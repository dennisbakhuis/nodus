/** Cycles + deliverables API. */

import { request } from "./client";
import type {
  CycleCloseRequest,
  CycleCreate,
  CycleRead,
  CycleUpdate,
  DeliverableType,
} from "../manage/types";

export async function listCycles(): Promise<CycleRead[]> {
  return request<CycleRead[]>(`/cycles`);
}

export async function createCycle(payload: CycleCreate): Promise<CycleRead> {
  return request<CycleRead>(`/cycles`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateCycle(
  cycleId: string,
  payload: CycleUpdate,
): Promise<CycleRead> {
  return request<CycleRead>(`/cycles/${cycleId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function closeCycle(
  cycleId: string,
  payload: CycleCloseRequest,
): Promise<CycleRead> {
  return request<CycleRead>(`/cycles/${cycleId}/close`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Deliverable fetcher — keeps raw fetch because the response is either JSON
 * (radar.json) or plain text (markdown). request<T> assumes JSON.
 */
export async function getDeliverable(
  cycleId: string,
  type: DeliverableType,
): Promise<string | Record<string, unknown>> {
  const path = `/api/cycles/${cycleId}/deliverables/${type}`;
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`API ${res.status}`);
  }
  if (type === "radar.json") {
    return (await res.json()) as Record<string, unknown>;
  }
  return await res.text();
}
