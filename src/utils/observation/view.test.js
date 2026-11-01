import { describe, expect, it } from 'vitest';
import { stemmer } from 'stemmer';
import { HOUR } from './timeline';
import { chooseWidening, expandableTerms, matchesExact, parseSearch, relatedReason } from './search';
import {
  computeView, emptyMessage, metaText, searchCountText, soloKey,
} from './view';
import { NOW, itemRow, makeModel } from './fixtures';

const base = (model, overrides = {}) => ({
  t: NOW,
  windowHours: 24,
  cardCount: 6,
  solo: new Set(),
  search: parseSearch(''),
  stem: stemmer,
  expansions: new Map(),
  blocked: new Set(),
  ...overrides,
});

const titles = (v) => v.inWin.map((i) => i.title);

describe('computeView: window, solo and ranking', () => {
  const model = makeModel();

  it('keeps items within the window of the scrubber, ranked by source order then recency', () => {
    const v = computeView(model, base(model));
    expect(titles(v)).toEqual(['Weather today', 'Tariffs rise on steel', 'Ceasefire talks resume', 'Duty on imports debated']);
    expect(v.live).toBe(true);
  });

  it('moves the window with the scrubber', () => {
    const v = computeView(model, base(model, { t: NOW - 30 * HOUR, windowHours: 2 }));
    expect(titles(v)).toEqual(['Chip supply improves']);
    expect(v.live).toBe(false);
  });

  it('solo keeps only the soloed group or feed and dims the rest', () => {
    const v = computeView(model, base(model, { solo: new Set([soloKey.group('telecom')]) }));
    expect(titles(v)).toEqual(['Duty on imports debated']);
    expect(v.soloing).toBe(true);
    expect(v.hidden).toBe(3);
    expect(v.filters).toBe('solo');
    const byFeed = computeView(model, base(model, { solo: new Set([soloKey.feed('aj')]) }));
    expect(titles(byFeed)).toEqual(['Ceasefire talks resume']);
  });
});

