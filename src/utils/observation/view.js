// What the page shows for a given scrubber position, window, solo and search. Pure functions.
import { sourceKey } from './keys';
import { HOUR, formatTime } from './timeline';
import {
  chooseWidening, expandableTerms, matchesExact, matchesWidened, relatedReason,
} from './search';

export { expandableTerms, relatedReason };

export const WINDOW_OPTIONS = [
  { hours: 2, label: '2 hours' },
  { hours: 6, label: '6 hours' },
  { hours: 24, label: '1 day' },
  { hours: 96, label: '4 days' },
  { hours: 168, label: '1 week' },
  { hours: 360, label: '15 days' },
];

export const soloKey = sourceKey;

// `solo` is a Set of soloKey values; `search` comes from parseSearch.
// `stakes` is an optional Map of item id to stakes for the open case; items missing from it are 0.
export function computeView(model, { t, windowHours, cardCount, solo, search, stem, expansions, blocked, stakes }) {
  const half = windowHours * HOUR;
  const lo = t - half;
  const hi = t + half;
  const soloing = solo.size > 0;
  const searching = search.terms.length > 0;
  const inSolo = (item) => {
    if (!soloing) return true;
    const feed = model.feeds[item.lane];
    return solo.has(soloKey.group(feed.group)) || solo.has(soloKey.feed(feed.id));
  };

  const allInWin = model.items
    .filter((i) => i.ms >= lo && i.ms <= hi)
    .sort((a, b) => a.lane - b.lane || b.ms - a.ms);
  const { level, alts } = chooseWidening(search, { model, stem, expansions, blocked }, allInWin, inSolo);
  const lit = (item) => searching && (matchesExact(item, search) || (level > 0 && matchesWidened(item, alts)));
  const isLit = (item) => (searching ? lit(item) : true);
  const isFocused = (item) => isLit(item) && inSolo(item);
  const isRelated = (item) => level > 0 && !matchesExact(item, search);

  // Outside-your-interests picks come first, or a one-a-day pick would never reach the top cards.
  // Then exact matches rank before related ones, then higher stakes first; the sort is stable, so
  // source order holds within each.
  const stakesOf = (item) => stakes?.get(item.id) ?? 0;
  const inWin = allInWin.filter(isFocused).sort((a, b) => Number(b.injected) - Number(a.injected)
    || Number(isRelated(a)) - Number(isRelated(b))
    || stakesOf(b) - stakesOf(a));
  const matched = searching ? model.items.filter((i) => matchesExact(i, search)) : [];
  const hits = matched.filter(inSolo);
  const seenWords = new Set();
  return {
    t,
    live: t >= model.end - HOUR / 2,
    lo,
    hi,
    windowHours,
    cardCount,
    allInWin,
    inWin,
    soloing,
    searching,
    hits,
    level,
    alts,
    related: inWin.filter(isRelated).length,
    chips: (level >= 2 ? alts.flat().filter((a) => a.kind !== 'form') : [])
      .filter((a) => !seenWords.has(a.word) && seenWords.add(a.word)),
    matchLanes: new Set((searching ? model.items.filter(lit) : []).map((i) => i.lane)),
    totalMatches: matched.length,
    hidden: allInWin.length - inWin.length,
    noneInSolo: searching && soloing && matched.length > 0 && hits.length === 0,
    filters: [soloing && 'solo', searching && 'search'].filter(Boolean).join(' and '),
    isFocused,
    isRelated,
    prevHit: hits.reduce((best, i) => (i.ms < t && (!best || i.ms > best.ms) ? i : best), null),
    nextHit: hits.reduce((best, i) => (i.ms > t && (!best || i.ms < best.ms) ? i : best), null),
  };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const matchCount = (n) => plural(n, 'match').replace('matchs', 'matches');

export function searchCountText(v) {
  if (!v.searching) return '';
  let text = `${matchCount(v.totalMatches)} in all`;
  if (v.soloing && v.totalMatches > 0) {
    text += v.hits.length ? `, ${v.hits.length} in the soloed rows` : ', none in the soloed rows';
  }
  if (v.level > 0) text += ` · ${v.related} related here`;
  return text;
}

// Why the cards area is empty, most specific reason first.
export function emptyMessage(v, search) {
  if (v.searching && v.totalMatches === 0) {
    const hint = search.whole
      ? ' as a whole word. Try turning off Whole word, or a different word.'
      : '. Try a different word.';
    return `No stored item contains "${search.text.trim()}"${hint}`;
  }
  if (v.noneInSolo) {
    const verb = v.totalMatches === 1 ? 'is' : 'are';
    const them = v.totalMatches === 1 ? 'it' : 'them';
    return `Nothing in the soloed rows matches your search anywhere in the history. ${matchCount(v.totalMatches)} ${verb} in other rows. Clear solo to see ${them}.`;
  }
  const others = plural(v.hidden, 'other item');
  if (v.filters) return `Nothing matches in this window (${others} hidden by ${v.filters}). Clear it, or keep scrubbing.`;
  return 'Nothing in this window. Widen the window or keep scrubbing.';
}

export function metaText(v) {
  if (!v.inWin.length) return '';
  const lanes = new Set(v.inWin.map((i) => i.lane)).size;
  const shown = Math.min(v.cardCount, v.inWin.length);
  const span = WINDOW_OPTIONS.find((o) => o.hours === v.windowHours)?.label ?? `${v.windowHours} hours`;
  const picks = v.inWin.some((i) => i.injected) ? ' Items from outside your interests are listed first.' : '';
  const tail = v.filters
    ? ` ${plural(v.hidden, 'other item')} hidden by ${v.filters}.`
    : ' Co-occurrence is not a link.';
  return `${plural(v.inWin.length, 'item')} across ${plural(lanes, 'source')} within ±${span} of ${v.live ? 'now' : formatTime(v.t)}. Showing the top ${shown} by source order.${picks}${tail}`;
}

