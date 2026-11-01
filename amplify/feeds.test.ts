// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { COLLECTED_FEEDS, OUTSIDE_FEED_POOL, STARTER_FEEDS } from './feeds';

describe.each([
  ['STARTER_FEEDS', STARTER_FEEDS],
  ['OUTSIDE_FEED_POOL', OUTSIDE_FEED_POOL],
])('%s', (_name, list) => {
  it('gives every feed a name, a group and an http(s) address', () => {
    for (const feed of list) {
      expect(feed.name.trim()).not.toBe('');
      expect(feed.group.trim()).not.toBe('');
      expect(() => new URL(feed.url)).not.toThrow();
      expect(new URL(feed.url).protocol).toMatch(/^https?:$/);
    }
  });

  it('keeps each group together, because a group ranks where its first feed does', () => {
    const seen = new Set<string>();
    let previous = '';
    for (const feed of list) {
      if (feed.group !== previous) {
        expect(seen.has(feed.group)).toBe(false);
        seen.add(feed.group);
        previous = feed.group;
      }
    }
  });
});

describe('COLLECTED_FEEDS', () => {
  it('has a unique, URL-safe id for every feed, starter and pool together', () => {
    const ids = COLLECTED_FEEDS.map((feed) => feed.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('ranks the pool after the starter list', () => {
    expect(COLLECTED_FEEDS.slice(0, STARTER_FEEDS.length)).toEqual(STARTER_FEEDS);
  });

  it('fits the collector: few enough feeds to fetch within its timeout', () => {
    // 6 at a time, 20 seconds each at worst, inside a 120-second Lambda timeout.
    expect(Math.ceil(COLLECTED_FEEDS.length / 6) * 20).toBeLessThanOrEqual(120);
  });
});

describe('OUTSIDE_FEED_POOL', () => {
  it('explains every feed in one line, because injected items show why they appear', () => {
    for (const feed of OUTSIDE_FEED_POOL) {
      expect(feed.reason?.trim().length).toBeGreaterThan(10);
      expect(feed.reason).not.toContain('\n');
    }
  });

  it('is large enough that a daily pick has variety and a dismissed source leaves choices', () => {
    expect(OUTSIDE_FEED_POOL.length).toBeGreaterThanOrEqual(5);
  });

  it('shares no feed with the starter list', () => {
    const starter = new Set(STARTER_FEEDS.map((f) => f.id));
    for (const feed of OUTSIDE_FEED_POOL) expect(starter.has(feed.id)).toBe(false);
  });

  it('keeps starter feeds free of a reason, which marks pool feeds', () => {
    for (const feed of STARTER_FEEDS) expect(feed.reason).toBeUndefined();
  });
});
