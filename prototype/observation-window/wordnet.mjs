// Minimal Princeton WordNet reader (the wordnet-db package's dict files) for query widening.
// Given a word it returns synonyms (other words in its top senses) and broader terms
// (words in the synsets one step up: the "hypernyms"). Single words only; phrases are skipped.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const POS = ['noun', 'verb', 'adj', 'adv'];
const SENSES_PER_POS = 2; // WordNet lists senses most-common first; later senses add noise

export function loadWordNet() {
  const dictDir = join(createRequire(import.meta.url)('wordnet-db').path);
  const index = {};
  const data = {};
  for (const pos of POS) {
    index[pos] = new Map();
    for (const line of readFileSync(join(dictDir, `index.${pos}`), 'utf8').split('\n')) {
      if (!line || line.startsWith(' ')) continue; // license header
      const f = line.trim().split(' '); // index lines end with a space
      const synsetCount = Number.parseInt(f[2], 10);
      index[pos].set(f[0], f.slice(f.length - synsetCount, f.length));
    }
    data[pos] = new Map();
    for (const line of readFileSync(join(dictDir, `data.${pos}`), 'utf8').split('\n')) {
      if (!line || line.startsWith(' ')) continue;
      const gloss = line.indexOf('|');
      const f = (gloss === -1 ? line : line.slice(0, gloss)).trim().split(' ');
      const wordCount = Number.parseInt(f[3], 16); // hex
      const words = [];
      for (let i = 0; i < wordCount; i++) words.push(f[4 + i * 2]);
      let p = 4 + wordCount * 2;
      const pointerCount = Number.parseInt(f[p++], 10);
      const hypernyms = [];
      for (let i = 0; i < pointerCount; i++, p += 4) {
        if (f[p] === '@' || f[p] === '@i') hypernyms.push(`${f[p + 2]}:${f[p + 1]}`);
      }
      data[pos].set(f[0], { words, hypernyms });
    }
  }

  const posName = { n: 'noun', v: 'verb', a: 'adj', s: 'adj', r: 'adv' };
  const clean = (w) => w.replace(/\(.*\)$/, '').toLowerCase();
  const lemmaCandidates = (term) => {
    const t = term.toLowerCase();
    return [...new Set([t, t.replace(/ies$/, 'y'), t.replace(/(es|s)$/, ''), t.replace(/ing$/, ''), t.replace(/ing$/, 'e'), t.replace(/ed$/, ''), t.replace(/ed$/, 'e')])];
  };

  return function lookup(term) {
    const synonyms = new Set();
    const broader = new Set();
    const self = term.toLowerCase();
    for (const lemma of lemmaCandidates(term)) {
      for (const pos of POS) {
        for (const offset of (index[pos].get(lemma) ?? []).slice(0, SENSES_PER_POS)) {
          const synset = data[pos].get(offset);
          if (!synset) continue;
          synset.words.map(clean).forEach((w) => synonyms.add(w));
          // Broader terms from verb senses are generic verbs ("go", "talk"), so take them from nouns only.
          if (pos !== 'noun') continue;
          for (const ref of synset.hypernyms) {
            const [p, off] = ref.split(':');
            data[posName[p]]?.get(off)?.words.map(clean).forEach((w) => broader.add(w));
          }
        }
      }
    }
    const single = (w) => /^[a-z]+$/.test(w);
    const syn = [...synonyms].filter((w) => single(w) && w !== self);
    const synSet = new Set(syn);
    return { term: self, synonyms: syn, broader: [...broader].filter((w) => single(w) && w !== self && !synSet.has(w)) };
  };
}
