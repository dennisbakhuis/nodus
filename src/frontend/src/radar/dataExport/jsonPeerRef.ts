import type { RadarData, RadarEntry } from "../types";

export type PeerRefExportSource = {
  party_name: string;
  party_slug?: string | null;
  party_url?: string | null;
  source_name: string;
  source_url?: string | null;
};

export type PeerRefExportUrl = {
  url: string;
  label: string | null;
  display_order: number;
};

export type PeerRefExportTopic = {
  canonical_name: string;
  slug: string;
  peer_title: string;
  peer_ring_label: string | null;
  peer_segment_label: string | null;
  peer_time_to_mainstream_label: string | null;
  summary: string | null;
  urls: PeerRefExportUrl[];
};

export type PeerRefExportEnvelope = {
  version: "1.0";
  format: "nodus-peer-reference";
  exported_at: string;
  source: PeerRefExportSource;
  topics: PeerRefExportTopic[];
};

export type PeerRefBuildResult = {
  envelope: PeerRefExportEnvelope;
  /** Number of filtered entries that were dropped because not_for_external_publication=true. */
  privateExcluded: number;
};

function buildTopicUrl(
  slug: string,
  baseUrl: string | null | undefined,
): string | null {
  if (!baseUrl) return null;
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}/topic/${slug}`;
}

export function buildPeerRefExport(
  data: RadarData,
  filteredEntries: RadarEntry[],
  source: PeerRefExportSource,
): PeerRefBuildResult {
  const publicEntries: RadarEntry[] = [];
  let privateExcluded = 0;
  for (const entry of filteredEntries) {
    if (entry.not_for_external_publication === true) {
      privateExcluded += 1;
      continue;
    }
    publicEntries.push(entry);
  }

  const topics: PeerRefExportTopic[] = publicEntries.map((entry) => {
    const urls: PeerRefExportUrl[] = [];
    const link = buildTopicUrl(entry.slug, source.source_url);
    if (link) {
      urls.push({
        url: link,
        label: `View on ${source.party_name}`,
        display_order: 0,
      });
    }
    return {
      canonical_name: entry.canonical_name,
      slug: entry.slug,
      peer_title: entry.canonical_name,
      peer_ring_label: entry.ring ?? null,
      peer_segment_label: entry.segment_name ?? null,
      peer_time_to_mainstream_label: entry.time_to_mainstream ?? null,
      summary: entry.summary ?? null,
      urls,
    };
  });

  return {
    envelope: {
      version: "1.0",
      format: "nodus-peer-reference",
      exported_at: new Date().toISOString(),
      source,
      topics,
    },
    privateExcluded,
  };
}

export function peerRefExportJson(envelope: PeerRefExportEnvelope): string {
  return JSON.stringify(envelope, null, 2);
}

export function peerRefExportFilename(data: RadarData): string {
  return `nodus-radar-${data.radar.cycle || "current"}-peer-ref.json`;
}
