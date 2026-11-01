import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COLLAPSED_KEY, DISABLED_KEY, DISMISSED_KEY, clearObservationPreferences, readSet, writeSet,
} from './preferences';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('observation preferences', () => {
  it('round-trips a set', () => {
    writeSet(COLLAPSED_KEY, new Set(['war', 'telecom']));
    expect(readSet(COLLAPSED_KEY)).toEqual(new Set(['war', 'telecom']));
  });

  it('reads an empty set when nothing, junk or a non-list is stored', () => {
    expect(readSet(COLLAPSED_KEY)).toEqual(new Set());
    localStorage.setItem(COLLAPSED_KEY, '{nope');
    expect(readSet(COLLAPSED_KEY)).toEqual(new Set());
    localStorage.setItem(COLLAPSED_KEY, '{"a":1}');
    expect(readSet(COLLAPSED_KEY)).toEqual(new Set());
  });

  it('clears both remembered choices and nothing else', () => {
    localStorage.setItem(COLLAPSED_KEY, '["war"]');
    localStorage.setItem(DISMISSED_KEY, '["nature"]');
    localStorage.setItem(DISABLED_KEY, '["g:war"]');
    localStorage.setItem('tarotSpaSavedReadings', 'keep');

    expect(clearObservationPreferences()).toBe(true);

    expect(localStorage.getItem(COLLAPSED_KEY)).toBeNull();
    expect(localStorage.getItem(DISMISSED_KEY)).toBeNull();
    expect(localStorage.getItem(DISABLED_KEY)).toBeNull();
    expect(localStorage.getItem('tarotSpaSavedReadings')).toBe('keep');
  });

  it('says so when the browser will not let it clear', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(clearObservationPreferences()).toBe(false);
  });

  it('does not throw when storage will not save or read', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(() => writeSet(COLLAPSED_KEY, new Set(['x']))).not.toThrow();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readSet(COLLAPSED_KEY)).toEqual(new Set());
  });
});
