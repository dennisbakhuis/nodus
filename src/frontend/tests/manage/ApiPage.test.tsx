import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { ApiPage } from "../../src/manage/ApiPage";
import { ConfirmProvider } from "../../src/shared/ConfirmDialog";
import * as apiKeysModule from "../../src/api/api-keys";
import * as usersModule from "../../src/api/users";

vi.mock("../../src/shared/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "u-admin",
      username: "admin",
      first_name: "Ada",
      last_name: "Lovelace",
      role: "admin",
      mfa_enabled: false,
    },
    isLoading: false,
    isWriter: true,
    isAdmin: true,
    authEnabled: true,
    login: vi.fn(),
    loginMfa: vi.fn(),
    refreshUser: vi.fn(),
    logout: vi.fn(),
  }),
}));

const ACTIVE_KEY = {
  id: "key-1",
  name: "weekly-digest",
  description: "agent that posts to slack",
  token_prefix: "ntr_aBcDe123", // gitleaks:allow
  user_id: "u-admin",
  owner_username: "admin",
  created_at: "2026-05-10T12:00:00Z",
  last_used_at: null,
  expires_at: null,
  revoked_at: null,
};

const ADMIN_USER = {
  id: "u-admin",
  username: "admin",
  first_name: "Ada",
  last_name: "Lovelace",
  role: "admin",
  is_active: true,
  mfa_enabled: false,
  must_change_password: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ConfirmProvider>
        <ApiPage />
      </ConfirmProvider>
    </MemoryRouter>,
  );
}

describe("ApiPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(apiKeysModule, "listApiKeys").mockResolvedValue([ACTIVE_KEY]);
    vi.spyOn(usersModule, "listUsers").mockResolvedValue([ADMIN_USER]);
  });

  it("renders documentation sections and the existing key row", async () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "API" }))
      .toBeInTheDocument();
    expect(screen.getByText("Quick start")).toBeInTheDocument();
    expect(screen.getByText("Authentication")).toBeInTheDocument();
    expect(screen.getByText("Endpoint reference")).toBeInTheDocument();
    expect(screen.getByText("/api/radar/current")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("weekly-digest")).toBeInTheDocument();
    });
    expect(screen.getByText(/ntr_aBcDe123/)).toBeInTheDocument();
  });

  it("shows the plaintext token once after create and clears it on close", async () => {
    const createSpy = vi
      .spyOn(apiKeysModule, "createApiKey")
      .mockResolvedValue({
        api_key: { ...ACTIVE_KEY, id: "key-2", name: "fresh-key" },
        token: "ntr_PLAINTEXT_SECRET_VALUE",
      });
    renderPage();
    await waitFor(() => screen.getByText("weekly-digest"));

    fireEvent.click(screen.getByRole("button", { name: /Create new key/i }));
    fireEvent.change(screen.getByLabelText(/^Name$/i), {
      target: { value: "fresh-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Create$/ }));

    await waitFor(() => {
      expect(screen.getByText("Save this token now")).toBeInTheDocument();
    });
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: "fresh-key" }),
    );
    expect(screen.getByText("ntr_PLAINTEXT_SECRET_VALUE")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/I have saved this token/i));
    fireEvent.click(screen.getByRole("button", { name: /^Done$/ }));

    await waitFor(() => {
      expect(screen.queryByText("ntr_PLAINTEXT_SECRET_VALUE")).not
        .toBeInTheDocument();
    });
  });

  it("hides revoked keys by default and reveals them via the toggle", async () => {
    vi.spyOn(apiKeysModule, "listApiKeys").mockResolvedValue([
      ACTIVE_KEY,
      {
        ...ACTIVE_KEY,
        id: "key-revoked",
        name: "old-agent",
        revoked_at: "2026-05-01T00:00:00Z",
      },
    ]);
    renderPage();
    await waitFor(() => screen.getByText("weekly-digest"));
    expect(screen.queryByText("old-agent")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Show revoked/i));
    expect(screen.getByText("old-agent")).toBeInTheDocument();
  });
});
