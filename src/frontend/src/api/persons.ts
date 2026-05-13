/** Persons + topic-person links API. */

import { request } from "./client";
import type {
  PersonCreate,
  PersonReadManagement,
  PersonUpdate,
  TopicPersonLinkCreate,
  TopicPersonLinkManagementRead,
} from "../manage/types";

export async function listPersons(
  params: {
    search?: string;
    company?: string;
    offset?: number;
    limit?: number;
  } = {},
): Promise<PersonReadManagement[]> {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.company) qs.set("company", params.company);
  if (params.offset !== undefined) qs.set("offset", String(params.offset));
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return request<PersonReadManagement[]>(`/manage/persons${query}`);
}

export async function createPerson(
  payload: PersonCreate,
): Promise<PersonReadManagement> {
  return request<PersonReadManagement>(`/manage/persons`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePerson(
  personId: string,
  payload: PersonUpdate,
): Promise<PersonReadManagement> {
  return request<PersonReadManagement>(`/manage/persons/${personId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deletePerson(personId: string): Promise<void> {
  return request<void>(`/manage/persons/${personId}`, { method: "DELETE" });
}

export async function listTopicPersons(
  topicId: string,
): Promise<TopicPersonLinkManagementRead[]> {
  return request<TopicPersonLinkManagementRead[]>(
    `/manage/topics/${topicId}/persons`,
  );
}

export async function addPersonToTopic(
  topicId: string,
  payload: TopicPersonLinkCreate,
): Promise<TopicPersonLinkManagementRead> {
  return request<TopicPersonLinkManagementRead>(
    `/manage/topics/${topicId}/persons`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function removePersonFromTopic(
  topicId: string,
  linkId: string,
): Promise<void> {
  return request<void>(`/manage/topics/${topicId}/persons/${linkId}`, {
    method: "DELETE",
  });
}

export async function upsertPersonOnTopic(
  topicId: string,
  payload: {
    person_id?: string;
    full_name?: string;
    company?: string;
    role?: string | null;
    department?: string | null;
    email?: string | null;
    notes?: string | null;
    link_role: string;
  },
): Promise<TopicPersonLinkManagementRead> {
  return request<TopicPersonLinkManagementRead>(
    `/manage/topics/${topicId}/persons/upsert`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}
