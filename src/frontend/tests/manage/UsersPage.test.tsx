import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { UsersPage } from "../../src/manage/UsersPage";
import { ConfirmProvider } from "../../src/shared/ConfirmDialog";
import type { UserAdminRead } from "../../src/api/users";

const listUsers = vi.fn();
const updateUser = vi.fn();
const deleteUser = vi.fn();
const getEntraConfig = vi.fn();
const getSetting = vi.fn();

vi.mock("../../src/manage/api", () => ({
  listUsers: (...a: unknown[]) => listUsers(...a),
  createUser: vi.fn(),
  updateUser: (...a: unknown[]) => updateUser(...a),
  resetUserPassword: vi.fn(),
  deleteUser: (...a: unknown[]) => deleteUser(...a),
  getEntraConfig: (...a: unknown[]) => getEntraConfig(...a),
  getSetting: (...a: unknown[]) => getSetting(...a),
  upsertSetting: vi.fn(),
}));

let mockAuth: { authEnabled: boolean; providers: string[] };

vi.mock("../../src/shared/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

function localUser(over: Partial<UserAdminRead> = {}): UserAdminRead {
  return {
    id: "u-local",
    username: "alice",
    first_name: "Alice",
    last_name: "Anderson",
    role: "writer",
    is_active: true,
    mfa_enabled: false,
    must_change_password: false,
    entra_oid: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function entraUser(over: Partial<UserAdminRead> = {}): UserAdminRead {
  return localUser({
    id: "u-entra",
    username: "bob",
    first_name: "Bob",
    last_name: "Brown",
    role: "reader",
    entra_oid: "oid-123",
    ...over,
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ConfirmProvider>
        <UsersPage />
      </ConfirmProvider>
    </MemoryRouter>,
  );
}

describe("UsersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth = { authEnabled: true, providers: ["local"] };
    getSetting.mockResolvedValue({ key: "x", value: "false" });
    getEntraConfig.mockResolvedValue({ enabled: true, groups: [] });
    listUsers.mockResolvedValue([localUser()]);
    updateUser.mockResolvedValue(localUser());
    deleteUser.mockResolvedValue(localUser());
  });

  it("shows Edit and Delete actions for a local user", async () => {
    renderPage();
    const cell = await screen.findByText("alice");
    const row = cell.closest("tr") as HTMLElement;
    expect(within(row).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(
      within(row).getByRole("button", { name: "Delete" }),
    ).toBeInTheDocument();
  });

  it("submits username/name changes from the edit modal", async () => {
    renderPage();
    const cell = await screen.findByText("alice");
    const row = cell.closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Edit" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Username/i), {
      target: { value: "alice2" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Save changes/i }));

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith(
        "u-local",
        expect.objectContaining({
          username: "alice2",
          first_name: "Alice",
          last_name: "Anderson",
        }),
      );
    });
  });

  it("deletes a user after confirmation", async () => {
    renderPage();
    const cell = await screen.findByText("alice");
    const row = cell.closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));

    const confirmBtn = await screen.findByRole("button", {
      name: /Delete user/i,
    });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(deleteUser).toHaveBeenCalledWith("u-local");
    });
  });

  it("renders Entra users read-only with a badge and no edit/delete", async () => {
    listUsers.mockResolvedValue([entraUser()]);
    mockAuth = { authEnabled: true, providers: ["local", "entra"] };
    renderPage();

    const cell = await screen.findByText("bob");
    const row = cell.closest("tr") as HTMLElement;
    expect(within(row).queryByRole("button", { name: "Edit" })).toBeNull();
    expect(within(row).queryByRole("button", { name: "Delete" })).toBeNull();
    expect(within(row).queryByRole("combobox")).toBeNull(); // no role <select>
    expect(within(row).getByText("Entra")).toBeInTheDocument();
    expect(within(row).getByText("Reader")).toBeInTheDocument();
  });

  it("shows the Entra group mapping only when Entra is enabled", async () => {
    mockAuth = { authEnabled: true, providers: ["local", "entra"] };
    getEntraConfig.mockResolvedValue({
      enabled: true,
      groups: [{ role: "admin", group_id: "grp-admin" }],
    });
    renderPage();

    expect(await screen.findByText("Entra group mapping")).toBeInTheDocument();
    expect(await screen.findByText("grp-admin")).toBeInTheDocument();
  });

  it("hides the Entra group mapping for local-only deployments", async () => {
    mockAuth = { authEnabled: true, providers: ["local"] };
    renderPage();
    await screen.findByText("alice");
    expect(screen.queryByText("Entra group mapping")).toBeNull();
    expect(getEntraConfig).not.toHaveBeenCalled();
  });

  it("does not offer public_reader as a create-user role", async () => {
    renderPage();
    await screen.findByText("alice");
    fireEvent.click(screen.getByRole("button", { name: "Add user" }));
    const roleSelect = screen.getByLabelText("Role") as HTMLSelectElement;
    const values = Array.from(roleSelect.options).map((o) => o.value);
    expect(values).toEqual(["reader", "writer", "admin"]);
    expect(values).not.toContain("public_reader");
  });
});
