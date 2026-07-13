import { describe, expect, it, vi } from 'vitest';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { createHandler } from './handler';

const event = {
  userName: 'new-user',
  userPoolId: 'us-east-1_pool',
  request: {
    userAttributes: { sub: 'account-123' },
    clientMetadata: { inviteKeyCode: 'FIRST-GEN-TEST' },
  },
};

function dependencies() {
  return {
    dynamo: { send: vi.fn() },
    cognito: { send: vi.fn() },
    resolveTableNames: vi.fn().mockResolvedValue({
      accountTableName: 'AccountTable',
      inviteKeyTableName: 'InviteKeyTable',
    }),
  };
}

function conditionalFailure() {
  return new TransactionCanceledException({
    $metadata: {},
    message: 'condition failed',
    CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
  });
}

describe('post-confirmation handler', () => {
  it('atomically redeems the key and creates an account, then returns the event', async () => {
    const deps = dependencies();
    deps.dynamo.send
      .mockResolvedValueOnce({ Item: { generation: 'FirstGen' } })
      .mockResolvedValueOnce({});

    const result = await createHandler(deps)(event);

    expect(result).toBe(event);
    expect(deps.dynamo.send).toHaveBeenCalledTimes(2);
    const transaction = deps.dynamo.send.mock.calls[1][0].input;
    expect(transaction.TransactItems).toHaveLength(2);
    expect(transaction.TransactItems[0].Update.ConditionExpression).toContain('#status = :unredeemed');
    expect(transaction.TransactItems[1].Put.Item).toMatchObject({
      id: 'account-123',
      generation: 'FirstGen',
      onwardKeyGenerated: false,
    });
    expect(transaction.TransactItems[1].Put.Item.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(transaction.TransactItems[1].Put.Item.updatedAt).toBe(
      transaction.TransactItems[1].Put.Item.createdAt,
    );
    expect(deps.cognito.send).not.toHaveBeenCalled();
  });

  it('deletes the confirmed Cognito user when the transaction condition fails (key already redeemed or revoked)', async () => {
    // The handler's ConditionExpression only checks `status = unredeemed`; it doesn't
    // distinguish *why* that's false. A revoked key and a key someone else just redeemed
    // both fail the same condition and take this identical compensating-delete path — there
    // is no separate "revoked" code path to test.
    const deps = dependencies();
    deps.dynamo.send
      .mockResolvedValueOnce({ Item: { generation: 'FirstGen' } })
      .mockRejectedValueOnce(conditionalFailure())
      .mockResolvedValueOnce({});

    const result = await createHandler(deps)(event);

    expect(result).toBe(event);
    expect(deps.cognito.send).toHaveBeenCalledOnce();
    expect(deps.cognito.send.mock.calls[0][0].input).toEqual({
      UserPoolId: 'us-east-1_pool',
      Username: 'new-user',
    });
  });

  it('compensates and returns the event when the key does not exist', async () => {
    const deps = dependencies();
    deps.dynamo.send.mockResolvedValueOnce({});

    const result = await createHandler(deps)(event);

    expect(result).toBe(event);
    expect(deps.cognito.send).toHaveBeenCalledOnce();
  });

  it('is idempotent on a retried invocation after the key was already redeemed by this account', async () => {
    const deps = dependencies();
    deps.dynamo.send.mockResolvedValueOnce({ Item: { generation: 'FirstGen', redeemedBy: 'account-123' } });

    const result = await createHandler(deps)(event);

    expect(result).toBe(event);
    expect(deps.dynamo.send).toHaveBeenCalledTimes(1);
    expect(deps.cognito.send).not.toHaveBeenCalled();
  });

  it('does not delete the user when the transaction condition fails but the Account already exists (concurrent retry)', async () => {
    const deps = dependencies();
    deps.dynamo.send
      .mockResolvedValueOnce({ Item: { generation: 'FirstGen' } })
      .mockRejectedValueOnce(conditionalFailure())
      .mockResolvedValueOnce({ Item: { id: 'account-123' } });

    const result = await createHandler(deps)(event);

    expect(result).toBe(event);
    expect(deps.cognito.send).not.toHaveBeenCalled();
  });

  it('never throws and always returns the event, even on an unexpected error', async () => {
    const deps = dependencies();
    deps.dynamo.send.mockRejectedValueOnce(new Error('DynamoDB is throttling'));

    const result = await createHandler(deps)(event);

    expect(result).toBe(event);
  });

  it('never throws and always returns the event when SSM table-name resolution fails', async () => {
    const deps = dependencies();
    deps.resolveTableNames.mockRejectedValueOnce(new Error('SSM parameter not found'));

    const result = await createHandler(deps)(event);

    expect(result).toBe(event);
    expect(deps.dynamo.send).not.toHaveBeenCalled();
  });
});
