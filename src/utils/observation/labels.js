import { percentAlong } from './timeline';

// Dense lanes stay readable (epic S2.5): inside the window, a lane titles at most this many of its
// items, the ones the cards rank first (outside-interest picks, then stakes, then source order).
// Every other dot stays a plain marker.
export const MAX_LANE_TITLES = 5;
// A title needs this much of the lane's width (in percent) to be worth drawing.
export const MIN_LABEL_WIDTH = 6;
const GAP = 0.4;

// Titles to draw in one lane: the lane's top items from `view.inWin` (already in card order), each
// given the room from its dot to the next titled dot on the right. A title with too little room is
// dropped and its place goes to the next-ranked item, so a crowded lane shows fewer, readable titles.
export function laneTitles(model, view, lane, limit = MAX_LANE_TITLES) {
  const ranked = view.inWin.filter((item) => item.lane === lane);
  const chosen = [];
  for (const item of ranked) {
    if (chosen.length === limit) break;
    const left = percentAlong(model, item.ms);
    const next = chosen.concat({ item, left }).sort((a, b) => a.left - b.left);
    const fits = next.every((one, i) => (i === next.length - 1 ? 100 : next[i + 1].left - GAP) - one.left >= MIN_LABEL_WIDTH);
    if (fits) chosen.splice(0, chosen.length, ...next);
  }
  return chosen.map((one, i) => ({
    item: one.item,
    left: one.left,
    width: (i === chosen.length - 1 ? 100 : chosen[i + 1].left - GAP) - one.left,
  }));
}
