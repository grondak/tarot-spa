// @vitest-environment node
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createHandler } from './handler';
// The prototype's reader is the reference: the bundled table must give the same answers.
// It needs the prototype's own `npm install` (wordnet-db), so that one test skips without it.
import { loadWordNet } from '../../../prototype/observation-window/wordnet.mjs';

const referenceAvailable = existsSync(
  new URL('../../../prototype/observation-window/node_modules/wordnet-db', import.meta.url),
);

const widen = createHandler();
const ask = (term: string) => widen({ arguments: { term } });

describe('widen-search', () => {
  it('returns synonyms and broader terms for a common word', async () => {
    const result = await ask('dog');
    expect(result.term).toBe('dog');
    expect(result.synonyms).toContain('frump');
    expect(result.broader).toEqual(expect.arrayContaining(['canine', 'canid']));
    expect(result.synonyms).not.toContain('dog');
    expect(result.broader).not.toContain('dog');
    expect((await ask('car')).synonyms).toContain('automobile');
  });

  it('finds the entry for a plural and keeps the singular as a synonym', async () => {
    const result = await ask('banks');
    expect(result.synonyms).toContain('bank');
    expect(result.synonyms).not.toContain('banks');
  });

  it('lowercases and trims the term', async () => {
    expect((await ask('  CAR ')).term).toBe('car');
  });

  it('returns nothing for a word WordNet does not know', async () => {
    expect(await ask('zzzqx')).toEqual({ term: 'zzzqx', synonyms: [], broader: [] });
  });

  it.each(['', '   ', 'two words', 'x1', 'rm -rf', '__proto__'])(
    'returns nothing for the non-word %j',
    async (term) => {
      const result = await ask(term);
      expect(result.synonyms).toEqual([]);
      expect(result.broader).toEqual([]);
    },
  );

  it('returns nothing when the term is missing', async () => {
    expect(await widen({})).toEqual({ term: '', synonyms: [], broader: [] });
  });

  it('truncates an overlong term', async () => {
    expect((await ask('a'.repeat(100))).term).toHaveLength(40);
  });

  it.skipIf(!referenceAvailable)('agrees with the prototype reader on a spread of words', async () => {
    const reference = loadWordNet();
    const sample = [
      'economy', 'war', 'inflation', 'tariffs', 'missile', 'chips', 'training', 'trained',
      'bank', 'banks', 'telecom', 'network', 'model', 'models', 'merger', 'earnings',
      'privacy', 'satellite', 'ceasefire', 'startup', 'energy', 'oil', 'growth', 'fed',
    ];
    for (const term of sample) {
      const expected = reference(term);
      const actual = await ask(term);
      expect([...actual.synonyms].sort(), term).toEqual([...expected.synonyms].sort());
      expect([...actual.broader].sort(), term).toEqual([...expected.broader].sort());
    }
  });
});