describe('computeView: search', () => {
  const model = makeModel({
    items: [
      itemRow({ title: 'Tariffs rise on steel', summary: 'Trade ministers met.', publishedAt: new Date(NOW - 2 * HOUR).toISOString(), sources: ['bbc'] }),
      itemRow({ title: 'Duty on imports debated', summary: 'A new duty is proposed.', publishedAt: new Date(NOW - 3 * HOUR).toISOString(), sources: ['lr'] }),
      itemRow({ title: 'Ceasefire talks resume', publishedAt: new Date(NOW - 4 * HOUR).toISOString(), sources: ['aj'] }),
      ...Array.from({ length: 30 }, (_, i) => itemRow({ title: `Filler story ${i}`, summary: 'Nothing here.', publishedAt: new Date(NOW - (40 + i) * HOUR).toISOString(), sources: ['bbc'] })),
    ],
  });
  const search = parseSearch('tariff');

  it('dims everything that does not contain every typed word', () => {
    const v = computeView(model, base(model, { search: parseSearch('ceasefire') }));
    expect(titles(v)).toEqual(['Ceasefire talks resume']);
    expect(v.totalMatches).toBe(1);
    expect(v.matchLanes).toEqual(new Set([1]));
  });

  it('requires every word', () => {
    expect(matchesExact(model.items[0], parseSearch('tariffs steel'))).toBe(true);
    expect(matchesExact(model.items[0], parseSearch('tariffs ceasefire'))).toBe(false);
  });

  it('whole word skips matches inside other words', () => {
    const item = { hay: 'the chain said so' };
    expect(matchesExact(item, parseSearch('ai', false))).toBe(true);
    expect(matchesExact(item, parseSearch('ai', true))).toBe(false);
    expect(matchesExact({ hay: 'ai is here' }, parseSearch('ai', true))).toBe(true);
  });

  it('escapes regex characters in a typed word', () => {
    expect(matchesExact({ hay: 'cost (usd) up' }, parseSearch('(usd)', true))).toBe(true);
    expect(() => parseSearch('[')).not.toThrow();
  });

  it('widens to word forms when a window has fewer than three exact matches', () => {
    const v = computeView(model, base(model, { search }));
    expect(v.level).toBeGreaterThanOrEqual(1);
    expect(titles(v)).toContain('Tariffs rise on steel');
  });

  it('widens to synonyms from WordNet and ranks exact matches before related ones', () => {
    const expansions = new Map([['tariff', { synonyms: ['duty'], broader: [] }]]);
    const v = computeView(model, base(model, { search, expansions }));
    // Two cards is still under three, so the ladder runs on to its last rung (nothing broader here).
    expect(v.level).toBe(3);
    expect(titles(v)).toEqual(['Tariffs rise on steel', 'Duty on imports debated']);
    expect(v.related).toBe(1);
    expect(v.isRelated(v.inWin[1])).toBe(true);
    expect(v.isRelated(v.inWin[0])).toBe(false);
    expect(v.chips.map((c) => c.word)).toEqual(['duty']);
    expect(relatedReason(v.inWin[1], v.alts)).toBe('“duty” (synonym of “tariff”)');
  });

  it('lets the user remove a widening word', () => {
    const expansions = new Map([['tariff', { synonyms: ['duty'], broader: [] }]]);
    const v = computeView(model, base(model, { search, expansions, blocked: new Set(['duty']) }));
    expect(titles(v)).toEqual(['Tariffs rise on steel']);
    expect(v.chips).toEqual([]);
  });

  it('ignores a widening word so common it would match everything', () => {
    const common = makeModel({
      items: Array.from({ length: 20 }, (_, i) => itemRow({ title: i === 0 ? 'tariff' : 'the news today', publishedAt: new Date(NOW - i * HOUR).toISOString() })),
    });
    const expansions = new Map([['tariff', { synonyms: ['news'], broader: [] }]]);
    const v = computeView(common, base(common, { search, expansions }));
    expect(v.chips).toEqual([]);
    expect(titles(v)).toEqual(['tariff']);
  });

  it('does not widen when there are enough exact matches', () => {
    const many = makeModel({
      items: Array.from({ length: 4 }, (_, i) => itemRow({ title: `tariff ${i}`, publishedAt: new Date(NOW - i * HOUR).toISOString() })),
    });
    expect(computeView(many, base(many, { search })).level).toBe(0);
  });

  it('counts solo when deciding whether to widen', () => {
    const inSolo = () => false;
    expect(chooseWidening(search, { model, stem: stemmer, expansions: new Map(), blocked: new Set() }, model.items, inSolo).level).toBe(3);
  });

  it('jumps to the nearest hit before and after the scrubber', () => {
    const v = computeView(model, base(model, { t: NOW - 2.5 * HOUR, search: parseSearch(' on ') }));
    expect(v.prevHit.title).toBe('Duty on imports debated');
    expect(v.nextHit.title).toBe('Tariffs rise on steel');
  });

  it('reports only the words worth asking WordNet about', () => {
    expect(expandableTerms(parseSearch('ai tariff x1 war-time cat'))).toEqual(['tariff', 'cat']);
  });

  it('says why nothing matches', () => {
    const v = computeView(model, base(model, { search: parseSearch('zzzz') }));
    expect(emptyMessage(v, parseSearch('zzzz'))).toBe('No stored item contains "zzzz". Try a different word.');
    expect(emptyMessage(v, parseSearch('zzzz', true))).toContain('as a whole word');
  });

  it('says when the soloed rows have no match but others do', () => {
    const s = parseSearch('ceasefire');
    const v = computeView(model, base(model, { search: s, solo: new Set([soloKey.feed('bbc')]) }));
    expect(v.noneInSolo).toBe(true);
    expect(emptyMessage(v, s)).toContain('1 match is in other rows. Clear solo to see it.');
    expect(searchCountText(v)).toContain('1 match in all, none in the soloed rows');
  });
});

describe('texts', () => {
  const model = makeModel();

  it('describes the window and what is hidden', () => {
    const v = computeView(model, base(model));
    expect(metaText(v)).toContain('4 items across 3 sources within ±1 day of now. Showing the top 4 by source order. Co-occurrence is not a link.');
    const soloed = computeView(model, base(model, { solo: new Set([soloKey.feed('aj')]) }));
    expect(metaText(soloed)).toContain('3 other items hidden by solo.');
  });

  it('is empty when nothing is in the window and explains why', () => {
    const v = computeView(model, base(model, { t: NOW - 60 * HOUR, windowHours: 2 }));
    expect(metaText(v)).toBe('');
    expect(emptyMessage(v, parseSearch(''))).toBe('Nothing in this window. Widen the window or keep scrubbing.');
  });

  it('counts matches with the right plural and mentions related items', () => {
    const s = parseSearch('tariffs');
    const v = computeView(model, base(model, { search: s }));
    expect(searchCountText(v)).toMatch(/^1 match in all/);
    expect(searchCountText(computeView(model, base(model)))).toBe('');
  });
});
