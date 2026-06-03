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

export async function updateMyProfile(
  payload: SelfProfileUpdate,
): Promise<void> {
  await request<unknown>("/auth/me/profile", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
