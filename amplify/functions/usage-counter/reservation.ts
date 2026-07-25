import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

export type CommandClient = { send(command: unknown): Promise<unknown> };

type Config = {
  dailyLimit: number;
  monthlyBudget: number;
};

export function utcDate(now: Date) {
  return now.toISOString().slice(0, 10);
}

export function utcMonth(now: Date) {
  return now.toISOString().slice(0, 7);
}

export async function readConfig(dynamo: CommandClient, configTable: string): Promise<Config> {
  const result = await dynamo.send(new GetCommand({
    TableName: configTable,
    Key: { id: 'global' },
    ConsistentRead: true,
  })) as { Item?: Partial<Config> };

  if (typeof result.Item?.dailyLimit !== 'number'
    || typeof result.Item?.monthlyBudget !== 'number') {
    throw new Error('orientation config missing — run scripts/seed-config.mjs');
  }

  return {
    dailyLimit: result.Item.dailyLimit,
    monthlyBudget: result.Item.monthlyBudget,
  };
}

type UsageMutation = {
  dailyTable: string;
  monthlyTable: string;
  sessionTable: string;
  sessionId: string;
  accountId: string;
  date: string;
  month: string;
  estimate: number;
  timestamp: string;
};

type UsageReservation = UsageMutation & {
  dailyLimit: number;
  monthlyBudget: number;
};

const TRANSACTION_ATTEMPTS = 3;

function transactionToken(sessionId: string, suffix: 'RES' | 'RBK') {
  return `${sessionId.replace(/-/g, '')}${suffix}`;
}

export function reservationToken(sessionId: string) {
  return transactionToken(sessionId, 'RES');
}

export function compensationToken(sessionId: string) {
  return transactionToken(sessionId, 'RBK');
}

function cancellationReasons(error: unknown) {
  if (typeof error !== 'object'
    || error === null
    || !('name' in error)
    || error.name !== 'TransactionCanceledException'
    || !('CancellationReasons' in error)
    || !Array.isArray(error.CancellationReasons)) {
    return [];
  }
  return error.CancellationReasons as Array<{ Code?: string }>;
}

function reservationCommand(input: UsageReservation) {
  return new TransactWriteCommand({
    ClientRequestToken: reservationToken(input.sessionId),
    TransactItems: [
      {
        Update: {
          TableName: input.monthlyTable,
          Key: { id: input.month },
          ConditionExpression: 'attribute_not_exists(id) OR #spent <= :budgetMinusEstimate',
          UpdateExpression: 'SET #spent = if_not_exists(#spent, :zero) + :estimate, createdAt = if_not_exists(createdAt, :ts), updatedAt = :ts',
          ExpressionAttributeNames: { '#spent': 'spent' },
          ExpressionAttributeValues: {
            ':budgetMinusEstimate': input.monthlyBudget - input.estimate,
            ':zero': 0,
            ':estimate': input.estimate,
            ':ts': input.timestamp,
          },
        },
      },
      {
        Update: {
          TableName: input.dailyTable,
          Key: { id: `${input.accountId}#${input.date}` },
          ConditionExpression: 'attribute_not_exists(id) OR #count < :limit',
          UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :one, #owner = if_not_exists(#owner, :accountId), createdAt = if_not_exists(createdAt, :ts), updatedAt = :ts',
          ExpressionAttributeNames: {
            '#count': 'count',
            '#owner': 'owner',
          },
          ExpressionAttributeValues: {
            ':limit': input.dailyLimit,
            ':zero': 0,
            ':one': 1,
            ':accountId': input.accountId,
            ':ts': input.timestamp,
          },
        },
      },
      {
        Update: {
          TableName: input.sessionTable,
          Key: { id: input.sessionId },
          ConditionExpression: 'attribute_not_exists(usageReservedAt)',
          UpdateExpression: 'SET usageReservedAt = :ts',
          ExpressionAttributeValues: {
            ':ts': input.timestamp,
          },
        },
      },
    ],
  });
}

function rollbackCommand(input: UsageMutation) {
  return new TransactWriteCommand({
    ClientRequestToken: compensationToken(input.sessionId),
    TransactItems: [
      {
        Update: {
          TableName: input.monthlyTable,
          Key: { id: input.month },
          ConditionExpression: '#spent >= :estimate',
          UpdateExpression: 'SET #spent = #spent - :estimate, updatedAt = :ts',
          ExpressionAttributeNames: { '#spent': 'spent' },
          ExpressionAttributeValues: {
            ':estimate': input.estimate,
            ':ts': input.timestamp,
          },
        },
      },
      {
        Update: {
          TableName: input.dailyTable,
          Key: { id: `${input.accountId}#${input.date}` },
          ConditionExpression: '#count >= :one',
          UpdateExpression: 'SET #count = #count - :one, updatedAt = :ts',
          ExpressionAttributeNames: { '#count': 'count' },
          ExpressionAttributeValues: {
            ':one': 1,
            ':ts': input.timestamp,
          },
        },
      },
      {
        Update: {
          TableName: input.sessionTable,
          Key: { id: input.sessionId },
          ConditionExpression: 'attribute_exists(usageReservedAt) AND attribute_not_exists(usageCompensatedAt)',
          UpdateExpression: 'SET usageCompensatedAt = :ts',
          ExpressionAttributeValues: {
            ':ts': input.timestamp,
          },
        },
      },
    ],
  });
}

export async function reserveUsage(dynamo: CommandClient, input: UsageReservation) {
  if (input.monthlyBudget < input.estimate) throw new Error('MONTHLY_BUDGET_EXHAUSTED');
  if (input.dailyLimit < 1) throw new Error('DAILY_LIMIT_EXHAUSTED');

  for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      await dynamo.send(reservationCommand(input));
      return;
    } catch (error) {
      const reasons = cancellationReasons(error);
      if (reasons[2]?.Code === 'ConditionalCheckFailed') return;
      if (reasons[0]?.Code === 'ConditionalCheckFailed') {
        throw new Error('MONTHLY_BUDGET_EXHAUSTED');
      }
      if (reasons[1]?.Code === 'ConditionalCheckFailed') {
        throw new Error('DAILY_LIMIT_EXHAUSTED');
      }
      if (attempt === TRANSACTION_ATTEMPTS) throw error;
    }
  }
}

export async function rollbackUsage(dynamo: CommandClient, input: UsageMutation) {
  for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      await dynamo.send(rollbackCommand(input));
      return;
    } catch (error) {
      const reasons = cancellationReasons(error);
      if (reasons[2]?.Code === 'ConditionalCheckFailed') return;
      if (reasons.some((reason) => reason.Code === 'ConditionalCheckFailed')) throw error;
      if (attempt === TRANSACTION_ATTEMPTS) throw error;
    }
  }
}
