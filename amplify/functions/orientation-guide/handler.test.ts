import { describe, expect, it, vi } from 'vitest';
import { createHandler } from './handler';

const card = {
  name: 'The Fool',
  pattern: 'Begin before certainty arrives.',
  invertedPattern: 'Motion without attention.',
  questions: ['What becomes possible if you begin?'],
  inverted: false,
};

function response(results = [{
  title: 'Event',
  content: 'Detail',
  url: 'https://example.com',
  published_date: '2026-07-18',
  score: 0.9,
}]) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({ results }),
  } as unknown as Response;
}

function dependencies(overrides: Record<string, unknown> = {}) {
  const commands: unknown[] = [];
  const dynamo = {
    send: vi.fn(async (command: unknown) => {
      commands.push(command);
      if ((command as { constructor: { name: string } }).constructor.name === 'GetCommand') {
        return { Item: { dailyLimit: 5, monthlyBudget: 30 } };
      }
      return {};
    }),
  };
  const bedrock = {
    send: vi.fn().mockResolvedValue({
      output: { message: { content: [{ text: 'A specific continuous essay.' }] } },
    }),
  };

  return {
    dynamo,
    bedrock,
    fetchFn: vi.fn().mockResolvedValue(response()),
    tableNames: {
      session: 'SessionTable',
      dailyUsage: 'DailyTable',
      monthlySpend: 'MonthlyTable',
      config: 'ConfigTable',
    },
    tavilyApiKey: 'secret-from-environment',
    drawCards: vi.fn(() => [card]),
    now: () => new Date('2026-07-18T20:00:00Z'),
    commands,
    ...overrides,
  };
}

const event = {
  identity: { sub: 'account-1' },
  arguments: { context: 'Erica is deciding whether to move the kiln into the old warehouse.', spreadKey: 'single' },
};

describe('orientation-guide handler', () => {
  it('reserves in order, grounds with Tavily, invokes Opus, persists, and returns a lean payload', async () => {
    const deps = dependencies();
    const result = await createHandler(deps)(event);

    const inputs = deps.commands.map((command) => (command as { input: Record<string, unknown> }).input);
    expect(inputs[1].TableName).toBe('DailyTable');
    expect(inputs[2].TableName).toBe('MonthlyTable');
    expect(deps.fetchFn).toHaveBeenCalledWith(
      'https://api.tavily.com/search',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer secret-from-environment', 'Content-Type': 'application/json' },
      }),
    );
    expect(JSON.parse(deps.fetchFn.mock.calls[0][1].body)).toMatchObject({
      topic: 'news',
      search_depth: 'basic',
      max_results: 3,
    });
    expect(deps.bedrock.send).toHaveBeenCalledTimes(1);
    expect((deps.bedrock.send.mock.calls[0][0] as { input: unknown }).input).toMatchObject({
      modelId: 'us.anthropic.claude-opus-4-6-v1',
      inferenceConfig: { maxTokens: 1500 },
    });
    expect(inputs[3]).toMatchObject({
      TableName: 'SessionTable',
      Item: expect.objectContaining({ owner: 'account-1', guide: 'A specific continuous essay.' }),
    });
    expect(result).toMatchObject({
      sessionId: expect.any(String),
      cards: [{ name: 'The Fool', position: 'Draw', inverted: false }],
      guide: 'A specific continuous essay.',
      tavilyTimedOut: false,
    });
    expect(result.currentEvents).toEqual([{
      title: 'Event',
      content: 'Detail',
      url: 'https://example.com',
      published_date: '2026-07-18',
    }]);
  });

  it.each([
    [{ ...event, arguments: { ...event.arguments, context: '   ' } }, 'context is required'],
    [{ ...event, arguments: { ...event.arguments, spreadKey: 'forged' } }, 'invalid spreadKey'],
  ])('rejects invalid input before DynamoDB writes', async (invalidEvent, message) => {
    const deps = dependencies();
    await expect(createHandler(deps)(invalidEvent)).rejects.toThrow(message);
    expect(deps.dynamo.send).not.toHaveBeenCalled();
  });

  it('stops on the daily cap before provider calls', async () => {
    const deps = dependencies();
    deps.dynamo.send.mockImplementation(async (command: unknown) => {
      if ((command as { constructor: { name: string } }).constructor.name === 'GetCommand') {
        return { Item: { dailyLimit: 5, monthlyBudget: 30 } };
      }
      throw { name: 'ConditionalCheckFailedException' };
    });
    await expect(createHandler(deps)(event)).rejects.toThrow('DAILY_LIMIT_EXHAUSTED');
    expect(deps.fetchFn).not.toHaveBeenCalled();
    expect(deps.bedrock.send).not.toHaveBeenCalled();
  });

  it('rolls daily back when the monthly reservation fails', async () => {
    const deps = dependencies();
    let updates = 0;
    deps.dynamo.send.mockImplementation(async (command: unknown) => {
      if ((command as { constructor: { name: string } }).constructor.name === 'GetCommand') {
        return { Item: { dailyLimit: 5, monthlyBudget: 30 } };
      }
      updates += 1;
      if (updates === 2) throw { name: 'ConditionalCheckFailedException' };
      return {};
    });
    await expect(createHandler(deps)(event)).rejects.toThrow('MONTHLY_BUDGET_EXHAUSTED');
    expect(deps.dynamo.send).toHaveBeenCalledTimes(4);
  });

  it('treats Tavily abort as an ungrounded counted success without rollback', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    const deps = dependencies({ fetchFn: vi.fn().mockRejectedValue(abort) });
    await expect(createHandler(deps)(event)).resolves.toMatchObject({
      currentEvents: [],
      tavilyTimedOut: true,
    });
    expect(deps.dynamo.send).toHaveBeenCalledTimes(4);
  });

  it.each(['tavily', 'bedrock'])('rolls both reservations back on outright %s failure', async (provider) => {
    const overrides = provider === 'tavily'
      ? { fetchFn: vi.fn().mockResolvedValue({ ok: false, status: 500 }) }
      : { bedrock: { send: vi.fn().mockRejectedValue(new Error('Bedrock unavailable')) } };
    const deps = dependencies(overrides);
    await expect(createHandler(deps)(event)).rejects.toThrow('GENERATION_FAILED');
    expect(deps.dynamo.send).toHaveBeenCalledTimes(5);
  });

  it('fails before reservation when Config is missing', async () => {
    const deps = dependencies();
    deps.dynamo.send.mockResolvedValue({});
    await expect(createHandler(deps)(event)).rejects.toThrow('orientation config missing');
    expect(deps.dynamo.send).toHaveBeenCalledTimes(1);
  });

  it('returns the paid result when Session persistence fails', async () => {
    const deps = dependencies();
    deps.dynamo.send.mockImplementation(async (command: unknown) => {
      const name = (command as { constructor: { name: string } }).constructor.name;
      if (name === 'GetCommand') return { Item: { dailyLimit: 5, monthlyBudget: 30 } };
      if (name === 'PutCommand') throw new Error('Session unavailable');
      return {};
    });
    await expect(createHandler(deps)(event)).resolves.toMatchObject({
      guide: 'A specific continuous essay.',
    });
    expect(deps.dynamo.send).toHaveBeenCalledTimes(4);
  });
});
