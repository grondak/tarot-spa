// What is normal for each lane, and whether the window on screen is busier or quieter than that
// (epic S5.3). Normal is a source's average items per day over the complete days of history before
// the window, from the daily counts the collector keeps after items expire. A simple comparison, not
// a forecast, and it says nothing about why a lane is busy. Pure functions.
const DAY = 24 * 3600e3;

// Fewer complete days than this and "normal" would be a guess, so none is shown.
export const MIN_BASELINE_DAYS = 7;

const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayStart = (key) => Date.parse(`${key}T00:00:00Z`);

// Busier: at least double what is expected, and at least two items. Quieter: a lane that
// usually gives three or more in this span has half or less. Anything else is normal.
export function volumeState(actual, expected) {
  if (actual >= 2 * expected && actual >= 2) return 'busier';
  if (expected >= 3 && actual <= expected / 2) return 'quieter';
  return 'normal';
}

// The complete days (before today, UTC) the collector was running and that have a count, minus
// any day the window overlaps, so a burst never sets its own normal. Days before the collector's
// first run hold only archive items a feed still listed, so they are not counted. Nothing is
// adjusted for weekends yet.
function baselineDays(model, lo, hi) {
  if (model.collectorSince === null || model.collectorSince === undefined) return [];
  const all = [...model.counts.values()].flatMap((byDay) => [...byDay.keys()]);
  if (all.length === 0) return [];
  const firstCount = all.reduce((a, b) => (a < b ? a : b));
  const afterFirstRun = dayKey(model.collectorSince + DAY);
  const first = firstCount > afterFirstRun ? firstCount : afterFirstRun;
  const today = dayKey(model.end);
  const days = [];
  for (let ms = dayStart(first); dayKey(ms) < today; ms += DAY) {
    if (ms + DAY > lo && ms < hi) continue;
    days.push(dayKey(ms));
  }
  return days;
}

export function laneVolumes(model, view) {
  const days = baselineDays(model, view.lo, view.hi);
  if (days.length < MIN_BASELINE_DAYS) return { status: 'thin', days: days.length, lanes: [] };

  const spanDays = Math.max(0, Math.min(view.hi, model.end) - view.lo) / DAY;
  const actualByLane = new Map();
  for (const item of view.allInWin) actualByLane.set(item.lane, (actualByLane.get(item.lane) ?? 0) + 1);

  const lanes = model.feeds.flatMap((feed, lane) => {
    if (feed.injected) return [];
    const byDay = model.counts.get(feed.id);
    const total = days.reduce((sum, day) => sum + (byDay?.get(day) ?? 0), 0);
    const normalPerDay = total / days.length;
    const expected = normalPerDay * spanDays;
    const actual = actualByLane.get(lane) ?? 0;
    return [{ lane, id: feed.id, name: feed.name, group: feed.group, actual, expected, normalPerDay, state: volumeState(actual, expected) }];
  });
  return { status: 'ready', days: days.length, since: days[0], lanes };
}
