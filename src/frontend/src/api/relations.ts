/** Topic / technology relations API. */

import { request } from "./client";
import type { TopicRelation } from "../radar/types";

export async function fetchRelations(
  topicId?: string,
): Promise<TopicRelation[]> {
  const q = topicId ? `?topic_id=${topicId}` : "";
  return request<TopicRelation[]>(`/relations${q}`);
}
