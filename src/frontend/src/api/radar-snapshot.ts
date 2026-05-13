/** Live radar snapshot fetcher.
 *
 * Wraps the Zod boundary parser around the GET /api/radar/current call. Kept
 * separate from the cycle-deliverable snapshot endpoints (api/cycles.ts ::
 * getDeliverable) which return an immutable frozen JSON snapshot for a
 * specific cycle.
 */

import { request } from "./client";
import { parseRadarSnapshotResponse } from "./boundary";
import type { RadarData } from "../radar/types";

export async function fetchCurrentRadar(
  segment?: string,
  ring?: string,
  includeStatus?: string[],
  includeCandidates?: boolean,
): Promise<RadarData> {
  const params = new URLSearchParams();
  if (segment) params.set("segment", segment);
  if (ring) params.set("ring", ring);
  if (includeStatus && includeStatus.length > 0) {
    includeStatus.forEach((s) => params.append("include_status", s));
  }
  if (includeCandidates) params.set("include_candidates", "true");
  const query = params.toString() ? `?${params.toString()}` : "";
  const raw = await request<unknown>(`/radar/current${query}`);
  return parseRadarSnapshotResponse(raw) as RadarData;
}

export async function fetchHistoricalRadar(
  cycleId: string,
): Promise<RadarData> {
  const raw = await request<unknown>(
    `/cycles/${cycleId}/deliverables/radar.json`,
  );
  return parseRadarSnapshotResponse(raw) as RadarData;
}
