import { describe, expect, it, vi } from 'vitest';
import { createHandler } from './handler';

type Page = {
  Items?: Array<Record<string, unknown>>;
  LastEvaluatedKey?: Record<string, unknown>;
};

function commandName(command: unknown) {
  return (command as { constructor: { name: string } }).constructor.name;
}

function commandInput(command: unknown) {
  return (command as { input: Record<string, unknown> }).input;
}

function dependencies(options: {
  config?: Record<string, unknown>;
  monthlySpend?: Record<string, unknown>;
  pages?: Record<string, Page[]>;
} = {}) {
  const pages = Object.fromEntries(
    Object.entries(options.pages ?? {}).map(([table, tablePages]) => [
      table,
      [...tablePages],
    ]),
  );
  const dynamo = {
    send: vi.fn(async (command: unknown) => {
      const input = commandInput(command);
      if (commandName(command) === 'GetCommand' && input.TableName === 'ConfigTable') {
        return options.config === undefined
          ? { Item: { dailyLimit: 3, monthlyBudget: 30 } }
          : { Item: options.config };
      }
      if (commandName(command) === 'GetCommand' && input.TableName === 'MonthlySpendTable') {
        return options.monthlySpend ? { Item: options.monthlySpend } : {};
      }
      if (commandName(command) === 'ScanCommand') {
        return pages[input.TableName as string]?.shift() ?? { Items: [] };
      }
      throw new Error(`Unexpected ${commandName(command)} for ${String(input.TableName)}`);
    }),
  };

  return {
    dynamo,
    accountTableName: 'AccountTable',
    sessionTableName: 'SessionTable',
    dailyUsageTableName: 'DailyUsageTable',
    monthlySpendTableName: 'MonthlySpendTable',
    configTableName: 'ConfigTable',
    now: () => new Date('2026-07-26T18:04:00.000Z'),
  };
}

describe('admin-metrics handler', () => {
  it('returns the exact empty-table response with null rates and zero spend', async () => {
    const deps = dependencies();

    await expect(createHandler(deps)()).resolves.toEqual({
      generatedAt: '2026-07-26T18:04:00.000Z',
      usersByGeneration: { FirstGen: 0, SecondGen: 0 },
      succeededSessionCount: 0,
      dailyLimitHitRate: null,
      dailyUsageRecordCount: 0,
      monthlySpend: { spentToDate: 0, budget: 30 },
      averageGroundednessScore: null,
      scoredSessionCount: 0,
    });

    const dailyScan = deps.dynamo.send.mock.calls
      .map(([command]) => command)
      .find((command) => (
        commandName(command) === 'ScanCommand'
        && commandInput(command).TableName === 'DailyUsageTable'
      ));
    expect(commandInput(dailyScan)).toMatchObject({
      ProjectionExpression: '#count',
      ExpressionAttributeNames: { '#count': 'count' },
    });
  });

  it('computes generation, delivered-Guide, hit-rate, spend, and score aggregates', async () => {
    const deps = dependencies({
      monthlySpend: { spent: 4.32 },
      pages: {
        AccountTable: [{
          Items: [
            { generation: 'FirstGen' },
            { generation: 'FirstGen' },
            { generation: 'SecondGen' },
          ],
        }],
        SessionTable: [{
          Items: [
            { status: 'SUCCEEDED', groundednessScore: 0.2 },
            { status: 'SUCCEEDED' },
            { groundednessScore: 0.4 },
            { status: 'PENDING', groundednessScore: 1 },
            { status: 'FAILED', groundednessScore: 1 },
          ],
        }],
        DailyUsageTable: [{
          Items: [{ count: 1 }, { count: 3 }, { count: 4 }, { count: 2 }],
        }],
      },
    });

    await expect(createHandler(deps)()).resolves.toEqual({
      generatedAt: '2026-07-26T18:04:00.000Z',
      usersByGeneration: { FirstGen: 2, SecondGen: 1 },
      succeededSessionCount: 3,
      dailyLimitHitRate: 0.5,
      dailyUsageRecordCount: 4,
      monthlySpend: { spentToDate: 4.32, budget: 30 },
      averageGroundednessScore: 0.30000000000000004,
      scoredSessionCount: 2,
    });
  });

  it('paginates every scan and passes each continuation key to DynamoDB', async () => {
    const deps = dependencies({
      pages: {
        AccountTable: [
          {
            Items: [{ generation: 'FirstGen' }],
            LastEvaluatedKey: { id: 'account-cursor' },
          },
          { Items: [{ generation: 'SecondGen' }] },
        ],
        SessionTable: [
          {
            Items: [{ status: 'SUCCEEDED', groundednessScore: 0 }],
            LastEvaluatedKey: { id: 'session-cursor' },
          },
          { Items: [{ status: 'SUCCEEDED', groundednessScore: 1 }] },
        ],
        DailyUsageTable: [
          {
            Items: [{ count: 3 }],
            LastEvaluatedKey: { id: 'usage-cursor' },
          },
          { Items: [{ count: 1 }] },
        ],
      },
    });

    await expect(createHandler(deps)()).resolves.toMatchObject({
      usersByGeneration: { FirstGen: 1, SecondGen: 1 },
      succeededSessionCount: 2,
      dailyLimitHitRate: 0.5,
      dailyUsageRecordCount: 2,
      averageGroundednessScore: 0.5,
      scoredSessionCount: 2,
    });

    const continuationScans = deps.dynamo.send.mock.calls
      .map(([command]) => commandInput(command))
      .filter((input) => input.ExclusiveStartKey);
    expect(continuationScans).toEqual(expect.arrayContaining([
      expect.objectContaining({ ExclusiveStartKey: { id: 'account-cursor' } }),
      expect.objectContaining({ ExclusiveStartKey: { id: 'session-cursor' } }),
      expect.objectContaining({ ExclusiveStartKey: { id: 'usage-cursor' } }),
    ]));
  });

  it('uses zero when the current-month MonthlySpend record is absent', async () => {
    const deps = dependencies();

    await expect(createHandler(deps)()).resolves.toMatchObject({
      monthlySpend: { spentToDate: 0, budget: 30 },
    });

    const monthlyGet = deps.dynamo.send.mock.calls
      .map(([command]) => command)
      .find((command) => (
        commandName(command) === 'GetCommand'
        && commandInput(command).TableName === 'MonthlySpendTable'
      ));
    expect(commandInput(monthlyGet)).toMatchObject({
      Key: { id: '2026-07' },
      ConsistentRead: true,
    });
  });

  it('propagates the shared readConfig failure when Config is missing', async () => {
    const deps = dependencies({ config: {} });

    await expect(createHandler(deps)()).rejects.toThrow(
      'orientation config missing — run scripts/seed-config.mjs',
    );
  });
});
