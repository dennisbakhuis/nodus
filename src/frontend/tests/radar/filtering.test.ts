import { describe, expect, it } from "vitest";
import { applyListFilters, isVisible } from "../../src/radar/filtering";
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
  visibility: "all",
  groupId: null,
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

  it("narrows by maximum TRL", () => {
    const out = applyListFilters(
      mockSmallRadarData.entries,
      { ...baseFilters, maxTrl: 3 },
      mockSmallRadarData,
    );
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((e) => e.trl != null && e.trl <= 3)).toBe(true);
  });

  it("narrows by a TRL min/max range (both handles)", () => {
    const out = applyListFilters(
      mockSmallRadarData.entries,
      { ...baseFilters, minTrl: 4, maxTrl: 6 },
      mockSmallRadarData,
    );
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((e) => e.trl != null && e.trl >= 4 && e.trl <= 6)).toBe(
      true,
    );
  });

  it("narrows by a contiguous time-to-mainstream range", () => {
    const range = ["0-2 yr", "2-5 yr"];
    const out = applyListFilters(
      mockSmallRadarData.entries,
      { ...baseFilters, timeToMainstream: range },
      mockSmallRadarData,
    );
    expect(out.length).toBeGreaterThan(0);
    expect(
      out.every(
        (e) => e.time_to_mainstream != null && range.includes(e.time_to_mainstream),
      ),
    ).toBe(true);
  });

  it("applies strategic relevance on the radar (isVisible)", () => {
    const high = mockSmallRadarData.entries.find(
      (e) => e.strategic_relevance === "High",
    );
    const notHigh = mockSmallRadarData.entries.find(
      (e) => e.strategic_relevance != null && e.strategic_relevance !== "High",
    );
    expect(high && notHigh).toBeTruthy();
    const filters = { ...baseFilters, strategicRelevance: ["High"] };
    expect(isVisible(high!, mockSmallRadarData, filters)).toBe(true);
    expect(isVisible(notHigh!, mockSmallRadarData, filters)).toBe(false);
  });

  it("applies the TRL range on the radar too (isVisible)", () => {
    const lowTrl = mockSmallRadarData.entries.find(
      (e) => e.trl != null && e.trl <= 2,
    );
    const highTrl = mockSmallRadarData.entries.find(
      (e) => e.trl != null && e.trl >= 8,
    );
    expect(lowTrl && highTrl).toBeTruthy();
    const filters = { ...baseFilters, minTrl: 7 };
    expect(isVisible(highTrl!, mockSmallRadarData, filters)).toBe(true);
    expect(isVisible(lowTrl!, mockSmallRadarData, filters)).toBe(false);
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
