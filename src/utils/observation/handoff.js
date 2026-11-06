// What Observe hands to Orient: the cards on screen, as Current Events for the Guide.
import { formatTime, safeHref } from './timeline';

// The server accepts at most 12 (MAX_SUPPLIED_EVENTS in start-orientation-guide).
export const MAX_HANDOFF_ITEMS = 12;

// `source` and `when` are only for showing the list in Orient; toSuppliedEvent leaves them out.
export function observedEvents(model, items) {
  return items.slice(0, MAX_HANDOFF_ITEMS).map((item) => {
    const title = (item.title || item.link || 'Untitled').replace(/\s+/g, ' ').trim();
    const summary = (item.summary ?? '').replace(/\s+/g, ' ').trim();
    const url = safeHref(item.link);
    return {
      source: model.feeds[item.lane].name,
      when: formatTime(item.ms),
      title,
      // A card with no summary still needs content: its title stands in.
      content: summary || title,
      ...(url ? { url } : {}),
      published_date: new Date(item.ms).toISOString(),
    };
  });
}

export function toSuppliedEvent({ title, content, url, published_date: publishedDate }) {
  return {
    title,
    content,
    ...(url ? { url } : {}),
    ...(publishedDate ? { published_date: publishedDate } : {}),
  };
}

// The open case, in the user's own words, as the start of the reading's Context (S8.2).
export function caseContext({ title, hypothesis }) {
  const lines = [`The decision I'm weighing: ${title}`];
  if (hypothesis?.trim()) lines.push(`My hypothesis: ${hypothesis.trim()}`);
  return lines.join('\n');
}
