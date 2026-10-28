import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_SAVED_READINGS,
  deleteSavedReading,
  loadSavedReadings,
  saveReading,
} from './savedReadings';

const reading = (sessionId, extra = {}) => ({
  sessionId,
  spreadKey: 'decision',
  context: 'Should I move?',
  cards: [{ name: 'The Fool', position: 'Past', inverted: false }],
  currentEvents: [],
  guide: 'A guide.',
  tavilyTimedOut: false,
  ...extra,
});

beforeEach(() => {
  localStorage.clear();
});

describe('savedReadings', () => {
  it('round-trips a reading, newest first, scoped per user', () => {
    expect(saveReading('u1', reading('a'), new Date('2026-10-27T10:00:00Z'))).toBe(true);
    expect(saveReading('u1', reading('b'))).toBe(true);

    expect(loadSavedReadings('u1').map((r) => r.id)).toEqual(['b', 'a']);
    expect(loadSavedReadings('u1')[1]).toMatchObject({
      savedAt: '2026-10-27T10:00:00.000Z',
      context: 'Should I move?',
      guide: 'A guide.',
    });
    expect(loadSavedReadings('u2')).toEqual([]);
  });

  it('keeps one entry when the same Session is saved twice', () => {
    saveReading('u1', reading('a'));
    saveReading('u1', reading('b'));
    saveReading('u1', reading('a'));

    expect(loadSavedReadings('u1').map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('caps the list, dropping the oldest', () => {
    for (let i = 0; i < MAX_SAVED_READINGS + 3; i += 1) saveReading('u1', reading(`r${i}`));

    const ids = loadSavedReadings('u1').map((r) => r.id);
    expect(ids).toHaveLength(MAX_SAVED_READINGS);
    expect(ids[0]).toBe(`r${MAX_SAVED_READINGS + 2}`);
    expect(ids).not.toContain('r0');
  });

  it('deletes only the named reading', () => {
    saveReading('u1', reading('a'));
    saveReading('u1', reading('b'));

    expect(deleteSavedReading('u1', 'a')).toBe(true);
    expect(loadSavedReadings('u1').map((r) => r.id)).toEqual(['b']);
  });

  it('refuses without a user id or Session id, and survives corrupt or blocked storage', () => {
    expect(saveReading(null, reading('a'))).toBe(false);
    expect(saveReading('u1', reading(undefined))).toBe(false);

    localStorage.setItem('tarotSpaSavedReadings:u1', '{not json');
    expect(loadSavedReadings('u1')).toEqual([]);
    localStorage.setItem('tarotSpaSavedReadings:u1', '{"a":1}');
    expect(loadSavedReadings('u1')).toEqual([]);

    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(saveReading('u1', reading('a'))).toBe(false);
    blocked.mockRestore();
  });
});
