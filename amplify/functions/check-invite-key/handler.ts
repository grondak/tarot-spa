import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

type CheckInviteKeyEvent = { arguments: { code: string } };

export const handler = async (event: CheckInviteKeyEvent) => {
  const code = event.arguments.code.trim();
  if (!code) return null;

  const result = await dynamo.send(new GetCommand({
    TableName: process.env.INVITE_KEY_TABLE_NAME,
    Key: { id: code },
    ProjectionExpression: '#status',
    ExpressionAttributeNames: { '#status': 'status' },
    ConsistentRead: true,
  }));

  return result.Item?.status ?? null;
};
