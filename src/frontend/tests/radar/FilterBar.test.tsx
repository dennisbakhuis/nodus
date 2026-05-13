import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FilterBar } from "../../src/radar/FilterBar";
import { mockSmallRadarData } from "../../src/radar/__fixtures__/mockRadarData";
import type { FilterState } from "../../src/radar/types";

const defaultFilters: FilterState = {
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
  candidatesOnly: false,
  visibility: "all",
};

describe("FilterBar", () => {
  it("renders segment chips", () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        data={mockSmallRadarData}
        filters={defaultFilters}
        onChange={onChange}
      />
    );
    expect(
      screen.getByRole("button", { name: "Platforms & Infrastructure" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Data & AI" })
    ).toBeInTheDocument();
  });

  it("renders ring chips", () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        data={mockSmallRadarData}
        filters={defaultFilters}
        onChange={onChange}
      />
    );
    expect(screen.getByRole("button", { name: "Invest" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Monitor" })).toBeInTheDocument();
  });

  it("renders movement chips", () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        data={mockSmallRadarData}
        filters={defaultFilters}
        onChange={onChange}
      />
    );
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Promoted" })).toBeInTheDocument();
  });

  it("calls onChange when a segment chip is clicked", () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        data={mockSmallRadarData}
        filters={defaultFilters}
        onChange={onChange}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Platforms & Infrastructure" })
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        segments: ["Platforms & Infrastructure"],
      })
    );
  });

  it("toggles segment off when already active", () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        data={mockSmallRadarData}
        filters={{ ...defaultFilters, segments: ["Platforms & Infrastructure"] }}
        onChange={onChange}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Platforms & Infrastructure" })
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ segments: [] })
    );
  });

  it("shows clear all button when filters are active", () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        data={mockSmallRadarData}
        filters={{ ...defaultFilters, rings: ["Invest"] }}
        onChange={onChange}
      />
    );
    expect(screen.getByText("Clear all")).toBeInTheDocument();
  });

  it("clears all filters when clear all is clicked", () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        data={mockSmallRadarData}
        filters={{ ...defaultFilters, rings: ["Invest"], segments: ["Data & AI"] }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByText("Clear all"));
    expect(onChange).toHaveBeenCalledWith({
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
      candidatesOnly: false,
      visibility: "all",
    });
  });
});
