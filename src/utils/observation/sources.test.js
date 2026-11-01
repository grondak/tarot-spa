import { describe, expect, it } from 'vitest';
import { groupState, toggleFeed, toggleGroup } from './sources';

const catalog = [
  { name: 'world', feeds: [{ id: 'bbc', name: 'BBC' }, { id: 'aj', name: 'Al Jazeera' }, { id: 'old', name: 'Old', retired: true }] },
  { name: 'telecom', feeds: [{ id: 'lr', name: 'Light Reading' }] },
  { name: 'outside your interests', feeds: [], injected: true },
];

describe('toggling', () => {
  it('switches a whole group off, clearing its single-source choices, and back on', () => {
    const off = toggleGroup(catalog, new Set(['f:bbc']), 'world');
    expect(off).toEqual(new Set(['g:world']));
    expect(toggleGroup(catalog, off, 'world')).toEqual(new Set());
  });

  it('treats a partly-off group as on, so one click switches it all off', () => {
    expect(toggleGroup(catalog, new Set(['f:bbc']), 'world')).toEqual(new Set(['g:world']));
  });

  it('switches one source off and on', () => {
    const off = toggleFeed(catalog, new Set(), 'world', 'bbc');
    expect(off).toEqual(new Set(['f:bbc']));
    expect(toggleFeed(catalog, off, 'world', 'bbc')).toEqual(new Set());
  });

  it('brings back only the chosen source when its group was switched off', () => {
    const next = toggleFeed(catalog, new Set(['g:world']), 'world', 'aj');
    expect(next).toEqual(new Set(['f:bbc', 'f:old']));
  });

  it('does not change what it was given', () => {
    const before = new Set(['g:world']);
    toggleGroup(catalog, before, 'telecom');
    toggleFeed(catalog, before, 'world', 'bbc');
    expect(before).toEqual(new Set(['g:world']));
  });

  it('switches the daily outside-interest pick off and on like a group', () => {
    const off = toggleGroup(catalog, new Set(), 'outside your interests');
    expect(off).toEqual(new Set(['g:outside your interests']));
    expect(toggleGroup(catalog, off, 'outside your interests')).toEqual(new Set());
  });
});

describe('groupState', () => {
  it('is on, partial or off', () => {
    expect(groupState(catalog[0], new Set())).toBe('on');
    expect(groupState(catalog[0], new Set(['f:bbc']))).toBe('partial');
    expect(groupState(catalog[0], new Set(['g:world']))).toBe('off');
    expect(groupState(catalog[1], new Set(['f:lr']))).toBe('off');
    expect(groupState(catalog[2], new Set())).toBe('on');
    expect(groupState(catalog[2], new Set(['g:outside your interests']))).toBe('off');
  });
});
