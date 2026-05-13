import { describe, expect, it } from "vitest";
import {
  CSV_COLUMNS,
  buildRow,
  csvFilename,
  entriesToCsv,
} from "../../../src/radar/dataExport/csv";
import type { RadarData, RadarEntry } from "../../../src/radar/types";

function entry(overrides: Partial<RadarEntry> = {}): RadarEntry {
  return {
    id: "e1",
    topic_id: "t1",
    canonical_name: "Smart Grid",
    slug: "smart-grid",
    technology_id: "tech-1",
    registry_status: "On Radar",
    segment_id: "seg-1",
    segment_name: "System Operations",
    segment_slug: "system-operations",
    ring: "Pilot",
    ring_id: 2,
    summary: "Lightweight summary",
    last_updated: "2026-04-01",
    hero_image_url: null,
    peer_reference_count: 0,
    peer_references: [],
    persons: [],
    trl: 6,
    strategic_relevance: "High",
    time_to_mainstream: "2-5 yr",
    movement: "promoted",
    not_for_external_publication: false,
    ...overrides,
  } as RadarEntry;
}

describe("CSV serializer", () => {
  it("emits header in declared column order", () => {
    const csv = entriesToCsv([entry()]);
    const firstLine = csv.split("\r\n")[0];
    expect(firstLine).toBe(CSV_COLUMNS.join(","));
  });

  it("escapes embedded commas, quotes, and newlines", () => {
    const csv = entriesToCsv([
      entry({
        canonical_name: 'Tech "Alpha", v2',
        summary: "Line one\nLine two",
      }),
    ]);
    expect(csv).toContain('"Tech ""Alpha"", v2"');
    expect(csv).toContain('"Line one\nLine two"');
  });

  it("joins multiple persons with semicolons and roles", () => {
    const row = buildRow(
      entry({
        persons: [
          { link_role: "owner", person: { id: "p1", full_name: "Ada Lovelace" } },
          { link_role: "contributor", person: { id: "p2", full_name: "Linus Torvalds" } },
        ],
      } as Partial<RadarEntry>),
    );
    expect(row.persons).toBe("Ada Lovelace (owner); Linus Torvalds (contributor)");
  });

  it("emits empty cells for null fields, not the string 'null'", () => {
    const row = buildRow(
      entry({
        segment_name: null,
        ring: null,
        movement: null,
        registry_status: null,
        strategic_relevance: null,
        time_to_mainstream: null,
        trl: null,
        summary: null,
        hero_image_url: null,
        last_updated: null,
      }),
    );
    expect(row.segment_name).toBe("");
    expect(row.trl).toBe("");
    expect(row.summary).toBe("");
  });

  it("derives a filename from the cycle", () => {
    const data = { radar: { cycle: "2026-Q2", title: "x", generated_at: "" } } as RadarData;
    expect(csvFilename(data)).toBe("nodus-radar-2026-Q2.csv");
  });

  it("falls back to 'current' when cycle is missing", () => {
    const data = { radar: { cycle: null, title: "x", generated_at: "" } } as RadarData;
    expect(csvFilename(data)).toBe("nodus-radar-current.csv");
  });
});
