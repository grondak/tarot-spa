import { describe, expect, it, vi } from 'vitest';
import { createHandler } from './handler';

function dependencies(...results: unknown[]) {
  return {
    dynamo: { send: vi.fn().mockImplementation(() => Promise.resolve(results.shift())) },
    configTableName: 'ConfigTable',
    dailyUsageTableName: 'DailyTable',
    now: () => new Date('2026-07-18T23:00:00Z'),
  };
}

describe('usage-counter handler', () => {
  it('reports a user below the limit', async () => {
    const deps = dependencies(
      { Item: { dailyLimit: 5, monthlyBudget: 30 } },
      { Item: { count: 2 } },
    );
    await expect(createHandler(deps)({ identity: { sub: 'account-1' } })).resolves.toEqual({
      dailyUsed: 2,
      dailyLimit: 5,
      limitExhausted: false,
    });
    expect((deps.dynamo.send.mock.calls[1][0] as { input: unknown }).input).toMatchObject({
      Key: { id: 'account-1#2026-07-18' },
      ConsistentRead: true,
    });
  });

  it('reports a user at the limit', async () => {
    const deps = dependencies(
      { Item: { dailyLimit: 5, monthlyBudget: 30 } },
      { Item: { count: 5 } },
    );
    await expect(createHandler(deps)({ identity: { sub: 'account-1' } })).resolves.toMatchObject({
      dailyUsed: 5,
      limitExhausted: true,
    });
  });

  it('treats a missing usage item as zero', async () => {
    const deps = dependencies({ Item: { dailyLimit: 5, monthlyBudget: 30 } }, {});
    await expect(createHandler(deps)({ identity: { sub: 'account-1' } })).resolves.toEqual({
      dailyUsed: 0,
      dailyLimit: 5,
      limitExhausted: false,
    });
  });

  it('fails loudly when Config is missing', async () => {
    const deps = dependencies({});
    await expect(createHandler(deps)({ identity: { sub: 'account-1' } })).rejects.toThrow(
      'orientation config missing — run scripts/seed-config.mjs',
    );
  });
});
