/*
 * Thin, failure-tolerant wrapper around Web Storage.
 * Only local UI/session state lives here — never learning data.
 */

const PREFIX = "ltt:";

function backend(kind) {
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

export function readJSON(key, fallback = null, kind = "local") {
  try {
    const value = backend(kind)?.getItem(PREFIX + key);
    return value == null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value, kind = "local") {
  try {
    backend(kind)?.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key, kind = "local") {
  try {
    backend(kind)?.removeItem(PREFIX + key);
  } catch {
    /* storage unavailable — nothing to remove */
  }
}

/** Subscribes to changes of `key` made in other tabs. */
export function onExternalChange(key, handler) {
  const listener = (event) => {
    if (event.key === PREFIX + key) {
      let value = null;
      try {
        value = event.newValue == null ? null : JSON.parse(event.newValue);
      } catch {
        value = null;
      }
      handler(value);
    }
  };
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

/* ---------- Preferences ---------- */

const PREFS_KEY = "prefs";
const DEFAULT_PREFS = { theme: "system", lastRoute: "#/", historySort: "newest" };

export function getPrefs() {
  return { ...DEFAULT_PREFS, ...readJSON(PREFS_KEY, {}) };
}

export function setPref(name, value) {
  writeJSON(PREFS_KEY, { ...getPrefs(), [name]: value });
}
