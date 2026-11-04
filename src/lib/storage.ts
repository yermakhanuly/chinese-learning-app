/**
 * Small key-value storage for device preferences and the login session.
 * Web: the browser's localStorage. iPhone: see storage.native.ts (expo-sqlite).
 * Every call is wrapped so a blocked/missing storage never breaks the app.
 */

function store(): Storage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

export function getItem(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function setItem(key: string, value: string): void {
  try {
    store()?.setItem(key, value);
  } catch {
    // Preference just won't persist.
  }
}

export function removeItem(key: string): void {
  try {
    store()?.removeItem(key);
  } catch {
    // Nothing to clean up.
  }
}
