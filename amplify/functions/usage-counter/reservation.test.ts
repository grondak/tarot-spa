import { describe, expect, it, vi } from 'vitest';
import {
  compensationToken,
  readConfig,
  reservationToken,
  reserveUsage,
  rollbackUsage,
  utcDate,
  utcMonth,
} from './reservation';

function client(...results: unknown[]) {
  return { send: vi.fn().mockImplementation(() => Promise.resolve(results.shift())) };
}

const usage = {
  dailyTable: 'DailyTable',
  monthlyTable: 'MonthlyTable',
  sessionTable: 'SessionTable',
  sessionId: '12345678-1234-4234-9234-123456789012',
  accountId: 'acct',
  date: '2026-07-18',
  month: '2026-07',
  estimate: 0.03,
  timestamp: 'timestamp',
};

function canceled(...codes: string[]) {
  return {
    name: 'TransactionCanceledException',
    CancellationReasons: codes.map((Code) => ({ Code })),
  };
}

describe('usage reservations', () => {
  it('derives UTC date and month keys', () => {
    const instant = new Date('2026-08-01T00:30:00+02:00');
    expect(utcDate(instant)).toBe('2026-07-31');
    expect(utcMonth(instant)).toBe('2026-07');
  });

  it('derives deterministic, distinct 35-character transaction tokens from the Session id', () => {
    expect(reservationToken(usage.sessionId)).toBe(
      '12345678123442349234123456789012RES',
    );
    expect(compensationToken(usage.sessionId)).toBe(
      '12345678123442349234123456789012RBK',
    );
    expect(reservationToken(usage.sessionId)).toHaveLength(35);
    expect(compensationToken(usage.sessionId)).toHaveLength(35);
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

  it('reserves monthly and daily counters in one idempotent transaction', async () => {
    const dynamo = client({});
    await reserveUsage(dynamo, { ...usage, dailyLimit: 5, monthlyBudget: 30 });

    expect((dynamo.send.mock.calls[0][0] as { input: unknown }).input).toMatchObject({
      ClientRequestToken: reservationToken(usage.sessionId),
      TransactItems: [
        {
          Update: {
            TableName: 'MonthlyTable',
            Key: { id: '2026-07' },
            ConditionExpression: 'attribute_not_exists(id) OR #spent <= :budgetMinusEstimate',
            ExpressionAttributeValues: expect.objectContaining({ ':budgetMinusEstimate': 29.97 }),
          },
        },
        {
          Update: {
            TableName: 'DailyTable',
            Key: { id: 'acct#2026-07-18' },
            ConditionExpression: 'attribute_not_exists(id) OR #count < :limit',
          },
        },
        {
          Update: {
            TableName: 'SessionTable',
            Key: { id: usage.sessionId },
            ConditionExpression: 'attribute_not_exists(usageReservedAt)',
            UpdateExpression: 'SET usageReservedAt = :ts',
          },
        },
      ],
    });
  });

  it('maps invalid limits and transaction cancellation reasons to frozen error codes', async () => {
    await expect(reserveUsage(client(), {
      ...usage,
      dailyLimit: 0,
      monthlyBudget: 30,
    })).rejects.toThrow(
      'DAILY_LIMIT_EXHAUSTED',
    );
    await expect(reserveUsage(client(), {
      ...usage,
      dailyLimit: 5,
      monthlyBudget: 0.02,
    })).rejects.toThrow(
      'MONTHLY_BUDGET_EXHAUSTED',
    );

    const dailyRejected = { send: vi.fn().mockRejectedValue(canceled('None', 'ConditionalCheckFailed')) };
    await expect(reserveUsage(dailyRejected, {
      ...usage,
      dailyLimit: 5,
      monthlyBudget: 30,
    })).rejects.toThrow(
      'DAILY_LIMIT_EXHAUSTED',
    );

    const bothRejected = {
      send: vi.fn().mockRejectedValue(canceled(
        'ConditionalCheckFailed',
        'ConditionalCheckFailed',
      )),
    };
    await expect(reserveUsage(bothRejected, {
      ...usage,
      dailyLimit: 5,
      monthlyBudget: 30,
    })).rejects.toThrow(
      'MONTHLY_BUDGET_EXHAUSTED',
    );

    const alreadyReserved = {
      send: vi.fn().mockRejectedValue(canceled(
        'None',
        'None',
        'ConditionalCheckFailed',
      )),
    };
    await expect(reserveUsage(alreadyReserved, {
      ...usage,
      dailyLimit: 5,
      monthlyBudget: 30,
    })).resolves.toBeUndefined();
  });

  it('rolls monthly and daily counters back in one idempotent transaction', async () => {
    const dynamo = client({});
    await rollbackUsage(dynamo, usage);

    expect((dynamo.send.mock.calls[0][0] as { input: unknown }).input).toMatchObject({
      ClientRequestToken: compensationToken(usage.sessionId),
      TransactItems: [
        {
          Update: {
            TableName: 'MonthlyTable',
            ConditionExpression: '#spent >= :estimate',
          },
        },
        {
          Update: {
            TableName: 'DailyTable',
            ConditionExpression: '#count >= :one',
          },
        },
        {
          Update: {
            TableName: 'SessionTable',
            Key: { id: usage.sessionId },
            ConditionExpression: 'attribute_exists(usageReservedAt) AND attribute_not_exists(usageCompensatedAt)',
            UpdateExpression: 'SET usageCompensatedAt = :ts',
          },
        },
      ],
    });
  });

  it('retries transactions with the same request token after ambiguous failures', async () => {
    const transient = {
      send: vi.fn()
        .mockRejectedValueOnce(new Error('throttled'))
        .mockRejectedValueOnce(new Error('network reset'))
        .mockResolvedValue({}),
    };
    await expect(reserveUsage(transient, {
      ...usage,
      dailyLimit: 5,
      monthlyBudget: 30,
    })).resolves.toBeUndefined();
    expect(transient.send).toHaveBeenCalledTimes(3);
    const inputs = transient.send.mock.calls
      .map(([command]) => (command as { input: { ClientRequestToken?: string } }).input);
    expect(inputs.map((input) => input.ClientRequestToken)).toEqual([
      reservationToken(usage.sessionId),
      reservationToken(usage.sessionId),
      reservationToken(usage.sessionId),
    ]);
    expect(inputs[1]).toEqual(inputs[0]);
    expect(inputs[2]).toEqual(inputs[0]);
  });

  it('does not mark the Session failed when a counter rollback condition misses', async () => {
    const conditional = {
      send: vi.fn().mockRejectedValue(canceled('ConditionalCheckFailed', 'None')),
    };
    await expect(rollbackUsage(conditional, usage)).rejects.toMatchObject({
      name: 'TransactionCanceledException',
    });
    expect(conditional.send).toHaveBeenCalledTimes(1);
  });

  it('treats the Session marker miss as an already-compensated replay', async () => {
    const replay = {
      send: vi.fn().mockRejectedValue(canceled(
        'None',
        'None',
        'ConditionalCheckFailed',
      )),
    };

    await expect(rollbackUsage(replay, usage)).resolves.toBeUndefined();
    expect(replay.send).toHaveBeenCalledOnce();
  });

  it('fails closed after bounded rollback retries are exhausted', async () => {
    const failing = { send: vi.fn().mockRejectedValue(new Error('rollback failed')) };
    await expect(rollbackUsage(failing, usage)).rejects.toThrow('rollback failed');
    expect(failing.send).toHaveBeenCalledTimes(3);
  });
});
