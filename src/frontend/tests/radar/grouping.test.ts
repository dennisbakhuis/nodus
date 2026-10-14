import { describe, expect, it } from "vitest";
import { applyListFilters, isVisible } from "../../src/radar/filtering";
import { matchesGroup } from "../../src/radar/types";
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
  groupIds: [],
};

describe("matchesGroup", () => {
  it("is a no-op when no group is selected", () => {
    expect(matchesGroup({ topic_id: "x" }, [])).toBe(true);
  });

  it("matches the group node itself", () => {
    expect(matchesGroup({ topic_id: "gen", ancestor_path: [] }, ["gen"])).toBe(
      true,
    );
  });

  it("matches descendants via ancestor_path", () => {
    expect(
      matchesGroup({ topic_id: "mas", ancestor_path: ["gen", "agents"] }, ["gen"]),
    ).toBe(true);
  });

  it("excludes unrelated entries", () => {
    expect(
      matchesGroup({ topic_id: "other", ancestor_path: ["foo"] }, ["gen"]),
    ).toBe(false);
  });

  it("unions several selected groups", () => {
    expect(
      matchesGroup({ topic_id: "spot", ancestor_path: ["robots"] }, ["gen", "robots"]),
    ).toBe(true);
    expect(
      matchesGroup({ topic_id: "other", ancestor_path: ["foo"] }, ["gen", "robots"]),
    ).toBe(false);
  });
});

describe("group filter in list + radar", () => {
  const e0 = mockSmallRadarData.entries[0]!;
  const e1 = mockSmallRadarData.entries[1]!;
  const e2 = mockSmallRadarData.entries[2]!;
  // e0 is the group root; e1 is a descendant; e2 is unrelated.
  const entries = [
    { ...e0, ancestor_path: [] as string[] },
    { ...e1, ancestor_path: [e0.topic_id] },
    { ...e2, ancestor_path: [] as string[] },
  ];
  const data = { ...mockSmallRadarData, entries };

  it("list keeps the group and its descendants only", () => {
    const out = applyListFilters(
      entries,
      { ...baseFilters, groupIds: [e0.topic_id] },
      data,
    );
    const ids = out.map((e) => e.topic_id).sort();
    expect(ids).toEqual([e0.topic_id, e1.topic_id].sort());
  });

  it("radar isVisible dims non-members", () => {
    expect(isVisible(entries[0]!, data, { ...baseFilters, groupIds: [e0.topic_id] })).toBe(
      true,
    );
    expect(isVisible(entries[1]!, data, { ...baseFilters, groupIds: [e0.topic_id] })).toBe(
      true,
    );
    expect(isVisible(entries[2]!, data, { ...baseFilters, groupIds: [e0.topic_id] })).toBe(
      false,
    );
  });

  it("no selected group leaves everything visible", () => {
    const out = applyListFilters(entries, baseFilters, data);
    expect(out).toHaveLength(3);
  });
});
