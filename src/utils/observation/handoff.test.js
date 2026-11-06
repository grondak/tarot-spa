import { describe, expect, it } from 'vitest';
import { MAX_HANDOFF_ITEMS, observedEvents, toSuppliedEvent } from './handoff';
import { formatTime } from './timeline';

const model = { feeds: [{ name: 'Strawberry Weekly' }, { name: 'Dairy Wire' }] };
const ms = Date.UTC(2026, 10, 1, 12);

describe('observedEvents', () => {
  it('turns cards into Current Events with source and time for display', () => {
    const [event] = observedEvents(model, [
      { lane: 0, ms, title: ' Berry  stand\nsold out ', summary: 'Sold out by 9am', link: 'https://example.com/a' },
    ]);
    expect(event).toEqual({
      source: 'Strawberry Weekly',
      when: formatTime(ms),
      title: 'Berry stand sold out',
      content: 'Sold out by 9am',
      url: 'https://example.com/a',
      published_date: '2026-11-01T12:00:00.000Z',
    });
  });

  it('uses the title as content when there is no summary, and the link as title when there is none', () => {
    const events = observedEvents(model, [
      { lane: 1, ms, title: 'Only a title', summary: '   ' },
      { lane: 1, ms, title: '', link: 'https://example.com/b' },
      { lane: 1, ms },
    ]);
    expect(events[0].content).toBe('Only a title');
    expect(events[1]).toMatchObject({ title: 'https://example.com/b', content: 'https://example.com/b' });
    expect(events[2]).toMatchObject({ title: 'Untitled', content: 'Untitled' });
    expect(events[2]).not.toHaveProperty('url');
  });

  it('leaves out a link that is not http or https', () => {
    const [event] = observedEvents(model, [{ lane: 0, ms, title: 'x', link: 'javascript:alert(1)' }]);
    expect(event).not.toHaveProperty('url');
  });

  it('stops at the most the server takes', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ lane: 0, ms, title: `t${i}` }));
    expect(observedEvents(model, items)).toHaveLength(MAX_HANDOFF_ITEMS);
    expect(MAX_HANDOFF_ITEMS).toBe(12);
  });
});

describe('toSuppliedEvent', () => {
  it('keeps only what the server takes', () => {
    expect(toSuppliedEvent({
      source: 'S', when: 'W', title: 't', content: 'c', url: 'https://example.com', published_date: 'd',
    })).toEqual({ title: 't', content: 'c', url: 'https://example.com', published_date: 'd' });
    expect(toSuppliedEvent({ title: 't', content: 'c' })).toEqual({ title: 't', content: 'c' });
  });
});
