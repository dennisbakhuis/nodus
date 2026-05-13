/** Initiative CRUD client. */

import { request } from "./client";
import type {
  InitiativeCreate,
  InitiativeRead,
  InitiativeUpdate,
} from "../manage/types";

export async function listInitiatives(
  technologyId: string,
): Promise<InitiativeRead[]> {
  return request<InitiativeRead[]>(
    `/manage/technologies/${technologyId}/initiatives`,
  );
}

export async function createInitiative(
  technologyId: string,
  payload: InitiativeCreate,
): Promise<InitiativeRead> {
  return request<InitiativeRead>(
    `/manage/technologies/${technologyId}/initiatives`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function updateInitiative(
  initiativeId: string,
  payload: InitiativeUpdate,
): Promise<InitiativeRead> {
  return request<InitiativeRead>(`/manage/initiatives/${initiativeId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteInitiative(initiativeId: string): Promise<void> {
  return request<void>(`/manage/initiatives/${initiativeId}`, {
    method: "DELETE",
  });
}
