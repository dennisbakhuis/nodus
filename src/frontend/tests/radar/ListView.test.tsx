import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ListView } from "../../src/radar/ListView";
import { mockSmallRadarData } from "../../src/radar/__fixtures__/mockRadarData";
import type { FilterState } from "../../src/radar/types";

const defaultFilters: FilterState = {
  segments: [],
  rings: [],
  movements: [],
  search: "",
  strategicRelevance: [],
  minTrl: null,
  registryStatuses: ["On Radar", "Backlog", "Archive"],
  hasFactsheet: null,
  hasPeerRefs: null,
  timeToMainstream: [],
  personIds: [],
  candidatesOnly: false,
  visibility: "all",
};

describe("ListView", () => {
  it("renders a table with column headers", () => {
    render(
      <ListView
        data={mockSmallRadarData}
        filters={defaultFilters}
        onRowClick={vi.fn()}
      />
    );
    expect(screen.getByRole("columnheader", { name: /name/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /ring/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /segment/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /movement/i })).toBeInTheDocument();
  });

  it("renders all visible entries", () => {
    render(
      <ListView
        data={mockSmallRadarData}
        filters={defaultFilters}
        onRowClick={vi.fn()}
      />
    );
    const rows = screen.getAllByRole("row");
    expect(rows.length).toBeGreaterThan(1);
  });

  it("filters entries by ring", () => {
    render(
      <ListView
        data={mockSmallRadarData}
        filters={{ ...defaultFilters, rings: ["Invest"] }}
        onRowClick={vi.fn()}
      />
    );
    const badges = screen.queryAllByText("Invest");
    const monitorBadges = screen.queryAllByText("Monitor");
    expect(badges.length).toBeGreaterThanOrEqual(0);
    expect(monitorBadges).toHaveLength(0);
  });

  it("calls onRowClick when a row is clicked", () => {
    const onRowClick = vi.fn();
    render(
      <ListView
        data={mockSmallRadarData}
        filters={defaultFilters}
        onRowClick={onRowClick}
      />
    );
    const rows = screen.getAllByRole("row");
    const firstDataRow = rows[1];
    if (firstDataRow) {
      fireEvent.click(firstDataRow);
      expect(onRowClick).toHaveBeenCalled();
    }
  });

  it("sorts by name ascending by default", () => {
    render(
      <ListView
        data={mockSmallRadarData}
        filters={defaultFilters}
        onRowClick={vi.fn()}
      />
    );
    const nameHeader = screen.getByRole("columnheader", { name: /name/i });
    expect(nameHeader).toHaveAttribute("aria-sort", "ascending");
  });

  it("reverses sort on click (asc → desc → asc)", () => {
    render(
      <ListView
        data={mockSmallRadarData}
        filters={defaultFilters}
        onRowClick={vi.fn()}
      />
    );
    const nameHeader = screen.getByRole("columnheader", { name: /name/i });
    expect(nameHeader).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(nameHeader);
    expect(nameHeader).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(nameHeader);
    expect(nameHeader).toHaveAttribute("aria-sort", "ascending");
  });

  it("shows empty state when no entries match filters", () => {
    render(
      <ListView
        data={mockSmallRadarData}
        filters={{ ...defaultFilters, search: "xyznotfoundatall" }}
        onRowClick={vi.fn()}
      />
    );
    expect(screen.getByText(/no technologies match/i)).toBeInTheDocument();
  });

  it("shows entry count", () => {
    render(
      <ListView
        data={mockSmallRadarData}
        filters={defaultFilters}
        onRowClick={vi.fn()}
      />
    );
    expect(screen.getByText(/technologies/i)).toBeInTheDocument();
  });

  it("hides the Visibility column by default", () => {
    render(
      <ListView
        data={mockSmallRadarData}
        filters={defaultFilters}
        onRowClick={vi.fn()}
      />
    );
    expect(
      screen.queryByRole("columnheader", { name: /visibility/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the Visibility column when showVisibility is true", () => {
    render(
      <ListView
        data={mockSmallRadarData}
        filters={defaultFilters}
        onRowClick={vi.fn()}
        showVisibility
      />
    );
    expect(
      screen.getByRole("columnheader", { name: /visibility/i }),
    ).toBeInTheDocument();
  });

  it("always renders the Status column", () => {
    render(
      <ListView
        data={mockSmallRadarData}
        filters={defaultFilters}
        onRowClick={vi.fn()}
      />
    );
    expect(
      screen.getByRole("columnheader", { name: /status/i }),
    ).toBeInTheDocument();
  });
});
