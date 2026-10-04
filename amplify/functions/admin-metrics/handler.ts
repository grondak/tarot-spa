import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  readConfig,
  type CommandClient,
  utcMonth,
} from '../usage-counter/reservation';

type HandlerDependencies = {
  dynamo: CommandClient;
  accountTableName: string;
  dailyUsageTableName: string;
  monthlySpendTableName: string;
  configTableName: string;
  metricsTableName: string;
  now: () => Date;
};

type AccountItem = {
  generation?: string;
};

type DailyUsageItem = {
  count?: number;
};

type MetricsItem = {
  succeededSessionCount?: number;
  scoredSessionCount?: number;
  groundednessScoreSum?: number;
};

type ScanOptions = {
  ProjectionExpression: string;
  ExpressionAttributeNames?: Record<string, string>;
};

const defaultDependencies: HandlerDependencies = {
  dynamo: DynamoDBDocumentClient.from(new DynamoDBClient({})),
  accountTableName: process.env.ACCOUNT_TABLE_NAME ?? '',
  dailyUsageTableName: process.env.DAILY_USAGE_TABLE_NAME ?? '',
  monthlySpendTableName: process.env.MONTHLY_SPEND_TABLE_NAME ?? '',
  configTableName: process.env.CONFIG_TABLE_NAME ?? '',
  metricsTableName: process.env.METRICS_TABLE_NAME ?? '',
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
      || !deps.dailyUsageTableName
      || !deps.monthlySpendTableName
      || !deps.configTableName
      || !deps.metricsTableName
    ) {
      throw new Error('admin-metrics table configuration is missing');
    }

    const now = deps.now();
    const [
      config,
      monthlySpendResult,
      metricsResult,
      accounts,
      dailyUsageRecords,
    ] = await Promise.all([
      readConfig(deps.dynamo, deps.configTableName),
      deps.dynamo.send(new GetCommand({
        TableName: deps.monthlySpendTableName,
        Key: { id: utcMonth(now) },
        ConsistentRead: true,
      })) as Promise<{ Item?: { spent?: number } }>,
      deps.dynamo.send(new GetCommand({
        TableName: deps.metricsTableName,
        Key: { id: 'global' },
        ConsistentRead: true,
      })) as Promise<{ Item?: MetricsItem }>,
      scanAll<AccountItem>(deps.dynamo, deps.accountTableName, {
        ProjectionExpression: 'generation',
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

    const succeededSessionCount = metricsResult.Item?.succeededSessionCount ?? 0;
    const scoredSessionCount = metricsResult.Item?.scoredSessionCount ?? 0;
    const groundednessScoreSum = metricsResult.Item?.groundednessScoreSum ?? 0;

    const hitCount = dailyUsageRecords.filter(
      (record) => typeof record.count === 'number' && record.count >= config.dailyLimit,
    ).length;

    return {
      generatedAt: now.toISOString(),
      usersByGeneration,
      succeededSessionCount,
      dailyLimitHitRate: dailyUsageRecords.length > 0
        ? hitCount / dailyUsageRecords.length
        : null,
      dailyUsageRecordCount: dailyUsageRecords.length,
      monthlySpend: {
        spentToDate: monthlySpendResult.Item?.spent ?? 0,
        budget: config.monthlyBudget,
      },
      config: {
        dailyLimit: config.dailyLimit,
        monthlyBudget: config.monthlyBudget,
      },
      averageGroundednessScore: scoredSessionCount > 0
        ? groundednessScoreSum / scoredSessionCount
        : null,
      scoredSessionCount,
    };
  };
}

export const handler = createHandler();
