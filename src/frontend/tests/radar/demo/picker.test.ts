import { describe, expect, it } from "vitest";
import { pickNextEntry } from "../../../src/radar/demo/useDemoPresentation";
import { mockSmallRadarData } from "../../../src/radar/__fixtures__/mockRadarData";
import type { FilterState } from "../../../src/radar/types";

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

describe("pickNextEntry", () => {
  it("returns null when data is null", () => {
    expect(pickNextEntry(null, baseFilters, null, [], null)).toBeNull();
  });

  it("returns null when no entries match the active filter", () => {
    const out = pickNextEntry(
      mockSmallRadarData,
      { ...baseFilters, search: "this-string-matches-nothing-zzzz" },
      null,
      [],
      null,
    );
    expect(out).toBeNull();
  });

  it("only picks entries that survive the visibility filter", () => {
    const ring = "Invest" as const;
    const seen = new Set<string>();
    for (let i = 0; i < 60; i += 1) {
      const out = pickNextEntry(
        mockSmallRadarData,
        { ...baseFilters, rings: [ring] },
        null,
        [],
        null,
      );
      if (out) seen.add(out.id);
    }
    expect(seen.size).toBeGreaterThan(0);
    for (const id of seen) {
      const entry = mockSmallRadarData.entries.find((e) => e.id === id);
      expect(entry?.ring).toBe(ring);
    }
  });

  it("avoids the current entry and entries in the recent-set when fresh picks exist", () => {
    const recent = mockSmallRadarData.entries.slice(0, 5).map((e) => e.id);
    const current = mockSmallRadarData.entries[5] ?? null;
    for (let i = 0; i < 50; i += 1) {
      const out = pickNextEntry(
        mockSmallRadarData,
        baseFilters,
        null,
        recent,
        current,
      );
      expect(out).not.toBeNull();
      if (out) {
        expect(recent).not.toContain(out.id);
        expect(out.id).not.toBe(current?.id);
      }
    }
  });

  it("falls back to the visible set when every visible entry is in the recent-set", () => {
    const ring = "Invest" as const;
    const visible = mockSmallRadarData.entries.filter((e) => e.ring === ring);
    const recent = visible.map((e) => e.id);
    const out = pickNextEntry(
      mockSmallRadarData,
      { ...baseFilters, rings: [ring] },
      null,
      recent,
      null,
    );
    expect(out).not.toBeNull();
    if (out) {
      expect(visible.map((e) => e.id)).toContain(out.id);
    }
  });

  it("restricts picks to the focused segment when focus mode is active", () => {
    const focusedIdx = 1;
    const sorted = [...mockSmallRadarData.segments].sort(
      (a, b) => a.order - b.order,
    );
    const focusedSegId = sorted[focusedIdx]?.id;
    expect(focusedSegId).toBeDefined();
    for (let i = 0; i < 50; i += 1) {
      const out = pickNextEntry(
        mockSmallRadarData,
        baseFilters,
        focusedIdx,
        [],
        null,
      );
      expect(out).not.toBeNull();
      if (out) expect(out.segment_id).toBe(focusedSegId);
    }
  });
});
