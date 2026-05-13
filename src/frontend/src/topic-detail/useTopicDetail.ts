import { useCallback, useEffect, useState } from "react";
import { getTopic, type TopicDetailResponse } from "../api/client";
import {
  listFactsheets,
  listMovements,
  listPeerReferences,
  listSegments,
  listTopicPersons,
} from "../manage/api";
import type {
  FactsheetRead,
  MovementEventRead,
  PeerReferenceRead,
  SegmentAdmin,
  TopicDetail,
  TopicPersonLinkManagementRead,
} from "../manage/types";
import { useAuth } from "../shared/AuthContext";
import type { TopicDetailNested } from "./types";

export type UseTopicDetailResult = {
  topic: TopicDetail | null;
  nested: TopicDetailNested | null;
  factsheets: FactsheetRead[];
  movements: MovementEventRead[];
  segments: SegmentAdmin[];
  peerRefs: PeerReferenceRead[];
  personLinks: TopicPersonLinkManagementRead[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

/**
 * Flatten the nested wire response into the legacy `TopicDetail` shape
 * consumers still expect, plus a typed `TopicDetailNested` view.
 */
function normalizeTopic(raw: TopicDetailResponse): {
  topic: TopicDetail;
  nested: TopicDetailNested;
} {
  const topic: TopicDetail = {
    id: raw.topic.id,
    canonical_name: raw.topic.canonical_name,
    slug: raw.topic.slug,
    not_for_external_publication: raw.topic.not_for_external_publication,
    created_at: raw.topic.created_at ?? "",
    technology_id: raw.topic.technology_id ?? null,
    registry_status: raw.topic.registry_status ?? null,
    current_ring: raw.topic.current_ring ?? null,
    current_segment_id: raw.topic.current_segment_id ?? null,
    aliases: raw.aliases as unknown as TopicDetail["aliases"],
    technology: raw.technology,
    factsheet: raw.factsheet,
    recent_events: (raw.recent_events ?? []) as TopicDetail["recent_events"],
    // peer_references and persons in TopicDetail are typed against the
    // richer /peer-references and /topic-persons endpoint shapes, but the
    // wire here returns slim summaries. Consumers that need the rich data
    // read it from the dedicated `peerRefs` / `personLinks` state vars on
    // this hook; the flat fields on TopicDetail are vestigial.
    peer_references:
      raw.peer_references as unknown as TopicDetail["peer_references"],
    persons: (raw.persons ?? []) as unknown as TopicDetail["persons"],
    hero_image_id: raw.technology?.hero_image_id ?? null,
  };

  // The TopicDetailNested type still uses Record<string, unknown> for
  // technology/factsheet/assessment because some consumers read fields the
  // current generated schemas don't expose yet (e.g. internal-only factsheet
  // notes). The cast is unavoidable until those consumers move off the loose
  // shape.
  const nested: TopicDetailNested = {
    topic: raw.topic as unknown as Record<string, unknown>,
    technology:
      (raw.technology as unknown as Record<string, unknown> | null) ?? null,
    factsheet:
      (raw.factsheet as unknown as Record<string, unknown> | null) ?? null,
    assessment:
      (raw.assessment as unknown as Record<string, unknown> | null) ?? null,
    aliases: raw.aliases as TopicDetailNested["aliases"],
    recent_events: (raw.recent_events ??
      []) as TopicDetailNested["recent_events"],
    peer_references:
      raw.peer_references as unknown as TopicDetailNested["peer_references"],
    peer_reference_count: raw.peer_reference_count,
    persons: (raw.persons ?? []) as unknown as TopicDetailNested["persons"],
    hero_image_url: raw.hero_image_url,
    created_by: raw.created_by ?? null,
  };

  return { topic, nested };
}

export function useTopicDetail(slug: string | null): UseTopicDetailResult {
  const { isWriter } = useAuth();
  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [nested, setNested] = useState<TopicDetailNested | null>(null);
  const [factsheets, setFactsheets] = useState<FactsheetRead[]>([]);
  const [movements, setMovements] = useState<MovementEventRead[]>([]);
  const [segments, setSegments] = useState<SegmentAdmin[]>([]);
  const [peerRefs, setPeerRefs] = useState<PeerReferenceRead[]>([]);
  const [personLinks, setPersonLinks] = useState<
    TopicPersonLinkManagementRead[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const raw = await getTopic(slug);
      const { topic: t, nested: n } = normalizeTopic(raw);
      setTopic(t);
      setNested(n);

      const segs = await listSegments({ includeInactive: true });
      setSegments(segs);

      if (t.technology_id) {
        const [fs, movs] = await Promise.all([
          listFactsheets(t.technology_id),
          listMovements(t.technology_id),
        ]);
        setFactsheets(fs);
        setMovements(movs);
      } else {
        setFactsheets([]);
        setMovements([]);
      }

      // listTopicPersons is the management surface (returns email + full PII)
      // and requires Writer; readers/anonymous get the public PersonReadPublic
      // list from the /topics/{slug} payload (already in `nested.persons`).
      // Skip the writer-only call so opening the modal doesn't 401 the load.
      const [peers, links] = await Promise.all([
        listPeerReferences(t.id),
        isWriter ? listTopicPersons(t.id) : Promise.resolve([]),
      ]);
      setPeerRefs(peers);
      setPersonLinks(links);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load topic");
    } finally {
      setLoading(false);
    }
  }, [slug, isWriter]);

  useEffect(() => {
    if (!slug) {
      setTopic(null);
      setNested(null);
      setFactsheets([]);
      setMovements([]);
      setPeerRefs([]);
      setPersonLinks([]);
      return;
    }
    void load();
  }, [slug, load]);

  return {
    topic,
    nested,
    factsheets,
    movements,
    segments,
    peerRefs,
    personLinks,
    loading,
    error,
    refetch: load,
  };
}
