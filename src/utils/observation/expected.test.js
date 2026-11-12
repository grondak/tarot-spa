import { describe, expect, it } from 'vitest';
import { stemmer } from 'stemmer';
import { absences, expectedDayMs, expectedWords, formatDay, occurrences, occurrencesByEvent } from './expected';

const DAY = 24 * 3600e3;
const utc = (y, m, d, h = 12) => Date.UTC(y, m - 1, d, h);
const mk = (id, ms, text) => ({
  id, ms, title: text, stems: new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).map(stemmer)),
});

// Today is 2026-11-20 at noon; the collector first ran on 2026-10-01, and items go back 30 days.
const model = (items, extra = {}) => ({
  items, gaps: [], collectorSince: utc(2026, 10, 1, 6), end: utc(2026, 11, 20), ...extra,
});
const event = { id: 'e1', name: 'Berry price report', words: 'berry price report', dayOfMonth: 15, tolerance: 3 };
const run = (items, ev = event, extra = {}) => occurrences(ev, model(items, extra), stemmer);

describe('expectedWords', () => {
  it('lowercases, drops one-letter words and repeats', () => {
    expect(expectedWords('Berry, a price PRICE report')).toEqual(['berry', 'price', 'report']);
  });
});

describe('expectedDayMs', () => {
  it('holds the day to the last day of a short month', () => {
    expect(expectedDayMs(2026, 1, 31)).toBe(utc(2026, 2, 28, 0));
    expect(expectedDayMs(2026, 10, 15)).toBe(utc(2026, 11, 15, 0));
  });
});

describe('occurrences', () => {
  it('calls an event arrived when an item holds every word inside the allowed days, from any source', () => {
    const [only] = run([mk('a', utc(2026, 11, 14), 'Berry prices: the monthly report is out')]);
    expect(only).toMatchObject({ status: 'arrived', expectedMs: utc(2026, 11, 15, 0) });
    expect(only.matches.map((m) => m.id)).toEqual(['a']);
  });

  it('calls it missing once every allowed day has passed with nothing matching', () => {
    const found = run([mk('a', utc(2026, 11, 14), 'Berry harvest begins'), mk('b', utc(2026, 11, 14), 'Price report on steel')]);
    const decided = found.filter((o) => o.status !== 'pending');
    expect(decided).toHaveLength(1);
    expect(found[0].status).toBe('missing');
    expect(found[0].matches).toEqual([]);
  });

  it('ignores a matching item outside the allowed days', () => {
    expect(run([mk('a', utc(2026, 11, 20), 'Berry price report')])[0].status).toBe('missing');
    expect(run([mk('a', utc(2026, 11, 11, 23), 'Berry price report')])[0].status).toBe('missing');
    expect(run([mk('a', utc(2026, 11, 12, 1), 'Berry price report')])[0].status).toBe('arrived');
  });

  it('does not call it missing while an allowed day is still to come', () => {
    const found = run([], { ...event, dayOfMonth: 19 });
    expect(found.find((o) => o.status === 'missing')).toBeUndefined();
    expect(found.filter((o) => o.status === 'pending')).toHaveLength(1);
    expect(found.at(-1).expectedMs).toBe(utc(2026, 11, 19, 0));
  });

  it('offers only the next pending month', () => {
    const pending = run([]).filter((o) => o.status === 'pending');
    expect(pending).toHaveLength(1);
    expect(pending[0].expectedMs).toBe(utc(2026, 12, 15, 0));
  });

  it('leaves out a month the collector did not fully cover, or that expired', () => {
    const started = run([], event, { collectorSince: utc(2026, 11, 14, 6) });
    expect(started.find((o) => o.expectedMs === utc(2026, 11, 15, 0))).toBeUndefined();
    const early = run([], event, { end: utc(2026, 12, 20) });
    expect(early.find((o) => o.expectedMs === utc(2026, 10, 15, 0))).toBeUndefined();
  });

  it('never calls a month missing when a collector outage overlapped it', () => {
    const gap = [utc(2026, 11, 13, 0), utc(2026, 11, 14, 0)];
    expect(run([], event, { gaps: [gap] }).find((o) => o.status === 'missing')).toBeUndefined();
  });

  it('needs words, and a collector that has run', () => {
    expect(run([], { ...event, words: ' , ' })).toEqual([]);
    expect(run([], event, { collectorSince: null })).toEqual([]);
  });

  it('checks each month on its own', () => {
    const items = [mk('a', utc(2026, 10, 15), 'Berry price report')];
    const found = occurrences(event, model(items, { end: utc(2026, 11, 3) }), stemmer);
    expect(found.map((o) => [formatDay(o.expectedMs), o.status])).toEqual([['Oct 15', 'arrived'], ['Nov 15', 'pending']]);
    const later = occurrences(event, model(items, { end: utc(2026, 11, 20) }), stemmer);
    expect(later.map((o) => [formatDay(o.expectedMs), o.status])).toEqual([['Nov 15', 'missing'], ['Dec 15', 'pending']]);
  });
});

describe('absences', () => {
  it('lists the missing months across events, oldest first, each with its event', () => {
    const byEvent = occurrencesByEvent(
      [event, { ...event, id: 'e2', name: 'Other', words: 'zzz', dayOfMonth: 5 }],
      model([mk('a', utc(2026, 11, 14), 'Berry price report')]),
      stemmer,
    );
    const list = absences(byEvent);
    expect(list.map((o) => [o.event.id, formatDay(o.expectedMs)])).toEqual([['e2', 'Nov 5']]);
    expect(DAY).toBeGreaterThan(0);
  });
});
