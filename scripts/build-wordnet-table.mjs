import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWordNet } from '../prototype/observation-window/wordnet.mjs';

// Distills the Princeton WordNet dictionary (34 MB, from the prototype's wordnet-db install) into the
// small table the widen-search Lambda bundles: for each single-word entry, its synonyms and broader
// terms, exactly as the prototype's lookup computes them. Words are stored once, by number.
// Re-run only if the lookup rules in prototype/observation-window/wordnet.mjs change:
//   (cd prototype/observation-window && npm install) && node scripts/build-wordnet-table.mjs
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'amplify', 'functions', 'widen-search', 'wordnet-table.json');

const lookup = loadWordNet();
const words = [];
const wordId = new Map();
const idOf = (w) => {
  if (!wordId.has(w)) {
    wordId.set(w, words.length);
    words.push(w);
  }
  return wordId.get(w);
};

const entries = {};
for (const lemma of new Set(lookup.lemmas())) {
  if (!/^[a-z]+$/.test(lemma)) continue;
  const { synonyms, broader } = lookup(lemma, { exact: true });
  if (synonyms.length === 0 && broader.length === 0) continue;
  // The entry's own word is a synonym of its word forms ("bank" for "banks"), so keep it; the
  // function drops the searched word itself.
  entries[lemma] = [[lemma, ...synonyms].map(idOf), broader.map(idOf)];
}

await writeFile(out, JSON.stringify({ words, entries }));
console.log(`${Object.keys(entries).length} entries, ${words.length} words -> ${out}`);
