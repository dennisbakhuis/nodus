import { describe, expect, it } from "vitest";
import { applyListFilters } from "../../src/radar/filtering";
import { mockSmallRadarData } from "../../src/radar/__fixtures__/mockRadarData";
import type { FilterState } from "../../src/radar/types";

const baseFilters: FilterState = {
  segments: [],
  rings: [],
  movements: [],
  search: "",
  strategicRelevance: [],
  minTrl: null,
  registryStatuses: [],
  hasFactsheet: null,
  hasPeerRefs: null,
  timeToMainstream: [],
  personIds: [],
  candidatesOnly: false,
  visibility: "all",
};

describe("applyListFilters", () => {
  it("returns every entry when no filters are active", () => {
    const out = applyListFilters(
      mockSmallRadarData.entries,
      baseFilters,
      mockSmallRadarData,
    );
    expect(out).toHaveLength(mockSmallRadarData.entries.length);
  });

  it("narrows by ring", () => {
    const out = applyListFilters(
      mockSmallRadarData.entries,
      { ...baseFilters, rings: ["Invest"] },
      mockSmallRadarData,
    );
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((e) => e.ring === "Invest")).toBe(true);
  });

  it("narrows by minimum TRL", () => {
    const out = applyListFilters(
      mockSmallRadarData.entries,
      { ...baseFilters, minTrl: 7 },
      mockSmallRadarData,
    );
    expect(out.every((e) => (e.trl ?? 0) >= 7)).toBe(true);
  });

  it("text search matches canonical name", () => {
    const target = mockSmallRadarData.entries[0]!.canonical_name;
    const fragment = target.split(" ")[0]!;
    const out = applyListFilters(
      mockSmallRadarData.entries,
      { ...baseFilters, search: fragment },
      mockSmallRadarData,
    );
    expect(out.length).toBeGreaterThan(0);
    expect(
      out.every((e) => e.canonical_name.toLowerCase().includes(fragment.toLowerCase())),
    ).toBe(true);
  });

  it("visibility=public hides private topics", () => {
    const e0 = mockSmallRadarData.entries[0]!;
    const e1 = mockSmallRadarData.entries[1]!;
    const entries = [
      { ...e0, not_for_external_publication: true },
      { ...e1, not_for_external_publication: false },
    ];
    const out = applyListFilters(
      entries,
      { ...baseFilters, visibility: "public" },
      mockSmallRadarData,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe(entries[1]!.id);
  });
});
