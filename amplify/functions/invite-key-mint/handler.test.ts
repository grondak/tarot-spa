import { describe, expect, it, vi } from 'vitest';
import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import { createHandler } from './handler';

const event = { identity: { sub: 'account-123' } };

function dependencies() {
  return {
    dynamo: { send: vi.fn() },
    accountTableName: 'AccountTable',
    inviteKeyTableName: 'InviteKeyTable',
    generateCode: vi.fn(() => 'ABCD-EFGH-JKMP'),
  };
}

describe('invite-key-mint handler', () => {
  it('atomically marks the account and creates one SecondGen key', async () => {
    const deps = dependencies();
    deps.dynamo.send.mockResolvedValueOnce({});

    const code = await createHandler(deps)(event);

    expect(code).toBe('ABCD-EFGH-JKMP');
    expect(deps.dynamo.send).toHaveBeenCalledOnce();
    const transaction = deps.dynamo.send.mock.calls[0][0].input;
    expect(transaction.TransactItems).toHaveLength(2);

    const accountUpdate = transaction.TransactItems[0].Update;
    expect(accountUpdate.Key).toEqual({ id: 'account-123' });
    expect(accountUpdate.ConditionExpression).toContain('#generation = :firstGen');
    expect(accountUpdate.ConditionExpression).toContain('#onwardKeyGenerated = :false');
    expect(accountUpdate.ExpressionAttributeNames).toMatchObject({
      '#generation': 'generation',
      '#onwardKeyGenerated': 'onwardKeyGenerated',
    });
    expect(accountUpdate.UpdateExpression).toContain('updatedAt = :timestamp');
    expect(accountUpdate.ExpressionAttributeValues).toMatchObject({
      ':firstGen': 'FirstGen',
      ':false': false,
      ':true': true,
    });

    const keyPut = transaction.TransactItems[1].Put;
    expect(keyPut.Item).toMatchObject({
      id: 'ABCD-EFGH-JKMP',
      status: 'unredeemed',
      generation: 'SecondGen',
    });
    expect(keyPut.Item.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(keyPut.Item.updatedAt).toBe(keyPut.Item.createdAt);
    expect(accountUpdate.ExpressionAttributeValues[':timestamp']).toBe(keyPut.Item.createdAt);
    expect(keyPut.ConditionExpression).toBe('attribute_not_exists(id)');
  });

  it('returns a clean not-eligible error after a conditional failure', async () => {
    const deps = dependencies();
    deps.dynamo.send.mockRejectedValueOnce(new TransactionCanceledException({
      $metadata: {},
      message: 'condition failed',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
    }));

    await expect(createHandler(deps)(event)).rejects.toThrow('not eligible');
  });

  it('rejects a missing caller identity without touching DynamoDB', async () => {
    const deps = dependencies();

    await expect(createHandler(deps)({ identity: null })).rejects.toThrow('authenticated identity required');
    expect(deps.dynamo.send).not.toHaveBeenCalled();
  });

  it('fails clearly when table configuration is missing', async () => {
    const deps = dependencies();
    deps.accountTableName = '';

    await expect(createHandler(deps)(event)).rejects.toThrow('table configuration is missing');
    expect(deps.dynamo.send).not.toHaveBeenCalled();
  });

  it('mints a FirstGen key on the admin field without a caller identity', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T21:10:00.000Z'));
    const deps = dependencies();
    deps.dynamo.send.mockResolvedValueOnce({});

    try {
      const code = await createHandler(deps)({
        fieldName: 'adminMintInviteKey',
      });

      expect(code).toBe('ABCD-EFGH-JKMP');
      expect(deps.dynamo.send).toHaveBeenCalledOnce();
      expect(deps.dynamo.send.mock.calls[0][0].input).toEqual({
        TableName: 'InviteKeyTable',
        Item: {
          id: 'ABCD-EFGH-JKMP',
          status: 'unredeemed',
          generation: 'FirstGen',
          createdAt: '2026-07-28T21:10:00.000Z',
          updatedAt: '2026-07-28T21:10:00.000Z',
        },
        ConditionExpression: 'attribute_not_exists(id)',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('propagates an admin-key collision', async () => {
    const deps = dependencies();
    const collision = new ConditionalCheckFailedException({
      $metadata: {},
      message: 'condition failed',
    });
    deps.dynamo.send.mockRejectedValueOnce(collision);

    await expect(createHandler(deps)({
      info: { fieldName: 'adminMintInviteKey' },
    })).rejects.toBe(collision);
  });

  it('keeps the explicit mintOnwardKey field on the unchanged onward path', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T21:10:00.000Z'));
    const omittedInfoDeps = dependencies();
    const explicitInfoDeps = dependencies();
    omittedInfoDeps.dynamo.send.mockResolvedValueOnce({});
    explicitInfoDeps.dynamo.send.mockResolvedValueOnce({});

    try {
      await createHandler(omittedInfoDeps)(event);
      await createHandler(explicitInfoDeps)({
        ...event,
        fieldName: 'mintOnwardKey',
      });

      expect(explicitInfoDeps.dynamo.send.mock.calls[0][0].input).toEqual(
        omittedInfoDeps.dynamo.send.mock.calls[0][0].input,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the nested info.fieldName mintOnwardKey field on the unchanged onward path', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T21:10:00.000Z'));
    const omittedInfoDeps = dependencies();
    const nestedInfoDeps = dependencies();
    omittedInfoDeps.dynamo.send.mockResolvedValueOnce({});
    nestedInfoDeps.dynamo.send.mockResolvedValueOnce({});

    try {
      await createHandler(omittedInfoDeps)(event);
      await createHandler(nestedInfoDeps)({
        ...event,
        info: { fieldName: 'mintOnwardKey' },
      });

      expect(nestedInfoDeps.dynamo.send.mock.calls[0][0].input).toEqual(
        omittedInfoDeps.dynamo.send.mock.calls[0][0].input,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects an unrecognized fieldName instead of silently falling through to the onward path', async () => {
    const deps = dependencies();

    await expect(createHandler(deps)({
      ...event,
      fieldName: 'someOtherMutation',
    })).rejects.toThrow('unrecognized fieldName');
    expect(deps.dynamo.send).not.toHaveBeenCalled();
  });

  it('treats an explicit null fieldName the same as an absent one, not as unrecognized', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T21:10:00.000Z'));
    const omittedInfoDeps = dependencies();
    const nullFieldNameDeps = dependencies();
    omittedInfoDeps.dynamo.send.mockResolvedValueOnce({});
    nullFieldNameDeps.dynamo.send.mockResolvedValueOnce({});

    try {
      await createHandler(omittedInfoDeps)(event);
      await createHandler(nullFieldNameDeps)({
        ...event,
        fieldName: null,
        info: { fieldName: null },
      });

      expect(nullFieldNameDeps.dynamo.send.mock.calls[0][0].input).toEqual(
        omittedInfoDeps.dynamo.send.mock.calls[0][0].input,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
