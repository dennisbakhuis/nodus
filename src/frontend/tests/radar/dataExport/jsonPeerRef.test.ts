import { describe, expect, it } from "vitest";
import {
  buildPeerRefExport,
  peerRefExportFilename,
  type PeerRefExportSource,
} from "../../../src/radar/dataExport/jsonPeerRef";
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
    persons: [
      { link_role: "owner", person: { id: "p1", full_name: "Ada Lovelace" } },
    ],
    trl: 6,
    strategic_relevance: "High",
    time_to_mainstream: "2-5 yr",
    movement: "promoted",
    not_for_external_publication: false,
    ...overrides,
  } as RadarEntry;
}

const SOURCE: PeerRefExportSource = {
  party_name: "Acme Energy",
  party_slug: "acme-energy",
  party_url: null,
  source_name: "acme-radar-2026",
  source_url: "https://radar.acme.example/",
};

const data: RadarData = {
  radar: { title: "Acme Radar", cycle: "2026-Q1", generated_at: "" },
  cycle: null,
  segments: [],
  rings: [],
  entries: [],
} as unknown as RadarData;

describe("Peer-reference JSON export", () => {
  it("excludes entries flagged not_for_external_publication", () => {
    const result = buildPeerRefExport(
      data,
      [entry({ slug: "ok" }), entry({ slug: "secret", not_for_external_publication: true })],
      SOURCE,
    );
    expect(result.envelope.topics).toHaveLength(1);
    expect(result.envelope.topics[0]!.slug).toBe("ok");
    expect(result.privateExcluded).toBe(1);
  });

  it("drops persons, trl, strategic_relevance from each topic", () => {
    const result = buildPeerRefExport(data, [entry()], SOURCE);
    const topic = result.envelope.topics[0]! as Record<string, unknown>;
    expect(topic.persons).toBeUndefined();
    expect(topic.trl).toBeUndefined();
    expect(topic.strategic_relevance).toBeUndefined();
    expect(topic.notes).toBeUndefined();
  });

  it("maps ring/segment to peer_ring_label/peer_segment_label", () => {
    const result = buildPeerRefExport(data, [entry()], SOURCE);
    const t = result.envelope.topics[0]!;
    expect(t.peer_title).toBe("Smart Grid");
    expect(t.peer_ring_label).toBe("Pilot");
    expect(t.peer_segment_label).toBe("System Operations");
    expect(t.peer_time_to_mainstream_label).toBe("2-5 yr");
  });

  it("synthesizes a topic URL when source_url is provided", () => {
    const result = buildPeerRefExport(data, [entry({ slug: "demand-response" })], SOURCE);
    const urls = result.envelope.topics[0]!.urls;
    expect(urls).toHaveLength(1);
    expect(urls[0]!.url).toBe("https://radar.acme.example/topic/demand-response");
    expect(urls[0]!.display_order).toBe(0);
  });

  it("emits empty urls list when source_url is missing", () => {
    const result = buildPeerRefExport(data, [entry()], { ...SOURCE, source_url: null });
    expect(result.envelope.topics[0]!.urls).toHaveLength(0);
  });

  it("envelope advertises format and version", () => {
    const result = buildPeerRefExport(data, [entry()], SOURCE);
    expect(result.envelope.format).toBe("nodus-peer-reference");
    expect(result.envelope.version).toBe("1.0");
    expect(typeof result.envelope.exported_at).toBe("string");
  });

  it("filename uses the cycle", () => {
    expect(peerRefExportFilename(data)).toBe("nodus-radar-2026-Q1-peer-ref.json");
  });
});
