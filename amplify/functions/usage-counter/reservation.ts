import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

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

function isConditionalFailure(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && error.name === 'ConditionalCheckFailedException';
}

export async function reserveDaily(
  dynamo: CommandClient,
  table: string,
  accountId: string,
  date: string,
  dailyLimit: number,
  timestamp: string,
) {
  if (dailyLimit < 1) throw new Error('DAILY_LIMIT_EXHAUSTED');

  try {
    await dynamo.send(new UpdateCommand({
      TableName: table,
      Key: { id: `${accountId}#${date}` },
      ConditionExpression: 'attribute_not_exists(id) OR #count < :limit',
      UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :one, #owner = if_not_exists(#owner, :accountId), createdAt = if_not_exists(createdAt, :ts), updatedAt = :ts',
      ExpressionAttributeNames: {
        '#count': 'count',
        '#owner': 'owner',
      },
      ExpressionAttributeValues: {
        ':limit': dailyLimit,
        ':zero': 0,
        ':one': 1,
        ':accountId': accountId,
        ':ts': timestamp,
      },
    }));
  } catch (error) {
    if (isConditionalFailure(error)) throw new Error('DAILY_LIMIT_EXHAUSTED');
    throw error;
  }
}

export async function reserveMonthly(
  dynamo: CommandClient,
  table: string,
  month: string,
  estimate: number,
  monthlyBudget: number,
  timestamp: string,
) {
  if (monthlyBudget < estimate) throw new Error('MONTHLY_BUDGET_EXHAUSTED');

  try {
    await dynamo.send(new UpdateCommand({
      TableName: table,
      Key: { id: month },
      ConditionExpression: 'attribute_not_exists(id) OR #spent <= :budgetMinusEstimate',
      UpdateExpression: 'SET #spent = if_not_exists(#spent, :zero) + :estimate, createdAt = if_not_exists(createdAt, :ts), updatedAt = :ts',
      ExpressionAttributeNames: { '#spent': 'spent' },
      ExpressionAttributeValues: {
        ':budgetMinusEstimate': monthlyBudget - estimate,
        ':zero': 0,
        ':estimate': estimate,
        ':ts': timestamp,
      },
    }));
  } catch (error) {
    if (isConditionalFailure(error)) throw new Error('MONTHLY_BUDGET_EXHAUSTED');
    throw error;
  }
}

export async function rollbackDaily(
  dynamo: CommandClient,
  table: string,
  accountId: string,
  date: string,
  timestamp: string,
) {
  try {
    await dynamo.send(new UpdateCommand({
      TableName: table,
      Key: { id: `${accountId}#${date}` },
      ConditionExpression: '#count >= :one',
      UpdateExpression: 'SET #count = #count - :one, updatedAt = :ts',
      ExpressionAttributeNames: { '#count': 'count' },
      ExpressionAttributeValues: { ':one': 1, ':ts': timestamp },
    }));
  } catch (error) {
    console.error('DailyUsage rollback failed', error);
  }
}

export async function rollbackMonthly(
  dynamo: CommandClient,
  table: string,
  month: string,
  estimate: number,
  timestamp: string,
) {
  try {
    await dynamo.send(new UpdateCommand({
      TableName: table,
      Key: { id: month },
      ConditionExpression: '#spent >= :estimate',
      UpdateExpression: 'SET #spent = #spent - :estimate, updatedAt = :ts',
      ExpressionAttributeNames: { '#spent': 'spent' },
      ExpressionAttributeValues: { ':estimate': estimate, ':ts': timestamp },
    }));
  } catch (error) {
    console.error('MonthlySpend rollback failed', error);
  }
}
