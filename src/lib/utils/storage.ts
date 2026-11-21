/**
 * Safe wrappers around Web Storage.
 *
 * `localStorage` can be missing or throw (private browsing, blocked site data,
 * quota exceeded). Preferences are a convenience, so failures are reported
 * through the return value instead of breaking the app.
 */

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** Reads a value, or `null` if it does not exist or storage is unavailable. */
export function readStorage(
  key: string,
  storage: Storage | null = defaultStorage(),
): string | null {
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

/** Writes a value. Returns `false` if storage is unavailable or the write failed. */
export function writeStorage(
  key: string,
  value: string,
  storage: Storage | null = defaultStorage(),
): boolean {
  if (!storage) return false
  try {
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}
