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
  first_name?: string;
  last_name?: string;
  role?: string;
  is_active?: boolean;
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

export async function deactivateUser(userId: string): Promise<UserAdminRead> {
  return request<UserAdminRead>(`/admin/users/${userId}`, {
    method: "DELETE",
  });
}
