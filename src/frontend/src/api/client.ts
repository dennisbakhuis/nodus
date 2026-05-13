import type {
  TechnologyRead,
  TechnologyUpdate,
  AliasCreate,
  AliasRead,
  FactsheetCreate,
  FactsheetRead,
  // TriageRequest intentionally absent — Nomination model removed.
  CycleCreate,
  CycleRead,
  CycleCloseRequest,
  MovementEventRead,
  HealthResponse,
  TopicRead,
  TopicCreate,
  TopicUpdate,
  TopicCreateResponse,
  PeerReferenceRead,
  PeerReferenceCreate,
  PeerReferenceUpdate,
  PeerReferenceUrlCreate,
  PeerReferenceUrlRead,
  PersonCreate,
  PersonReadManagement,
  PersonUpdate,
  PersonLinkRole,
  TopicPersonLinkCreate,
  TopicPersonLinkManagementRead,
  MediaAssetRead,
  ListTopicsApiTopicsGetData,
  RadarCurrentApiRadarCurrentGetData,
  ListPersonsApiManagePersonsGetData,
} from "./generated/types.gen";

export type {
  TechnologyRead,
  TechnologyUpdate,
  AliasCreate,
  AliasRead,
  FactsheetCreate,
  FactsheetRead,
  CycleCreate,
  CycleRead,
  CycleCloseRequest,
  MovementEventRead,
  HealthResponse,
  TopicRead,
  TopicCreate,
  TopicUpdate,
  TopicCreateResponse,
  PeerReferenceRead,
  PeerReferenceCreate,
  PeerReferenceUpdate,
  PeerReferenceUrlCreate,
  PeerReferenceUrlRead,
  PersonCreate,
  PersonReadManagement,
  PersonUpdate,
  PersonLinkRole,
  TopicPersonLinkCreate,
  TopicPersonLinkManagementRead,
  MediaAssetRead,
};

type ListTopicsParams = NonNullable<ListTopicsApiTopicsGetData["query"]>;
type RadarCurrentParams = NonNullable<
  RadarCurrentApiRadarCurrentGetData["query"]
>;
type ListPersonsParams = NonNullable<
  ListPersonsApiManagePersonsGetData["query"]
>;

export type RadarCurrentResponse = { [key: string]: unknown };

const BASE_URL = "/api";

import {
  AUTH_INVALID_EVENT_NAME,
  TOKEN_STORAGE_KEY,
  buildAuthHeaders,
  notifyAuthInvalid,
} from "../shared/tokenStore";
import { parseTopicDetailResponse } from "./boundary";

/** Re-exported for back-compat with consumers that imported these names directly. */
export const AUTH_TOKEN_KEY = TOKEN_STORAGE_KEY;
export const AUTH_INVALID_EVENT = AUTH_INVALID_EVENT_NAME;

class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(init?.headers),
    },
    ...init,
  });

  if (response.status === 401) {
    notifyAuthInvalid();
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      `API error ${response.status}: ${response.statusText}`,
    );
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return response.json() as Promise<T>;
}

function buildQuery(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, v]) => v != null);
  if (entries.length === 0) return "";
  const qs = entries
    .map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
    )
    .join("&");
  return `?${qs}`;
}

