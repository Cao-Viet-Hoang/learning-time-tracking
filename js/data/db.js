/*
 * Data layer facade.
 * Owns the active backend (Firestore or local dev), the current userId, and
 * the live collection listeners that feed `state.data`.
 * Services call `db()` / `currentUserId()` and never touch a backend directly.
 */

import { COLLECTIONS, setCollection, setSync, resetData } from "../state.js";
import { createFirestoreBackend } from "./firestoreBackend.js";
import { createLocalBackend } from "./localBackend.js";
import { describeError } from "../utils/errors.js";

let backend = null;
let userId = null;
let unsubscribers = [];
let errorHandler = (message) => console.error(message);

/** Registers a UI callback for errors that happen outside a user action. */
export function setBackgroundErrorHandler(handler) {
  errorHandler = handler;
}

export function db() {
  if (!backend) throw new Error("Not connected to a data store. Please sign in.");
  return backend;
}

export function currentUserId() {
  if (!userId) throw new Error("No signed-in user.");
  return userId;
}

export const backendKind = () => backend?.kind ?? null;

/**
 * Connects to the store for `user` and starts live listeners.
 * mode: "firestore" (needs apiKey) | "local"
 */
export async function connect({ mode, apiKey, user }) {
  await disconnect();
  const onBackgroundError = (error) => errorHandler(describeError(error));
  backend = mode === "local" ? createLocalBackend({ userId: user.id }) : await createFirestoreBackend({ apiKey, userId: user.id, onBackgroundError });
  userId = user.id;
  startListeners();
  return backend;
}

function startListeners() {
  const meta = {};
  unsubscribers = COLLECTIONS.map((name) =>
    backend.subscribe(
      name,
      (docs, info) => {
        const first = !(name in meta);
        meta[name] = info;
        if (first || info.docsChanged !== false) setCollection(name, docs);
        const all = Object.values(meta);
        setSync({
          fromCache: all.some((m) => m.fromCache),
          pendingWrites: all.some((m) => m.pendingWrites),
          error: null,
        });
      },
      (error) => {
        // Unblock the UI even if a listener fails, and explain why data is missing.
        setCollection(name, []);
        setSync({ error: describeError(error) });
        errorHandler(describeError(error));
      }
    )
  );
}

export async function disconnect() {
  unsubscribers.forEach((unsubscribe) => {
    try {
      unsubscribe();
    } catch {
      /* listener already gone */
    }
  });
  unsubscribers = [];
  if (backend) await backend.dispose();
  backend = null;
  userId = null;
  resetData();
}
