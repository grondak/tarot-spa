// @vitest-environment node
import { PutCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COLLECTOR_RUN_RETENTION_DAYS, FEED_ITEM_RETENTION_DAYS } from '../../config';
import { OUTSIDE_FEED_POOL } from '../../feeds';
import { createHandler } from './handler';

const NOW_ISO = '2026-10-31T12:00:00.000Z';
const DAY_MS = 86_400_000;

const tableNames = {
  feed: 'FeedTable',
  feedItem: 'FeedItemTable',
  feedDailyCount: 'FeedDailyCountTable',
  collectorRun: 'CollectorRunTable',
};

const feeds = [
  { id: 'alpha', group: 'g1', name: 'Alpha', url: 'https://a.example/feed' },
  { id: 'beta', group: 'g2', name: 'Beta', url: 'https://b.example/feed' },
];

const item = (title: string, link: string, pubDate?: string) =>
  `<item><title>${title}</title><link>${link}</link>${pubDate ? `<pubDate>${pubDate}</pubDate>` : ''}</item>`;
const rss = (...items: string[]) => `<?xml version="1.0"?><rss version="2.0"><channel>${items.join('')}</channel></rss>`;
const daysAgo = (days: number) => new Date(Date.parse(NOW_ISO) - days * DAY_MS).toUTCString();

type StoredItem = { id: string; sources: string[]; expiresAt: number; publishedAtEstimated: boolean; publishedAt: string };

// A small stand-in for DynamoDB that honours the conditions the collector relies on, so the
// tests check observable behaviour (what ends up stored) rather than which calls were made.
function fakeDynamo() {
  const items = new Map<string, StoredItem>();
  const counts = new Map<string, number>();
  const feedRows = new Map<string, Record<string, unknown>>();
  const runs: Record<string, unknown>[] = [];

  const send = vi.fn(async (command: unknown) => {
    if (command instanceof TransactWriteCommand) {
      const [put, update] = command.input.TransactItems ?? [];
      const row = put.Put!.Item as StoredItem;
      if (items.has(row.id)) {
        const error = new Error('cancelled') as Error & { CancellationReasons?: { Code: string }[] };
        error.name = 'TransactionCanceledException';
        error.CancellationReasons = [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }];
        throw error;
      }
      items.set(row.id, row);
      const key = update.Update!.Key as { feedId: string; day: string };
      counts.set(`${key.feedId}|${key.day}`, (counts.get(`${key.feedId}|${key.day}`) ?? 0) + 1);
      return {};
    }
    if (command instanceof UpdateCommand) {
      const input = command.input;
      if (input.TableName === tableNames.feedItem) {
        const row = items.get((input.Key as { id: string }).id)!;
        const feedId = input.ExpressionAttributeValues![':feedId'] as string;
        if (row.sources.includes(feedId)) {
          const error = new Error('exists');
          error.name = 'ConditionalCheckFailedException';
          throw error;
        }
        row.sources.push(feedId);
        return {};
      }
      if (input.TableName === tableNames.feed) {
        const values = input.ExpressionAttributeValues!;
        feedRows.set((input.Key as { id: string }).id, {
          name: values[':name'], group: values[':group'], sortOrder: values[':sortOrder'], kind: values[':kind'], reason: values[':reason'],
          lastStatus: values[':status'], lastError: values[':error'],
        });
        return {};
      }
    }
    if (command instanceof PutCommand) {
      runs.push(command.input.Item as Record<string, unknown>);
      return {};
    }
    throw new Error(`unexpected command ${(command as { constructor: { name: string } }).constructor.name}`);
  });

  return { send, items, counts, feedRows, runs };
}

function setup(responses: Record<string, string | number>, options: { feeds?: typeof feeds } = {}) {
  const dynamo = fakeDynamo();
  const fetchFn = vi.fn(async (url: string | URL | Request) => {
    const body = responses[String(url)];
    if (typeof body === 'number') return new Response('error', { status: body });
    return new Response(body ?? 'missing', { status: body === undefined ? 404 : 200 });
  });
  const handler = createHandler({
    dynamo,
    fetchFn: fetchFn as unknown as typeof fetch,
    tableNames,
    feeds: options.feeds ?? feeds,
    now: () => new Date(NOW_ISO),
  });
  return { dynamo, fetchFn, handler };
}

