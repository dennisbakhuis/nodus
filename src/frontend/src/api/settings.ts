/** Settings API. */

import { request } from "./client";

export type SettingRead = { key: string; value: string };

export async function listSettings(): Promise<SettingRead[]> {
  return request<SettingRead[]>("/settings");
}

export async function getSetting(key: string): Promise<SettingRead> {
  return request<SettingRead>(`/settings/${encodeURIComponent(key)}`);
}

export async function upsertSetting(
  key: string,
  value: string,
): Promise<SettingRead> {
  return request<SettingRead>(`/settings/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
}