export function updateTechnology(
  id: string,
  data: TechnologyUpdate,
): Promise<TechnologyRead> {
  return request<TechnologyRead>(`/technologies/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function addAlias(
  topicId: string,
  data: AliasCreate,
): Promise<AliasRead> {
  return request<AliasRead>(`/topics/${encodeURIComponent(topicId)}/aliases`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function removeAlias(topicId: string, aliasId: string): Promise<void> {
  return request<void>(
    `/topics/${encodeURIComponent(topicId)}/aliases/${encodeURIComponent(aliasId)}`,
    { method: "DELETE" },
  );
}

export function createFactsheet(
  techId: string,
  data: FactsheetCreate,
): Promise<FactsheetRead> {
  return request<FactsheetRead>(
    `/technologies/${encodeURIComponent(techId)}/factsheet`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

export function listFactsheets(techId: string): Promise<FactsheetRead[]> {
  return request<FactsheetRead[]>(
    `/technologies/${encodeURIComponent(techId)}/factsheets`,
  );
}

export function getFactsheet(
  techId: string,
  version: number,
): Promise<FactsheetRead> {
  return request<FactsheetRead>(
    `/technologies/${encodeURIComponent(techId)}/factsheets/${encodeURIComponent(String(version))}`,
  );
}

export function listCycles(): Promise<CycleRead[]> {
  return request<CycleRead[]>("/cycles");
}

export function createCycle(data: CycleCreate): Promise<CycleRead> {
  return request<CycleRead>("/cycles", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function closeCycle(
  id: string,
  data?: CycleCloseRequest,
): Promise<CycleRead> {
  return request<CycleRead>(`/cycles/${encodeURIComponent(id)}/close`, {
    method: "POST",
    body: JSON.stringify(data ?? {}),
  });
}

export function getCycle(id: string): Promise<CycleRead> {
  return request<CycleRead>(`/cycles/${encodeURIComponent(id)}`);
}

export function getRadar(
  params?: RadarCurrentParams,
): Promise<RadarCurrentResponse> {
  return request<RadarCurrentResponse>(
    `/radar/current${buildQuery(params ?? {})}`,
  );
}

export function getDeliverable(
  cycleId: string,
  type: "radar.json" | "summary.md" | "detailed.md" | "delta.md",
): Promise<unknown> {
  return request<unknown>(
    `/cycles/${encodeURIComponent(cycleId)}/deliverables/${type}`,
  );
}

export function getMovements(techId: string): Promise<MovementEventRead[]> {
  return request<MovementEventRead[]>(
    `/technologies/${encodeURIComponent(techId)}/movements`,
  );
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

export function listTopics(filters?: ListTopicsParams): Promise<TopicRead[]> {
  return request<TopicRead[]>(`/topics${buildQuery(filters ?? {})}`);
}

/** Per-topic Assessment payload as returned in the topic-detail response.
 *
 * The route emits Pydantic-validated AssessmentRead but that schema is not
 * exposed via response_model so it doesn't appear in generated.ts. Hand-typed
 * here to mirror app/schemas/assessment.py. */
export type TopicDetailAssessment = {
  id: string;
  factsheet_id: string;
  trl: number | null;
  trl_notes: string | null;
  strategic_relevance: string | null;
  strategic_relevance_notes: string | null;
  impact_potential: string | null;
  impact_potential_notes: string | null;
  implementation_feasibility: string | null;
  implementation_feasibility_notes: string | null;
  time_to_mainstream: string | null;
  time_to_mainstream_notes: string | null;
  collaboration_potential: string | null;
  collaboration_potential_notes: string | null;
  created_at: string;
};

/** Public-facing person view (PII-filtered) — mirrors PersonReadPublic. */
export type TopicDetailPerson = {
  id: string;
  full_name: string;
  company: string;
  department: string | null;
  role: string | null;
};

export type TopicDetailPeerReference = {
  id: string;
  topic_id: string;
  party_id: string;
  party_name: string;
  party_slug: string;
  peer_title: string;
  peer_ring_label: string | null;
  peer_segment_label: string | null;
  summary: string | null;
};

/** Composite shape returned by GET /api/topics/{slug}.
 *
 * The backend route is typed as `dict[str, object]` and applies field-level
 * visibility filtering, so several fields can be stripped entirely depending
 * on the caller's role. Sub-shapes use generated schemas where exposed and
 * hand-typed ones for those not yet attached to a response_model.
 */
export type TopicDetailResponse = {
  topic: TopicRead;
  technology: TechnologyRead | null;
  factsheet: FactsheetRead | null;
  assessment: TopicDetailAssessment | null;
  aliases: AliasRead[];
  /** Reader/Writer/Admin only — stripped for PublicReader. */
  recent_events?: MovementEventRead[];
  peer_references: TopicDetailPeerReference[];
  peer_reference_count: number;
  /** Reader/Writer/Admin only — stripped for PublicReader. */
  persons?: { link_id: string; link_role: string; person: TopicDetailPerson }[];
  hero_image_url: string | null;
  /** Reader/Writer/Admin only — stripped for PublicReader. */
  created_by?: { id: string; username: string; full_name: string } | null;
};

export async function getTopic(slug: string): Promise<TopicDetailResponse> {
  const raw = await request<unknown>(`/topics/${encodeURIComponent(slug)}`);
  // Zod validates the shape at the boundary; a backend regression that
  // changes the response shape now fails here with a clear message rather
  // than crashing somewhere deep in the topic-detail tree.
  return parseTopicDetailResponse(raw) as TopicDetailResponse;
}

export function createTopic(data: TopicCreate): Promise<TopicCreateResponse> {
  return request<TopicCreateResponse>("/topics", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateTopic(
  topicId: string,
  data: TopicUpdate,
): Promise<TopicRead> {
  return request<TopicRead>(`/topics/${encodeURIComponent(topicId)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function listPeerReferences(
  topicId: string,
): Promise<PeerReferenceRead[]> {
  return request<PeerReferenceRead[]>(
    `/manage/topics/${encodeURIComponent(topicId)}/peer-references`,
  );
}

export function createPeerReference(
  topicId: string,
  data: PeerReferenceCreate,
): Promise<PeerReferenceRead> {
  return request<PeerReferenceRead>(
    `/manage/topics/${encodeURIComponent(topicId)}/peer-references`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

export function updatePeerReference(
  topicId: string,
  peerRefId: string,
  data: PeerReferenceUpdate,
): Promise<PeerReferenceRead> {
  return request<PeerReferenceRead>(
    `/manage/topics/${encodeURIComponent(topicId)}/peer-references/${encodeURIComponent(peerRefId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    },
  );
}

export function addPeerReferenceUrl(
  topicId: string,
  peerRefId: string,
  data: PeerReferenceUrlCreate,
): Promise<PeerReferenceUrlRead> {
  return request<PeerReferenceUrlRead>(
    `/manage/topics/${encodeURIComponent(topicId)}/peer-references/${encodeURIComponent(peerRefId)}/urls`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

export function removePeerReferenceUrl(
  topicId: string,
  peerRefId: string,
  urlId: string,
): Promise<void> {
  return request<void>(
    `/manage/topics/${encodeURIComponent(topicId)}/peer-references/${encodeURIComponent(peerRefId)}/urls/${encodeURIComponent(urlId)}`,
    { method: "DELETE" },
  );
}

export function listPersons(
  params?: ListPersonsParams,
): Promise<PersonReadManagement[]> {
  return request<PersonReadManagement[]>(
    `/manage/persons${buildQuery(params ?? {})}`,
  );
}

export function createPerson(
  data: PersonCreate,
): Promise<PersonReadManagement> {
  return request<PersonReadManagement>("/manage/persons", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function linkPersonToTopic(
  topicId: string,
  data: TopicPersonLinkCreate,
): Promise<TopicPersonLinkManagementRead> {
  return request<TopicPersonLinkManagementRead>(
    `/manage/topics/${encodeURIComponent(topicId)}/persons`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

export function unlinkPersonFromTopic(
  topicId: string,
  linkId: string,
): Promise<void> {
  return request<void>(
    `/manage/topics/${encodeURIComponent(topicId)}/persons/${encodeURIComponent(linkId)}`,
    { method: "DELETE" },
  );
}

export async function uploadMedia(file: File): Promise<MediaAssetRead> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${BASE_URL}/manage/media`, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: formData,
  });

  if (response.status === 401) {
    notifyAuthInvalid();
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      `API error ${response.status}: ${response.statusText}`,
    );
  }

  return response.json() as Promise<MediaAssetRead>;
}

export function getMediaUrl(assetId: string): string {
  return `/api/media/${encodeURIComponent(assetId)}`;
}

export { ApiError };
