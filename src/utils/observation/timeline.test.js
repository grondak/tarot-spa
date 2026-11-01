import { describe, expect, it } from 'vitest';
import { stemmer } from 'stemmer';
import {
  HOUR, axisMarks, buildModel, laneColor, percentAlong, safeHref,
} from './timeline';
import { NOW, feedRows, hoursAgo, itemRow, makeModel, runRows } from './fixtures';

describe('buildModel', () => {
  it('makes one lane per live feed in source order, keeping a retired feed that still has items', () => {
    const model = makeModel();
    expect(model.feeds.map((f) => f.id)).toEqual(['bbc', 'aj', 'lr', 'fierce']);
    expect(model.feeds.at(-1).retired).toBe(true);
  });

  it('drops a retired feed once none of its items are left', () => {
    const model = makeModel({ items: [itemRow({ sources: ['bbc'] })] });
    expect(model.feeds.map((f) => f.id)).toEqual(['bbc', 'aj', 'lr']);
  });

  it('places a story from two feeds in the higher-ranked lane', () => {
    const model = makeModel();
    const chips = model.items.find((i) => i.title === 'Chip supply improves');
    expect(chips.lane).toBe(0);
  });

  it('skips items with no usable date or no known feed', () => {
    const model = makeModel({
      items: [
        itemRow({ publishedAt: 'nope' }),
        itemRow({ sources: ['unknown'] }),
        itemRow({ sources: [] }),
        itemRow({ title: 'kept' }),
      ],
    });
    expect(model.items.map((i) => i.title)).toEqual(['kept']);
  });

  it('groups lanes by group name in order of first appearance', () => {
    const model = makeModel();
    expect(model.groups.map((g) => [g.name, g.lanes])).toEqual([['world', [0, 1]], ['telecom', [2, 3]]]);
  });

  it('starts the axis at the first item rounded down to the hour and ends it now', () => {
    const model = makeModel();
    expect(model.end).toBe(NOW);
    expect(model.start % HOUR).toBe(0);
    expect(model.start).toBeLessThanOrEqual(Date.parse(hoursAgo(100)));
    expect(model.start).toBeGreaterThan(Date.parse(hoursAgo(101)));
  });

  it('keeps a usable axis when there are no items', () => {
    const model = makeModel({ items: [] });
    expect(model.end - model.start).toBeGreaterThanOrEqual(HOUR);
  });

  it('finds a gap only where collector runs are more than 2.5 hours apart', () => {
    const model = makeModel();
    expect(model.gaps).toEqual([[Date.parse(hoursAgo(8.9)), Date.parse(hoursAgo(3))]]);
  });

  it('counts how many items carry each word stem', () => {
    const model = buildModel({
      feeds: feedRows,
      items: [itemRow({ title: 'tariff news' }), itemRow({ title: 'tariffs again' })],
      runs: [],
      now: NOW,
      stem: stemmer,
    });
    expect(model.stemDf.get(stemmer('tariff'))).toBe(2);
  });

  it('marks estimated dates and tolerates missing text', () => {
    const model = makeModel({ items: [itemRow({ title: null, summary: undefined, publishedAtEstimated: true })] });
    expect(model.items[0]).toMatchObject({ title: '', summary: '', estimated: true });
  });
});

describe('axis and colour helpers', () => {
  it('maps a time to a percentage along the axis', () => {
    const model = makeModel();
    expect(percentAlong(model, model.start)).toBe(0);
    expect(percentAlong(model, model.end)).toBe(100);
  });

  it('gives lanes in one group the same colour and different groups different colours', () => {
    const model = makeModel();
    expect(laneColor(model, 0)).toBe(laneColor(model, 1));
    expect(laneColor(model, 0)).not.toBe(laneColor(model, 2));
  });

  it('marks now and every fifth day back', () => {
    const marks = axisMarks(makeModel({ items: [itemRow({ publishedAt: hoursAgo(12 * 24) })] }));
    expect(marks[0]).toMatchObject({ ms: NOW, label: 'now' });
    expect(marks).toHaveLength(3);
    expect(marks[1].ms).toBe(NOW - 5 * 24 * HOUR);
  });

  it('only turns web links into hrefs', () => {
    expect(safeHref('https://example.com/a')).toBe('https://example.com/a');
    expect(safeHref('http://example.com')).toBe('http://example.com');
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('data:text/html,hi')).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
  });
});

it('uses run times only (runs without a finish time still work)', () => {
  const model = makeModel({ runs: [...runRows, { startedAt: hoursAgo(0.5) }] });
  expect(model.gaps.length).toBeGreaterThanOrEqual(1);
});
