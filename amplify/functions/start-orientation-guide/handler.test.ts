import { describe, expect, it, vi } from 'vitest';
import { createHandler } from './handler';

const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000';
const WORKER_ARN = 'arn:aws:lambda:us-east-1:123456789012:function:orientation-guide:live';
const event = {
  identity: { sub: 'account-1' },
  arguments: {
    requestId: REQUEST_ID,
    context: '  Erica is deciding whether to move the kiln.  ',
    spreadKey: 'single',
  },
};

function conditionalFailure() {
  return { name: 'ConditionalCheckFailedException' };
}

function dependencies() {
  const order: string[] = [];
  const dynamo = {
    send: vi.fn(async (command: unknown) => {
      order.push((command as { constructor: { name: string } }).constructor.name);
      return {};
    }),
  };
  const lambda = {
    send: vi.fn(async (command: unknown) => {
      order.push((command as { constructor: { name: string } }).constructor.name);
      return {};
    }),
  };

  return {
    dynamo,
    lambda,
    tableNames: { session: 'SessionTable' },
    workerFunctionArn: WORKER_ARN,
    now: () => new Date('2026-07-19T18:00:00.000Z'),
    order,
  };
}

describe('start-orientation-guide handler', () => {
  it('creates the PENDING Session before asynchronously invoking the qualified durable worker', async () => {
    const deps = dependencies();

    const result = await createHandler(deps)(event);

    expect(result).toEqual({ sessionId: REQUEST_ID, status: 'PENDING' });
    expect(deps.order).toEqual(['PutCommand', 'InvokeCommand']);
    expect((deps.dynamo.send.mock.calls[0][0] as { input: unknown }).input).toEqual({
      TableName: 'SessionTable',
      Item: {
        id: REQUEST_ID,
        owner: 'account-1',
        spreadKey: 'single',
        context: '  Erica is deciding whether to move the kiln.  ',
        status: 'PENDING',
        createdAt: '2026-07-19T18:00:00.000Z',
        updatedAt: '2026-07-19T18:00:00.000Z',
      },
      ConditionExpression: 'attribute_not_exists(id)',
    });
    const invocation = (deps.lambda.send.mock.calls[0][0] as {
      input: Record<string, unknown>;
    }).input;
    expect(invocation).toMatchObject({
      FunctionName: WORKER_ARN,
      InvocationType: 'Event',
      DurableExecutionName: REQUEST_ID,
    });
    expect(JSON.parse(invocation.Payload as string)).toEqual({ sessionId: REQUEST_ID });
  });

  it.each([
    [{ ...event, identity: null }, 'authenticated identity required'],
    [{ ...event, arguments: { ...event.arguments, context: '   ' } }, 'context is required'],
    [{
      ...event,
      arguments: { ...event.arguments, context: 'x'.repeat(10_001) },
    }, 'context must be 10000 characters or fewer'],
    [{ ...event, arguments: { ...event.arguments, spreadKey: 'forged' } }, 'invalid spreadKey'],
    [{ ...event, arguments: { ...event.arguments, spreadKey: 'constructor' } }, 'invalid spreadKey'],
    [{
      ...event,
      arguments: { ...event.arguments, requestId: 'not-a-uuid' },
    }, 'invalid requestId'],
  ])('rejects invalid input before writing or invoking', async (invalidEvent, message) => {
    const deps = dependencies();

    await expect(createHandler(deps)(invalidEvent)).rejects.toThrow(message);

    expect(deps.dynamo.send).not.toHaveBeenCalled();
    expect(deps.lambda.send).not.toHaveBeenCalled();
  });

  it('accepts Context at the exact 10,000-character boundary', async () => {
    const deps = dependencies();
    const boundaryEvent = {
      ...event,
      arguments: { ...event.arguments, context: 'x'.repeat(10_000) },
    };

    await expect(createHandler(deps)(boundaryEvent)).resolves.toEqual({
      sessionId: REQUEST_ID,
      status: 'PENDING',
    });

    const put = (deps.dynamo.send.mock.calls[0][0] as {
      input: { Item: { context: string } };
    }).input;
    expect(put.Item.context).toHaveLength(10_000);
    expect(deps.lambda.send).toHaveBeenCalledOnce();
  });

  it.each([
    { label: 'Session table', configure: (deps: ReturnType<typeof dependencies>) => {
      deps.tableNames.session = '';
    } },
    { label: 'worker ARN', configure: (deps: ReturnType<typeof dependencies>) => {
      deps.workerFunctionArn = '';
    } },
  ])('rejects missing $label configuration before writing or invoking', async ({ configure }) => {
    const deps = dependencies();
    configure(deps);

    await expect(createHandler(deps)(event))
      .rejects.toThrow('start-orientation-guide configuration is missing');

    expect(deps.dynamo.send).not.toHaveBeenCalled();
    expect(deps.lambda.send).not.toHaveBeenCalled();
  });

  it('propagates a generic conditional-create write failure without reading or invoking', async () => {
    const deps = dependencies();
    deps.dynamo.send.mockRejectedValueOnce(new Error('DynamoDB unavailable'));

    await expect(createHandler(deps)(event)).rejects.toThrow('DynamoDB unavailable');

    expect(deps.dynamo.send).toHaveBeenCalledOnce();
    expect(deps.lambda.send).not.toHaveBeenCalled();
  });

  it('propagates a failed duplicate read without invoking the worker', async () => {
    const deps = dependencies();
    deps.dynamo.send
      .mockRejectedValueOnce(conditionalFailure())
      .mockRejectedValueOnce(new Error('duplicate read unavailable'));

    await expect(createHandler(deps)(event)).rejects.toThrow('duplicate read unavailable');

    expect(deps.dynamo.send).toHaveBeenCalledTimes(2);
    expect(deps.lambda.send).not.toHaveBeenCalled();
  });

  it('fails closed when the conditional-create race read returns no Session', async () => {
    const deps = dependencies();
    deps.dynamo.send
      .mockRejectedValueOnce(conditionalFailure())
      .mockResolvedValueOnce({});

    await expect(createHandler(deps)(event)).rejects.toThrow('IDEMPOTENCY_CONFLICT');

    expect(deps.dynamo.send).toHaveBeenCalledTimes(2);
    expect(deps.lambda.send).not.toHaveBeenCalled();
  });

  it('returns an identical RUNNING Session without starting a fresh execution', async () => {
    const deps = dependencies();
    deps.dynamo.send
      .mockRejectedValueOnce(conditionalFailure())
      .mockResolvedValueOnce({
        Item: {
          id: REQUEST_ID,
          owner: 'account-1',
          context: event.arguments.context,
          spreadKey: 'single',
          status: 'RUNNING',
        },
      });

    await expect(createHandler(deps)(event)).resolves.toEqual({
      sessionId: REQUEST_ID,
      status: 'RUNNING',
    });

    expect(deps.dynamo.send).toHaveBeenCalledTimes(2);
    expect(deps.lambda.send).not.toHaveBeenCalled();
    expect(deps.dynamo.send.mock.calls.map(
      ([command]) => (command as { constructor: { name: string } }).constructor.name,
    )).toEqual(['PutCommand', 'GetCommand']);
    expect((deps.dynamo.send.mock.calls[1][0] as { input: unknown }).input).toEqual({
      TableName: 'SessionTable',
      Key: { id: REQUEST_ID },
      ConsistentRead: true,
    });
  });

  it('re-issues the named invoke only when an identical existing Session is PENDING', async () => {
    const deps = dependencies();
    deps.dynamo.send
      .mockRejectedValueOnce(conditionalFailure())
      .mockResolvedValueOnce({
        Item: {
          id: REQUEST_ID,
          owner: 'account-1',
          context: event.arguments.context,
          spreadKey: 'single',
          status: 'PENDING',
        },
      });

    await expect(createHandler(deps)(event)).resolves.toEqual({
      sessionId: REQUEST_ID,
      status: 'PENDING',
    });

    expect(deps.lambda.send).toHaveBeenCalledOnce();
    expect(deps.dynamo.send.mock.invocationCallOrder[1])
      .toBeLessThan(deps.lambda.send.mock.invocationCallOrder[0]);
    expect((deps.lambda.send.mock.calls[0][0] as { input: unknown }).input).toMatchObject({
      DurableExecutionName: REQUEST_ID,
      Payload: JSON.stringify({ sessionId: REQUEST_ID }),
    });
  });

  it.each([
    ['SUCCEEDED', 'SUCCEEDED'],
    ['FAILED', 'FAILED'],
    [undefined, 'SUCCEEDED'],
  ])('does not invoke an existing terminal or legacy Session with status %s', async (
    existingStatus,
    expectedStatus,
  ) => {
    const deps = dependencies();
    deps.dynamo.send
      .mockRejectedValueOnce(conditionalFailure())
      .mockResolvedValueOnce({
        Item: {
          id: REQUEST_ID,
          owner: 'account-1',
          context: event.arguments.context,
          spreadKey: 'single',
          status: existingStatus,
        },
      });

    await expect(createHandler(deps)(event)).resolves.toEqual({
      sessionId: REQUEST_ID,
      status: expectedStatus,
    });
    expect(deps.lambda.send).not.toHaveBeenCalled();
  });

  it.each([
    { existingOverride: { context: 'different context' }, label: 'input mismatch' },
    { existingOverride: { spreadKey: 'system' }, label: 'spread mismatch' },
    { existingOverride: { owner: 'account-2' }, label: 'owner mismatch' },
  ])('rejects conflicting idempotency after an $label', async ({ existingOverride }) => {
    const deps = dependencies();
    deps.dynamo.send
      .mockRejectedValueOnce(conditionalFailure())
      .mockResolvedValueOnce({
        Item: {
          id: REQUEST_ID,
          owner: 'account-1',
          context: event.arguments.context,
          spreadKey: 'single',
          status: 'PENDING',
          ...existingOverride,
        },
      });

    await expect(createHandler(deps)(event)).rejects.toThrow('IDEMPOTENCY_CONFLICT');

    expect(deps.lambda.send).not.toHaveBeenCalled();
  });

  it('treats DurableExecutionAlreadyStartedException as an accepted start', async () => {
    const deps = dependencies();
    deps.lambda.send.mockRejectedValueOnce({
      name: 'DurableExecutionAlreadyStartedException',
    });

    await expect(createHandler(deps)(event)).resolves.toEqual({
      sessionId: REQUEST_ID,
      status: 'PENDING',
    });
  });

  it('propagates unrelated worker invocation failures', async () => {
    const deps = dependencies();
    deps.lambda.send.mockRejectedValueOnce(new Error('worker invoke unavailable'));

    await expect(createHandler(deps)(event)).rejects.toThrow('worker invoke unavailable');

    expect(deps.dynamo.send).toHaveBeenCalledOnce();
    expect(deps.lambda.send).toHaveBeenCalledOnce();
    expect((deps.lambda.send.mock.calls[0][0] as { constructor: { name: string } })
      .constructor.name).toBe('InvokeCommand');
  });
});
