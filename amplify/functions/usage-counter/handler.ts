import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { readConfig, type CommandClient, utcDate } from './reservation';

type UsageCounterEvent = { identity?: { sub?: string } | null };

type HandlerDependencies = {
  dynamo: CommandClient;
  configTableName: string;
  dailyUsageTableName: string;
  now: () => Date;
};

const defaultDependencies: HandlerDependencies = {
  dynamo: DynamoDBDocumentClient.from(new DynamoDBClient({})),
  configTableName: process.env.CONFIG_TABLE_NAME ?? '',
  dailyUsageTableName: process.env.DAILY_USAGE_TABLE_NAME ?? '',
  now: () => new Date(),
};

export function createHandler(deps: HandlerDependencies = defaultDependencies) {
  return async (event: UsageCounterEvent) => {
    const accountId = event.identity?.sub;
    if (!accountId) throw new Error('authenticated identity required');
    if (!deps.configTableName || !deps.dailyUsageTableName) {
      throw new Error('usage-counter table configuration is missing');
    }

    const config = await readConfig(deps.dynamo, deps.configTableName);
    const result = await deps.dynamo.send(new GetCommand({
      TableName: deps.dailyUsageTableName,
      Key: { id: `${accountId}#${utcDate(deps.now())}` },
      ConsistentRead: true,
    })) as { Item?: { count?: number } };
    const dailyUsed = result.Item?.count ?? 0;

    return {
      dailyUsed,
      dailyLimit: config.dailyLimit,
      limitExhausted: dailyUsed >= config.dailyLimit,
    };
  };
}

export const handler = createHandler();
