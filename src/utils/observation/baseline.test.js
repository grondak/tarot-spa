import { describe, expect, it } from 'vitest';
import { laneVolumes, MIN_BASELINE_DAYS, volumeState } from './baseline';
import { HOUR } from './timeline';
import { NOW, countRows, longRunRows, makeModel } from './fixtures';

const DAY = 24 * HOUR;
// A one-day window centred on 2026-10-31 12:00 UTC: all of Oct 31 (UTC), and nothing else.
const centre = NOW - DAY;
const windowOf = (allInWin, lo = centre - DAY / 2, hi = centre + DAY / 2) => ({ lo, hi, allInWin });
const itemsOf = (model, laneName, n) => {
  const lane = model.feeds.findIndex((f) => f.name === laneName);
  return Array.from({ length: n }, () => ({ lane }));
};
const lane = (volumes, name) => volumes.lanes.find((l) => l.name === name);

describe('volumeState', () => {
  it('is busier at double the expected and at least two items', () => {
    expect(volumeState(4, 2)).toBe('busier');
    expect(volumeState(2, 0.5)).toBe('busier');
    expect(volumeState(1, 0.2)).toBe('normal');
    expect(volumeState(3, 2)).toBe('normal');
  });

  it('is quieter only for a lane that usually gives three or more', () => {
    expect(volumeState(1, 4)).toBe('quieter');
    expect(volumeState(0, 2)).toBe('normal');
  });
});

describe('laneVolumes', () => {
  const model = makeModel({ counts: countRows, runs: longRunRows });

  it('has no normal until there are enough complete days', () => {
    const thin = makeModel({ counts: countRows.filter((r) => r.day >= '2026-10-28'), runs: longRunRows });
    expect(laneVolumes(thin, windowOf([]))).toEqual({ status: 'thin', days: 3, lanes: [] });
    expect(laneVolumes(makeModel(), windowOf([])).status).toBe('thin');
    expect(MIN_BASELINE_DAYS).toBe(7);
  });

  it('starts the day after the collector first ran, ignoring older archive counts', () => {
    const young = makeModel({
      counts: [...countRows, { feedId: 'bbc', day: '2026-10-05', count: 400 }],
      runs: [{ startedAt: '2026-10-20T08:00:00Z', finishedAt: '2026-10-20T08:05:00Z' }],
    });
    const volumes = laneVolumes(young, windowOf([]));
    expect(volumes.since).toBe('2026-10-21');
    expect(lane(volumes, 'BBC').normalPerDay).toBe(2);
    expect(laneVolumes(makeModel({ counts: countRows, runs: [] }), windowOf([])).status).toBe('thin');
  });

  it('works out each lane\'s normal from the days outside the window', () => {
    const volumes = laneVolumes(model, windowOf([]));
    expect(volumes.status).toBe('ready');
    // 22 days from Oct 10 to Oct 31, minus Oct 31, which the window covers.
    expect(volumes.days).toBe(21);
    expect(volumes.since).toBe('2026-10-10');
    expect(lane(volumes, 'BBC').normalPerDay).toBe(2);
    expect(lane(volumes, 'BBC').expected).toBeCloseTo(2);
    expect(lane(volumes, 'Light Reading').expected).toBeCloseTo(1);
  });

  it('flags a lane that is busier than normal, and one that is not', () => {
    const volumes = laneVolumes(model, windowOf([...itemsOf(model, 'BBC', 7), ...itemsOf(model, 'Light Reading', 1)]));
    expect(lane(volumes, 'BBC')).toMatchObject({ actual: 7, state: 'busier' });
    expect(lane(volumes, 'Light Reading')).toMatchObject({ actual: 1, state: 'normal' });
  });

  it('scales normal to the length of the window', () => {
    const wide = laneVolumes(model, windowOf([], NOW - 5 * DAY, NOW - DAY));
    expect(lane(wide, 'BBC').expected).toBeCloseTo(8);
    const short = laneVolumes(model, windowOf([], centre - 6 * HOUR, centre + 6 * HOUR));
    expect(lane(short, 'BBC').expected).toBeCloseTo(1);
  });

  it('never lets a burst inside the window set its own normal', () => {
    const burst = makeModel({
      runs: longRunRows,
      counts: [...countRows, { feedId: 'bbc', day: '2026-10-31', count: 500 }, { feedId: 'bbc', day: '2026-10-30', count: 500 }],
    });
    const both = windowOf([], centre - DAY, centre + DAY / 2);
    expect(lane(laneVolumes(burst, both), 'BBC').normalPerDay).toBe(2);
  });

  it('ignores today, which is not complete, and malformed rows', () => {
    const odd = makeModel({
      runs: longRunRows,
      counts: [...countRows, { feedId: 'bbc', day: '2026-11-01', count: 900 }, { feedId: 'bbc', day: 'x', count: 'y' }, { day: '2026-10-20', count: 5 }],
    });
    expect(lane(laneVolumes(odd, windowOf([])), 'BBC').normalPerDay).toBe(2);
  });

  it('treats a day with no row as zero items for a source that was quiet', () => {
    const gappy = makeModel({ runs: longRunRows, counts: countRows.filter((r) => !(r.feedId === 'lr' && r.day < '2026-10-20')) });
    expect(lane(laneVolumes(gappy, windowOf([])), 'Light Reading').normalPerDay).toBeLessThan(1);
  });

  it('leaves the outside-interest lanes out', () => {
    const lanes = laneVolumes(model, windowOf([])).lanes;
    expect(lanes.every((l) => !l.injected)).toBe(true);
  });
});
