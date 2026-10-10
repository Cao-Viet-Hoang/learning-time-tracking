/*
 * Minimal browser globals so the app's ES modules can be imported in Node.
 * Only what services/state touch at import time or during a write is shimmed.
 */

class MemoryStorage {
  #items = new Map();
  getItem(key) {
    return this.#items.has(key) ? this.#items.get(key) : null;
  }
  setItem(key, value) {
    this.#items.set(key, String(value));
  }
  removeItem(key) {
    this.#items.delete(key);
  }
  clear() {
    this.#items.clear();
  }
}

globalThis.window ??= globalThis;
globalThis.localStorage ??= new MemoryStorage();
globalThis.sessionStorage ??= new MemoryStorage();
globalThis.window.addEventListener ??= () => {};
globalThis.window.removeEventListener ??= () => {};
if (!("onLine" in globalThis.navigator)) Object.defineProperty(globalThis.navigator, "onLine", { value: true });

/** Resolves after queued microtasks and the local backend's emits have run. */
export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
