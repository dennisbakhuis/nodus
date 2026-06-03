import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { CyclePicker } from "../../src/shared/CyclePicker";

const listCycles = vi.fn();
vi.mock("../../src/api/cycles", () => ({
  listCycles: (...a: unknown[]) => listCycles(...a),
}));

let mockAuth: { canBrowseCycles: boolean };
vi.mock("../../src/shared/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

function renderPicker() {
  return render(
    <MemoryRouter>
      <CyclePicker />
    </MemoryRouter>,
  );
}

describe("CyclePicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listCycles.mockResolvedValue([
      { id: "c1", name: "2026 Q2", start_date: "2026-04-01", end_date: null },
      {
        id: "c0",
        name: "2026 Q1",
        start_date: "2026-01-01",
        end_date: "2026-03-31",
      },
    ]);
  });

  it("renders the selector when there is more than one cycle", async () => {
    mockAuth = { canBrowseCycles: true };
    renderPicker();
    expect(await screen.findByLabelText("Select cycle")).toBeInTheDocument();
  });

  it("hides the selector when there is only one cycle", async () => {
    listCycles.mockResolvedValue([
      { id: "c1", name: "2026 Q2", start_date: "2026-04-01", end_date: null },
    ]);
    mockAuth = { canBrowseCycles: true };
    const { container } = renderPicker();
    // Let the fetch resolve, then confirm nothing rendered.
    await Promise.resolve();
    expect(screen.queryByLabelText("Select cycle")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing (and skips the fetch) when the role cannot browse cycles", () => {
    mockAuth = { canBrowseCycles: false };
    const { container } = renderPicker();
    expect(container).toBeEmptyDOMElement();
    expect(listCycles).not.toHaveBeenCalled();
  });
});
