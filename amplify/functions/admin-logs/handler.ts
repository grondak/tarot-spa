import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { type CommandClient } from '../usage-counter/reservation';

type HandlerDependencies = {
  dynamo: CommandClient;
  inviteKeyTableName: string;
  accountTableName: string;
  questionLogTableName: string;
  now: () => Date;
};

type AccountItem = {
  id?: string;
  email?: string;
  redeemedInviteKey?: string;
  generation?: string;
  createdAt?: string;
};

type InviteKeyItem = {
  id?: string;
  generation?: string;
  status?: string;
  createdAt?: string;
  mintedBy?: string;
  revokedBy?: string;
  revokedAt?: string;
};

type QuestionLogItem = {
  id?: string;
  owner?: string;
  occurredAt?: string;
  durationMs?: number;
  hadResult?: boolean;
};

type ScanOptions = {
  ProjectionExpression: string;
  ExpressionAttributeNames?: Record<string, string>;
};

// Each log is capped to its most recent rows — the underlying tables are
// deliberately allowed to grow unboundedly (they're the permanent record),
// but the admin-facing response stays bounded. Same tradeoff admin-metrics
// already accepts scanning all of Account/DailyUsage.
const LOG_CAP = 100;

const defaultDependencies: HandlerDependencies = {
  dynamo: DynamoDBDocumentClient.from(new DynamoDBClient({})),
  inviteKeyTableName: process.env.INVITE_KEY_TABLE_NAME ?? '',
  accountTableName: process.env.ACCOUNT_TABLE_NAME ?? '',
  questionLogTableName: process.env.QUESTION_LOG_TABLE_NAME ?? '',
  now: () => new Date(),
};

async function scanAll<T>(
  dynamo: CommandClient,
  tableName: string,
  options: ScanOptions,
): Promise<T[]> {
  const items: T[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const page = await dynamo.send(new ScanCommand({
      TableName: tableName,
      ConsistentRead: true,
      ExclusiveStartKey: exclusiveStartKey,
      ...options,
    })) as {
      Items?: T[];
      LastEvaluatedKey?: Record<string, unknown>;
    };
    items.push(...(page.Items ?? []));
    exclusiveStartKey = page.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return items;
}

function byMostRecent<T>(at: (item: T) => string | undefined) {
  return (a: T, b: T) => (at(b) ?? '').localeCompare(at(a) ?? '');
}

export function createHandler(deps: HandlerDependencies = defaultDependencies) {
  return async () => {
    if (
      !deps.inviteKeyTableName
      || !deps.accountTableName
      || !deps.questionLogTableName
    ) {
      throw new Error('admin-logs table configuration is missing');
    }

    const [accounts, inviteKeys, questionLogs] = await Promise.all([
      scanAll<AccountItem>(deps.dynamo, deps.accountTableName, {
        ProjectionExpression: 'id, email, redeemedInviteKey, generation, createdAt',
      }),
      scanAll<InviteKeyItem>(deps.dynamo, deps.inviteKeyTableName, {
        ProjectionExpression: 'id, generation, #status, createdAt, mintedBy, revokedBy, revokedAt',
        ExpressionAttributeNames: { '#status': 'status' },
      }),
      scanAll<QuestionLogItem>(deps.dynamo, deps.questionLogTableName, {
        ProjectionExpression: 'id, #owner, occurredAt, durationMs, hadResult',
        ExpressionAttributeNames: { '#owner': 'owner' },
      }),
    ]);

    const emailByAccountId = new Map(
      accounts.filter((account) => account.id).map((account) => [account.id, account.email]),
    );
    const emailFor = (accountId: string | undefined) => {
      if (!accountId) return null;
      return emailByAccountId.get(accountId) ?? accountId;
    };

    const mintingLog = inviteKeys
      .map((key) => ({
        code: key.id,
        generation: key.generation,
        status: key.status,
        createdAt: key.createdAt,
        mintedByEmail: emailFor(key.mintedBy),
      }))
      .sort(byMostRecent((entry) => entry.createdAt))
      .slice(0, LOG_CAP);

    const adminActionLog = inviteKeys
      .flatMap((key) => {
        const actions = [];
        // Admin-minted keys are always FirstGen (invite-key-mint's admin
        // path); self-serve onward mints are always SecondGen — no separate
        // field needed to tell them apart.
        if (key.generation === 'FirstGen') {
          actions.push({
            code: key.id,
            action: 'minted' as const,
            byEmail: emailFor(key.mintedBy),
            at: key.createdAt,
          });
        }
        if (key.revokedBy) {
          actions.push({
            code: key.id,
            action: 'revoked' as const,
            byEmail: emailFor(key.revokedBy),
            at: key.revokedAt,
          });
        }
        return actions;
      })
      .sort(byMostRecent((entry) => entry.at))
      .slice(0, LOG_CAP);

    const signupLog = accounts
      .map((account) => ({
        email: account.email,
        redeemedInviteKey: account.redeemedInviteKey,
        generation: account.generation,
        createdAt: account.createdAt,
      }))
      .sort(byMostRecent((entry) => entry.createdAt))
      .slice(0, LOG_CAP);

    const questionsLog = questionLogs
      .map((entry) => ({
        ownerEmail: emailFor(entry.owner),
        occurredAt: entry.occurredAt,
        durationMs: entry.durationMs,
        hadResult: entry.hadResult,
      }))
      .sort(byMostRecent((entry) => entry.occurredAt))
      .slice(0, LOG_CAP);

    return {
      generatedAt: deps.now().toISOString(),
      mintingLog,
      adminActionLog,
      signupLog,
      questionsLog,
    };
  };
}

export const handler = createHandler();
