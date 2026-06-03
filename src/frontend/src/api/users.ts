/** Admin: users API. */

import { request } from "./client";

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

/** Permanently delete a user. The backend cleans up dependent rows first. */
export async function deleteUser(userId: string): Promise<UserAdminRead> {
  return request<UserAdminRead>(`/admin/users/${userId}`, {
    method: "DELETE",
  });
}

/** Admin: the Entra integration's enabled state and group→role mapping. */
export async function getEntraConfig(): Promise<EntraAdminConfig> {
  return request<EntraAdminConfig>("/auth/entra/admin/config");
}
