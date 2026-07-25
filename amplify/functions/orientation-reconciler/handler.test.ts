import { describe, expect, it, vi } from 'vitest';
import { createHandler, PENDING_STALE_AFTER_MS } from './handler';

const WORKER_ARN = 'arn:aws:lambda:us-east-1:123456789012:function:orientation-guide:live';

function commandName(command: unknown) {
  return (command as { constructor: { name: string } }).constructor.name;
}

function commandInput(command: unknown) {
  return (command as { input: Record<string, unknown> }).input;
}

function dependencies() {
  return {
    dynamo: { send: vi.fn<(command: unknown) => Promise<unknown>>() },
    lambda: { send: vi.fn<(command: unknown) => Promise<unknown>>() },
    sessionTableName: 'SessionTable',
    workerFunctionArn: WORKER_ARN,
    workerFunctionName: 'orientation-guide',
    workerQualifier: 'live',
    now: () => new Date('2026-07-22T18:00:00.000Z'),
  };
}

describe('orientation-reconciler handler', () => {
  it('rejects incomplete configuration before scanning', async () => {
    const deps = dependencies();
    deps.sessionTableName = '';

    await expect(createHandler(deps)())
      .rejects.toThrow('orientation-reconciler configuration is missing');
    expect(deps.dynamo.send).not.toHaveBeenCalled();
    expect(deps.lambda.send).not.toHaveBeenCalled();
  });

  it('dispatches missing work, preserves running work, and terminalizes closed executions', async () => {
    const deps = dependencies();
    deps.dynamo.send.mockImplementation(async (command) => {
      if (commandName(command) === 'ScanCommand') {
        return {
          Items: [
            { id: 'missing-session' },
            { id: 'unrelated-only-session' },
            { id: 'running-session' },
            { id: 'failed-session' },
            { id: 'succeeded-but-pending-session' },
            { id: 'timed-out-session' },
            { id: 'stopped-session' },
          ],
        };
      }
      if (commandName(command) === 'UpdateCommand') return {};
      throw new Error(`Unexpected ${commandName(command)}`);
    });
    deps.lambda.send.mockImplementation(async (command) => {
      const input = commandInput(command);
      if (commandName(command) === 'InvokeCommand') return {};
      if (commandName(command) !== 'ListDurableExecutionsByFunctionCommand') {
        throw new Error(`Unexpected ${commandName(command)}`);
      }
      const name = input.DurableExecutionName;
      if (name === 'missing-session') return { DurableExecutions: [] };
      if (name === 'unrelated-only-session') {
        return {
          DurableExecutions: [{
            DurableExecutionName: 'different-session',
            Status: 'RUNNING',
          }],
        };
      }
      if (name === 'running-session') {
        return { DurableExecutions: [{ DurableExecutionName: name, Status: 'RUNNING' }] };
      }
      if (name === 'failed-session') {
        return { DurableExecutions: [{ DurableExecutionName: name, Status: 'FAILED' }] };
      }
      if (name === 'timed-out-session') {
        return { DurableExecutions: [{ DurableExecutionName: name, Status: 'TIMED_OUT' }] };
      }
      if (name === 'stopped-session') {
        return { DurableExecutions: [{ DurableExecutionName: name, Status: 'STOPPED' }] };
      }
      return { DurableExecutions: [{ DurableExecutionName: name, Status: 'SUCCEEDED' }] };
    });

    await expect(createHandler(deps)()).resolves.toEqual({
      inspected: 7,
      dispatched: 2,
      terminalized: 4,
      running: 1,
    });

    const scan = deps.dynamo.send.mock.calls.find(
      ([command]) => commandName(command) === 'ScanCommand',
    )?.[0];
    expect(commandInput(scan)).toMatchObject({
      TableName: 'SessionTable',
      ConsistentRead: true,
      FilterExpression: '#s = :pending AND updatedAt <= :staleBefore',
      ProjectionExpression: 'id',
      ExpressionAttributeValues: {
        ':pending': 'PENDING',
        ':staleBefore': new Date(
          Date.parse('2026-07-22T18:00:00.000Z') - PENDING_STALE_AFTER_MS,
        ).toISOString(),
      },
    });

    const invokes = deps.lambda.send.mock.calls
      .filter(([command]) => commandName(command) === 'InvokeCommand')
      .map(([command]) => commandInput(command));
    expect(invokes).toHaveLength(2);
    expect(invokes).toEqual([
      {
        FunctionName: WORKER_ARN,
        InvocationType: 'Event',
        DurableExecutionName: 'missing-session',
        Payload: JSON.stringify({ sessionId: 'missing-session' }),
      },
      {
        FunctionName: WORKER_ARN,
        InvocationType: 'Event',
        DurableExecutionName: 'unrelated-only-session',
        Payload: JSON.stringify({ sessionId: 'unrelated-only-session' }),
      },
    ]);

    const lists = deps.lambda.send.mock.calls
      .filter(([command]) => commandName(command) === 'ListDurableExecutionsByFunctionCommand')
      .map(([command]) => commandInput(command));
    expect(lists).toHaveLength(7);
    expect(lists[0]).toMatchObject({
      FunctionName: 'orientation-guide',
      Qualifier: 'live',
      MaxItems: 2,
    });

    const updates = deps.dynamo.send.mock.calls
      .filter(([command]) => commandName(command) === 'UpdateCommand')
      .map(([command]) => commandInput(command));
    expect(updates).toHaveLength(4);
    expect(Object.fromEntries(updates.map((update) => [
      (update.Key as { id: string }).id,
      update,
    ]))).toEqual(Object.fromEntries([
      'failed-session',
      'succeeded-but-pending-session',
      'timed-out-session',
      'stopped-session',
    ].map((id) => [id, {
      TableName: 'SessionTable',
      Key: { id },
      ConditionExpression: '#s = :pending',
      UpdateExpression: 'SET #s = :failed, errorCode = :errorCode, completedAt = :timestamp, updatedAt = :timestamp',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':pending': 'PENDING',
        ':failed': 'FAILED',
        ':errorCode': 'GENERATION_FAILED',
        ':timestamp': '2026-07-22T18:00:00.000Z',
      },
    }])));
  });

  it('paginates the Session scan and tolerates reconciliation races', async () => {
    const deps = dependencies();
    deps.dynamo.send
      .mockResolvedValueOnce({
        Items: [{ id: 'invoke-race' }],
        LastEvaluatedKey: { id: 'cursor' },
      })
      .mockResolvedValueOnce({ Items: [{ id: 'terminal-race' }] })
      .mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' });
    deps.lambda.send
      .mockResolvedValueOnce({ DurableExecutions: [] })
      .mockRejectedValueOnce({ name: 'DurableExecutionAlreadyStartedException' })
      .mockResolvedValueOnce({
        DurableExecutions: [{ DurableExecutionName: 'terminal-race', Status: 'TIMED_OUT' }],
      });

    await expect(createHandler(deps)()).resolves.toEqual({
      inspected: 2,
      dispatched: 0,
      terminalized: 0,
      running: 0,
    });

    const scans = deps.dynamo.send.mock.calls
      .filter(([command]) => commandName(command) === 'ScanCommand')
      .map(([command]) => commandInput(command));
    expect(scans).toHaveLength(2);
    expect(scans[1].ExclusiveStartKey).toEqual({ id: 'cursor' });
  });

  it('propagates unrelated worker invocation failures', async () => {
    const deps = dependencies();
    deps.dynamo.send.mockResolvedValueOnce({ Items: [{ id: 'invoke-failure' }] });
    deps.lambda.send
      .mockResolvedValueOnce({ DurableExecutions: [] })
      .mockRejectedValueOnce(new Error('Lambda unavailable'));

    await expect(createHandler(deps)()).rejects.toThrow('Lambda unavailable');
  });

  it('propagates unrelated terminal Session update failures', async () => {
    const deps = dependencies();
    deps.dynamo.send
      .mockResolvedValueOnce({ Items: [{ id: 'update-failure' }] })
      .mockRejectedValueOnce(new Error('DynamoDB unavailable'));
    deps.lambda.send.mockResolvedValueOnce({
      DurableExecutions: [{
        DurableExecutionName: 'update-failure',
        Status: 'FAILED',
      }],
    });

    await expect(createHandler(deps)()).rejects.toThrow('DynamoDB unavailable');
  });
});
