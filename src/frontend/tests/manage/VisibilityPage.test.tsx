import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { VisibilityPage } from "../../src/manage/VisibilityPage";

const getVisibilityConfig = vi.fn();
const saveVisibilityConfig = vi.fn();
const getCapabilityConfig = vi.fn();
const saveCapabilityConfig = vi.fn();

vi.mock("../../src/manage/api", () => ({
  getVisibilityConfig: (...a: unknown[]) => getVisibilityConfig(...a),
  saveVisibilityConfig: (...a: unknown[]) => saveVisibilityConfig(...a),
  getCapabilityConfig: (...a: unknown[]) => getCapabilityConfig(...a),
  saveCapabilityConfig: (...a: unknown[]) => saveCapabilityConfig(...a),
  DEFAULT_CAPABILITIES: {
    cycle_selector: ["reader", "writer", "admin"],
    list_view: ["reader", "writer", "admin"],
  },
}));

describe("VisibilityPage — view capabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVisibilityConfig.mockResolvedValue({});
    getCapabilityConfig.mockResolvedValue({
      cycle_selector: ["reader", "writer", "admin"],
      list_view: ["reader", "writer", "admin"],
    });
    saveCapabilityConfig.mockResolvedValue(undefined);
  });

  it("renders a capability row for the cycle selector and list view", async () => {
    render(<VisibilityPage />);
    expect(await screen.findByText("View capabilities")).toBeInTheDocument();
    expect(screen.getByText("Cycle selector")).toBeInTheDocument();
    expect(screen.getByText("List view")).toBeInTheDocument();
  });

  it("saves capability changes via saveCapabilityConfig", async () => {
    render(<VisibilityPage />);
    const checkbox = await screen.findByLabelText(
      "Allow Public reader to use List view",
    );
    fireEvent.click(checkbox);

    const saveButtons = screen.getAllByRole("button", { name: "Save" });
    fireEvent.click(saveButtons[saveButtons.length - 1]!);

    await waitFor(() => {
      expect(saveCapabilityConfig).toHaveBeenCalled();
    });
    const saved = saveCapabilityConfig.mock.calls[0]![0] as Record<
      string,
      string[]
    >;
    expect(saved.list_view).toContain("public_reader");
  });
});
