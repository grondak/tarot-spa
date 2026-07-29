import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  effectiveStatus,
  readConfig,
  type CommandClient,
  utcMonth,
} from '../usage-counter/reservation';

type HandlerDependencies = {
  dynamo: CommandClient;
  accountTableName: string;
  sessionTableName: string;
  dailyUsageTableName: string;
  monthlySpendTableName: string;
  configTableName: string;
  now: () => Date;
};

type AccountItem = {
  generation?: string;
};

type SessionItem = {
  status?: string;
  groundednessScore?: number;
};

type DailyUsageItem = {
  count?: number;
};

type ScanOptions = {
  ProjectionExpression: string;
  ExpressionAttributeNames?: Record<string, string>;
};

const defaultDependencies: HandlerDependencies = {
  dynamo: DynamoDBDocumentClient.from(new DynamoDBClient({})),
  accountTableName: process.env.ACCOUNT_TABLE_NAME ?? '',
  sessionTableName: process.env.SESSION_TABLE_NAME ?? '',
  dailyUsageTableName: process.env.DAILY_USAGE_TABLE_NAME ?? '',
  monthlySpendTableName: process.env.MONTHLY_SPEND_TABLE_NAME ?? '',
  configTableName: process.env.CONFIG_TABLE_NAME ?? '',
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

export function createHandler(deps: HandlerDependencies = defaultDependencies) {
  return async () => {
    if (
      !deps.accountTableName
      || !deps.sessionTableName
      || !deps.dailyUsageTableName
      || !deps.monthlySpendTableName
      || !deps.configTableName
    ) {
      throw new Error('admin-metrics table configuration is missing');
    }

    const now = deps.now();
    const [
      config,
      monthlySpendResult,
      accounts,
      sessions,
      dailyUsageRecords,
    ] = await Promise.all([
      readConfig(deps.dynamo, deps.configTableName),
      deps.dynamo.send(new GetCommand({
        TableName: deps.monthlySpendTableName,
        Key: { id: utcMonth(now) },
        ConsistentRead: true,
      })) as Promise<{ Item?: { spent?: number } }>,
      scanAll<AccountItem>(deps.dynamo, deps.accountTableName, {
        ProjectionExpression: 'generation',
      }),
      scanAll<SessionItem>(deps.dynamo, deps.sessionTableName, {
        ProjectionExpression: '#status, groundednessScore',
        ExpressionAttributeNames: { '#status': 'status' },
      }),
      scanAll<DailyUsageItem>(deps.dynamo, deps.dailyUsageTableName, {
        ProjectionExpression: '#count',
        ExpressionAttributeNames: { '#count': 'count' },
      }),
    ]);

    const usersByGeneration = { FirstGen: 0, SecondGen: 0 };
    for (const account of accounts) {
      if (account.generation === 'FirstGen') usersByGeneration.FirstGen += 1;
      if (account.generation === 'SecondGen') usersByGeneration.SecondGen += 1;
    }

    const succeededSessions = sessions.filter(
      (session) => effectiveStatus(session) === 'SUCCEEDED',
    );
    const scoredSessions = succeededSessions.filter(
      (session): session is SessionItem & { groundednessScore: number } => (
        typeof session.groundednessScore === 'number'
      ),
    );
    const scoreTotal = scoredSessions.reduce(
      (total, session) => total + session.groundednessScore,
      0,
    );
    const hitCount = dailyUsageRecords.filter(
      (record) => typeof record.count === 'number' && record.count >= config.dailyLimit,
    ).length;

    return {
      generatedAt: now.toISOString(),
      usersByGeneration,
      succeededSessionCount: succeededSessions.length,
      dailyLimitHitRate: dailyUsageRecords.length > 0
        ? hitCount / dailyUsageRecords.length
        : null,
      dailyUsageRecordCount: dailyUsageRecords.length,
      monthlySpend: {
        spentToDate: monthlySpendResult.Item?.spent ?? 0,
        budget: config.monthlyBudget,
      },
      averageGroundednessScore: scoredSessions.length > 0
        ? scoreTotal / scoredSessions.length
        : null,
      scoredSessionCount: scoredSessions.length,
    };
  };
}

export const handler = createHandler();
