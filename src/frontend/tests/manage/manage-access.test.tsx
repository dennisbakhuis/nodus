import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";
import { App } from "../../src/App";

/**
 * Anonymous is the default here: jsdom has no real backend, so AuthContext's
 * initial /api/auth/config + /me probes fall through to the logged-out state.
 * Direct navigation to a protected /manage URL must therefore never render the
 * management surface.
 */
const PROTECTED_PATHS = [
  "/manage",
  "/manage/users",
  "/manage/settings",
  "/manage/api",
  "/manage/backup",
];

describe("Manage route access (anonymous)", () => {
  for (const path of PROTECTED_PATHS) {
    it(`does not render the management surface at ${path}`, async () => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>,
      );

      await waitFor(() => {
        // The "Manage" nav link is hidden for anonymous visitors; its absence
        // confirms the auth effect has settled into the logged-out state.
        expect(screen.queryByRole("link", { name: "Manage" })).toBeNull();
      });

      // The manage layout's sidebar must never mount for an unauthenticated user.
      expect(screen.queryByRole("navigation", { name: "Manage navigation" })).toBeNull();
    });
  }
});
