// The "What I observed" block that Observe hands to Orient as the start of its Context.
import { formatTime } from './timeline';

const TITLE_LIMIT = 160;

const clip = (text) => (text.length > TITLE_LIMIT ? `${text.slice(0, TITLE_LIMIT - 1)}…` : text);

// `items` are the cards on screen; `t` is where the scrubber sits, or null when it is live.
export function observedContext(model, items, { t = null } = {}) {
  const when = t === null ? 'now' : formatTime(t);
  const lines = items.map((item) => {
    const title = clip((item.title || item.link || 'Untitled').replace(/\s+/g, ' ').trim());
    return `- ${model.feeds[item.lane].name}, ${formatTime(item.ms)}: ${title}`;
  });
  return [
    `What I observed in the Observation Window (${when}):`,
    ...lines,
    '',
    'What I make of it, and the decision I am weighing:',
    '',
  ].join('\n');
}
