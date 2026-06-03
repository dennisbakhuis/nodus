/** Self-service People profile for the logged-in user (first-login completion). */

import { request } from "./client";
import type { PersonReadManagement } from "../manage/types";

export type SelfProfileUpdate = {
  full_name?: string;
  company?: string;
  email?: string;
  department?: string;
  role?: string;
};

export async function getMyProfile(): Promise<PersonReadManagement> {
  return request<PersonReadManagement>("/auth/me/profile");
}

/** Account-less People records matching the caller's name (claim the right one). */
export async function getProfileCandidates(): Promise<PersonReadManagement[]> {
  return request<PersonReadManagement[]>("/auth/me/profile/candidates");
}

/** Link the caller's account to an existing People record (replaces a blank stub). */
export async function linkMyProfile(personId: string): Promise<void> {
  await request<unknown>("/auth/me/profile/link", {
    method: "POST",
    body: JSON.stringify({ person_id: personId }),
  });
}

export async function updateMyProfile(
  payload: SelfProfileUpdate,
): Promise<void> {
  await request<unknown>("/auth/me/profile", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
