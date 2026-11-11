// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { RIVAL_DAILY_LIMIT } from '../../config';
import { createHandler, parseItems, parseRival, SYSTEM_PROMPT } from './handler';

const items = [1, 2, 3, 4].map((n) => ({ id: `i${n}`, title: `Item ${n}`, summary: 'Words.', stance: 'supports' }));
const good = JSON.stringify({ rival: 'Imports, not demand, explain the shortage.', fits: ['i1', 'i2', 'i3'] });

const reply = (text: string, stopReason = 'end_turn') => ({
  output: { message: { content: [{ text }] } },
  stopReason,
});

function setup({ answer = reply(good), dynamoError }: { answer?: unknown; dynamoError?: unknown } = {}) {
  const dynamo = {
    send: vi.fn(async () => {
      if (dynamoError) throw dynamoError;
      return {};
    }),
  };
  const bedrock = { send: vi.fn(async () => answer) };
  const handler = createHandler({ dynamo, bedrock, spendTable: 'spend', now: () => new Date('2026-11-10T12:00:00Z') });
  return { dynamo, bedrock, handler };
}

const call = (handler: ReturnType<typeof createHandler>, args: Record<string, unknown> = {}, sub: string | null = 'u1') => handler({
  identity: sub ? { sub } : null,
  arguments: { title: 'Plant strawberries?', hypothesis: 'Demand is up.', items, ...args },
});

const cancelled = (...codes: string[]) => Object.assign(new Error('cancelled'), {
  name: 'TransactionCanceledException',
  CancellationReasons: codes.map((Code) => ({ Code })),
});

describe('suggest-rival', () => {
  it('returns a rival and the items it fits, reserving first', async () => {
    const { handler, dynamo, bedrock } = setup();
    expect(await call(handler)).toEqual({ rival: 'Imports, not demand, explain the shortage.', fits: ['i1', 'i2', 'i3'] });
    expect(dynamo.send).toHaveBeenCalledTimes(1);
    expect(bedrock.send).toHaveBeenCalledTimes(1);
  });

  it('keeps its counters apart from the Guide by key', async () => {
    const { handler, dynamo } = setup();
    await call(handler);
    const input = JSON.stringify((dynamo.send.mock.calls[0] as unknown[])[0]);
    expect(input).toContain('rival-month#2026-11');
    expect(input).toContain('rival-day#u1#2026-11-10');
    expect(input).toContain(String(RIVAL_DAILY_LIMIT));
  });

  it('requires a signed-in caller, a title, a hypothesis and enough items', async () => {
    const { handler, bedrock } = setup();
    await expect(call(handler, {}, null)).rejects.toThrow('authenticated identity required');
    await expect(call(handler, { title: ' ' })).rejects.toThrow('title is required');
    await expect(call(handler, { hypothesis: '' })).rejects.toThrow('hypothesis is required');
    await expect(call(handler, { items: items.slice(0, 2) })).rejects.toThrow('at least 3 items');
    expect(bedrock.send).not.toHaveBeenCalled();
  });

  it('reports the daily and monthly limits without calling the model', async () => {
    const monthly = setup({ dynamoError: cancelled('ConditionalCheckFailed', 'None') });
    await expect(call(monthly.handler)).rejects.toThrow('RIVAL_BUDGET_EXHAUSTED');
    const daily = setup({ dynamoError: cancelled('None', 'ConditionalCheckFailed') });
    await expect(call(daily.handler)).rejects.toThrow('RIVAL_DAILY_LIMIT');
    expect(monthly.bedrock.send).not.toHaveBeenCalled();
    expect(daily.bedrock.send).not.toHaveBeenCalled();
  });

  it('refunds the reservation when the answer is unusable', async () => {
    const { handler, dynamo } = setup({ answer: reply('not json') });
    await expect(call(handler)).rejects.toThrow('RIVAL_UNAVAILABLE');
    expect(dynamo.send).toHaveBeenCalledTimes(2);
  });

  it('refunds when the model call fails', async () => {
    const { handler, dynamo, bedrock } = setup();
    bedrock.send.mockRejectedValueOnce(new Error('throttled'));
    await expect(call(handler)).rejects.toThrow('throttled');
    expect(dynamo.send).toHaveBeenCalledTimes(2);
  });

  it('treats item text as untrusted and says so in the prompt', () => {
    expect(SYSTEM_PROMPT).toMatch(/untrusted/);
  });
});

describe('parseItems', () => {
  it('trims text, defaults the stance and rejects bad shapes', () => {
    const [one] = parseItems(JSON.stringify([{ id: 'a', title: ` ${'x'.repeat(300)} `, stance: 'weird' }]));
    expect(one.title).toHaveLength(200);
    expect(one.stance).toBe('unsorted');
    expect(() => parseItems('nope')).toThrow('invalid items');
    expect(() => parseItems([])).toThrow('invalid items');
    expect(() => parseItems([{ id: 'a', title: 'x' }, { id: 'a', title: 'y' }])).toThrow('invalid items');
    expect(() => parseItems(Array.from({ length: 13 }, (_, n) => ({ id: `${n}`, title: 't' })))).toThrow('12 or fewer');
  });
});

describe('parseRival', () => {
  it('needs at least three real items and ignores made-up ids', () => {
    expect(parseRival(good, items)?.fits).toEqual(['i1', 'i2', 'i3']);
    expect(parseRival(JSON.stringify({ rival: 'x', fits: ['i1', 'i2', 'zzz'] }), items)).toBeNull();
    expect(parseRival(`Here you go: ${good}`, items)?.rival).toMatch(/Imports/);
    expect(parseRival('{"rival":"","fits":["i1","i2","i3"]}', items)).toBeNull();
  });
});
