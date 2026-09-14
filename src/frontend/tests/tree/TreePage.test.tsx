import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TreePage } from "../../src/tree/TreePage";
import { ConfirmProvider } from "../../src/shared/ConfirmDialog";
import type { RadarData } from "../../src/radar/types";

const fetchCurrentRadar = vi.fn();
const fetchRelations = vi.fn();
const listGroupsTree = vi.fn();

vi.mock("../../src/api/radar-snapshot", () => ({
  fetchCurrentRadar: (...args: unknown[]) => fetchCurrentRadar(...args),
  fetchHistoricalRadar: vi.fn(),
}));
vi.mock("../../src/api/relations", () => ({
  fetchRelations: (...args: unknown[]) => fetchRelations(...args),
}));
vi.mock("../../src/api/topics", () => ({
  listGroupsTree: (...args: unknown[]) => listGroupsTree(...args),
}));
vi.mock("../../src/radar/Sidebar", () => ({ Sidebar: () => null }));
vi.mock("../../src/radar/DetailPanel", () => ({ DetailPanel: () => null }));
vi.mock("../../src/topic-detail", () => ({ TopicDetailModal: () => null }));
vi.mock("../../src/shared/AuthContext", () => ({
  useAuth: () => ({ isWriter: false, isAdmin: false }),
}));
vi.mock("../../src/shared/RadarCycleContext", () => ({
  useRadarCycle: () => ({ setFullBleed: () => {} }),
}));

const segments = [
  {
    id: "seg-1",
    name: "Data & AI",
    slug: "data-ai",
    order: 0,
    theme_key: "rose",
    is_active: true,
  },
];

function entry(topicId: string, over: Record<string, unknown> = {}) {
  return {
    id: `e-${topicId}`,
    topic_id: topicId,
    technology_id: `t-${topicId}`,
    canonical_name: topicId,
    slug: topicId,
    registry_status: "On Radar",
    segment_id: "seg-1",
    segment_name: "Data & AI",
    ring: "Invest",
    summary: "",
    trl: 5,
    strategic_relevance: "High",
    time_to_mainstream: "0-2 yr",
    movement: "unchanged",
    peer_reference_count: 0,
    peer_references: [],
    persons: [],
    ancestor_path: [],
    ...over,
  };
}

const data = {
  radar: { title: "Radar", cycle: null },
  cycle: { id: "c1", name: "2026", end_date: null },
  segments,
  rings: [{ id: 1, name: "Invest", order: 0 }],
  entries: [entry("alpha"), entry("beta")],
} as unknown as RadarData;

function renderPage(path = "/tree") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ConfirmProvider>
        <TreePage />
      </ConfirmProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchCurrentRadar.mockResolvedValue(data);
  fetchRelations.mockResolvedValue([]);
  listGroupsTree.mockResolvedValue([]);
});

describe("TreePage", () => {
  // Classification reads "absent from entries" as "has no Technology", so a
  // snapshot limited to On Radar would turn every Backlog or Archive
  // technology into a label group.
  it("requests every registry status", async () => {
    renderPage();
    await waitFor(() => expect(fetchCurrentRadar).toHaveBeenCalled());
    expect(fetchCurrentRadar.mock.calls[0]![2]).toEqual([
      "On Radar",
      "Backlog",
      "Adopted",
      "Archive",
    ]);
  });

  it("renders the tree once data arrives", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByLabelText("Technology tree")).toBeInTheDocument(),
    );
    expect(document.querySelectorAll("[data-topic-id]").length).toBe(2);
  });

  it("prompts for an anchor in dependency mode when none is set", async () => {
    renderPage("/tree?mode=deps");
    await waitFor(() =>
      expect(screen.getByText(/Pick an anchor technology/)).toBeInTheDocument(),
    );
  });

  it("renders a lineage when the anchor resolves from the URL", async () => {
    fetchRelations.mockResolvedValue([
      {
        id: "r1",
        from_topic_id: "alpha",
        to_topic_id: "beta",
        relation_type: "drives",
        created_at: "",
      },
    ]);
    renderPage("/tree?mode=deps&anchor=alpha&depth=2");
    await waitFor(() =>
      expect(screen.getByLabelText("Technology tree")).toBeInTheDocument(),
    );
    expect(screen.getByText("ANCHOR")).toBeInTheDocument();
    expect(screen.getByText("DOWNSTREAM · LEVEL -1")).toBeInTheDocument();
  });

  // Folded by default: the canvas is what the reader came for, so the key
  // announces itself without covering the corner until it is asked for.
  it("offers a legend, folded, and unfolds it on request", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByLabelText("Technology tree")).toBeInTheDocument(),
    );
    expect(screen.getByText("Legend")).toBeInTheDocument();
    expect(
      screen.queryByText("Group — never on the radar"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Legend/ }));
    expect(screen.getByText("Group — never on the radar")).toBeInTheDocument();
    expect(screen.getByText("Data & AI")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Legend/ }));
    expect(
      screen.queryByText("Group — never on the radar"),
    ).not.toBeInTheDocument();
  });

  // Groups mode tints links by generation, so the only thing a stroke colour
  // can mean there is depth; dependency mode is the one with relation types.
  it("keys levels in groups mode and relation types in dependency mode", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByLabelText("Technology tree")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: /Legend/ }));
    expect(screen.getByText(/Column — level/)).toBeInTheDocument();
    expect(screen.queryByText("hinders")).not.toBeInTheDocument();

    fetchRelations.mockResolvedValue([
      {
        id: "r1",
        from_topic_id: "alpha",
        to_topic_id: "beta",
        relation_type: "drives",
        created_at: "",
      },
    ]);
    renderPage("/tree?mode=deps&anchor=alpha&depth=2");
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /Legend/ }).length).toBe(2),
    );
    await user.click(screen.getAllByRole("button", { name: /Legend/ })[1]!);
    expect(screen.getAllByText("hinders").length).toBeGreaterThan(0);
  });

  it("surfaces a load failure", async () => {
    fetchCurrentRadar.mockRejectedValue(new Error("boom"));
    renderPage();
    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
  });

  it("still renders when the group tree endpoint fails", async () => {
    listGroupsTree.mockRejectedValue(new Error("nope"));
    renderPage();
    await waitFor(() =>
      expect(screen.getByLabelText("Technology tree")).toBeInTheDocument(),
    );
  });
});
