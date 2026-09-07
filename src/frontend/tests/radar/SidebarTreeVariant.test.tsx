import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { Sidebar } from "../../src/radar/Sidebar";
import { ConfirmProvider } from "../../src/shared/ConfirmDialog";
import type { FilterState, RadarData } from "../../src/radar/types";

vi.mock("../../src/shared/CyclePicker", () => ({ CyclePicker: () => null }));
vi.mock("../../src/radar/SearchBox", () => ({ SearchBox: () => null }));
vi.mock("../../src/shared/NodusFooterLink", () => ({
  NodusFooterLink: () => null,
}));
vi.mock("../../src/shared/AuthContext", () => ({
  useAuth: () => ({ isAdmin: true, isWriter: true }),
}));
vi.mock("../../src/radar/ReadOnlyRadarContext", () => ({
  useReadOnlyRadar: () => false,
}));
vi.mock("../../src/manage/api", () => ({
  listPersons: vi.fn().mockResolvedValue([]),
  listSegments: vi.fn().mockResolvedValue([]),
  createSegment: vi.fn(),
  deleteSegment: vi.fn(),
  reorderSegments: vi.fn(),
  updateSegment: vi.fn(),
}));
vi.mock("../../src/api/topics", () => ({
  listGroupsTree: vi.fn().mockResolvedValue([]),
}));

const data = {
  entries: [],
  segments: [],
  cycle: null,
} as unknown as RadarData;

const filters: FilterState = {
  segments: [],
  rings: [],
  movements: [],
  search: "",
  strategicRelevance: [],
  minTrl: null,
  registryStatuses: ["On Radar"],
  hasFactsheet: null,
  hasPeerRefs: null,
  timeToMainstream: [],
  personIds: [],
  visibility: "all",
  groupId: null,
};

function renderSidebar(extra: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ConfirmProvider>
        <Sidebar
          variant="tree"
          entries={[]}
          search=""
          onSearchChange={() => {}}
          onSearchSelect={() => {}}
          data={data}
          filters={filters}
          onFiltersChange={() => {}}
          {...extra}
        />
      </ConfirmProvider>
    </MemoryRouter>,
  );
}

describe("Sidebar tree variant", () => {
  it("offers both hierarchy modes", () => {
    renderSidebar();
    expect(screen.getByText("Groups")).toBeInTheDocument();
    expect(screen.getByText("Dependencies")).toBeInTheDocument();
  });

  // The tree shows the whole registry, so the registry-scoped filters that used
  // to be list-only must come along; the radar still must not get them.
  it("shows the registry-scoped filters", () => {
    renderSidebar();
    expect(screen.getByText("Registry Status")).toBeInTheDocument();
    expect(screen.getByText("Visibility")).toBeInTheDocument();
    expect(screen.getByText("Completeness")).toBeInTheDocument();
  });

  it("hides the dot encoding pickers, which are radar-only", () => {
    renderSidebar({
      colorMode: "segment",
      onColorModeChange: () => {},
      shapeMode: "dot",
      onShapeModeChange: () => {},
    });
    expect(screen.queryByText("Color dots by")).toBeNull();
    expect(screen.queryByText("Shape dots by")).toBeNull();
  });

  it("shows depth and anchor controls only in dependency mode", () => {
    const { unmount } = renderSidebar({ treeMode: "groups" });
    expect(screen.queryByText("Depth")).toBeNull();
    expect(screen.queryByText("Anchor")).toBeNull();
    unmount();

    renderSidebar({ treeMode: "deps" });
    expect(screen.getByText("Depth")).toBeInTheDocument();
    expect(screen.getByText("Anchor")).toBeInTheDocument();
  });

  it("reports the selected depth", () => {
    const onTreeDepthChange = vi.fn();
    renderSidebar({ treeMode: "deps", treeDepth: 2, onTreeDepthChange });
    const three = screen.getByRole("button", {
      name: "Depth plus or minus 3",
    });
    fireEvent.click(three);
    expect(onTreeDepthChange).toHaveBeenCalledWith(3);
  });

  it("switches mode when a hierarchy chip is clicked", () => {
    const onTreeModeChange = vi.fn();
    renderSidebar({ treeMode: "groups", onTreeModeChange });
    fireEvent.click(screen.getByText("Dependencies"));
    expect(onTreeModeChange).toHaveBeenCalledWith("deps");
  });

  it("names the current anchor and allows clearing it", () => {
    const onAnchorClear = vi.fn();
    renderSidebar({
      treeMode: "deps",
      anchorName: "Adaptive Protection",
      onAnchorClear,
    });
    expect(screen.getByText("Adaptive Protection")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear anchor" }));
    expect(onAnchorClear).toHaveBeenCalled();
  });

  it("prompts when no anchor is set", () => {
    renderSidebar({ treeMode: "deps", anchorName: null });
    expect(screen.getByText("Search above to pick one")).toBeInTheDocument();
  });

  it("keeps segment administration out of the tree", () => {
    renderSidebar();
    expect(screen.queryByRole("button", { name: /edit segments/i })).toBeNull();
  });
});
