import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { PersonsPage } from "../../src/manage/PersonsPage";
import { ConfirmProvider } from "../../src/shared/ConfirmDialog";

const listPersons = vi.fn();
const listUsers = vi.fn();
const updatePerson = vi.fn();

vi.mock("../../src/manage/api", () => ({
  listPersons: (...a: unknown[]) => listPersons(...a),
  listUsers: (...a: unknown[]) => listUsers(...a),
  updatePerson: (...a: unknown[]) => updatePerson(...a),
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
});
