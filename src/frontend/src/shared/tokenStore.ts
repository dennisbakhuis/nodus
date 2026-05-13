/**
 * Single source of truth for the bearer-token persistence layer.
 *
 * The auth token lives in localStorage so that page reloads don't drop the
 * session. Storage failures (private mode, quota, SecurityError on iframes,
 * etc.) log a one-line warning and degrade to in-memory only.
 */

const STORAGE_KEY = "nodus.auth.token";
const AUTH_INVALID_EVENT = "nodus:auth-invalid";

let memoryFallback: string | null = null;

function _warn(operation: string, error: unknown): void {
  // Logged at warn so it shows in the dev console and CI artefacts but
  // doesn't trip error monitoring.
  console.warn(
    `tokenStore: ${operation} failed (using memory fallback):`,
    error,
  );
}

export function getToken(): string | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null ? stored : memoryFallback;
  } catch (error) {
    _warn("getToken", error);
    return memoryFallback;
  }
}

export function setToken(token: string): void {
  memoryFallback = token;
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch (error) {
    _warn("setToken", error);
  }
}

export function clearToken(): void {
  memoryFallback = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    _warn("clearToken", error);
  }
}

/** Dispatch the global "auth invalid" event so AuthProvider can react. */
export function notifyAuthInvalid(): void {
  clearToken();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_INVALID_EVENT));
  }
}

/** Build an Authorization header dict (or empty if no token). */
export function buildAuthHeaders(extra?: HeadersInit): HeadersInit {
  const token = getToken();
  if (!token) return extra ?? {};
  return { Authorization: `Bearer ${token}`, ...extra };
}

export const TOKEN_STORAGE_KEY = STORAGE_KEY;
export const AUTH_INVALID_EVENT_NAME = AUTH_INVALID_EVENT;
