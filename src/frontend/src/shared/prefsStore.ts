/**
 * Per-reader display preferences kept in this browser.
 *
 * Reads and writes are best-effort: storage can be absent, blocked or full,
 * and a page must render the same without it. Never used for the auth token,
 * which lives in `tokenStore`.
 */

export function readPreference<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writePreference(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage absent or full; the preference still applies for this visit */
  }
}
