import { describe, expect, it } from 'vitest';
import { hashString, pickInjections, utcDay } from './injection';

const poolFeeds = [
  { id: 'nature', sortOrder: 0 },
  { id: 'aeon', sortOrder: 1 },
  { id: 'nasa', sortOrder: 2 },
];
const at = (iso) => Date.parse(iso);
const item = (id, feedId, iso) => ({ id, feedId, ms: at(iso) });
const daily = [
  item('n1', 'nature', '2026-10-30T08:00:00Z'), item('a1', 'aeon', '2026-10-30T09:00:00Z'), item('s1', 'nasa', '2026-10-30T10:00:00Z'),
  item('n2', 'nature', '2026-10-31T08:00:00Z'), item('a2', 'aeon', '2026-10-31T09:00:00Z'), item('s2', 'nasa', '2026-10-31T10:00:00Z'),
];
const pick = (overrides = {}) => pickInjections({
  poolFeeds, poolItems: daily, userId: 'user-1', dismissed: new Set(), ...overrides,
});

describe('pickInjections', () => {
  it('picks exactly one item for each day that has pool news, oldest day first', () => {
    const picks = pick();
    expect(picks.map((p) => p.day)).toEqual(['2026-10-30', '2026-10-31']);
    expect(picks.every((p) => p.item.feedId === p.feedId)).toBe(true);
  });

  it('gives the same user the same picks every time', () => {
    expect(pick().map((p) => p.item.id)).toEqual(pick().map((p) => p.item.id));
  });

  it('spreads picks across the pool and across users', () => {
    const days = Array.from({ length: 60 }, (_, i) => new Date(at('2026-09-01T00:00:00Z') + i * 86400e3).toISOString());
    const items = days.flatMap((iso, i) => poolFeeds.map((f) => item(`${f.id}${i}`, f.id, iso)));
    const feedsUsed = (userId) => new Set(pickInjections({ poolFeeds, poolItems: items, userId, dismissed: new Set() }).map((p) => p.feedId));
    expect(feedsUsed('user-1').size).toBe(3);
    const a = pickInjections({ poolFeeds, poolItems: items, userId: 'user-1', dismissed: new Set() }).map((p) => p.feedId);
    const b = pickInjections({ poolFeeds, poolItems: items, userId: 'user-2', dismissed: new Set() }).map((p) => p.feedId);
    expect(a).not.toEqual(b);
  });

  it('chooses the day\'s source from the whole pool, so a later publisher does not change it', () => {
    const early = pick({ poolItems: daily.filter((i) => i.id !== 's1' && i.id !== 's2') });
    const full = pick();
    // Wherever a day's source was already in the early list, adding more news keeps it.
    for (const p of early) {
      const same = full.find((f) => f.day === p.day);
      if (p.feedId !== 'nasa') expect(same.item.id).toBe(p.item.id);
    }
  });

  it('falls back to the next source when the chosen one had nothing that day', () => {
    const only = [item('a1', 'aeon', '2026-10-30T09:00:00Z')];
    const picks = pick({ poolItems: only });
    expect(picks).toHaveLength(1);
    expect(picks[0].item.id).toBe('a1');
  });

  it('takes the earliest item of the day from the chosen source', () => {
    const items = [item('late', 'nature', '2026-10-30T20:00:00Z'), item('early', 'nature', '2026-10-30T06:00:00Z')];
    const picks = pick({ poolFeeds: [poolFeeds[0]], poolItems: items });
    expect(picks[0].item.id).toBe('early');
  });

  it('never picks a dismissed source', () => {
    const picks = pick({ dismissed: new Set(['nature', 'aeon']) });
    expect(picks.map((p) => p.feedId)).toEqual(['nasa', 'nasa']);
  });

  it('picks nothing when every source is dismissed or there is no news', () => {
    expect(pick({ dismissed: new Set(poolFeeds.map((f) => f.id)) })).toEqual([]);
    expect(pick({ poolItems: [] })).toEqual([]);
    expect(pick({ poolFeeds: [] })).toEqual([]);
  });
});

describe('helpers', () => {
  it('hashes the same text to the same number, and different text differently', () => {
    expect(hashString('a|2026-10-30')).toBe(hashString('a|2026-10-30'));
    expect(hashString('a|2026-10-30')).not.toBe(hashString('b|2026-10-30'));
    expect(hashString('')).toBeGreaterThanOrEqual(0);
  });

  it('names the UTC day of a time', () => {
    expect(utcDay(at('2026-10-30T23:59:59Z'))).toBe('2026-10-30');
    expect(utcDay(at('2026-10-31T00:00:00Z'))).toBe('2026-10-31');
  });
});
