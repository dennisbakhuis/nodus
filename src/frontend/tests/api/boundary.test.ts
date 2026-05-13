import { describe, expect, it } from "vitest";
import {
  BoundaryValidationError,
  parseRadarSnapshotResponse,
  parseTopicDetailResponse,
} from "../../src/api/boundary";

const VALID_RADAR = {
  radar: {
    title: "Nodus Technology Radar",
    cycle: "2026-Q1",
    generated_at: "2026-04-28T10:00:00Z",
  },
  cycle: {
    id: "00000000-0000-0000-0000-000000000001",
    name: "2026-Q1",
    start_date: "2026-01-01",
    end_date: null,
  },
  segments: [
    {
      id: "seg-1",
      name: "System Operations",
      slug: "system-operations",
      order: 1,
      theme_key: null,
      is_active: true,
    },
  ],
  rings: [{ id: 1, name: "Invest", order: 0 }],
  entries: [
    {
      id: "topic-1",
      topic_id: "topic-1",
      canonical_name: "Grid-Forming Inverters",
      slug: "grid-forming-inverters",
      technology_id: "tech-1",
      registry_status: "On Radar",
      segment_id: "seg-1",
      segment_name: "System Operations",
      segment_slug: "system-operations",
      ring: "Invest",
      ring_id: 1,
      summary: "Power electronics that …",
      last_updated: "2026-03-15",
      hero_image_url: null,
      peer_reference_count: 0,
      peer_references: [],
      persons: [],
      trl: 7,
      strategic_relevance: "High",
      time_to_mainstream: "0-2 yr",
      movement: "promoted",
    },
  ],
};

const VALID_TOPIC_DETAIL = {
  topic: {
    id: "topic-1",
    canonical_name: "Grid-Forming Inverters",
    slug: "grid-forming-inverters",
    not_for_external_publication: false,
    created_at: "2026-01-01T00:00:00Z",
  },
  technology: null,
  factsheet: null,
  assessment: null,
  aliases: [
    { id: "a1", topic_id: "topic-1", alias_name: "GFI" },
  ],
  peer_references: [],
  peer_reference_count: 0,
  hero_image_url: null,
};

describe("api/boundary", () => {
  describe("parseRadarSnapshotResponse", () => {
    it("accepts a well-formed radar response", () => {
      expect(() => parseRadarSnapshotResponse(VALID_RADAR)).not.toThrow();
    });

    it("accepts extra top-level keys (passthrough)", () => {
      const withExtra = { ...VALID_RADAR, future_field: 42 };
      expect(() => parseRadarSnapshotResponse(withExtra)).not.toThrow();
    });

    it("rejects a missing required top-level field", () => {
      const broken = { ...VALID_RADAR } as Record<string, unknown>;
      delete broken.cycle;
      expect(() => parseRadarSnapshotResponse(broken)).toThrow(
        BoundaryValidationError,
      );
    });

    it("rejects a wrong type on an entry", () => {
      const broken = JSON.parse(JSON.stringify(VALID_RADAR));
      broken.entries[0].ring_id = "not-a-number";
      expect(() => parseRadarSnapshotResponse(broken)).toThrow(
        BoundaryValidationError,
      );
    });

    it("includes the offending path in the error message", () => {
      const broken = JSON.parse(JSON.stringify(VALID_RADAR));
      broken.entries[0].peer_references = "not-an-array";
      try {
        parseRadarSnapshotResponse(broken);
        expect.fail("expected throw");
      } catch (e) {
        expect(e).toBeInstanceOf(BoundaryValidationError);
        const err = e as BoundaryValidationError;
        expect(err.message).toContain("entries.0.peer_references");
      }
    });
  });

  describe("parseTopicDetailResponse", () => {
    it("accepts a well-formed topic-detail response", () => {
      expect(() => parseTopicDetailResponse(VALID_TOPIC_DETAIL)).not.toThrow();
    });

    it("accepts a payload missing visibility-stripped optional fields", () => {
      // PublicReader caller — `recent_events`, `persons`, `created_by` are
      // stripped by apply_field_visibility before the response leaves the
      // server.
      const stripped = { ...VALID_TOPIC_DETAIL };
      delete (stripped as Record<string, unknown>).recent_events;
      delete (stripped as Record<string, unknown>).persons;
      delete (stripped as Record<string, unknown>).created_by;
      expect(() => parseTopicDetailResponse(stripped)).not.toThrow();
    });

    it("rejects a missing required `topic.canonical_name`", () => {
      const broken = JSON.parse(JSON.stringify(VALID_TOPIC_DETAIL));
      delete broken.topic.canonical_name;
      expect(() => parseTopicDetailResponse(broken)).toThrow(
        BoundaryValidationError,
      );
    });

    it("error includes endpoint name", () => {
      const broken = JSON.parse(JSON.stringify(VALID_TOPIC_DETAIL));
      broken.peer_reference_count = "many";
      try {
        parseTopicDetailResponse(broken);
        expect.fail("expected throw");
      } catch (e) {
        const err = e as BoundaryValidationError;
        expect(err.endpoint).toBe("GET /api/topics/{slug}");
        expect(err.issues.length).toBeGreaterThan(0);
      }
    });
  });
});
