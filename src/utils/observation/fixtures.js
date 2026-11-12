import { stemmer } from 'stemmer';
import { HOUR, buildModel } from './timeline';

export const NOW = Date.parse('2026-11-01T12:00:00Z');
export const hoursAgo = (h) => new Date(NOW - h * HOUR).toISOString();

export const feedRows = [
  { id: 'bbc', name: 'BBC', group: 'world', sortOrder: 0, lastFetchedAt: hoursAgo(0.5) },
  { id: 'aj', name: 'Al Jazeera', group: 'world', sortOrder: 1, lastFetchedAt: hoursAgo(0.5) },
  { id: 'lr', name: 'Light Reading', group: 'telecom', sortOrder: 2, lastFetchedAt: hoursAgo(0.5) },
  { id: 'fierce', name: 'Fierce Network', group: 'telecom', sortOrder: 2, lastFetchedAt: hoursAgo(90) },
  { id: 'gone', name: 'Gone Feed', group: 'telecom', sortOrder: 3, lastFetchedAt: hoursAgo(90) },
];

let n = 0;
export const itemRow = (overrides = {}) => ({
  id: `item-${++n}`,
  title: 'A headline',
  link: 'https://example.com/a',
  summary: '',
  publishedAt: hoursAgo(1),
  publishedAtEstimated: false,
  sources: ['bbc'],
  ...overrides,
});

export const itemRows = [
  itemRow({ title: 'Tariffs rise on steel', summary: 'Trade ministers met.', publishedAt: hoursAgo(2), sources: ['bbc'] }),
  itemRow({ title: 'Ceasefire talks resume', summary: 'Delegations met again.', publishedAt: hoursAgo(3), sources: ['aj'] }),
  itemRow({ title: 'Duty on imports debated', summary: 'A new duty is proposed.', publishedAt: hoursAgo(4), sources: ['lr'] }),
  itemRow({ title: 'Chip supply improves', summary: 'Fabs report capacity.', publishedAt: hoursAgo(30), sources: ['lr', 'bbc'] }),
  itemRow({ title: 'Old Fierce story', summary: 'Retired source.', publishedAt: hoursAgo(100), sources: ['fierce'] }),
  itemRow({ title: 'Weather today', summary: 'Rain.', publishedAt: hoursAgo(1), sources: ['bbc'], publishedAtEstimated: true }),
];

export const runRows = [
  { startedAt: hoursAgo(10), finishedAt: hoursAgo(9.9) },
  { startedAt: hoursAgo(9), finishedAt: hoursAgo(8.9) },
  { startedAt: hoursAgo(3), finishedAt: hoursAgo(2.9) }, // 5.9 h after the last finish: a gap
  { startedAt: hoursAgo(2), finishedAt: hoursAgo(1.9) },
];

export const makeModel = (overrides = {}) => buildModel({
  feeds: feedRows, items: itemRows, runs: runRows, now: NOW, stem: stemmer, ...overrides,
});

// The outside-interest pool: collected like any feed, never a lane until a day's pick lands.
export const poolFeedRows = [
  { id: 'nature', name: 'Nature', group: 'outside interests', kind: 'pool', reason: 'Peer-reviewed science.', sortOrder: 4, lastFetchedAt: hoursAgo(0.5) },
  { id: 'aeon', name: 'Aeon', group: 'outside interests', kind: 'pool', reason: 'Essays on ideas.', sortOrder: 5, lastFetchedAt: hoursAgo(0.5) },
  { id: 'nasa', name: 'NASA', group: 'outside interests', kind: 'pool', reason: 'Space science.', sortOrder: 6, lastFetchedAt: hoursAgo(0.5) },
];

// Every pool feed publishes on each of the last three days (hours 5, 29 and 53 ago).
export const poolItemRows = ['nature', 'aeon', 'nasa'].flatMap((feed) => [5, 29, 53].map((h) => itemRow({
  title: `${feed} story ${h}`,
  summary: 'Something far from the news.',
  publishedAt: hoursAgo(h),
  sources: [feed],
})));

// Items per source per UTC day for the 22 days before NOW's day: BBC usually 2 a day, Light Reading 1.
export const countRows = ['bbc', 'lr'].flatMap((feedId) => Array.from({ length: 22 }, (_, i) => ({
  feedId,
  day: new Date(Date.UTC(2026, 9, 10 + i)).toISOString().slice(0, 10),
  count: feedId === 'bbc' ? 2 : 1,
})));

// A collector that has run every hour since Oct 9, so baselines and expected events have history
// with no outage in it; the last stretch is the usual runs above, with their gap.
const firstHour = Date.UTC(2026, 9, 9, 6);
export const longRunRows = [
  ...Array.from({ length: Math.floor((NOW - 11 * HOUR - firstHour) / HOUR) }, (_, i) => ({
    startedAt: new Date(firstHour + i * HOUR).toISOString(),
    finishedAt: new Date(firstHour + i * HOUR + 6 * 60e3).toISOString(),
  })),
  ...runRows,
];
