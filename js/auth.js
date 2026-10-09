/*
 * Authentication.
 *
 * Sign-in = username + Firebase API key. The key is verified (offline against
 * a SHA-256 fingerprint from firebase-config.js, or online against Google's
 * API), then the username becomes the stable userId that scopes all data.
 *
 * This is the single place to swap in Firebase Authentication later
 * (e.g. signInWithEmailAndPassword → user.uid as userId) without touching
 * services or views.
 */

import { apiKeyFingerprint, firebaseConfig, devModeEnabled } from "../firebase-config.js";
import { connect, disconnect, db } from "./data/db.js";
import { setState } from "./state.js";
import { readJSON, writeJSON, removeKey } from "./utils/storage.js";
import { sha256Hex } from "./utils/misc.js";
import { AuthError } from "./utils/errors.js";

const SESSION_KEY = "auth";

export const isDevModeAvailable = () => devModeEnabled;

/** Converts a display username into a stable, Firestore-safe id. */
export function toUserId(username) {
  return username
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function validateUsername(username) {
  const value = (username || "").trim();
  if (!value) return "Enter a username.";
  if (value.length < 2) return "Username must be at least 2 characters.";
  if (value.length > 40) return "Username must be 40 characters or fewer.";
  if (!toUserId(value)) return "Use letters or numbers in your username.";
  return "";
}

async function verifyApiKey(apiKey) {
  if (!/^AIza[0-9A-Za-z_-]{35}$/.test(apiKey)) {
    throw new AuthError("That doesn't look like a Firebase API key (it should start with “AIza”).", "apiKey");
  }
  if (apiKeyFingerprint) {
    const hash = await sha256Hex(apiKey);
    if (hash !== apiKeyFingerprint) throw new AuthError("The API key is not valid for this project.", "apiKey");
    return;
  }
  // No fingerprint configured: ask Google whether the key is valid for this project.
  let response;
  try {
    response = await fetch(`https://firebaseinstallations.googleapis.com/v1/projects/${firebaseConfig.projectId}/installations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ fid: "cAAAAAAAAAAAAAAAAAAAAA", appId: firebaseConfig.appId, authVersion: "FIS_v2", sdkVersion: "w:0.6.4" }),
    });
  } catch {
    throw new AuthError("Could not reach Firebase to verify the key. Check your connection.");
  }
  if (response.status === 400 || response.status === 403) {
    const body = await response.json().catch(() => ({}));
    if (/API key not valid|API_KEY_INVALID/i.test(JSON.stringify(body))) {
      throw new AuthError("The API key is not valid for this project.", "apiKey");
    }
  }
}

async function establish({ mode, username, apiKey }) {
  const user = { id: toUserId(username), username: username.trim(), mode };
  await connect({ mode, apiKey, user });
  writeJSON(SESSION_KEY, { mode, username: user.username, apiKey: mode === "firestore" ? apiKey : null });
  setState({ user, authStatus: "signed-in" });
  touchProfile(user);
  return user;
}

/** Records/refreshes the users/{userId} profile document (fire-and-forget). */
function touchProfile(user) {
  const store = db();
  store
    .set("users", user.id, { username: user.username, lastSignInAt: store.stamp(), updatedAt: store.stamp() }, { merge: true })
    .catch((error) => console.warn("Could not update profile", error));
}

export async function signIn({ username, apiKey }) {
  const usernameError = validateUsername(username);
  if (usernameError) throw new AuthError(usernameError, "username");
  const key = (apiKey || "").trim();
  if (!key) throw new AuthError("Enter your Firebase API key.", "apiKey");
  await verifyApiKey(key);
  return establish({ mode: "firestore", username, apiKey: key });
}

export async function signInDevMode({ username }) {
  if (!devModeEnabled) throw new AuthError("Local dev mode is disabled.");
  const name = (username || "").trim() || "dev";
  const usernameError = validateUsername(name);
  if (usernameError) throw new AuthError(usernameError, "username");
  return establish({ mode: "local", username: name });
}

/** Restores the previous session on page load. Returns true when signed in. */
export async function restoreSession() {
  const saved = readJSON(SESSION_KEY);
  if (!saved?.username) return false;
  try {
    if (saved.mode === "local") {
      if (!devModeEnabled) return false;
      await establish({ mode: "local", username: saved.username });
    } else {
      if (!saved.apiKey) return false;
      if (apiKeyFingerprint && (await sha256Hex(saved.apiKey)) !== apiKeyFingerprint) {
        removeKey(SESSION_KEY);
        return false;
      }
      await establish({ mode: "firestore", username: saved.username, apiKey: saved.apiKey });
    }
    return true;
  } catch (error) {
    console.error("Session restore failed", error);
    throw error;
  }
}

export const lastUsername = () => readJSON(SESSION_KEY)?.username || readJSON("lastUsername") || "";

export async function signOut() {
  const saved = readJSON(SESSION_KEY);
  if (saved?.username) writeJSON("lastUsername", saved.username);
  removeKey(SESSION_KEY);
  await disconnect();
  setState({ user: null, authStatus: "signed-out" });
}
