import { randomBytes } from 'node:crypto';
import { DynamoDBClient, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

type MintInviteKeyEvent = {
  fieldName?: string;
  identity?: { sub?: string } | null;
  info?: { fieldName?: string };
};
type CommandClient = { send(command: unknown): Promise<unknown> };

type HandlerDependencies = {
  dynamo: CommandClient;
  accountTableName: string;
  inviteKeyTableName: string;
  generateCode: () => string;
};

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function generateInviteCode() {
  const bytes = randomBytes(12);
  const characters = Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]);
  return `${characters.slice(0, 4).join('')}-${characters.slice(4, 8).join('')}-${characters.slice(8).join('')}`;
}

const defaultDependencies: HandlerDependencies = {
  dynamo: DynamoDBDocumentClient.from(new DynamoDBClient({})),
  accountTableName: process.env.ACCOUNT_TABLE_NAME ?? '',
  inviteKeyTableName: process.env.INVITE_KEY_TABLE_NAME ?? '',
  generateCode: generateInviteCode,
};

function isAccountConditionalFailure(error: unknown) {
  return error instanceof TransactionCanceledException
    && error.CancellationReasons?.[0]?.Code === 'ConditionalCheckFailed';
}

async function mintAdminKey(deps: HandlerDependencies) {
  if (!deps.inviteKeyTableName) {
    throw new Error('invite-key-mint table configuration is missing');
  }

  const code = deps.generateCode();
  const timestamp = new Date().toISOString();
  await deps.dynamo.send(new PutCommand({
    TableName: deps.inviteKeyTableName,
    Item: {
      id: code,
      status: 'unredeemed',
      generation: 'FirstGen',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    ConditionExpression: 'attribute_not_exists(id)',
  }));

  return code;
}

export function createHandler(deps: HandlerDependencies = defaultDependencies) {
  return async (event: MintInviteKeyEvent) => {
    const fieldName = event.fieldName ?? event.info?.fieldName;
    if (fieldName === 'adminMintInviteKey') {
      return mintAdminKey(deps);
    }

    const accountId = event.identity?.sub;
    if (!accountId) throw new Error('authenticated identity required');
    if (!deps.accountTableName || !deps.inviteKeyTableName) {
      throw new Error('invite-key-mint table configuration is missing');
    }

    const code = deps.generateCode();
    const timestamp = new Date().toISOString();

    try {
      await deps.dynamo.send(new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: deps.accountTableName,
              Key: { id: accountId },
              ConditionExpression: '#generation = :firstGen AND #onwardKeyGenerated = :false',
              UpdateExpression: 'SET #onwardKeyGenerated = :true, updatedAt = :timestamp',
              ExpressionAttributeNames: {
                '#generation': 'generation',
                '#onwardKeyGenerated': 'onwardKeyGenerated',
              },
              ExpressionAttributeValues: {
                ':firstGen': 'FirstGen',
                ':false': false,
                ':true': true,
                ':timestamp': timestamp,
              },
            },
          },
          {
            Put: {
              TableName: deps.inviteKeyTableName,
              Item: {
                id: code,
                status: 'unredeemed',
                generation: 'SecondGen',
                createdAt: timestamp,
                updatedAt: timestamp,
              },
              ConditionExpression: 'attribute_not_exists(id)',
            },
          },
        ],
      }));
    } catch (error) {
      if (isAccountConditionalFailure(error)) throw new Error('not eligible');
      throw error;
    }

    return code;
  };
}

export const handler = createHandler();
