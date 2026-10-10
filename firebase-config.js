/*
 * Firebase project configuration.
 *
 * The API key is intentionally NOT stored here: users enter it on the sign-in
 * screen together with their username. Everything else is project metadata
 * and safe to ship with the client.
 *
 * To use a different project, copy `firebase-config.example.js` over this file.
 */

export const firebaseConfig = {
  authDomain: "food-management-cf52b.firebaseapp.com",
  projectId: "food-management-cf52b",
  storageBucket: "food-management-cf52b.firebasestorage.app",
  messagingSenderId: "331392814353",
  appId: "1:331392814353:web:60e40c8ea6a9cd9ea5d0b0",
};

/**
 * SHA-256 fingerprint of the expected API key. When set, the key typed on the
 * sign-in screen is verified locally against it (works offline). Leave empty
 * to verify the key against Google's API endpoint instead.
 */
export const apiKeyFingerprint = "2680669eaabab67ca7b9d3eb118ae1808e4f5c578a3e672f55ba036c36795fed";

/** Firebase JS SDK version loaded from the gstatic CDN (ES modules). */
export const firebaseSdkVersion = "10.12.2";

/**
 * Development mode: offers a "local dev mode" on the sign-in screen that keeps
 * data in this browser only (no Firestore). Disable for production builds.
 */
export const devModeEnabled = true;
