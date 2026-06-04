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
  useAuth: () => ({ isAdmin: false, isWriter: false }),
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
          variant="radar"
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

describe("Sidebar resize + collapse", () => {
  it("always renders a resize handle", () => {
    renderSidebar();
    expect(
      screen.getByRole("separator", { name: "Resize sidebar" }),
    ).toBeInTheDocument();
  });

  it("shows a Hide button and calls onCollapse when provided (radar)", () => {
    const onCollapse = vi.fn();
    renderSidebar({ onCollapse });
    const hide = screen.getByRole("button", { name: "Hide sidebar" });
    fireEvent.click(hide);
    expect(onCollapse).toHaveBeenCalled();
  });

  it("has no Hide button without onCollapse (list)", () => {
    renderSidebar({ variant: "list", onCollapse: undefined });
    expect(screen.queryByRole("button", { name: "Hide sidebar" })).toBeNull();
    expect(
      screen.getByRole("separator", { name: "Resize sidebar" }),
    ).toBeInTheDocument();
  });
});
