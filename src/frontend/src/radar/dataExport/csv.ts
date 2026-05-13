import type { RadarData, RadarEntry } from "../types";

export const CSV_COLUMNS = [
  "canonical_name",
  "slug",
  "segment_name",
  "ring",
  "movement",
  "registry_status",
  "strategic_relevance",
  "trl",
  "time_to_mainstream",
  "last_updated",
  "peer_reference_count",
  "persons",
  "summary",
  "hero_image_url",
  "not_for_external_publication",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

function escapeField(raw: unknown): string {
  if (raw == null) return "";
  const s = String(raw);
  if (
    s.includes('"') ||
    s.includes(",") ||
    s.includes("\n") ||
    s.includes("\r")
  ) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatPersons(entry: RadarEntry): string {
  const links = entry.persons ?? [];
  return links
    .map((l) => {
      const name = l.person?.full_name?.trim() || "";
      const role = l.link_role?.trim();
      return role ? `${name} (${role})` : name;
    })
    .filter(Boolean)
    .join("; ");
}

export function buildRow(entry: RadarEntry): Record<CsvColumn, string> {
  return {
    canonical_name: entry.canonical_name,
    slug: entry.slug,
    segment_name: entry.segment_name ?? "",
    ring: entry.ring ?? "",
    movement: entry.movement ?? "",
    registry_status: entry.registry_status ?? "",
    strategic_relevance: entry.strategic_relevance ?? "",
    trl: entry.trl == null ? "" : String(entry.trl),
    time_to_mainstream: entry.time_to_mainstream ?? "",
    last_updated: entry.last_updated ?? "",
    peer_reference_count: String(entry.peer_reference_count ?? 0),
    persons: formatPersons(entry),
    summary: entry.summary ?? "",
    hero_image_url: entry.hero_image_url ?? "",
    not_for_external_publication: entry.not_for_external_publication
      ? "true"
      : "false",
  };
}

export function entriesToCsv(entries: RadarEntry[]): string {
  const header = CSV_COLUMNS.join(",");
  const rows = entries.map((e) => {
    const row = buildRow(e);
    return CSV_COLUMNS.map((c) => escapeField(row[c])).join(",");
  });
  return [header, ...rows].join("\r\n") + "\r\n";
}

export function csvFilename(data: RadarData): string {
  return `nodus-radar-${data.radar.cycle || "current"}.csv`;
}
