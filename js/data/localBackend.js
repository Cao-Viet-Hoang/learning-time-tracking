/*
 * Local development backend.
 * Mirrors the Firestore backend's interface but keeps documents in this
 * browser only. Used exclusively by "Local dev mode" on the sign-in screen so
 * the UI can be explored without a Firebase project. Not a production store.
 */

import { readJSON, writeJSON } from "../utils/storage.js";
import { uid } from "../utils/misc.js";

const STAMP = Symbol("serverTimestamp");

export function createLocalBackend({ userId }) {
  const storageKey = `devdb:${userId}`;
  const db = readJSON(storageKey, {});
  const subscribers = new Map(); // collection -> Set<fn>

  const persist = () => writeJSON(storageKey, db);
  const docsOf = (name) => Object.values(db[name] || {});

  function resolveStamps(data) {
    const now = Date.now();
    const out = {};
    for (const [key, value] of Object.entries(data)) out[key] = value === STAMP ? now : value;
    return out;
  }

  function emit(name) {
    const docs = docsOf(name).map((d) => ({ ...d }));
    subscribers.get(name)?.forEach((fn) => fn(docs, { fromCache: false, pendingWrites: false }));
  }

  function write(name, id, data, merge) {
    db[name] = db[name] || {};
    const previous = merge ? db[name][id] || {} : {};
    db[name][id] = { ...previous, ...resolveStamps(data), id };
  }

  const done = (names) => {
    persist();
    new Set(names).forEach(emit);
    return Promise.resolve({ queued: false });
  };

  return {
    kind: "local",
    stamp: () => STAMP,
    newId: () => uid("l"),

    subscribe(name, onData) {
      if (!subscribers.has(name)) subscribers.set(name, new Set());
      subscribers.get(name).add(onData);
      queueMicrotask(() => onData(docsOf(name).map((d) => ({ ...d })), { fromCache: false, pendingWrites: false }));
      return () => subscribers.get(name)?.delete(onData);
    },

    set(name, id, data, { merge = false } = {}) {
      write(name, id, data, merge);
      return done([name]);
    },

    update(name, id, patch) {
      if (!db[name]?.[id]) {
        return Promise.reject(Object.assign(new Error("Document not found"), { code: "not-found" }));
      }
      write(name, id, patch, true);
      return done([name]);
    },

    remove(name, id) {
      if (db[name]) delete db[name][id];
      return done([name]);
    },

    batch(ops) {
      for (const op of ops) {
        if (op.type === "delete") {
          if (db[op.collection]) delete db[op.collection][op.id];
        } else {
          write(op.collection, op.id, op.data, Boolean(op.merge));
        }
      }
      return done(ops.map((op) => op.collection));
    },

    async dispose() {
      subscribers.clear();
    },
  };
}
