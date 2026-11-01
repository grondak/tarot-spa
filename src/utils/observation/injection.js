// Outside-interest injection (epic S2.3): each day, each user is shown one item from a source
// they did not choose, taken from the operator's curated pool. Worked out here from the signed-in
// user's id and the date alone, so nothing about a user is stored on the server and the same
// person sees the same pick on every visit and every device. Pure functions.
export const INJECTED_GROUP = 'outside your interests';

const DAY_MS = 24 * 3600e3;

export const utcDay = (ms) => new Date(Math.floor(ms / DAY_MS) * DAY_MS).toISOString().slice(0, 10);

// FNV-1a: a small, stable string hash. Not security; it only has to spread picks around.
export function hashString(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.codePointAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

// poolFeeds: [{ id, sortOrder }]; poolItems: [{ id, ms, feedId }]; dismissed: Set of feed ids.
// Returns one pick per day that has pool news: [{ day, feedId, item }], oldest day first.
export function pickInjections({ poolFeeds, poolItems, userId, dismissed }) {
  const eligible = poolFeeds
    .filter((feed) => !dismissed.has(feed.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  if (eligible.length === 0) return [];

  const byDay = new Map();
  for (const item of poolItems) {
    const day = utcDay(item.ms);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(item);
  }

  const picks = [];
  for (const day of [...byDay.keys()].sort()) {
    const items = byDay.get(day).sort((a, b) => a.ms - b.ms);
    // The day's feed is chosen from the whole pool, so it does not change as feeds publish.
    // If that feed had nothing that day, the next in the rotation stands in.
    const first = hashString(`${userId}|${day}`) % eligible.length;
    for (let i = 0; i < eligible.length; i++) {
      const feed = eligible[(first + i) % eligible.length];
      // The day's earliest item, so a pick does not change when later news arrives.
      const item = items.find((candidate) => candidate.feedId === feed.id);
      if (item) {
        picks.push({ day, feedId: feed.id, item });
        break;
      }
    }
  }
  return picks;
}
