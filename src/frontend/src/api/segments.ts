/** Segments API. */

import { request } from "./client";
import type {
  SegmentAdmin,
  SegmentCreatePayload,
  SegmentUpdatePayload,
} from "../manage/types";

export async function listSegments(
  options: { includeInactive?: boolean } = {},
): Promise<SegmentAdmin[]> {
  const qs = options.includeInactive ? "?include_inactive=true" : "";
  return request<SegmentAdmin[]>(`/segments${qs}`);
}

export async function createSegment(
  payload: SegmentCreatePayload,
): Promise<SegmentAdmin> {
  return request<SegmentAdmin>(`/segments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateSegment(
  segmentId: string,
  payload: SegmentUpdatePayload,
): Promise<SegmentAdmin> {
  return request<SegmentAdmin>(`/segments/${segmentId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteSegment(segmentId: string): Promise<void> {
  return request<void>(`/segments/${segmentId}`, { method: "DELETE" });
}

export async function reorderSegments(ids: string[]): Promise<SegmentAdmin[]> {
  return request<SegmentAdmin[]>(`/segments/reorder`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}
