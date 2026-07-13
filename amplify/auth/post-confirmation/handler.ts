import {
  GetCommand,
  TransactWriteCommand,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

type PostConfirmationEvent = {
  userName: string;
  userPoolId: string;
  request: {
    userAttributes: { sub: string };
    clientMetadata?: { inviteKeyCode?: string };
  };
};

type CommandClient = { send(command: unknown): Promise<unknown> };

type TableNames = { accountTableName: string; inviteKeyTableName: string };

type HandlerDependencies = {
  dynamo: CommandClient;
  cognito: CommandClient;
  // The table names live in the data stack, which this auth-stack Lambda can't reference
  // at deploy time (circular dependency — see backend.ts). They're resolved at runtime
  // from SSM parameters instead, once per container.
  resolveTableNames: () => Promise<TableNames>;
};

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognito = new CognitoIdentityProviderClient({});
const ssm = new SSMClient({});

let cachedTableNames: TableNames | undefined;

async function resolveTableNamesFromSsm(): Promise<TableNames> {
  if (!cachedTableNames) {
    const getParam = async (name: string | undefined) => {
      if (!name) throw new Error('table-name SSM parameter path env var is not set');
      const result = await ssm.send(new GetParameterCommand({ Name: name }));
      const value = result.Parameter?.Value;
      if (!value) throw new Error(`SSM parameter ${name} has no value`);
      return value;
    };
    cachedTableNames = {
      accountTableName: await getParam(process.env.ACCOUNT_TABLE_PARAM),
      inviteKeyTableName: await getParam(process.env.INVITE_KEY_TABLE_PARAM),
    };
  }
  return cachedTableNames;
}

const defaultDependencies: HandlerDependencies = {
  dynamo,
  cognito,
  resolveTableNames: resolveTableNamesFromSsm,
};

async function deleteConfirmedUser(deps: HandlerDependencies, event: PostConfirmationEvent) {
  await deps.cognito.send(new AdminDeleteUserCommand({
    UserPoolId: event.userPoolId,
    Username: event.userName,
  }));
}

function isConditionalFailure(error: unknown) {
  return error instanceof TransactionCanceledException
    && error.CancellationReasons?.some((reason) => reason.Code === 'ConditionalCheckFailed');
}

export function createHandler(deps: HandlerDependencies = defaultDependencies) {
  return async (event: PostConfirmationEvent) => {
    // Cognito requires this trigger to always return the event — an uncaught throw here
    // breaks the whole auth flow for the user (they'd be stuck mid-confirmation). Every
    // exit path below goes through this outer catch instead of letting anything escape.
    try {
      const inviteKeyCode = event.request.clientMetadata?.inviteKeyCode?.trim();
      const accountId = event.request.userAttributes.sub;

      if (!inviteKeyCode) {
        await deleteConfirmedUser(deps, event);
        return event;
      }

      const { accountTableName, inviteKeyTableName } = await deps.resolveTableNames();

      const keyResult = await deps.dynamo.send(new GetCommand({
        TableName: inviteKeyTableName,
        Key: { id: inviteKeyCode },
        ProjectionExpression: 'generation, redeemedBy',
        ConsistentRead: true,
      })) as { Item?: { generation?: string; redeemedBy?: string } };

      if (!keyResult.Item?.generation) {
        await deleteConfirmedUser(deps, event);
        return event;
      }

      // Idempotent retry: a prior invocation for this same account already redeemed this
      // key (e.g. Cognito retried the trigger after a timeout on the earlier success).
      // Don't re-attempt the transaction or compensate — this account already has its Account.
      if (keyResult.Item.redeemedBy === accountId) {
        return event;
      }

      try {
        const timestamp = new Date().toISOString();
        await deps.dynamo.send(new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: inviteKeyTableName,
                Key: { id: inviteKeyCode },
                UpdateExpression: 'SET #status = :redeemed, redeemedBy = :accountId',
                ConditionExpression: '#status = :unredeemed',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                  ':unredeemed': 'unredeemed',
                  ':redeemed': 'redeemed',
                  ':accountId': accountId,
                },
              },
            },
            {
              Put: {
                TableName: accountTableName,
                Item: {
                  id: accountId,
                  owner: accountId,
                  generation: keyResult.Item.generation,
                  onwardKeyGenerated: false,
                  createdAt: timestamp,
                  updatedAt: timestamp,
                },
                ConditionExpression: 'attribute_not_exists(id)',
              },
            },
          ],
        }));
      } catch (error) {
        if (!isConditionalFailure(error)) throw error;

        // The transaction's condition failed either because someone else already redeemed
        // this key (real conflict — compensate), or because this is a retry of our own
        // already-committed transaction (idempotent — the redeemedBy check above only
        // catches this on a *later* invocation; a truly concurrent retry can reach here
        // before that check would have seen it). Distinguish by checking whether this
        // account's Account record already exists.
        const accountResult = await deps.dynamo.send(new GetCommand({
          TableName: accountTableName,
          Key: { id: accountId },
          ProjectionExpression: 'id',
          ConsistentRead: true,
        })) as { Item?: { id?: string } };

        if (!accountResult.Item) {
          await deleteConfirmedUser(deps, event);
        }
      }

      return event;
    } catch (error) {
      console.error('post-confirmation handler failed unexpectedly', error);
      return event;
    }
  };
}

export const handler = createHandler();
