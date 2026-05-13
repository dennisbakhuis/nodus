/**
 * Radar shared types.
 *
 * Wire-shape types are sourced from `api/generated.ts` (the OpenAPI-generated
 * types) so the radar response stays in lockstep with the backend Pydantic
 * schemas.
 *
 * UI-only types that have no wire counterpart (DotDatum, ArcDatum,
 * ColorMode, ShapeMode, ViewMode, FilterState, …) live below — they describe
 * derived or interaction state, not anything the server returns.
 */

import type {
  Ring,
  RegistryStatus,
  RadarSegment as RadarSegmentSchema,
  RadarRing as RadarRingSchema,
  RadarMeta as RadarMetaSchema,
  RadarEntry as RadarEntrySchema,
  RadarSnapshotResponse as RadarSnapshotResponseSchema,
  PeerReferenceSummary as PeerReferenceSummarySchema,
  PersonReadPublic,
  RadarPersonLink,
} from "../api/generated/types.gen";

// --- Wire-shape re-exports (source: app/schemas/radar.py) ----------------

export type RingName = Ring;
export type RegistryStatusName = RegistryStatus;
export type RadarSegment = RadarSegmentSchema;
export type RadarRing = RadarRingSchema;
export type RadarMeta = RadarMetaSchema;
export type RadarEntry = RadarEntrySchema;
export type RadarSnapshotResponse = RadarSnapshotResponseSchema;
export type PeerReferenceSummary = PeerReferenceSummarySchema;
export type PersonPublic = PersonReadPublic;
export type PersonLink = RadarPersonLink;

/**
 * Legacy alias for `RadarSnapshotResponse` — kept because consumers still
 * import `RadarData`. New code should import the generated name directly.
 */
export type RadarData = RadarSnapshotResponseSchema;

// --- Frontend-only types -------------------------------------------------

/**
 * The wire's ``movement`` field is plain ``string`` in the generated schema
 * (Pydantic doesn't enforce a Literal here yet); this union keeps the
 * five-value methodology vocabulary at hand for narrowing in the radar UI.
 */
export type MovementStatus =
  | "new"
  | "promoted"
  | "demoted"
  | "unchanged"
  | "removed";

export type DotDatum = RadarEntry & {
  x: number;
  y: number;
  segmentIndex: number;
  ringIndex: number;
  color: string;
  labelX: number;
  labelY: number;
};

export type ArcDatum = RadarEntry & {
  angle: number;
  arcX: number;
  arcY: number;
  segmentIndex: number;
  color: string;
};

export type ViewMode = "radar" | "list";

export type ColorMode =
  | "segment"
  | "ring"
  | "trl"
  | "ttm"
  | "relevance"
  | "movement";

export const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  segment: "Segment",
  ring: "Ring tier",
  trl: "TRL",
  ttm: "Time to mainstream",
  relevance: "Strategic relevance",
  movement: "Movement",
};

export type ShapeMode = "dot" | "movement";

export const SHAPE_MODE_LABELS: Record<ShapeMode, string> = {
  dot: "Dot",
  movement: "Movement",
};

export type FilterState = {
  segments: string[];
  rings: RingName[];
  movements: MovementStatus[];
  search: string;
  strategicRelevance: string[];
  minTrl: number | null;
  registryStatuses: RegistryStatusName[];
  hasFactsheet: boolean | null;
  hasPeerRefs: boolean | null;
  timeToMainstream: string[];
  personIds: string[];
  /** Writer-only list-view toggle: restrict to topics without a Technology. */
  candidatesOnly: boolean;
  /** Writer-only list-view filter on the Topic visibility flag. */
  visibility: "all" | "public" | "private";
};

export type TopicRelation = {
  id: string;
  from_topic_id: string;
  to_topic_id: string;
  relation_type: string;
  created_at: string;
};

export type TechnologyRelation = TopicRelation;
