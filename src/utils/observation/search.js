// Search over the loaded items, and the "widen a thin search" ladder. Pure functions.
//
// Every word typed must appear in the title or the stored summary. When the current window has
// fewer than MIN_CARDS exact matches, the search widens one rung at a time until it has enough,
// or the rungs run out:
//   1 word forms (tariffs ~ tariff)   2 + synonyms (tariff ~ duty)   3 + broader terms (tariff ~ tax)
// Synonyms and broader terms come from WordNet (the widen-search Lambda), and only count if they
// appear in the stored news and are not so common that they would match everything.
export const MIN_CARDS = 3;
const MAX_GENERIC_DF = 0.08;
export const LEVEL_NAMES = ['', 'word forms', 'word forms and synonyms', 'word forms, synonyms and broader terms'];

const escapeRe = (text) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

export function parseSearch(text, whole = false) {
  const terms = text.toLowerCase().split(/\s+/).filter(Boolean);
  return {
    text,
    whole,
    terms,
    // "Whole word" matches a term only when letters or digits don't touch it, so "ai" skips "said".
    termRes: terms.map((t) => new RegExp(String.raw`(?<![\p{L}\p{N}])${escapeRe(t)}(?![\p{L}\p{N}])`, 'u')),
  };
}

export const matchesExact = (item, search) => (search.whole
  ? search.termRes.every((re) => re.test(item.hay))
  : search.terms.every((t) => item.hay.includes(t)));

// Typed words worth asking WordNet about.
export const expandableTerms = (search) => search.terms.filter((t) => t.length >= 3 && /^[a-z]+$/.test(t));

// Everything one typed term can stand for at a given level: [{ stem, word, of, kind }]
function alternatives(term, level, { model, stem, expansions, blocked }) {
  const informative = (s) => {
    const df = model.stemDf.get(s) ?? 0;
    return df > 0 && df / model.items.length <= MAX_GENERIC_DF;
  };
  const alts = [{ stem: stem(term), word: term, of: term, kind: 'form' }];
  const seen = new Set([alts[0].stem]);
  const expansion = expansions.get(term) ?? { synonyms: [], broader: [] };
  const add = (words, kind) => {
    for (const word of words ?? []) {
      const s = stem(word);
      if (seen.has(s) || blocked.has(word) || !informative(s)) continue;
      seen.add(s);
      alts.push({ stem: s, word, of: term, kind });
    }
  };
  if (level >= 2) add(expansion.synonyms, 'synonym');
  if (level >= 3) add(expansion.broader, 'broader');
  return alts;
}

export const matchesWidened = (item, alts) => alts.every((group) => group.some((a) => item.stems.has(a.stem)));

// Picks the narrowest level that gives MIN_CARDS cards in this window (0 = exact only).
export function chooseWidening(search, context, windowItems, inSolo) {
  const build = (level) => search.terms.map((t) => alternatives(t, level, context));
  if (!search.terms.length) return { level: 0, alts: [] };
  const exact = windowItems.filter((i) => matchesExact(i, search) && inSolo(i)).length;
  if (exact >= MIN_CARDS) return { level: 0, alts: [] };
  let widening;
  for (let level = 1; level <= 3; level++) {
    const alts = build(level);
    const lit = windowItems.filter((i) => (matchesExact(i, search) || matchesWidened(i, alts)) && inSolo(i));
    widening = { level, alts };
    if (lit.length >= MIN_CARDS) break;
  }
  return widening;
}

// Why a related item is lit, e.g. “duty” (synonym of “tariff”).
export function relatedReason(item, alts) {
  const how = { synonym: 'synonym of', broader: 'broader than' };
  return alts
    .map((group) => group.find((a) => item.stems.has(a.stem)))
    .filter(Boolean)
    .map((a) => (a.kind === 'form' ? `matched a form of “${a.of}”` : `“${a.word}” (${how[a.kind]} “${a.of}”)`))
    .join(', ');
}
