import * as XLSX from "xlsx";
import type { RadarData, RadarEntry } from "../types";
import { CSV_COLUMNS, buildRow } from "./csv";

export const PEER_REF_COLUMNS = [
  "topic_canonical_name",
  "topic_slug",
  "party_name",
  "peer_title",
  "peer_ring_label",
  "peer_segment_label",
  "summary",
] as const;

export function entriesToWorkbook(
  entries: RadarEntry[],
  radarTitle: string,
  cycle: string | null,
): XLSX.WorkBook {
  const entriesAoo = entries.map((e) => buildRow(e));
  const entriesSheet = XLSX.utils.json_to_sheet(entriesAoo, {
    header: CSV_COLUMNS as unknown as string[],
  });

  const peerRows: Record<string, string>[] = [];
  for (const entry of entries) {
    for (const pr of entry.peer_references ?? []) {
      peerRows.push({
        topic_canonical_name: entry.canonical_name,
        topic_slug: entry.slug,
        party_name: pr.party_name,
        peer_title: pr.peer_title,
        peer_ring_label: pr.peer_ring_label ?? "",
        peer_segment_label: pr.peer_segment_label ?? "",
        summary: pr.summary ?? "",
      });
    }
  }
  const peerSheet = XLSX.utils.json_to_sheet(peerRows, {
    header: PEER_REF_COLUMNS as unknown as string[],
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, entriesSheet, "Entries");
  XLSX.utils.book_append_sheet(wb, peerSheet, "PeerReferences");
  wb.Props = {
    Title: radarTitle,
    Subject: cycle || "current",
    Application: "Nodus",
    CreatedDate: new Date(),
  };
  return wb;
}

export function workbookToBlob(wb: XLSX.WorkBook): Blob {
  const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([arr], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function xlsxFilename(data: RadarData): string {
  return `nodus-radar-${data.radar.cycle || "current"}.xlsx`;
}
