// The Observation Window's data model: shared feed rows and items in, lanes, groups and a time
// axis out. Pure functions; no network, no React. Ported from the Release 0 prototype.
export const HOUR = 3600e3;
const DAY = 24 * HOUR;
// A gap is a stretch between two collector runs longer than this (the collector is hourly).
const GAP_AFTER_MS = 2.5 * HOUR;
// A feed the collector has not fetched for this long, behind the newest feed, has been retired
// from the starter list. Its lane stays only while its items do.
const RETIRED_AFTER_MS = DAY;

export function formatTime(ms) {
  return new Date(ms).toLocaleString([], {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

const parseMs = (value) => {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
};

// Feeds become lanes in source order (the ranking until stakes exist, epic S2.8). A retired feed
// sorts after the live ones and is dropped once none of its items are left.
function orderFeeds(feedRows, items) {
  const fetchedAt = (feed) => parseMs(feed.lastFetchedAt);
  const newest = Math.max(0, ...feedRows.map((feed) => fetchedAt(feed) ?? 0));
  const carried = new Set(items.flatMap((item) => item.sources ?? []));
  return feedRows
    .map((feed) => ({
      id: feed.id,
      name: feed.name,
      group: feed.group,
      sortOrder: feed.sortOrder ?? 0,
      retired: (fetchedAt(feed) ?? 0) < newest - RETIRED_AFTER_MS,
    }))
    .filter((feed) => !feed.retired || carried.has(feed.id))
    .sort((a, b) => Number(a.retired) - Number(b.retired)
      || a.sortOrder - b.sortOrder
      || a.name.localeCompare(b.name));
}

function findGaps(runs) {
  const sorted = runs
    .map((run) => ({ startedAt: parseMs(run.startedAt), finishedAt: parseMs(run.finishedAt) }))
    .filter((run) => run.startedAt !== null)
    .sort((a, b) => a.startedAt - b.startedAt);
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    const from = sorted[i - 1].finishedAt ?? sorted[i - 1].startedAt;
    const to = sorted[i].startedAt;
    if (to - from > GAP_AFTER_MS) gaps.push([from, to]);
  }
  return gaps;
}

// `stem` reduces a word to its stem (the stemmer package); it is a parameter so this file stays
// free of imports and easy to test.
export function buildModel({ feeds: feedRows, items: itemRows, runs, now, stem }) {
  const feeds = orderFeeds(feedRows, itemRows);
  const laneOf = new Map(feeds.map((feed, lane) => [feed.id, lane]));
  const items = [];
  for (const row of itemRows) {
    const ms = parseMs(row.publishedAt);
    const lanes = (row.sources ?? []).map((id) => laneOf.get(id)).filter((lane) => lane !== undefined);
    if (ms === null || lanes.length === 0) continue;
    const title = row.title ?? '';
    const summary = row.summary ?? '';
    const hay = `${title} ${summary}`.toLowerCase();
    items.push({
      id: row.id,
      title,
      summary,
      link: row.link,
      ms,
      estimated: Boolean(row.publishedAtEstimated),
      lane: Math.min(...lanes),
      hay,
      stems: new Set((hay.match(/[\p{L}\p{N}]+/gu) ?? []).map(stem)),
    });
  }

  // How many items each word stem appears in, so a search never widens to a word so common it
  // would match everything.
  const stemDf = new Map();
  for (const item of items) for (const s of item.stems) stemDf.set(s, (stemDf.get(s) ?? 0) + 1);

  const groups = [];
  feeds.forEach((feed, lane) => {
    let group = groups.find((g) => g.name === feed.group);
    if (!group) {
      group = { name: feed.group, lanes: [] };
      groups.push(group);
    }
    group.lanes.push(lane);
  });

  const end = now;
  // The axis starts at the first item (rounded down to the hour), so the slider's left end is a dot.
  const first = items.length ? Math.min(...items.map((item) => item.ms)) : end - DAY;
  const start = Math.min(Math.floor(first / HOUR) * HOUR, end - HOUR);
  return { feeds, items, groups, stemDf, start, end, gaps: findGaps(runs) };
}

export const percentAlong = (model, ms) => ((ms - model.start) / (model.end - model.start)) * 100;

// One hue per group, so a group's lanes share a colour.
export function laneColor(model, lane) {
  const index = model.groups.findIndex((group) => group.lanes.includes(lane));
  return `hsl(${Math.round((Math.max(index, 0) * 360) / Math.max(model.groups.length, 1))} 65% 62%)`;
}

// Feeds can carry any URL. Only web links become clickable.
export const safeHref = (link) => (/^https?:\/\//i.test(link ?? '') ? link : undefined);

// Axis marks: now, then every five days back to the start.
export function axisMarks(model) {
  const marks = [];
  for (let d = 0; d * DAY <= model.end - model.start; d += 5) {
    const ms = model.end - d * DAY;
    marks.push({
      ms,
      label: d === 0 ? 'now' : new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' }),
    });
  }
  return marks;
}
