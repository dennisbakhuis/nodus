import { request } from "./client";

export type ApiKeyRead = {
  id: string;
  name: string;
  description: string | null;
  token_prefix: string;
  user_id: string;
  owner_username: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

export type ApiKeyCreatePayload = {
  name: string;
  description?: string | null;
  user_id?: string | null;
  expires_at?: string | null;
};

export type ApiKeyCreateResponse = {
  api_key: ApiKeyRead;
  token: string;
};

export async function listApiKeys(): Promise<ApiKeyRead[]> {
  return request<ApiKeyRead[]>(`/manage/api-keys`);
}

export async function createApiKey(
  payload: ApiKeyCreatePayload,
): Promise<ApiKeyCreateResponse> {
  return request<ApiKeyCreateResponse>(`/manage/api-keys`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function revokeApiKey(id: string): Promise<ApiKeyRead> {
  return request<ApiKeyRead>(`/manage/api-keys/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
