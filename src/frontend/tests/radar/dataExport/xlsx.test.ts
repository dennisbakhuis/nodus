import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  PEER_REF_COLUMNS,
  entriesToWorkbook,
  workbookToBlob,
  xlsxFilename,
} from "../../../src/radar/dataExport/xlsx";
import { CSV_COLUMNS } from "../../../src/radar/dataExport/csv";
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
    summary: "Summary",
    last_updated: "2026-04-01",
    hero_image_url: null,
    peer_reference_count: 1,
    peer_references: [
      {
        id: "pr1",
        topic_id: "t1",
        party_id: "pa1",
        party_name: "Peer Co",
        party_slug: "peer-co",
        peer_title: "Grid edge stuff",
        peer_ring_label: "Adopt",
        peer_segment_label: "Electrification",
        summary: "From peer radar",
      },
    ],
    persons: [],
    trl: 6,
    strategic_relevance: "High",
    time_to_mainstream: "2-5 yr",
    movement: "promoted",
    not_for_external_publication: false,
    ...overrides,
  } as RadarEntry;
}

describe("XLSX serializer", () => {
  it("creates Entries and PeerReferences sheets", () => {
    const wb = entriesToWorkbook([entry()], "Acme Radar", "2026-Q1");
    expect(wb.SheetNames).toContain("Entries");
    expect(wb.SheetNames).toContain("PeerReferences");
  });

  it("Entries sheet has all CSV columns in the header row", () => {
    const wb = entriesToWorkbook([entry()], "Acme Radar", "2026-Q1");
    const sheet = wb.Sheets["Entries"]!;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    expect(rows).toHaveLength(1);
    for (const col of CSV_COLUMNS) {
      expect(Object.keys(rows[0]!)).toContain(col);
    }
  });

  it("PeerReferences sheet has one row per (topic, peer) pair", () => {
    const wb = entriesToWorkbook(
      [
        entry({
          canonical_name: "T1",
          slug: "t1",
          peer_references: [
            {
              id: "p1",
              topic_id: "t1",
              party_id: "a",
              party_name: "Party A",
              party_slug: "a",
              peer_title: "A's view",
              peer_ring_label: null,
              peer_segment_label: null,
              summary: null,
            },
            {
              id: "p2",
              topic_id: "t1",
              party_id: "b",
              party_name: "Party B",
              party_slug: "b",
              peer_title: "B's view",
              peer_ring_label: null,
              peer_segment_label: null,
              summary: null,
            },
          ],
        }),
        entry({ canonical_name: "T2", slug: "t2", peer_references: [] }),
      ],
      "Acme",
      "X",
    );
    const sheet = wb.Sheets["PeerReferences"]!;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.topic_canonical_name).toBe("T1");
    expect(rows[1]!.party_name).toBe("Party B");
    for (const col of PEER_REF_COLUMNS) {
      expect(Object.keys(rows[0]!)).toContain(col);
    }
  });

  it("workbookToBlob returns an .xlsx-shaped Blob (PK magic)", () => {
    const wb = entriesToWorkbook([entry()], "Acme", "2026-Q1");
    const blob = workbookToBlob(wb);
    expect(blob.type).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const buf = new Uint8Array(
      XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
    );
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });

  it("filename uses the cycle", () => {
    const data = { radar: { cycle: "2026-Q1", title: "x", generated_at: "" } } as RadarData;
    expect(xlsxFilename(data)).toBe("nodus-radar-2026-Q1.xlsx");
  });
});
