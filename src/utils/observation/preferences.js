// What the Observation Window remembers, and only in this browser: which groups are collapsed,
// which outside-interest sources were dismissed, and which sources or groups are switched off. The server holds nothing about a user's use of
// the Window, so clearing these is the whole of "delete my history".
export const COLLAPSED_KEY = 'owCollapsedGroups';
export const DISMISSED_KEY = 'owDismissedSources';
export const DISABLED_KEY = 'owDisabledSources';

export function readSet(key) {
  try {
    const values = JSON.parse(localStorage.getItem(key) ?? '[]');
    return new Set(Array.isArray(values) ? values : []);
  } catch {
    return new Set();
  }
}

export function writeSet(key, values) {
  try {
    localStorage.setItem(key, JSON.stringify([...values]));
  } catch {
    // Storage unavailable: the choice just does not survive a reload.
  }
}

// Returns false when the browser would not let us remove them.
export function clearObservationPreferences() {
  try {
    localStorage.removeItem(COLLAPSED_KEY);
    localStorage.removeItem(DISMISSED_KEY);
    localStorage.removeItem(DISABLED_KEY);
    return true;
  } catch {
    return false;
  }
}
