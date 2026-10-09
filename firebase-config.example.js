/*
 * Example Firebase configuration.
 * Copy this file to `firebase-config.js` and fill in your project values
 * (Firebase Console → Project settings → Your apps → SDK setup and configuration).
 *
 * Do NOT put the API key here — it is entered on the sign-in screen.
 */

export const firebaseConfig = {
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000",
};

/**
 * Optional SHA-256 hex digest of your API key for offline verification.
 * Generate with:  node -e "console.log(require('crypto').createHash('sha256').update('YOUR_KEY').digest('hex'))"
 * Leave empty to verify the key online instead.
 */
export const apiKeyFingerprint = "";

export const firebaseSdkVersion = "10.12.2";

export const devModeEnabled = true;
