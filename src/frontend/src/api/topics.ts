/** Topics + technologies + aliases + factsheets + movements API. */

import { request } from "./client";
import type {
  AliasCreate,
  AliasRead,
  FactsheetCreate,
  FactsheetRead,
  MovementEventRead,
  TechnologyRead,
  TechnologyUpdate,
  TopicCreate,
  TopicCreateResponse,
  TopicRead,
  TopicUpdate,
} from "../manage/types";

export type TopicListParams = {
  registry_status?: string;
  segment_id?: string;
  ring?: string;
  has_party?: string;
  search?: string;
  offset?: number;
  limit?: number;
};

export async function listTopics(
  params: TopicListParams = {},
): Promise<TopicRead[]> {
  const qs = new URLSearchParams();
  if (params.registry_status) qs.set("registry_status", params.registry_status);
  if (params.segment_id) qs.set("segment_id", params.segment_id);
  if (params.ring) qs.set("ring", params.ring);
  if (params.has_party) qs.set("has_party", params.has_party);
  if (params.search) qs.set("search", params.search);
  if (params.offset !== undefined) qs.set("offset", String(params.offset));
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return request<TopicRead[]>(`/topics${query}`);
}

// getTopic is exported from ./client.ts (typed TopicDetailResponse return).

export async function createTopic(
  payload: TopicCreate,
): Promise<TopicCreateResponse> {
  return request<TopicCreateResponse>(`/topics`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTopic(
  topicId: string,
  payload: TopicUpdate,
): Promise<TopicRead> {
  return request<TopicRead>(`/topics/${topicId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function addAlias(
  topicId: string,
  payload: AliasCreate,
): Promise<AliasRead> {
  return request<AliasRead>(`/topics/${topicId}/aliases`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function removeAlias(
  topicId: string,
  aliasId: string,
): Promise<void> {
  return request<void>(`/topics/${topicId}/aliases/${aliasId}`, {
    method: "DELETE",
  });
}

export async function updateTechnology(
  techId: string,
  payload: TechnologyUpdate,
): Promise<TechnologyRead> {
  return request<TechnologyRead>(`/technologies/${techId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function createFactsheet(
  techId: string,
  payload: FactsheetCreate,
): Promise<FactsheetRead> {
  return request<FactsheetRead>(`/technologies/${techId}/factsheet`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listFactsheets(techId: string): Promise<FactsheetRead[]> {
  return request<FactsheetRead[]>(`/technologies/${techId}/factsheets`);
}

export async function getFactsheetVersion(
  techId: string,
  version: number,
): Promise<FactsheetRead> {
  return request<FactsheetRead>(
    `/technologies/${techId}/factsheets/${version}`,
  );
}

export async function listMovements(
  techId: string,
): Promise<MovementEventRead[]> {
  return request<MovementEventRead[]>(`/technologies/${techId}/movements`);
}
