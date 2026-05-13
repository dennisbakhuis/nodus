import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PersonPicker } from "../../src/shared/PersonPicker";
import * as client from "../../src/api/client";
import type { PersonReadManagement } from "../../src/api/client";

const sample: PersonReadManagement = {
  id: "p1",
  full_name: "Alice",
  email: null,
  company: "Acme",
  department: null,
  role: null,
  notes: null,
  user_id: null,
  created_at: "2026-04-30T00:00:00Z",
  updated_at: "2026-04-30T00:00:00Z",
};

describe("PersonPicker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders search results from the API", async () => {
    vi.spyOn(client, "listPersons").mockResolvedValue([sample]);
    const onSelect = vi.fn();
    render(<PersonPicker onSelect={onSelect} searchDelayMs={0} />);
    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
  });

  it("calls onSelect when a result is clicked", async () => {
    vi.spyOn(client, "listPersons").mockResolvedValue([sample]);
    const onSelect = vi.fn();
    render(<PersonPicker onSelect={onSelect} searchDelayMs={0} />);
    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Alice"));
    expect(onSelect).toHaveBeenCalledWith(sample);
  });

  it("falls back to a create form when 'Create new person' clicked", async () => {
    vi.spyOn(client, "listPersons").mockResolvedValue([]);
    render(<PersonPicker onSelect={vi.fn()} searchDelayMs={0} />);
    await waitFor(() => {
      expect(screen.getByText("No matches")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("+ Create new person"));
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
    expect(screen.getByLabelText("Company")).toBeInTheDocument();
  });

  it("creates a new person and emits onSelect with the result", async () => {
    vi.spyOn(client, "listPersons").mockResolvedValue([]);
    const created: PersonReadManagement = { ...sample, id: "p2", full_name: "Bob" };
    vi.spyOn(client, "createPerson").mockResolvedValue(created);
    const onSelect = vi.fn();
    render(<PersonPicker onSelect={onSelect} searchDelayMs={0} />);
    await waitFor(() => screen.getByText("No matches"));
    fireEvent.click(screen.getByText("+ Create new person"));

    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Bob" },
    });
    fireEvent.change(screen.getByLabelText("Company"), {
      target: { value: "Acme" },
    });
    fireEvent.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(created);
    });
  });

  it("blocks create when full_name or company empty", async () => {
    vi.spyOn(client, "listPersons").mockResolvedValue([]);
    const createSpy = vi.spyOn(client, "createPerson");
    render(<PersonPicker onSelect={vi.fn()} searchDelayMs={0} />);
    await waitFor(() => screen.getByText("No matches"));
    fireEvent.click(screen.getByText("+ Create new person"));
    fireEvent.click(screen.getByText("Create"));
    expect(createSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/required/i);
  });

  it("can return to search from create mode", async () => {
    vi.spyOn(client, "listPersons").mockResolvedValue([]);
    render(<PersonPicker onSelect={vi.fn()} searchDelayMs={0} />);
    await waitFor(() => screen.getByText("No matches"));
    fireEvent.click(screen.getByText("+ Create new person"));
    fireEvent.click(screen.getByText("Back to search"));
    await waitFor(() => screen.getByText("No matches"));
  });
});
