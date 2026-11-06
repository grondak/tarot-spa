import { describe, expect, it } from 'vitest';
import { cycleSummary, formatSpan } from './cases';

const at = (iso) => ({ at: iso });
const events = [
  { kind: 'OPENED', ...at('2026-10-01T09:00:00Z') },
  { kind: 'HANDED_OFF', ...at('2026-10-09T09:00:00Z') },
  { kind: 'HANDED_OFF', ...at('2026-10-10T09:00:00Z') },
  { kind: 'CLOSED', ...at('2026-10-12T09:00:00Z') },
];

describe('cycleSummary', () => {
  it('times a closed case from opening to its first handoff and to its close', () => {
    const summary = cycleSummary(events, 'CLOSED');
    expect(formatSpan(summary.toOrient)).toBe('8 days');
    expect(formatSpan(summary.toDecide)).toBe('11 days');
    expect(summary.handedOff).toBe(Date.parse('2026-10-09T09:00:00Z'));
  });

  it('leaves the close out while the case is open, even after an earlier close', () => {
    const summary = cycleSummary([...events, { kind: 'REOPENED', ...at('2026-10-13T09:00:00Z') }], 'OPEN');
    expect(summary.closed).toBeNull();
    expect(summary.toDecide).toBeNull();
    expect(summary.toOrient).not.toBeNull();
  });

  it('uses the latest close when a case was closed more than once', () => {
    const more = [...events, { kind: 'REOPENED', ...at('2026-10-13T09:00:00Z') }, { kind: 'CLOSED', ...at('2026-10-20T09:00:00Z') }];
    expect(formatSpan(cycleSummary(more, 'CLOSED').toDecide)).toBe('19 days');
  });

  it('reports nothing for stages not reached, and for a case with no events', () => {
    expect(cycleSummary([events[0]], 'OPEN')).toMatchObject({ handedOff: null, toOrient: null, closed: null });
    expect(cycleSummary([], 'OPEN')).toEqual({ opened: null, handedOff: null, closed: null, toOrient: null, toDecide: null });
  });

  it('ignores a time that is not a date', () => {
    expect(cycleSummary([{ kind: 'OPENED', at: 'nope' }], 'OPEN').opened).toBeNull();
  });
});

describe('formatSpan', () => {
  it('speaks in hours under a day and days after', () => {
    expect(formatSpan(10 * 60e3)).toBe('under an hour');
    expect(formatSpan(3600e3)).toBe('1 hour');
    expect(formatSpan(5 * 3600e3)).toBe('5 hours');
    expect(formatSpan(86400e3)).toBe('1 day');
    expect(formatSpan(86400e3 * 2.9)).toBe('2 days');
  });
});
