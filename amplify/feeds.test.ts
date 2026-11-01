// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { STARTER_FEEDS } from './feeds';

describe('STARTER_FEEDS', () => {
  it('has a unique, URL-safe id for every feed', () => {
    const ids = STARTER_FEEDS.map((feed) => feed.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('gives every feed a name, a group and an http(s) address', () => {
    for (const feed of STARTER_FEEDS) {
      expect(feed.name.trim()).not.toBe('');
      expect(feed.group.trim()).not.toBe('');
      expect(() => new URL(feed.url)).not.toThrow();
      expect(new URL(feed.url).protocol).toMatch(/^https?:$/);
    }
  });

  it('keeps each group together, because a group ranks where its first feed does', () => {
    const seen = new Set<string>();
    let previous = '';
    for (const feed of STARTER_FEEDS) {
      if (feed.group !== previous) {
        expect(seen.has(feed.group)).toBe(false);
        seen.add(feed.group);
        previous = feed.group;
      }
    }
  });

  it('fits the collector: few enough feeds to fetch within its timeout', () => {
    // 6 at a time, 20 seconds each at worst, inside a 120-second Lambda timeout.
    expect(Math.ceil(STARTER_FEEDS.length / 6) * 20).toBeLessThanOrEqual(120);
  });
});
