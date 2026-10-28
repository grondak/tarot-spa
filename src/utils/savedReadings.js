const KEY_PREFIX = 'tarotSpaSavedReadings:';
export const MAX_SAVED_READINGS = 50;

function key(userId) {
  return `${KEY_PREFIX}${userId}`;
}

export function loadSavedReadings(userId) {
  if (!userId) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key(userId)) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(userId, readings) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(readings));
    return true;
  } catch {
    return false;
  }
}

// Saving the same Session twice keeps one entry, refreshed to the top.
export function saveReading(userId, result, now = new Date()) {
  if (!userId || !result?.sessionId) return false;
  const entry = {
    id: result.sessionId,
    savedAt: now.toISOString(),
    spreadKey: result.spreadKey,
    context: result.context ?? '',
    cards: result.cards,
    currentEvents: result.currentEvents ?? [],
    guide: result.guide,
    tavilyTimedOut: Boolean(result.tavilyTimedOut),
  };
  const others = loadSavedReadings(userId).filter((reading) => reading.id !== entry.id);
  return write(userId, [entry, ...others].slice(0, MAX_SAVED_READINGS));
}

export function deleteSavedReading(userId, id) {
  if (!userId) return false;
  return write(userId, loadSavedReadings(userId).filter((reading) => reading.id !== id));
}
