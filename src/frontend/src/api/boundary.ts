/**
 * Runtime validation at the API boundary.
 *
 * The TypeScript types in ``generated.ts`` lock the *compile-time* contract;
 * this module locks the *runtime* contract. A backend regression that
 * silently changes the response shape — a column rename, an Optional flip,
 * a new required field — used to fly straight through to consumers as a
 * confusing crash deep in the UI tree. Now it fails at the fetch site with
 * a clear error pointing at the offending path.
 *
 * The parsers are intentionally permissive on extra keys (``passthrough``)
 * so a backend addition doesn't break a frontend that hasn't regenerated
 * its types — the strict requirement is that every field declared in
 * generated.ts is actually present and well-typed.
 *
 * Two boundaries are validated:
 *
 * - ``parseTopicDetailResponse`` — every call to ``GET /api/topics/{slug}``.
 * - ``parseRadarSnapshotResponse`` — every call to ``GET /api/radar/current``.
 *
 * Other endpoints continue to use the typed-cast pattern; widen this module
 * if a regression slips through one of those.
 */

import { z } from "zod";

const PersonReadPublicSchema = z.object({
  id: z.string(),
  full_name: z.string(),
  company: z.string(),
  department: z.string().nullable(),
  role: z.string().nullable(),
});

const PeerReferenceSummarySchema = z.object({
  id: z.string(),
  topic_id: z.string(),
  party_id: z.string(),
  party_name: z.string(),
  party_slug: z.string(),
  peer_title: z.string(),
  peer_ring_label: z.string().nullable(),
  peer_segment_label: z.string().nullable(),
  summary: z.string().nullable(),
});

const RadarMetaSchema = z.object({
  title: z.string(),
  cycle: z.string().nullable(),
  generated_at: z.string(),
});

const RadarCycleInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  start_date: z.string(),
  end_date: z.string().nullable(),
  color: z.string().nullable().optional().default(null),
});

const RadarSegmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  order: z.number(),
  theme_key: z.string().nullable().optional().default(null),
  is_active: z.boolean().optional().default(true),
});

const RadarRingSchema = z.object({
  id: z.number(),
  name: z.string(),
  order: z.number(),
});

const RadarPersonLinkSchema = z.object({
  link_role: z.string(),
  person: PersonReadPublicSchema,
});

const RadarEntrySchema = z
  .object({
    id: z.string(),
    topic_id: z.string(),
    canonical_name: z.string(),
    slug: z.string(),
    // Nullable for "candidate" rows (topics without a Technology yet) that
    // the list view merges in alongside real radar entries.
    technology_id: z.string().nullable(),
    registry_status: z.string().nullable(),
    segment_id: z.string().nullable(),
    segment_name: z.string().nullable(),
    segment_slug: z.string().nullable(),
    ring: z.string().nullable(),
    ring_id: z.number().nullable(),
    summary: z.string().nullable(),
    last_updated: z.string().nullable(),
    hero_image_url: z.string().nullable(),
    peer_reference_count: z.number(),
    peer_references: z.array(PeerReferenceSummarySchema),
    persons: z.array(RadarPersonLinkSchema).nullable().optional(),
    trl: z.number().nullable(),
    strategic_relevance: z.string().nullable(),
    time_to_mainstream: z.string().nullable(),
    movement: z.string().nullable(),
    not_for_external_publication: z.boolean().optional().default(false),
  })
  .passthrough();

const RadarSnapshotResponseSchema = z
  .object({
    radar: RadarMetaSchema,
    cycle: RadarCycleInfoSchema.nullable(),
    segments: z.array(RadarSegmentSchema),
    rings: z.array(RadarRingSchema),
    entries: z.array(RadarEntrySchema),
  })
  .passthrough();

const TopicReadSchema = z
  .object({
    id: z.string(),
    canonical_name: z.string(),
    slug: z.string(),
    not_for_external_publication: z.boolean(),
    created_at: z.string(),
    technology_id: z.string().nullable().optional(),
    registry_status: z.string().nullable().optional(),
    current_ring: z.string().nullable().optional(),
    current_segment_id: z.string().nullable().optional(),
  })
  .passthrough();

const TopicDetailAssessmentSchema = z
  .object({
    id: z.string(),
    factsheet_id: z.string(),
    trl: z.number().nullable(),
    strategic_relevance: z.string().nullable(),
    impact_potential: z.string().nullable(),
    implementation_feasibility: z.string().nullable(),
    time_to_mainstream: z.string().nullable(),
    collaboration_potential: z.string().nullable(),
    created_at: z.string(),
  })
  .passthrough();

const TopicDetailPersonRowSchema = z.object({
  link_id: z.string(),
  link_role: z.string(),
  person: z
    .object({
      id: z.string(),
      full_name: z.string(),
      company: z.string(),
      department: z.string().nullable(),
      role: z.string().nullable(),
    })
    .passthrough(),
});

const AliasReadSchema = z
  .object({
    id: z.string(),
    topic_id: z.string(),
    alias_name: z.string(),
  })
  .passthrough();

const MovementEventReadSchema = z
  .object({
    id: z.string(),
    technology_id: z.string(),
    event_type: z.string(),
    rationale: z.string(),
    timestamp: z.string(),
  })
  .passthrough();

const TopicDetailResponseSchema = z
  .object({
    topic: TopicReadSchema,
    technology: z.unknown().nullable().optional(),
    factsheet: z.unknown().nullable().optional(),
    assessment: TopicDetailAssessmentSchema.nullable().optional(),
    aliases: z.array(AliasReadSchema),
    recent_events: z.array(MovementEventReadSchema).optional(),
    peer_references: z.array(
      z
        .object({
          id: z.string(),
          topic_id: z.string(),
          party_id: z.string(),
          party_name: z.string(),
          party_slug: z.string(),
          peer_title: z.string(),
        })
        .passthrough(),
    ),
    peer_reference_count: z.number(),
    persons: z.array(TopicDetailPersonRowSchema).optional(),
    hero_image_url: z.string().nullable(),
    created_by: z
      .object({
        id: z.string(),
        username: z.string(),
        full_name: z.string(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();

/** Wraps a Zod parse error in the API client's existing ApiError shape. */
export class BoundaryValidationError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly issues: z.ZodIssue[],
  ) {
    const summary = issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    super(`Response shape mismatch on ${endpoint}: ${summary}`);
    this.name = "BoundaryValidationError";
  }
}

function _parse<T>(schema: z.ZodType<T>, endpoint: string, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new BoundaryValidationError(endpoint, result.error.issues);
  }
  return result.data;
}

export function parseTopicDetailResponse(raw: unknown): unknown {
  // Returns the parsed object retyped at the call site via the existing
  // TypeScript type — we only assert runtime shape, not narrow further.
  return _parse(TopicDetailResponseSchema, "GET /api/topics/{slug}", raw);
}

export function parseRadarSnapshotResponse(raw: unknown): unknown {
  return _parse(RadarSnapshotResponseSchema, "GET /api/radar/current", raw);
}
