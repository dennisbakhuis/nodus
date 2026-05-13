/** Media (image) upload API.
 *
 * Uses raw fetch because request<T> sets Content-Type: application/json which
 * corrupts multipart FormData; reuses buildAuthHeaders for consistency.
 */

import { buildAuthHeaders } from "../shared/tokenStore";
import type { MediaAssetRead } from "../manage/types";

const BASE = "/api";

export async function uploadMedia(file: File): Promise<MediaAssetRead> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${BASE}/manage/media`, {
    method: "POST",
    body: formData,
    headers: buildAuthHeaders(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return (await res.json()) as MediaAssetRead;
}

export function getMediaUrl(assetId: string): string {
  return `${BASE}/media/${assetId}`;
}
