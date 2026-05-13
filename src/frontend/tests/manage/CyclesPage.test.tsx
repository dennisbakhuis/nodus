import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CyclesPage } from "../../src/manage/CyclesPage";
import { ConfirmProvider } from "../../src/shared/ConfirmDialog";
import * as api from "../../src/manage/api";
import type { CycleRead } from "../../src/manage/types";

const openCycle: CycleRead = {
  id: "cycle-1",
  name: "2026-Q1",
  start_date: "2026-01-01",
  end_date: null,
  snapshot_json: null,
  color: "dark-blue",
};

const closedCycle: CycleRead = {
  id: "cycle-2",
  name: "2025-Q2",
  start_date: "2025-07-01",
  end_date: "2025-12-31",
  snapshot_json: '{"entries":[]}',
  color: "violet",
};

function renderComponent() {
  return render(
    <MemoryRouter>
      <ConfirmProvider>
        <CyclesPage />
      </ConfirmProvider>
    </MemoryRouter>
  );
}

describe("CyclesPage", () => {
  beforeEach(() => {
    vi.spyOn(api, "listCycles").mockResolvedValue([openCycle, closedCycle]);
  });

  it("renders the page heading", async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("Cycle Management")).toBeInTheDocument();
    });
  });

  it("renders existing cycles", async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/2026-Q1/)).toBeInTheDocument();
      expect(screen.getByText("2025-Q2")).toBeInTheDocument();
    });
  });

  it("shows Open badge for open cycle", async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("Open")).toBeInTheDocument();
    });
  });

  it("shows Closed badge for closed cycle", async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("Closed")).toBeInTheDocument();
    });
  });

  it("shows Close Cycle button for open cycle only", async () => {
    renderComponent();
    await waitFor(() => screen.getByText("Active: 2026-Q1"));
    const closeBtns = screen.getAllByText(/Close cycle/i);
    expect(closeBtns).toHaveLength(1);
  });

  it("shows deliverable download buttons for closed cycle", async () => {
    renderComponent();
    await waitFor(() => screen.getByText("2025-Q2"));
    expect(screen.getByText("Radar JSON")).toBeInTheDocument();
    expect(screen.getByText("Summary Brief")).toBeInTheDocument();
    expect(screen.getByText("Detailed Report")).toBeInTheDocument();
    expect(screen.getByText("Delta Document")).toBeInTheDocument();
  });

  it("shows New Cycle button", async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("New Cycle")).toBeInTheDocument();
    });
  });

  it("shows new cycle form when New Cycle clicked", async () => {
    renderComponent();
    await waitFor(() => screen.getByText("New Cycle"));
    fireEvent.click(screen.getByText("New Cycle"));
    await waitFor(() => {
      expect(screen.getByText("Create New Cycle")).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Cycle Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Start Date/i)).toBeInTheDocument();
  });

  it("calls createCycle when form submitted", async () => {
    const createSpy = vi
      .spyOn(api, "createCycle")
      .mockResolvedValue({ ...openCycle, name: "2026-Q2" });

    renderComponent();
    await waitFor(() => screen.getByText("New Cycle"));
    fireEvent.click(screen.getByText("New Cycle"));
    await waitFor(() => screen.getByLabelText(/Cycle Name/i));

    fireEvent.change(screen.getByLabelText(/Cycle Name/i), {
      target: { value: "2026-Q2" },
    });
    fireEvent.click(screen.getByText("Create Cycle"));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "2026-Q2" })
      );
    });
  });

  it("calls closeCycle when Close Cycle clicked", async () => {
    const closeSpy = vi
      .spyOn(api, "closeCycle")
      .mockResolvedValue({
        ...openCycle,
        end_date: "2026-04-28",
      });

    renderComponent();
    await waitFor(() => screen.getByText(/Close cycle/i));
    fireEvent.click(screen.getByText(/Close cycle/i));

    const dialogConfirm = await screen.findByRole("button", {
      name: /^Close cycle$/,
    });
    fireEvent.click(dialogConfirm);

    await waitFor(() => {
      expect(closeSpy).toHaveBeenCalledWith(
        "cycle-1",
        expect.objectContaining({ end_date: expect.any(String) })
      );
    });
  });

  it("shows empty state when no cycles", async () => {
    vi.spyOn(api, "listCycles").mockResolvedValue([]);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/No open cycle/i)).toBeInTheDocument();
    });
  });

  it("renders the cycle color picker on the new cycle form", async () => {
    renderComponent();
    await waitFor(() => screen.getByText("New Cycle"));
    fireEvent.click(screen.getByText("New Cycle"));
    await waitFor(() => screen.getByText("Create New Cycle"));
    expect(screen.getByRole("radiogroup", { name: /cycle color/i })).toBeInTheDocument();
  });

  it("passes color in createCycle payload", async () => {
    const createSpy = vi
      .spyOn(api, "createCycle")
      .mockResolvedValue({ ...openCycle, name: "2026-Q2" });

    renderComponent();
    await waitFor(() => screen.getByText("New Cycle"));
    fireEvent.click(screen.getByText("New Cycle"));
    await waitFor(() => screen.getByLabelText(/Cycle Name/i));

    fireEvent.change(screen.getByLabelText(/Cycle Name/i), {
      target: { value: "2026-Q2" },
    });
    fireEvent.click(screen.getByText("Create Cycle"));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "2026-Q2", color: expect.any(String) })
      );
    });
  });

  it("calls updateCycle on inline edit save", async () => {
    const updateSpy = vi
      .spyOn(api, "updateCycle")
      .mockResolvedValue({ ...openCycle, name: "2026-Q1 renamed" });

    renderComponent();
    await waitFor(() => screen.getByText(/Active: 2026-Q1/));
    const editButtons = screen.getAllByText(/Edit name & color/i);
    const firstEdit = editButtons[0];
    expect(firstEdit).toBeDefined();
    fireEvent.click(firstEdit!);
    const nameInput = await screen.findByLabelText(/cycle name/i);
    fireEvent.change(nameInput, { target: { value: "2026-Q1 renamed" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        "cycle-1",
        expect.objectContaining({ name: "2026-Q1 renamed" })
      );
    });
  });

  it("renders View on radar / View as list links for closed cycles", async () => {
    renderComponent();
    await waitFor(() => screen.getByText("2025-Q2"));
    const radarLink = screen.getByText("View on radar").closest("a");
    const listLink = screen.getByText("View as list").closest("a");
    expect(radarLink).toHaveAttribute("href", "/radar?cycle=cycle-2");
    expect(listLink).toHaveAttribute("href", "/list?cycle=cycle-2");
  });
});
