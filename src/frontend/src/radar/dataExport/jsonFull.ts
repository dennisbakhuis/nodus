import type { RadarData, RadarEntry } from "../types";

export type FullExportEnvelope = {
  version: "1.0";
  format: "nodus-full";
  exported_at: string;
  radar: RadarData["radar"];
  cycle: RadarData["cycle"];
  segments: RadarData["segments"];
  rings: RadarData["rings"];
  entries: RadarEntry[];
};

export function buildFullExport(
  data: RadarData,
  filteredEntries: RadarEntry[],
): FullExportEnvelope {
  return {
    version: "1.0",
    format: "nodus-full",
    exported_at: new Date().toISOString(),
    radar: data.radar,
    cycle: data.cycle,
    segments: data.segments,
    rings: data.rings,
    entries: filteredEntries,
  };
}

export function fullExportJson(
  data: RadarData,
  filteredEntries: RadarEntry[],
): string {
  return JSON.stringify(buildFullExport(data, filteredEntries), null, 2);
}

export function fullExportFilename(data: RadarData): string {
  return `nodus-radar-${data.radar.cycle || "current"}-full.json`;
}
