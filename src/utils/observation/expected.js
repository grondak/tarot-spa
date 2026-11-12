// Events the user expects to recur, and the ones that did not happen (epic S5.4, S5.5). An event is
// the user's own name and words plus a day of the month, give or take a few days. An item counts as
// the event when it holds every one of those words, from any source, and falls inside those days.
// Only a month the collector fully covered can be called missing; an outage never looks like a quiet
// month. Days are UTC days, like the daily counts. Pure functions.
const DAY = 24 * 3600e3;

// Items are kept 30 days (amplify/config.ts), so nothing older than that can be checked.
const ITEM_RETENTION_DAYS = 30;
export const MAX_TOLERANCE = 7;

export const expectedWords = (text) => [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length >= 2))];

const utcDayStart = (ms) => Math.floor(ms / DAY) * DAY;

// The day of the month in a given month, held to the month's last day (the 31st in a 30-day month).
export function expectedDayMs(year, month, dayOfMonth) {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(dayOfMonth, last));
}

const overlapsGap = (gaps, from, to) => gaps.some(([gapFrom, gapTo]) => gapFrom < to && gapTo > from);

// Each month's chance for one event: 'arrived' with the matching items, 'missing' once every
// allowed day has passed with none, or 'pending' while it can still arrive. Months the collector
// did not fully cover, or that expired from the store, are left out. Oldest first.
export function occurrences(event, model, stem) {
  const words = expectedWords(event.words).map(stem);
  if (words.length === 0 || model.collectorSince === null || model.collectorSince === undefined) return [];
  const today = utcDayStart(model.end);
  const covered = Math.max(utcDayStart(model.collectorSince) + DAY, today - ITEM_RETENTION_DAYS * DAY);
  const first = new Date(covered);
  const horizon = today + (event.tolerance + 1) * DAY + 31 * DAY;
  const found = [];
  for (let step = 0; ; step += 1) {
    const monthStart = Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + step, 1);
    if (monthStart > horizon) break;
    const when = new Date(monthStart);
    const expectedMs = expectedDayMs(when.getUTCFullYear(), when.getUTCMonth(), event.dayOfMonth);
    const from = expectedMs - event.tolerance * DAY;
    const to = expectedMs + (event.tolerance + 1) * DAY;
    if (from < covered) continue;
    if (to > today) {
      if (!found.some((o) => o.status === 'pending')) found.push({ expectedMs, from, to, status: 'pending', matches: [] });
      continue;
    }
    if (overlapsGap(model.gaps, from, to)) continue;
    const matches = model.items.filter((item) => item.ms >= from && item.ms < to && words.every((w) => item.stems.has(w)));
    found.push({ expectedMs, from, to, status: matches.length > 0 ? 'arrived' : 'missing', matches });
  }
  return found;
}

// Occurrences for each of a case's events, keyed by event id.
export function occurrencesByEvent(events, model, stem) {
  return new Map(events.map((event) => [event.id, occurrences(event, model, stem).map((o) => ({ ...o, event }))]));
}

// The events that did not happen, oldest first, ready to draw.
export function absences(byEvent) {
  return [...byEvent.values()].flat().filter((o) => o.status === 'missing').sort((a, b) => a.expectedMs - b.expectedMs);
}

export const formatDay = (ms) => new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });
