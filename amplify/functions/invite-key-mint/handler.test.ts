import { describe, expect, it, vi } from 'vitest';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
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
});
