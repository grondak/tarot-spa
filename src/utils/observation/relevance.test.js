import { describe, expect, it } from 'vitest';
import { stemmer } from 'stemmer';
import { caseKeywords, relevantItems, relevantWords, rivalEvidence, tallyUpTo } from './relevance';

const mk = (id, ms, text) => ({
  id, ms, stems: new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).map(stemmer)),
});
const items = [
  mk('a', 1000, 'Berry stand sold out by 9am as demand for local berries climbs'),
  mk('b', 2000, 'Neighbor tore out his strawberry patch, citing supply costs'),
  mk('c', 3000, 'Ceasefire talks resume'),
  mk('d', 4000, 'Strawberry prices steady'),
];
const model = (extra = {}) => {
  const stemDf = new Map();
  for (const item of items) for (const s of item.stems) stemDf.set(s, (stemDf.get(s) ?? 0) + 1);
  return { stemDf, items: Array.from({ length: 100 }, () => ({})), ...extra };
};

describe('caseKeywords', () => {
  it('keeps the case\'s own meaningful words once each, without filler', () => {
    const words = caseKeywords('Should I plant strawberry patch? Local demand for berries is outrunning supply', { stem: stemmer, model: model() })
      .map((k) => k.word);
    expect(words).toEqual(expect.arrayContaining(['strawberry', 'patch', 'local', 'demand', 'supply']));
    expect(words).not.toContain('should');
    expect(words).not.toContain('for');
    expect(new Set(words).size).toBe(words.length);
  });

  it('drops words that are not in the news at all, and words so common they match nearly everything', () => {
    const big = model({ items: Array.from({ length: 100 }, () => ({})) });
    big.stemDf.set(stemmer('berries'), 30); // 30% of 100 items
    const words = caseKeywords('zeppelin berries steady', { stem: stemmer, model: big }).map((k) => k.word);
    expect(words).not.toContain('zeppelin');
    expect(words).not.toContain('berries');
    expect(words).toContain('steady');
  });

  it('does not call a word common while there are too few stored items to tell', () => {
    const small = model({ items: Array.from({ length: 10 }, () => ({})) });
    expect(caseKeywords('berries', { stem: stemmer, model: small }).map((k) => k.word)).toEqual(['berries']);
  });
});

describe('relevantWords', () => {
  const keywords = caseKeywords('strawberry patch supply demand', { stem: stemmer, model: model() });

  it('needs two of the case\'s words when the case has several', () => {
    expect(relevantWords(items[1], keywords)).toEqual(['strawberry', 'patch', 'supply']);
    expect(relevantWords(items[3], keywords)).toEqual([]); // only 'strawberry'
    expect(relevantWords(items[2], keywords)).toEqual([]);
  });

  it('is satisfied by one word for a case with very few', () => {
    const few = caseKeywords('strawberry', { stem: stemmer, model: model() });
    expect(relevantWords(items[3], few)).toEqual(['strawberry']);
  });

  it('matches word forms', () => {
    const k = caseKeywords('berry demand', { stem: stemmer, model: model() });
    expect(relevantWords(items[0], k)).toEqual(['berry', 'demand']);
  });
});

describe('relevantItems and tallyUpTo', () => {
  const keywords = caseKeywords('strawberry patch supply demand', { stem: stemmer, model: model() });
  const matches = relevantItems(items, keywords);

  it('lists only the items that look relevant, with why', () => {
    expect([...matches.keys()]).toEqual(['b']);
    expect(relevantItems(items, [])).toEqual(new Map());
  });

  it('counts sorted evidence up to a time, and relevant items still unsorted', () => {
    const tags = new Map([
      ['x', { itemAt: new Date(1000).toISOString(), stance: 'SUPPORTS' }],
      ['y', { itemAt: new Date(2500).toISOString(), stance: 'CUTS_AGAINST' }],
      ['z', { itemAt: new Date(2600).toISOString(), stance: 'NOT_RELEVANT' }],
    ]);
    expect(tallyUpTo(5000, { tags, matches, items })).toEqual({ supports: 1, against: 1, unsorted: 1 });
    expect(tallyUpTo(2000, { tags, matches, items })).toEqual({ supports: 1, against: 0, unsorted: 1 });
    expect(tallyUpTo(1500, { tags, matches, items })).toEqual({ supports: 1, against: 0, unsorted: 0 });
    const sorted = new Map([...tags, ['b', { itemAt: new Date(2000).toISOString(), stance: 'SUPPORTS' }]]);
    expect(tallyUpTo(5000, { tags: sorted, matches, items }).unsorted).toBe(0);
  });
});

describe('rivalEvidence', () => {
  const row = (id, ms) => ({ id, ms, title: `T${id}`, summary: `S${id}` });
  const pool = [row('a', 1), row('b', 2), row('c', 3), row('d', 4), row('e', 5)];

  it('puts sorted items first, then unsorted relevant ones, newest first, and skips not-relevant', () => {
    const tags = new Map([
      ['a', { stance: 'SUPPORTS' }],
      ['b', { stance: 'CUTS_AGAINST' }],
      ['c', { stance: 'NOT_RELEVANT' }],
    ]);
    const matches = new Map([['c', ['x']], ['d', ['x']], ['e', ['x']]]);
    expect(rivalEvidence(pool, { tags, matches })).toEqual([
      { id: 'b', title: 'Tb', summary: 'Sb', stance: 'cuts against' },
      { id: 'a', title: 'Ta', summary: 'Sa', stance: 'supports' },
      { id: 'e', title: 'Te', summary: 'Se', stance: 'unsorted' },
      { id: 'd', title: 'Td', summary: 'Sd', stance: 'unsorted' },
    ]);
  });

  it('stops at the limit', () => {
    const matches = new Map(pool.map((i) => [i.id, ['x']]));
    expect(rivalEvidence(pool, { tags: new Map(), matches, limit: 2 }).map((e) => e.id)).toEqual(['e', 'd']);
  });
});
