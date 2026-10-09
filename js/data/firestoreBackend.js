/*
 * Firestore backend.
 * The Firebase SDK is loaded lazily from the official CDN as ES modules so the
 * app stays a plain static site without a build step.
 *
 * Every document carries `userId`; all reads are scoped with
 * `where("userId", "==", userId)` so users never see each other's data.
 */

import { firebaseConfig, firebaseSdkVersion } from "../../firebase-config.js";

const CDN = `https://www.gstatic.com/firebasejs/${firebaseSdkVersion}`;

let sdkPromise = null;

function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = Promise.all([import(`${CDN}/firebase-app.js`), import(`${CDN}/firebase-firestore.js`)])
      .then(([app, firestore]) => ({ ...app, ...firestore }))
      .catch((error) => {
        sdkPromise = null;
        throw error;
      });
  }
  return sdkPromise;
}

/** Converts Firestore Timestamps to epoch milliseconds recursively (shallow is enough here). */
function normalizeDoc(snapshot) {
  const data = snapshot.data({ serverTimestamps: "estimate" });
  const out = { id: snapshot.id };
  for (const [key, value] of Object.entries(data)) {
    out[key] = value && typeof value.toMillis === "function" ? value.toMillis() : value;
  }
  return out;
}

/** Resolves after the server acknowledges the write, or after `ms` if still pending (offline queue). */
function settle(promise, ms = 3000) {
  let timer;
  const queued = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ queued: true }), ms);
  });
  return Promise.race([promise.then(() => ({ queued: false })), queued]).finally(() => clearTimeout(timer));
}

export async function createFirestoreBackend({ apiKey, onBackgroundError }) {
  const sdk = await loadSdk();
  const appName = `ltt-${apiKey.slice(-6)}`;
  const existing = sdk.getApps().find((a) => a.name === appName);
  const app = existing || sdk.initializeApp({ ...firebaseConfig, apiKey }, appName);

  let db;
  try {
    db = sdk.initializeFirestore(app, {
      localCache: sdk.persistentLocalCache({ tabManager: sdk.persistentMultipleTabManager() }),
    });
  } catch {
    // Already initialised (e.g. sign out → sign in again) or persistence unsupported.
    db = sdk.getFirestore(app);
  }

  const track = (promise) => {
    // Late failures (after we stopped waiting) must still be reported.
    promise.catch((error) => onBackgroundError?.(error));
    return settle(promise);
  };

  return {
    kind: "firestore",
    stamp: () => sdk.serverTimestamp(),

    newId(collectionName) {
      return sdk.doc(sdk.collection(db, collectionName)).id;
    },

    subscribe(collectionName, userId, onData, onError) {
      const q = sdk.query(sdk.collection(db, collectionName), sdk.where("userId", "==", userId));
      return sdk.onSnapshot(
        q,
        { includeMetadataChanges: true },
        (snapshot) =>
          onData(snapshot.docs.map(normalizeDoc), {
            fromCache: snapshot.metadata.fromCache,
            pendingWrites: snapshot.metadata.hasPendingWrites,
            // false for metadata-only snapshots (sync state changed, documents did not)
            docsChanged: snapshot.docChanges().length > 0,
          }),
        onError
      );
    },

    set(collectionName, id, data, { merge = false } = {}) {
      return track(sdk.setDoc(sdk.doc(db, collectionName, id), data, { merge }));
    },

    update(collectionName, id, patch) {
      return track(sdk.updateDoc(sdk.doc(db, collectionName, id), patch));
    },

    remove(collectionName, id) {
      return track(sdk.deleteDoc(sdk.doc(db, collectionName, id)));
    },

    /** ops: [{ type: "set" | "delete", collection, id, data }] — chunked to Firestore's 500-op limit. */
    async batch(ops) {
      const results = [];
      for (let i = 0; i < ops.length; i += 450) {
        const batch = sdk.writeBatch(db);
        for (const op of ops.slice(i, i + 450)) {
          const ref = sdk.doc(db, op.collection, op.id);
          if (op.type === "delete") batch.delete(ref);
          else batch.set(ref, op.data, { merge: Boolean(op.merge) });
        }
        results.push(await track(batch.commit()));
      }
      return { queued: results.some((r) => r.queued) };
    },

    async dispose() {
      try {
        await sdk.terminate(db);
        await sdk.deleteApp(app);
      } catch {
        /* already disposed */
      }
    },
  };
}
