import { describe, expect, it } from 'vitest';
import { laneTitles, MAX_LANE_TITLES } from './labels';

const model = { start: 0, end: 1000 };
const at = (id, ms, lane = 0) => ({ id, ms, lane, title: id });
const view = (...items) => ({ inWin: items });

describe('laneTitles', () => {
  it('titles at most five items in a lane, in card order', () => {
    const items = Array.from({ length: 8 }, (_, i) => at(`i${i}`, 50 + i * 100));
    const titled = laneTitles(model, view(...items), 0).map((t) => t.item.id);
    expect(titled).toHaveLength(MAX_LANE_TITLES);
    expect(titled).toEqual(['i0', 'i1', 'i2', 'i3', 'i4']);
  });

  it('prefers the higher-ranked item when two are too close to both be titled', () => {
    const titled = laneTitles(model, view(at('top', 500), at('near', 520)), 0).map((t) => t.item.id);
    expect(titled).toEqual(['top']);
  });

  it('gives each title the room up to the next titled dot, and the last one to the lane end', () => {
    const [a, b] = laneTitles(model, view(at('a', 100), at('b', 400)), 0);
    expect(a.left).toBe(10);
    expect(a.width).toBeCloseTo(30 - 0.4);
    expect(b.width).toBeCloseTo(100 - 40);
  });

  it('drops a title with no room at the lane edge', () => {
    expect(laneTitles(model, view(at('edge', 990)), 0)).toEqual([]);
  });

  it('ignores items from other lanes', () => {
    expect(laneTitles(model, view(at('x', 100, 1)), 0)).toEqual([]);
  });
});