describe('feed-collector handler', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects incomplete configuration before fetching anything', async () => {
    const dynamo = fakeDynamo();
    const fetchFn = vi.fn();
    const handler = createHandler({
      dynamo, fetchFn: fetchFn as unknown as typeof fetch, tableNames: { ...tableNames, feedItem: '' }, feeds, now: () => new Date(NOW_ISO),
    });

    await expect(handler()).rejects.toThrow('feed-collector configuration is missing');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('stores new items with their sources and a 30-day expiry, and counts them by day', async () => {
    const published = daysAgo(2);
    const { dynamo, handler } = setup({
      'https://a.example/feed': rss(item('One', 'https://a.example/1', published)),
      'https://b.example/feed': rss(item('Two', 'https://b.example/2', published)),
    });

    const summary = await handler();

    expect(summary).toEqual({ feedsOk: 2, feedsTotal: 2, added: 2 });
    expect(dynamo.items.size).toBe(2);
    const publishedMs = Date.parse(published);
    for (const stored of dynamo.items.values()) {
      expect(stored.expiresAt).toBe(Math.floor((publishedMs + FEED_ITEM_RETENTION_DAYS * DAY_MS) / 1000));
    }
    const day = new Date(publishedMs).toISOString().slice(0, 10);
    expect(dynamo.counts.get(`alpha|${day}`)).toBe(1);
    expect(dynamo.counts.get(`beta|${day}`)).toBe(1);
  });

  it('adds nothing and counts nothing the second time it sees the same items', async () => {
    const xml = rss(item('One', 'https://a.example/1', daysAgo(1)));
    const { dynamo, handler } = setup({ 'https://a.example/feed': xml, 'https://b.example/feed': rss(item('X', 'https://b.example/x', daysAgo(1))) });

    await handler();
    const second = await handler();

    expect(second.added).toBe(0);
    expect([...dynamo.counts.values()].reduce((a, b) => a + b, 0)).toBe(2);
    expect(dynamo.items.size).toBe(2);
  });

  it('stores one story from two feeds once, lists both sources, and counts it once', async () => {
    const story = item('Same story', 'https://shared.example/story?utm_source=a', daysAgo(1));
    const sameStory = item('Same story', 'https://shared.example/story', daysAgo(1));
    const { dynamo, handler } = setup({
      'https://a.example/feed': rss(story),
      'https://b.example/feed': rss(sameStory),
    });

    const summary = await handler();

    expect(summary.added).toBe(1);
    expect(dynamo.items.size).toBe(1);
    expect([...dynamo.items.values()][0].sources).toEqual(['alpha', 'beta']);
    expect([...dynamo.counts.values()].reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('ignores items published before the retention window', async () => {
    const { dynamo, handler } = setup({
      'https://a.example/feed': rss(
        item('Old', 'https://a.example/old', daysAgo(FEED_ITEM_RETENTION_DAYS + 1)),
        item('Fresh', 'https://a.example/fresh', daysAgo(1)),
      ),
      'https://b.example/feed': rss(item('Other', 'https://b.example/o', daysAgo(1))),
    });

    const summary = await handler();

    expect(summary.added).toBe(2);
    expect([...dynamo.items.values()].some((i) => i.id && i.publishedAt < new Date(Date.parse(NOW_ISO) - FEED_ITEM_RETENTION_DAYS * DAY_MS).toISOString())).toBe(false);
  });

  it('dates undated items at the fetch time, marked as estimated', async () => {
    const { dynamo, handler } = setup({
      'https://a.example/feed': rss(item('Undated', 'https://a.example/u')),
      'https://b.example/feed': rss(item('Other', 'https://b.example/o', daysAgo(1))),
    });

    await handler();

    const undated = [...dynamo.items.values()].find((i) => i.publishedAtEstimated);
    expect(undated?.publishedAt).toBe(NOW_ISO);
  });

  it('treats a date far in the future as undated so it cannot outlive the window', async () => {
    const future = new Date(Date.parse(NOW_ISO) + 40 * DAY_MS).toUTCString();
    const { dynamo, handler } = setup({
      'https://a.example/feed': rss(item('From the future', 'https://a.example/f', future)),
      'https://b.example/feed': rss(item('Other', 'https://b.example/o', daysAgo(1))),
    });

    await handler();

    const stored = [...dynamo.items.values()].find((i) => i.publishedAtEstimated);
    expect(stored?.publishedAt).toBe(NOW_ISO);
    expect(stored?.expiresAt).toBe(Math.floor((Date.parse(NOW_ISO) + FEED_ITEM_RETENTION_DAYS * DAY_MS) / 1000));
  });

  it('keeps going when one feed fails, and records the failure on the feed and in the run log', async () => {
    const three = [...feeds, { id: 'gamma', group: 'g3', name: 'Gamma', url: 'https://c.example/feed' }];
    const { dynamo, handler } = setup({
      'https://a.example/feed': 503,
      'https://b.example/feed': rss(item('Two', 'https://b.example/2', daysAgo(1))),
      'https://c.example/feed': rss(item('Three', 'https://c.example/3', daysAgo(1))),
    }, { feeds: three });

    const summary = await handler();

    expect(summary).toEqual({ feedsOk: 2, feedsTotal: 3, added: 2 });
    expect(dynamo.feedRows.get('alpha')).toMatchObject({ lastStatus: 'error', lastError: 'HTTP 503' });
    expect(dynamo.feedRows.get('beta')).toMatchObject({ lastStatus: 'ok' });
    const results = JSON.parse(dynamo.runs[0].results as string) as { feedId: string; status: string }[];
    expect(results.find((r) => r.feedId === 'alpha')?.status).toBe('error');
    expect(dynamo.items.size).toBe(2);
  });

  it('reports a feed that parses to nothing as an error', async () => {
    const three = [...feeds, { id: 'gamma', group: 'g3', name: 'Gamma', url: 'https://c.example/feed' }];
    const { dynamo, handler } = setup({
      'https://a.example/feed': '<html>moved</html>',
      'https://b.example/feed': rss(item('Two', 'https://b.example/2', daysAgo(1))),
      'https://c.example/feed': rss(item('Three', 'https://c.example/3', daysAgo(1))),
    }, { feeds: three });

    await handler();

    expect(dynamo.feedRows.get('alpha')).toMatchObject({ lastStatus: 'error', lastError: 'no items found in feed' });
  });

  it('records the feed list order, name and group on each feed row', async () => {
    const { dynamo, handler } = setup({
      'https://a.example/feed': rss(item('One', 'https://a.example/1', daysAgo(1))),
      'https://b.example/feed': rss(item('Two', 'https://b.example/2', daysAgo(1))),
    });

    await handler();

    expect(dynamo.feedRows.get('alpha')).toMatchObject({ name: 'Alpha', group: 'g1', sortOrder: 0 });
    expect(dynamo.feedRows.get('beta')).toMatchObject({ name: 'Beta', group: 'g2', sortOrder: 1 });
  });

  it('marks the outside-interest pool feeds, with their reason, and everything else as starter', async () => {
    const pool = { ...OUTSIDE_FEED_POOL[0], url: 'https://pool.example/feed' };
    const { dynamo, handler } = setup({
      'https://a.example/feed': rss(item('One', 'https://a.example/1', daysAgo(1))),
      'https://b.example/feed': rss(item('Two', 'https://b.example/2', daysAgo(1))),
      'https://pool.example/feed': rss(item('Three', 'https://pool.example/3', daysAgo(1))),
    }, { feeds: [...feeds, pool] });

    await handler();

    expect(dynamo.feedRows.get('alpha')).toMatchObject({ kind: 'starter', reason: undefined });
    expect(dynamo.feedRows.get(pool.id)).toMatchObject({ kind: 'pool', reason: pool.reason });
  });

  it('writes a run row with the counts, a 60-day expiry, and the per-feed results as JSON text', async () => {
    const { dynamo, handler } = setup({
      'https://a.example/feed': rss(item('One', 'https://a.example/1', daysAgo(1))),
      'https://b.example/feed': rss(item('Two', 'https://b.example/2', daysAgo(1))),
    });

    await handler();

    expect(dynamo.runs).toHaveLength(1);
    expect(dynamo.runs[0]).toMatchObject({
      id: NOW_ISO, startedAt: NOW_ISO, feedsOk: 2, feedsTotal: 2, added: 2,
      expiresAt: Math.floor(Date.parse(NOW_ISO) / 1000) + COLLECTOR_RUN_RETENTION_DAYS * 86400,
    });
    expect(typeof dynamo.runs[0].results).toBe('string');
  });

  it('fails the invocation when most feeds fail, after writing the run log', async () => {
    const { dynamo, handler } = setup({
      'https://a.example/feed': 500,
      'https://b.example/feed': 500,
    });

    await expect(handler()).rejects.toThrow('only 0 of 2 feeds succeeded');
    expect(dynamo.runs).toHaveLength(1);
    expect(dynamo.runs[0]).toMatchObject({ feedsOk: 0, feedsTotal: 2 });
  });

  it('does not log anything from the feeds themselves', async () => {
    const log = vi.mocked(console.log);
    const { handler } = setup({
      'https://a.example/feed': rss(item('A secret-looking headline', 'https://a.example/1', daysAgo(1))),
      'https://b.example/feed': rss(item('Another one', 'https://b.example/2', daysAgo(1))),
    });

    await handler();

    const logged = log.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged).toContain('feed-collector-run');
    expect(logged).not.toContain('secret-looking');
    expect(logged).not.toContain('a.example');
  });
});
