import { describe, expect, it, vi } from 'vitest';
import {
  readConfig,
  reserveDaily,
  reserveMonthly,
  rollbackDaily,
  rollbackMonthly,
  utcDate,
  utcMonth,
} from './reservation';

function client(...results: unknown[]) {
  return { send: vi.fn().mockImplementation(() => Promise.resolve(results.shift())) };
}

describe('usage reservations', () => {
  it('derives UTC date and month keys', () => {
    const instant = new Date('2026-08-01T00:30:00+02:00');
    expect(utcDate(instant)).toBe('2026-07-31');
    expect(utcMonth(instant)).toBe('2026-07');
  });

  it('reads the single consistent Config snapshot and fails loudly when missing', async () => {
    const dynamo = client({ Item: { dailyLimit: 5, monthlyBudget: 30 } });
    await expect(readConfig(dynamo, 'ConfigTable')).resolves.toEqual({
      dailyLimit: 5,
      monthlyBudget: 30,
    });
    expect((dynamo.send.mock.calls[0][0] as { input: unknown }).input).toMatchObject({
      TableName: 'ConfigTable',
      Key: { id: 'global' },
      ConsistentRead: true,
    });

    await expect(readConfig(client({}), 'ConfigTable')).rejects.toThrow(
      'orientation config missing — run scripts/seed-config.mjs',
    );
  });

  it('uses atomic conditional daily and monthly increments', async () => {
    const dynamo = client({}, {});
    await reserveDaily(dynamo, 'DailyTable', 'acct', '2026-07-18', 5, 'timestamp');
    await reserveMonthly(dynamo, 'MonthlyTable', '2026-07', 0.03, 30, 'timestamp');

    expect((dynamo.send.mock.calls[0][0] as { input: unknown }).input).toMatchObject({
      Key: { id: 'acct#2026-07-18' },
      ConditionExpression: 'attribute_not_exists(id) OR #count < :limit',
    });
    expect((dynamo.send.mock.calls[1][0] as { input: unknown }).input).toMatchObject({
      Key: { id: '2026-07' },
      ConditionExpression: 'attribute_not_exists(id) OR #spent <= :budgetMinusEstimate',
      ExpressionAttributeValues: expect.objectContaining({ ':budgetMinusEstimate': 29.97 }),
    });
  });

  it('maps invalid limits and conditional failures to frozen error codes', async () => {
    await expect(reserveDaily(client(), 't', 'a', 'd', 0, 'ts')).rejects.toThrow(
      'DAILY_LIMIT_EXHAUSTED',
    );
    await expect(reserveMonthly(client(), 't', 'm', 0.03, 0.02, 'ts')).rejects.toThrow(
      'MONTHLY_BUDGET_EXHAUSTED',
    );

    const rejected = { send: vi.fn().mockRejectedValue({ name: 'ConditionalCheckFailedException' }) };
    await expect(reserveDaily(rejected, 't', 'a', 'd', 5, 'ts')).rejects.toThrow(
      'DAILY_LIMIT_EXHAUSTED',
    );
    await expect(reserveMonthly(rejected, 't', 'm', 0.03, 30, 'ts')).rejects.toThrow(
      'MONTHLY_BUDGET_EXHAUSTED',
    );
  });

  it('performs atomic decrements and swallows rollback failures', async () => {
    const dynamo = client({}, {});
    await rollbackDaily(dynamo, 'DailyTable', 'acct', '2026-07-18', 'timestamp');
    await rollbackMonthly(dynamo, 'MonthlyTable', '2026-07', 0.03, 'timestamp');
    expect((dynamo.send.mock.calls[0][0] as { input: unknown }).input).toMatchObject({
      ConditionExpression: '#count >= :one',
    });
    expect((dynamo.send.mock.calls[1][0] as { input: unknown }).input).toMatchObject({
      ConditionExpression: '#spent >= :estimate',
    });

    const failing = { send: vi.fn().mockRejectedValue(new Error('rollback failed')) };
    await expect(rollbackDaily(failing, 't', 'a', 'd', 'ts')).resolves.toBeUndefined();
    await expect(rollbackMonthly(failing, 't', 'm', 0.03, 'ts')).resolves.toBeUndefined();
  });
});
