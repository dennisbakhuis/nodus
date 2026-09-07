/**
 * Signed-in sessions for end-to-end specs.
 *
 * Several surfaces are invisible to anonymous callers — the List nav link and
 * the Tree route need the `canViewList` capability, and the export menu needs
 * any authenticated user — so a spec that skips signing in silently exercises
 * a redirect instead of the page it names.
 *
 * Requires the seeded demo accounts (`make seed`, which seeds them only when
 * NODUS_ENV is dev or test).
 */

import type { Page } from "@playwright/test";

export const API_BASE = "http://127.0.0.1:8000/api";

export type DemoAccount = "demo_reader" | "demo_writer" | "demo_admin";

/**
 * Sign in as a seeded demo account and put the token where the app looks.
 *
 * Returns the bearer token, or `null` when the account is unavailable so
 * callers can skip rather than fail against a database that was never seeded.
 * The token is returned as well as stored because it is needed for API calls
 * made before any page has loaded, when `localStorage` is not yet reachable.
 */
export async function signIn(
  page: Page,
  username: DemoAccount = "demo_reader",
): Promise<string | null> {
  const res = await page.request
    .post(`${API_BASE}/auth/login`, {
      data: { username, password: "demo" },
    })
    .catch(() => null);
  if (!res || !res.ok()) return null;

  const body = (await res.json()) as { token?: string };
  if (!body.token) return null;

  // A freshly seeded account has an incomplete People profile, and the
  // completion modal is deliberately undismissable — left alone it covers the
  // page and swallows every click. Fill it in over the API instead of driving
  // the form in every spec.
  await page.request
    .patch(`${API_BASE}/auth/me/profile`, {
      headers: { Authorization: `Bearer ${body.token}` },
      data: {
        full_name: "Demo Reader",
        company: "Nodus",
        email: `${username}@example.test`,
        department: "Scouting",
        role: "Reader",
      },
    })
    .catch(() => null);

  await page.addInitScript((token: string) => {
    window.localStorage.setItem("nodus.auth.token", token);
  }, body.token);
  return body.token;
}
