import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { PersonsPage } from "../../src/manage/PersonsPage";
import { ConfirmProvider } from "../../src/shared/ConfirmDialog";

const listPersons = vi.fn();
const listUsers = vi.fn();
const updatePerson = vi.fn();
const mergePerson = vi.fn();

vi.mock("../../src/manage/api", () => ({
  listPersons: (...a: unknown[]) => listPersons(...a),
  listUsers: (...a: unknown[]) => listUsers(...a),
  updatePerson: (...a: unknown[]) => updatePerson(...a),
  mergePerson: (...a: unknown[]) => mergePerson(...a),
  createPerson: vi.fn(),
  deletePerson: vi.fn(),
}));

function person(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    full_name: "Jane Doe",
    email: null,
    company: "Acme",
    department: null,
    role: null,
    notes: null,
    user_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ConfirmProvider>
        <PersonsPage />
      </ConfirmProvider>
    </MemoryRouter>,
  );
}

describe("PersonsPage linked account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPersons.mockResolvedValue([person()]);
    listUsers.mockResolvedValue([
      { id: "u1", username: "jdoe", first_name: "Jane", last_name: "Doe" },
    ]);
    updatePerson.mockResolvedValue(person({ user_id: "u1" }));
    mergePerson.mockResolvedValue(person());
  });

  it("links a person to a user via the picker", async () => {
    renderPage();
    const cell = await screen.findByText("Jane Doe");
    const row = cell.closest("tr") as HTMLElement;
    const picker = within(row).getByRole("combobox", {
      name: /Linked account for Jane Doe/i,
    });
    fireEvent.change(picker, { target: { value: "u1" } });

    await waitFor(() => {
      expect(updatePerson).toHaveBeenCalledWith("p1", { user_id: "u1" });
    });
  });

  it("merges a person into another via the merge dialog", async () => {
    listPersons.mockResolvedValue([
      person(),
      person({ id: "p2", full_name: "Jane Dupe" }),
    ]);
    renderPage();
    const cell = await screen.findByText("Jane Doe");
    const row = cell.closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Merge" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Merge target"), {
      target: { value: "p2" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Merge" }));

    await waitFor(() => {
      expect(mergePerson).toHaveBeenCalledWith("p1", "p2");
    });
  });
});
