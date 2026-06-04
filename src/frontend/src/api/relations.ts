/** Topic / technology relations API. */

import { request } from "./client";
import type { TopicRelation } from "../radar/types";

export async function fetchRelations(
  topicId?: string,
): Promise<TopicRelation[]> {
  const q = topicId ? `?topic_id=${topicId}` : "";
  return request<TopicRelation[]>(`/relations${q}`);
}

export async function createRelation(
  fromTopicId: string,
  toTopicId: string,
  relationType: string,
): Promise<TopicRelation> {
  return request<TopicRelation>(`/relations`, {
    method: "POST",
    body: JSON.stringify({
      from_topic_id: fromTopicId,
      to_topic_id: toTopicId,
      relation_type: relationType,
    }),
  });
}

export async function deleteRelation(relationId: string): Promise<void> {
  await request<void>(`/relations/${relationId}`, { method: "DELETE" });
}
