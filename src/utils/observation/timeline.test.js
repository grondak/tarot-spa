import { describe, expect, it } from 'vitest';
import { stemmer } from 'stemmer';
import {
  HOUR, axisMarks, buildModel, laneColor, percentAlong, safeHref,
} from './timeline';
import {
  NOW, feedRows, hoursAgo, itemRow, itemRows, makeModel, poolFeedRows, poolItemRows, runRows,
} from './fixtures';

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

describe('outside-interest injection in the model', () => {
  const withPool = (overrides = {}) => makeModel({
    feeds: [...feedRows, ...poolFeedRows], items: [...itemRows, ...poolItemRows], userId: 'user-1', ...overrides,
  });

  it('shows one pooled item per day, in an "outside your interests" group after the starter groups', () => {
    const model = withPool();
    const injected = model.items.filter((i) => i.injected);
    expect(injected).toHaveLength(3);
    expect(new Set(injected.map((i) => new Date(i.ms).toISOString().slice(0, 10))).size).toBe(3);
    expect(model.groups.at(-1).name).toBe('outside your interests');
    expect(model.groups.map((g) => g.name).slice(0, 2)).toEqual(['world', 'telecom']);
  });

  it('makes lanes only for pool sources that were picked, marked injected and carrying their reason', () => {
    const model = withPool();
    const lanes = model.feeds.filter((f) => f.injected);
    expect(lanes.length).toBeGreaterThanOrEqual(1);
    expect(lanes.length).toBeLessThanOrEqual(3);
    for (const lane of lanes) expect(lane.reason).toMatch(/\.$/);
    expect(model.items.filter((i) => i.injected).every((i) => model.feeds[i.lane].injected)).toBe(true);
  });

  it('keeps every other pooled item out of the window', () => {
    expect(withPool().items.filter((i) => i.title.endsWith('story 5') || i.title.endsWith('story 29') || i.title.endsWith('story 53')).length).toBe(3);
  });

  it('leaves starter items exactly as they were', () => {
    const plain = makeModel();
    const model = withPool();
    expect(model.items.filter((i) => !i.injected).map((i) => i.id)).toEqual(plain.items.map((i) => i.id));
  });

  it('gives a different user a different set of picks, and the same user the same set', () => {
    const picks = (userId) => withPool({ userId }).items.filter((i) => i.injected).map((i) => i.id).join();
    expect(picks('user-1')).toBe(picks('user-1'));
    const others = ['user-2', 'user-3', 'user-4', 'user-5'].map(picks);
    expect(others.some((p) => p !== picks('user-1'))).toBe(true);
  });

  it('drops a dismissed source from the picks, and every pick if all are dismissed', () => {
    const model = withPool({ dismissed: new Set(['nature', 'aeon']) });
    expect(model.items.filter((i) => i.injected).every((i) => model.feeds[i.lane].id === 'nasa')).toBe(true);
    const none = withPool({ dismissed: new Set(poolFeedRows.map((f) => f.id)) });
    expect(none.items.some((i) => i.injected)).toBe(false);
    expect(none.groups.map((g) => g.name)).not.toContain('outside your interests');
  });

  it('treats a story the user already follows as theirs, not as an injection', () => {
    const shared = itemRow({ title: 'Shared', sources: ['bbc', 'nature'] });
    const model = withPool({ items: [shared] });
    expect(model.items.find((i) => i.title === 'Shared').injected).toBe(false);
  });
});

describe('switching sources and groups off', () => {
  const build = (disabled, extra = {}) => makeModel({
    feeds: [...feedRows, ...poolFeedRows], items: [...itemRows, ...poolItemRows], userId: 'user-1', disabled, ...extra,
  });
  const laneIds = (model) => model.feeds.map((f) => f.id);

  it('takes a switched-off source out of the timeline and keeps the rest', () => {
    const model = build(new Set(['f:aj']));
    expect(laneIds(model)).not.toContain('aj');
    expect(laneIds(model)).toContain('bbc');
    expect(model.items.some((i) => i.title === 'Ceasefire talks resume')).toBe(false);
  });

  it('takes out every source of a switched-off group', () => {
    const model = build(new Set(['g:world']));
    expect(model.groups.map((g) => g.name)).not.toContain('world');
    expect(laneIds(model)).toEqual(expect.not.arrayContaining(['bbc', 'aj']));
  });

  it('keeps a story that another, still-on source also carried', () => {
    const model = build(new Set(['f:bbc']));
    const chips = model.items.find((i) => i.title === 'Chip supply improves');
    expect(model.feeds[chips.lane].id).toBe('lr');
  });

  it('keeps everything in the catalog, on or off, so a source can be switched back on', () => {
    const model = build(new Set(['g:world', 'f:lr']));
    const world = model.catalog.find((g) => g.name === 'world');
    expect(world.feeds.map((f) => f.id)).toEqual(['bbc', 'aj']);
    expect(model.catalog.map((g) => g.name)).toEqual(['world', 'telecom', 'outside your interests']);
    expect(model.catalog.at(-1)).toMatchObject({ injected: true, feeds: [] });
  });

  it('turns the daily outside-your-interests pick off with its group', () => {
    const model = build(new Set(['g:outside your interests']));
    expect(model.items.some((i) => i.injected)).toBe(false);
    expect(model.catalog.map((g) => g.name)).toContain('outside your interests');
  });

  it('lists no outside group in the catalog when there is no pool', () => {
    expect(makeModel().catalog.map((g) => g.name)).toEqual(['world', 'telecom']);
  });

  it('is unchanged when nothing is switched off', () => {
    expect(laneIds(build(new Set()))).toEqual(laneIds(build(undefined)));
  });
});
