import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DetailPanel } from "../../src/radar/DetailPanel";
import { mockSmallRadarData } from "../../src/radar/__fixtures__/mockRadarData";
import type { RadarEntry } from "../../src/radar/types";

vi.mock("../../src/api/client", () => ({
  getTopic: vi.fn().mockResolvedValue({
    topic: { id: "topic-0", canonical_name: "Grid-Forming Inverters", slug: "grid-forming-inverters" },
    technology: { id: "tech-0", hero_image_id: null },
    factsheet: {
      description: "Test description",
      use_cases: "Test use cases",
      summary: "Test summary",
      last_updated: "2026-01-01",
    },
    assessment: null,
    aliases: [],
    recent_events: [],
    peer_references: [],
    peer_reference_count: 0,
    persons: [],
    hero_image_url: null,
  }),
}));

vi.mock("../../src/manage/api", () => ({
  listMovements: vi.fn().mockResolvedValue([]),
}));

const sampleEntry: RadarEntry = mockSmallRadarData.entries[0]!;

describe("DetailPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing visibly when entry is null", () => {
    const { container } = render(
      <MemoryRouter>
        <DetailPanel
          entry={null}
          data={mockSmallRadarData}
          relations={[]}
          onClose={vi.fn()}
          onNavigate={vi.fn()}
        />
      </MemoryRouter>
    );
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    const style = (dialog as HTMLElement).style;
    expect(style.transform).toBe("translateX(100%)");
  });

  it("renders entry name when entry is provided", async () => {
    render(
      <MemoryRouter>
        <DetailPanel
          entry={sampleEntry}
          data={mockSmallRadarData}
          relations={[]}
          onClose={vi.fn()}
          onNavigate={vi.fn()}
        />
      </MemoryRouter>
    );
    expect(screen.getByText(sampleEntry.canonical_name)).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <DetailPanel
          entry={sampleEntry}
          data={mockSmallRadarData}
          relations={[]}
          onClose={onClose}
          onNavigate={vi.fn()}
        />
      </MemoryRouter>
    );
    const closeButton = screen.getByRole("button", { name: /close detail panel/i });
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on Escape key press", () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <DetailPanel
          entry={sampleEntry}
          data={mockSmallRadarData}
          relations={[]}
          onClose={onClose}
          onNavigate={vi.fn()}
        />
      </MemoryRouter>
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when overlay is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <DetailPanel
          entry={sampleEntry}
          data={mockSmallRadarData}
          relations={[]}
          onClose={onClose}
          onNavigate={vi.fn()}
        />
      </MemoryRouter>
    );
    const overlay = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    if (overlay) {
      fireEvent.click(overlay);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it("shows loading state initially", () => {
    render(
      <MemoryRouter>
        <DetailPanel
          entry={sampleEntry}
          data={mockSmallRadarData}
          relations={[]}
          onClose={vi.fn()}
          onNavigate={vi.fn()}
        />
      </MemoryRouter>
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows factsheet content after loading", async () => {
    render(
      <MemoryRouter>
        <DetailPanel
          entry={sampleEntry}
          data={mockSmallRadarData}
          relations={[]}
          onClose={vi.fn()}
          onNavigate={vi.fn()}
        />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });
    expect(screen.getByText("Test description")).toBeInTheDocument();
  });

  it("does not render email in the panel", async () => {
    const { container } = render(
      <MemoryRouter>
        <DetailPanel
          entry={sampleEntry}
          data={mockSmallRadarData}
          relations={[]}
          onClose={vi.fn()}
          onNavigate={vi.fn()}
        />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });
    expect(container.innerHTML).not.toMatch(/@\S+\.\S+/);
  });
});
