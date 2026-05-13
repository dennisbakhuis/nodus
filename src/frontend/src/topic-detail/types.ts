import type { RadarData, RadarEntry, TechnologyRelation } from "../radar/types";

export type TopicDetailNested = {
  topic: Record<string, unknown>;
  technology: Record<string, unknown> | null;
  factsheet: Record<string, unknown> | null;
  assessment: Record<string, unknown> | null;
  aliases: Array<{ id?: string; alias_name: string; source?: string | null }>;
  recent_events: Array<{
    id: string;
    event_type: string;
    from_value: string | null;
    to_value: string | null;
    rationale: string;
    timestamp: string;
  }>;
  peer_references: Array<{
    id: string;
    topic_id: string;
    party_id: string;
    party_name: string;
    party_slug: string;
    peer_title: string;
    peer_ring_label: string | null;
    peer_segment_label: string | null;
    summary: string | null;
    urls?: Array<{
      id: string;
      url: string;
      label: string | null;
      display_order: number;
    }>;
  }>;
  peer_reference_count: number;
  persons: Array<{
    link_id?: string;
    link_role: string;
    person: {
      id: string;
      full_name: string;
      company: string;
      department: string | null;
      role: string | null;
    };
  }>;
  hero_image_url: string | null;
  created_by?: {
    id: string;
    username: string;
    full_name: string;
  } | null;
};

export type RadarContext = {
  entry: RadarEntry;
  data: RadarData;
  relations: TechnologyRelation[];
  onNavigate: (entry: RadarEntry) => void;
};
