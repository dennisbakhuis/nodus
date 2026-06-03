/** Admin: users API. */

import { request } from "./client";
import type { PersonReadManagement } from "../manage/types";

export type UserAdminRead = {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  mfa_enabled: boolean;
  must_change_password: boolean;
  entra_oid: string | null;
  created_at: string;
  updated_at: string;
};

export type UserAdminCreatePayload = {
  username: string;
  first_name: string;
  last_name: string;
  role: string;
  initial_password: string;
  must_change_password?: boolean;
  /** Link this existing account-less Person instead of creating a fresh one. */
  person_id?: string;
  /** Deliberately create a new profile even if a name-matching Person exists. */
  create_new_person?: boolean;
};

export type UserDeleteOptions = {
  person_action: "keep" | "delete";
  note?: string;
  force_unlink_topics?: boolean;
};

export type UserLinkedPerson = {
  person: PersonReadManagement | null;
  topic_link_count: number;
};

export type UserAdminUpdatePayload = {
  username?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  is_active?: boolean;
};

export type EntraGroupMapping = {
  role: string;
  group_id: string;
};

export type EntraAdminConfig = {
  enabled: boolean;
  groups: EntraGroupMapping[];
};

export async function listUsers(): Promise<UserAdminRead[]> {
  return request<UserAdminRead[]>("/admin/users");
}

export async function createUser(
  payload: UserAdminCreatePayload,
): Promise<UserAdminRead> {
  return request<UserAdminRead>("/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateUser(
  userId: string,
  payload: UserAdminUpdatePayload,
): Promise<UserAdminRead> {
  return request<UserAdminRead>(`/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function resetUserPassword(
  userId: string,
  newPassword: string,
  mustChange: boolean = true,
): Promise<UserAdminRead> {
  return request<UserAdminRead>(`/admin/users/${userId}/reset-password`, {
    method: "POST",
    body: JSON.stringify({
      new_password: newPassword,
      must_change_password: mustChange,
    }),
  });
}

/** Permanently delete a user. `options` controls how the linked Person is handled. */
export async function deleteUser(
  userId: string,
  options?: UserDeleteOptions,
): Promise<UserAdminRead> {
  return request<UserAdminRead>(`/admin/users/${userId}`, {
    method: "DELETE",
    ...(options ? { body: JSON.stringify(options) } : {}),
  });
}

/** The user's linked Person plus its topic-link count, for the delete dialog. */
export async function getUserLinkedPerson(
  userId: string,
): Promise<UserLinkedPerson> {
  return request<UserLinkedPerson>(`/admin/users/${userId}/person`);
}

/** Account-less People matching a name — drives the create-time link prompt. */
export async function getPersonCandidates(
  firstName: string,
  lastName: string,
): Promise<PersonReadManagement[]> {
  const qs = new URLSearchParams({
    first_name: firstName,
    last_name: lastName,
  });
  return request<PersonReadManagement[]>(
    `/admin/users/person-candidates?${qs.toString()}`,
  );
}

/** Admin: the Entra integration's enabled state and group→role mapping. */
export async function getEntraConfig(): Promise<EntraAdminConfig> {
  return request<EntraAdminConfig>("/auth/entra/admin/config");
}
