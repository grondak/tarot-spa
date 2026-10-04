import { describe, expect, it, vi } from 'vitest';
import { createHandler } from './handler';
import {
  SCRUBBED_CONTEXT_PLACEHOLDER,
  SCRUBBED_GUIDE_PLACEHOLDER,
} from '../../config';

const NOW_ISO = '2026-07-22T18:00:00.000Z';
const NOW_EPOCH_SECONDS = Math.floor(Date.parse(NOW_ISO) / 1000);

function commandName(command: unknown) {
  return (command as { constructor: { name: string } }).constructor.name;
}

function commandInput(command: unknown) {
  return (command as { input: Record<string, unknown> }).input;
}

function dependencies() {
  return {
    dynamo: { send: vi.fn<(command: unknown) => Promise<unknown>>() },
    sessionTableName: 'SessionTable',
    now: () => new Date(NOW_ISO),
  };
}

describe('session-scrubber handler', () => {
  it('rejects incomplete configuration before scanning', async () => {
    const deps = dependencies();
    deps.sessionTableName = '';

    await expect(createHandler(deps)())
      .rejects.toThrow('session-scrubber configuration is missing');
    expect(deps.dynamo.send).not.toHaveBeenCalled();
  });

  it('scans with the correct eligibility filter and scrubs each eligible row', async () => {
    const deps = dependencies();
    deps.dynamo.send.mockImplementation(async (command) => {
      if (commandName(command) === 'ScanCommand') {
        return { Items: [{ id: 'session-1' }, { id: 'session-2' }] };
      }
      if (commandName(command) === 'UpdateCommand') return {};
      throw new Error(`Unexpected ${commandName(command)}`);
    });

    await expect(createHandler(deps)()).resolves.toEqual({ inspected: 2, scrubbed: 2 });

    const scan = deps.dynamo.send.mock.calls.find(
      ([command]) => commandName(command) === 'ScanCommand',
    )?.[0];
    expect(commandInput(scan)).toMatchObject({
      TableName: 'SessionTable',
      ConsistentRead: true,
      FilterExpression: 'expiresAt <= :now AND attribute_not_exists(scrubbedAt)',
      ProjectionExpression: 'id',
      ExpressionAttributeValues: { ':now': NOW_EPOCH_SECONDS },
    });

    const updates = deps.dynamo.send.mock.calls
      .filter(([command]) => commandName(command) === 'UpdateCommand')
      .map(([command]) => commandInput(command));
    expect(updates).toEqual([
      {
        TableName: 'SessionTable',
        Key: { id: 'session-1' },
        ConditionExpression: 'attribute_not_exists(scrubbedAt)',
        UpdateExpression: 'SET context = :context, guide = :guide, scrubbedAt = :timestamp, updatedAt = :timestamp',
        ExpressionAttributeValues: {
          ':context': SCRUBBED_CONTEXT_PLACEHOLDER,
          ':guide': SCRUBBED_GUIDE_PLACEHOLDER,
          ':timestamp': NOW_ISO,
        },
      },
      {
        TableName: 'SessionTable',
        Key: { id: 'session-2' },
        ConditionExpression: 'attribute_not_exists(scrubbedAt)',
        UpdateExpression: 'SET context = :context, guide = :guide, scrubbedAt = :timestamp, updatedAt = :timestamp',
        ExpressionAttributeValues: {
          ':context': SCRUBBED_CONTEXT_PLACEHOLDER,
          ':guide': SCRUBBED_GUIDE_PLACEHOLDER,
          ':timestamp': NOW_ISO,
        },
      },
    ]);
  });

  it('paginates the Session scan', async () => {
    const deps = dependencies();
    deps.dynamo.send
      .mockResolvedValueOnce({
        Items: [{ id: 'page-1-session' }],
        LastEvaluatedKey: { id: 'cursor' },
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Items: [{ id: 'page-2-session' }] })
      .mockResolvedValueOnce({});

    await expect(createHandler(deps)()).resolves.toEqual({ inspected: 2, scrubbed: 2 });

    const scans = deps.dynamo.send.mock.calls
      .filter(([command]) => commandName(command) === 'ScanCommand')
      .map(([command]) => commandInput(command));
    expect(scans).toHaveLength(2);
    expect(scans[1].ExclusiveStartKey).toEqual({ id: 'cursor' });
  });

  it('tolerates a concurrent scrub race without counting it as scrubbed', async () => {
    const deps = dependencies();
    deps.dynamo.send
      .mockResolvedValueOnce({ Items: [{ id: 'already-scrubbed' }] })
      .mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' });

    await expect(createHandler(deps)()).resolves.toEqual({ inspected: 1, scrubbed: 0 });
  });

  it('skips rows with no id', async () => {
    const deps = dependencies();
    deps.dynamo.send.mockResolvedValueOnce({ Items: [{}] });

    await expect(createHandler(deps)()).resolves.toEqual({ inspected: 0, scrubbed: 0 });
    expect(deps.dynamo.send).toHaveBeenCalledOnce();
  });

  it('propagates unrelated Session update failures', async () => {
    const deps = dependencies();
    deps.dynamo.send
      .mockResolvedValueOnce({ Items: [{ id: 'update-failure' }] })
      .mockRejectedValueOnce(new Error('DynamoDB unavailable'));

    await expect(createHandler(deps)()).rejects.toThrow('DynamoDB unavailable');
  });
});
