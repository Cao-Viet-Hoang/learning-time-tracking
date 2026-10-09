/*
 * Central application state.
 * A tiny observable store: views subscribe and re-render the regions they own.
 * Learning data arrives from the backend (Firestore) via live listeners;
 * nothing in here is persisted except through services.
 */

export const COLLECTIONS = ["subjects", "goals", "plannedSessions", "learningSessions"];

const emptyData = () => Object.fromEntries(COLLECTIONS.map((name) => [name, []]));
const emptyLoaded = () => Object.fromEntries(COLLECTIONS.map((name) => [name, false]));

export const state = {
  /** "booting" | "signed-out" | "signed-in" */
  authStatus: "booting",
  /** { id, username, mode: "firestore" | "local" } */
  user: null,
  data: emptyData(),
  loaded: emptyLoaded(),
  /** { online, fromCache, pendingWrites, error } */
  sync: { online: navigator.onLine, fromCache: false, pendingWrites: false, error: null },
  /** Active timer snapshot (mirrors localStorage), or null. */
  timer: null,
  /** Coarse clock (updated every 30s) so time-dependent UI stays fresh. */
  now: Date.now(),
};

const listeners = new Set();
let pendingKeys = new Set();
let scheduled = false;

function flush() {
  scheduled = false;
  const keys = pendingKeys;
  pendingKeys = new Set();
  for (const listener of [...listeners]) {
    try {
      listener(state, keys);
    } catch (error) {
      console.error("State listener failed", error);
    }
  }
}

function schedule(keys) {
  keys.forEach((key) => pendingKeys.add(key));
  if (!scheduled) {
    scheduled = true;
    queueMicrotask(flush);
  }
}

/** Shallow-merges top-level keys and notifies subscribers once per microtask. */
export function setState(patch) {
  Object.assign(state, patch);
  schedule(Object.keys(patch));
}

export function setCollection(name, docs) {
  state.data = { ...state.data, [name]: docs };
  state.loaded = { ...state.loaded, [name]: true };
  schedule(["data", `data.${name}`, "loaded"]);
}

export function setSync(patch) {
  state.sync = { ...state.sync, ...patch };
  schedule(["sync"]);
}

export function resetData() {
  state.data = emptyData();
  state.loaded = emptyLoaded();
  schedule(["data", "loaded"]);
}

export const isDataReady = () => COLLECTIONS.every((name) => state.loaded[name]);

/**
 * Subscribes to state changes. `keys` is the set of top-level keys that
 * changed (plus "data.<collection>" entries for finer-grained checks).
 */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
