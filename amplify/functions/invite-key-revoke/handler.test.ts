import { describe, expect, it, vi } from 'vitest';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { createHandler } from './handler';

function dependencies() {
  return {
    dynamo: { send: vi.fn() },
    inviteKeyTableName: 'InviteKeyTable',
  };
}

function event(code: string, sub: string | null = 'admin-789') {
  return { arguments: { code }, identity: sub ? { sub } : null };
}

describe('invite-key-revoke handler', () => {
  it('atomically flips an unredeemed key to revoked', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T12:00:00.000Z'));
    const deps = dependencies();
    deps.dynamo.send.mockResolvedValueOnce({});

    try {
      const result = await createHandler(deps)(event('ABCD-EFGH-JKMP'));

      expect(result).toBe(true);
      expect(deps.dynamo.send).toHaveBeenCalledOnce();
      const input = deps.dynamo.send.mock.calls[0][0].input;
      expect(input).toEqual({
        TableName: 'InviteKeyTable',
        Key: { id: 'ABCD-EFGH-JKMP' },
        ConditionExpression: '#status = :unredeemed',
        UpdateExpression: 'SET #status = :revoked, updatedAt = :timestamp, revokedBy = :revokedBy, revokedAt = :timestamp',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':unredeemed': 'unredeemed',
          ':revoked': 'revoked',
          ':timestamp': '2026-10-02T12:00:00.000Z',
          ':revokedBy': 'admin-789',
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('writes a null revokedBy when no caller identity is present', async () => {
    const deps = dependencies();
    deps.dynamo.send.mockResolvedValueOnce({});

    await createHandler(deps)(event('ABCD-EFGH-JKMP', null));

    expect(deps.dynamo.send.mock.calls[0][0].input.ExpressionAttributeValues).toMatchObject({
      ':revokedBy': null,
    });
  });

  it('trims the code before using it as the DynamoDB key', async () => {
    const deps = dependencies();
    deps.dynamo.send.mockResolvedValueOnce({});

    await createHandler(deps)(event('  ABCD-EFGH-JKMP  '));

    expect(deps.dynamo.send.mock.calls[0][0].input.Key).toEqual({ id: 'ABCD-EFGH-JKMP' });
  });

  it('throws INVITE_KEY_NOT_FOUND for a blank code without any DynamoDB call', async () => {
    const deps = dependencies();

    await expect(createHandler(deps)(event('   '))).rejects.toThrow('INVITE_KEY_NOT_FOUND');
    expect(deps.dynamo.send).not.toHaveBeenCalled();
  });

  it('fails clearly when table configuration is missing, without any DynamoDB call', async () => {
    const deps = dependencies();
    deps.inviteKeyTableName = '';

    await expect(createHandler(deps)(event('ABCD-EFGH-JKMP'))).rejects.toThrow(
      'invite-key-revoke table configuration is missing',
    );
    expect(deps.dynamo.send).not.toHaveBeenCalled();
  });

  it('classifies a not-found key after a conditional failure', async () => {
    const deps = dependencies();
    deps.dynamo.send
      .mockRejectedValueOnce(new ConditionalCheckFailedException({ $metadata: {}, message: 'condition failed' }))
      .mockResolvedValueOnce({ Item: undefined });

    await expect(createHandler(deps)(event('MISSING-CODE'))).rejects.toThrow('INVITE_KEY_NOT_FOUND');

    expect(deps.dynamo.send).toHaveBeenCalledTimes(2);
    const followUp = deps.dynamo.send.mock.calls[1][0].input;
    expect(followUp).toEqual({
      TableName: 'InviteKeyTable',
      Key: { id: 'MISSING-CODE' },
      ProjectionExpression: '#status',
      ExpressionAttributeNames: { '#status': 'status' },
      ConsistentRead: true,
    });
  });

  it('classifies an already-redeemed key after a conditional failure', async () => {
    const deps = dependencies();
    deps.dynamo.send
      .mockRejectedValueOnce(new ConditionalCheckFailedException({ $metadata: {}, message: 'condition failed' }))
      .mockResolvedValueOnce({ Item: { status: 'redeemed' } });

    await expect(createHandler(deps)(event('REDEEMED-CODE'))).rejects.toThrow('INVITE_KEY_ALREADY_REDEEMED');
  });

  it('classifies an already-revoked key after a conditional failure', async () => {
    const deps = dependencies();
    deps.dynamo.send
      .mockRejectedValueOnce(new ConditionalCheckFailedException({ $metadata: {}, message: 'condition failed' }))
      .mockResolvedValueOnce({ Item: { status: 'revoked' } });

    await expect(createHandler(deps)(event('REVOKED-CODE'))).rejects.toThrow('INVITE_KEY_ALREADY_REVOKED');
  });

  it('throws a generic failure for an unrecognized stored status', async () => {
    const deps = dependencies();
    deps.dynamo.send
      .mockRejectedValueOnce(new ConditionalCheckFailedException({ $metadata: {}, message: 'condition failed' }))
      .mockResolvedValueOnce({ Item: { status: 'something-unexpected' } });

    await expect(createHandler(deps)(event('WEIRD-CODE'))).rejects.toThrow('INVITE_KEY_REVOKE_FAILED');
  });

  it('propagates an unrelated DynamoDB error unchanged, without a follow-up read', async () => {
    const deps = dependencies();
    const unrelated = new Error('ProvisionedThroughputExceededException');
    deps.dynamo.send.mockRejectedValueOnce(unrelated);

    await expect(createHandler(deps)(event('ABCD-EFGH-JKMP'))).rejects.toBe(unrelated);
    expect(deps.dynamo.send).toHaveBeenCalledOnce();
  });

  it('throws a stable code if the follow-up classification read itself fails', async () => {
    const deps = dependencies();
    deps.dynamo.send
      .mockRejectedValueOnce(new ConditionalCheckFailedException({ $metadata: {}, message: 'condition failed' }))
      .mockRejectedValueOnce(new Error('ProvisionedThroughputExceededException'));

    await expect(createHandler(deps)(event('ABCD-EFGH-JKMP'))).rejects.toThrow('INVITE_KEY_REVOKE_FAILED');
  });

  it('throws INVITE_KEY_NOT_FOUND for a non-string code without any DynamoDB call', async () => {
    const deps = dependencies();

    await expect(createHandler(deps)({ arguments: {} } as unknown as { arguments: { code: string } })).rejects.toThrow(
      'INVITE_KEY_NOT_FOUND',
    );
    expect(deps.dynamo.send).not.toHaveBeenCalled();
  });
});
