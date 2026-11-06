import { describe, expect, it } from 'vitest';
import { observedContext } from './handoff';
import { formatTime } from './timeline';

const model = { feeds: [{ name: 'Strawberry Weekly' }, { name: 'Dairy Wire' }] };
const ms = Date.UTC(2026, 10, 1, 12);

describe('observedContext', () => {
  it('lists each item with its source and time, then leaves room for the user', () => {
    const text = observedContext(model, [
      { lane: 0, ms, title: 'Berry stand sold out' },
      { lane: 1, ms, title: '', link: 'https://example.com/a' },
    ]);
    expect(text).toContain('(now):');
    expect(text).toContain(`- Strawberry Weekly, ${formatTime(ms)}: Berry stand sold out`);
    expect(text).toContain(`- Dairy Wire, ${formatTime(ms)}: https://example.com/a`);
    expect(text.endsWith('decision I am weighing:\n')).toBe(true);
  });

  it('names the scrubber time when not live, and trims long or multi-line titles', () => {
    const text = observedContext(model, [{ lane: 0, ms, title: `a\n  b ${'x'.repeat(300)}` }], { t: ms });
    expect(text).toContain(`(${formatTime(ms)}):`);
    expect(text).toMatch(/: a b x+…\n/);
    expect(text.split('\n')[1].length).toBeLessThan(220);
  });
});
