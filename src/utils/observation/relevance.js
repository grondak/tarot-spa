// Which stored items look relevant to an open case. A proposal only: it matches the user's own
// words against each item and shows the matched words as the reason. It cannot tell whether an
// item supports or cuts against the hunch, so stance is always the user's call (epic S4.3, S4.4).
// Pure functions.
const MAX_GENERIC_DF = 0.08;
// Too few stored items to say a word is common; with fewer than this the cap is not applied.
const MIN_ITEMS_FOR_CAP = 100;

const STOPWORDS = new Set((
  'about above after again against all also and any are because been before being between both but can could '
  + 'did does doing down during each few for from further had has have having her here hers him his how into its '
  + 'just more most much must not now off once only other our out over own same she should some such than that '
  + 'the their them then there these they this those through too under until upon very was were what when where '
  + 'which while who whom why will with would you your yours yourself should might may need needs want wants '
  + 'think thinks know knows going get gets got make makes made say says said see sees seen use used using way '
  + 'new old big good bad one two three first last next than whether'
).split(/\s+/));

// The words of a case worth matching: its decision and hypothesis, minus filler and anything so
// common in the stored news that it would match nearly everything. [{ stem, word }]
export function caseKeywords(text, { stem, model }) {
  const seen = new Set();
  const keywords = [];
  for (const word of (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])) {
    if (word.length < 3 || STOPWORDS.has(word)) continue;
    const s = stem(word);
    const df = model.stemDf.get(s) ?? 0;
    const common = model.items.length >= MIN_ITEMS_FOR_CAP && df / model.items.length > MAX_GENERIC_DF;
    if (seen.has(s) || df === 0 || common) continue;
    seen.add(s);
    keywords.push({ stem: s, word });
  }
  return keywords;
}

// The case words found in one item, or [] when it does not look relevant. One shared word is
// enough only for a case with very few words of its own; otherwise it takes two.
export function relevantWords(item, keywords) {
  const needed = keywords.length >= 3 ? 2 : 1;
  const matched = keywords.filter((k) => item.stems.has(k.stem)).map((k) => k.word);
  return matched.length >= needed ? matched : [];
}

// Map of item id to matched words, for the items that look relevant.
export function relevantItems(items, keywords) {
  const found = new Map();
  if (keywords.length === 0) return found;
  for (const item of items) {
    const words = relevantWords(item, keywords);
    if (words.length > 0) found.set(item.id, words);
  }
  return found;
}

// Counts of the evidence the user has sorted up to time `t`, and relevant items still unsorted.
// Counts only: the Window never says whether the hypothesis is true.
export function tallyUpTo(t, { tags, matches, items }) {
  let supports = 0;
  let against = 0;
  for (const tag of tags.values()) {
    if (Date.parse(tag.itemAt) > t) continue;
    if (tag.stance === 'SUPPORTS') supports += 1;
    else if (tag.stance === 'CUTS_AGAINST') against += 1;
  }
  const unsorted = items.filter((item) => item.ms <= t && matches.has(item.id) && !tags.has(item.id)).length;
  return { supports, against, unsorted };
}

export const RIVAL_EVIDENCE_LIMIT = 12;
export const RIVAL_MIN_EVIDENCE = 3;

// The items to show a rival-hypothesis request: what the user sorted (supports and cuts against),
// then items that look relevant but are unsorted, newest first, up to the limit. Items marked
// "not relevant" are left out. Only what is already on screen for the case; stance stays the user's.
export function rivalEvidence(items, { tags, matches, limit = RIVAL_EVIDENCE_LIMIT }) {
  const stanceOf = { SUPPORTS: 'supports', CUTS_AGAINST: 'cuts against' };
  const toEvidence = (item, stance) => ({ id: item.id, title: item.title, summary: item.summary ?? '', stance });
  const byNewest = (a, b) => b.ms - a.ms;
  const sorted = items.filter((item) => stanceOf[tags.get(item.id)?.stance]).sort(byNewest)
    .map((item) => toEvidence(item, stanceOf[tags.get(item.id).stance]));
  const unsorted = items.filter((item) => matches.has(item.id) && !tags.has(item.id)).sort(byNewest)
    .map((item) => toEvidence(item, 'unsorted'));
  return [...sorted, ...unsorted].slice(0, limit);
}
