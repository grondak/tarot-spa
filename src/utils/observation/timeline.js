// The Observation Window's data model: shared feed rows and items in, lanes, groups and a time
// axis out. Pure functions; no network, no React. Ported from the Release 0 prototype.
import { INJECTED_GROUP, pickInjections } from './injection';
import { sourceKey } from './keys';

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
//
// Feeds of kind 'pool' are the operator's outside-interest pool: they never become lanes of
// their own. Each day one pooled item is picked for this user (see injection.js) and shown in the
// "outside your interests" group, unless the user has dismissed that source.
export function buildModel({
  feeds: feedRows, items: itemRows, runs, counts: countRows = [], now, stem, userId = '', dismissed = new Set(), disabled = new Set(),
}) {
  const poolRows = feedRows.filter((feed) => feed.kind === 'pool');
  const poolIds = new Set(poolRows.map((feed) => feed.id));
  const starterRows = feedRows.filter((feed) => feed.kind !== 'pool');
  const allStarter = orderFeeds(starterRows, itemRows);
  // Switched-off sources and groups leave the timeline, but their stored items are kept: switching
  // one back on brings its lane back (epic S2.1). `catalog` lists everything, on or off.
  const isOff = (feed) => disabled.has(sourceKey.feed(feed.id)) || disabled.has(sourceKey.group(feed.group));
  const feeds = allStarter.filter((feed) => !isOff(feed));
  const laneOf = new Map(feeds.map((feed, lane) => [feed.id, lane]));

  const rows = [];
  const poolCandidates = [];
  for (const row of itemRows) {
    const ms = parseMs(row.publishedAt);
    if (ms === null) continue;
    const sources = row.sources ?? [];
    const lanes = sources.map((id) => laneOf.get(id)).filter((lane) => lane !== undefined);
    if (lanes.length > 0) {
      rows.push({ row, ms, lane: Math.min(...lanes) });
      continue;
    }
    const feedId = sources.find((id) => poolIds.has(id));
    if (feedId) poolCandidates.push({ row, ms, feedId });
  }

  const injectionOn = !disabled.has(sourceKey.group(INJECTED_GROUP));
  const picks = pickInjections({
    poolFeeds: injectionOn ? poolRows : [],
    poolItems: poolCandidates.map(({ row, ms, feedId }) => ({ id: row.id, ms, feedId, row })),
    userId,
    dismissed,
  });
  // One lane per pool source that has a pick, after the starter lanes, in the pool's own order.
  const pickedIds = new Set(picks.map((pick) => pick.feedId));
  for (const feed of poolRows.filter((f) => pickedIds.has(f.id)).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))) {
    laneOf.set(feed.id, feeds.length);
    feeds.push({
      id: feed.id,
      name: feed.name,
      group: INJECTED_GROUP,
      sortOrder: feed.sortOrder ?? 0,
      retired: false,
      injected: true,
      reason: feed.reason ?? '',
    });
  }
  for (const pick of picks) {
    rows.push({ row: pick.item.row, ms: pick.item.ms, lane: laneOf.get(pick.feedId), injected: true });
  }

  const items = rows.map(({ row, ms, lane, injected }) => {
    const title = row.title ?? '';
    const summary = row.summary ?? '';
    const hay = `${title} ${summary}`.toLowerCase();
    return {
      id: row.id,
      title,
      summary,
      link: row.link,
      ms,
      estimated: Boolean(row.publishedAtEstimated),
      lane,
      injected: Boolean(injected),
      hay,
      stems: new Set((hay.match(/[\p{L}\p{N}]+/gu) ?? []).map(stem)),
    };
  });

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
  const catalog = [];
  for (const feed of allStarter) {
    let group = catalog.find((g) => g.name === feed.group);
    if (!group) {
      group = { name: feed.group, feeds: [] };
      catalog.push(group);
    }
    group.feeds.push({ id: feed.id, name: feed.name, retired: feed.retired });
  }
  if (poolRows.length > 0) catalog.push({ name: INJECTED_GROUP, feeds: [], injected: true });

  // Items per source per day, for the baseline (epic S5.3): source id to (UTC day to count).
  const counts = new Map();
  for (const { feedId, day, count } of countRows) {
    if (typeof feedId !== 'string' || typeof day !== 'string' || !Number.isFinite(count)) continue;
    if (!counts.has(feedId)) counts.set(feedId, new Map());
    counts.get(feedId).set(day, count);
  }

  // Counts from before the collector first ran are archive items a feed still listed, not real
  // volume, so the baseline starts after the day of the collector's first run.
  const runStarts = runs.map((run) => parseMs(run.startedAt)).filter((ms) => ms !== null);
  const collectorSince = runStarts.length ? Math.min(...runStarts) : null;

  return { feeds, items, groups, catalog, stemDf, counts, collectorSince, start, end, gaps: findGaps(runs) };
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
