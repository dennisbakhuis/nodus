/** Peer references + URLs API. */

import { request } from "./client";
import type {
  PeerReferenceCreate,
  PeerReferenceRead,
  PeerReferenceUpdate,
  PeerReferenceUrlCreate,
  PeerReferenceUrlRead,
} from "../manage/types";

export async function listPeerReferences(
  topicId: string,
): Promise<PeerReferenceRead[]> {
  return request<PeerReferenceRead[]>(
    `/manage/topics/${topicId}/peer-references`,
  );
}

export async function createPeerReference(
  topicId: string,
  payload: PeerReferenceCreate,
): Promise<PeerReferenceRead> {
  return request<PeerReferenceRead>(
    `/manage/topics/${topicId}/peer-references`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function updatePeerReference(
  topicId: string,
  peerRefId: string,
  payload: PeerReferenceUpdate,
): Promise<PeerReferenceRead> {
  return request<PeerReferenceRead>(
    `/manage/topics/${topicId}/peer-references/${peerRefId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deletePeerReference(
  topicId: string,
  peerRefId: string,
): Promise<void> {
  return request<void>(
    `/manage/topics/${topicId}/peer-references/${peerRefId}`,
    { method: "DELETE" },
  );
}

export async function addUrlToPeerReference(
  topicId: string,
  peerRefId: string,
  payload: PeerReferenceUrlCreate,
): Promise<PeerReferenceUrlRead> {
  return request<PeerReferenceUrlRead>(
    `/manage/topics/${topicId}/peer-references/${peerRefId}/urls`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function removeUrlFromPeerReference(
  topicId: string,
  peerRefId: string,
  urlId: string,
): Promise<void> {
  return request<void>(
    `/manage/topics/${topicId}/peer-references/${peerRefId}/urls/${urlId}`,
    { method: "DELETE" },
  );
}
