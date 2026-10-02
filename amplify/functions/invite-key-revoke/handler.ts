import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

type RevokeInviteKeyEvent = { arguments: { code: string } };
type CommandClient = { send(command: unknown): Promise<unknown> };

type HandlerDependencies = {
  dynamo: CommandClient;
  inviteKeyTableName: string;
};

const defaultDependencies: HandlerDependencies = {
  dynamo: DynamoDBDocumentClient.from(new DynamoDBClient({})),
  inviteKeyTableName: process.env.INVITE_KEY_TABLE_NAME ?? '',
};

async function classifyConditionalFailure(deps: HandlerDependencies, code: string) {
  let result: { Item?: { status?: string } };
  try {
    result = await deps.dynamo.send(new GetCommand({
      TableName: deps.inviteKeyTableName,
      Key: { id: code },
      ProjectionExpression: '#status',
      ExpressionAttributeNames: { '#status': 'status' },
      ConsistentRead: true,
    })) as { Item?: { status?: string } };
  } catch {
    throw new Error('INVITE_KEY_REVOKE_FAILED');
  }

  const status = result.Item?.status;
  if (!result.Item) throw new Error('INVITE_KEY_NOT_FOUND');
  if (status === 'redeemed') throw new Error('INVITE_KEY_ALREADY_REDEEMED');
  if (status === 'revoked') throw new Error('INVITE_KEY_ALREADY_REVOKED');
  throw new Error('INVITE_KEY_REVOKE_FAILED');
}

export function createHandler(deps: HandlerDependencies = defaultDependencies) {
  return async (event: RevokeInviteKeyEvent) => {
    if (typeof event.arguments?.code !== 'string') throw new Error('INVITE_KEY_NOT_FOUND');
    const code = event.arguments.code.trim();
    if (!code) throw new Error('INVITE_KEY_NOT_FOUND');

    if (!deps.inviteKeyTableName) {
      throw new Error('invite-key-revoke table configuration is missing');
    }

    const timestamp = new Date().toISOString();

    try {
      await deps.dynamo.send(new UpdateCommand({
        TableName: deps.inviteKeyTableName,
        Key: { id: code },
        ConditionExpression: '#status = :unredeemed',
        UpdateExpression: 'SET #status = :revoked, updatedAt = :timestamp',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':unredeemed': 'unredeemed',
          ':revoked': 'revoked',
          ':timestamp': timestamp,
        },
      }));
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        return classifyConditionalFailure(deps, code);
      }
      throw error;
    }

    return true;
  };
}

export const handler = createHandler();
