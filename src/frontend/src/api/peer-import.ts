import { request } from "./client";
import type { PeerRefExportEnvelope } from "../radar/dataExport/jsonPeerRef";

export type UnmatchedTopic = {
  canonical_name: string;
  slug: string;
};

export type ImportSummary = {
  dry_run: boolean;
  party_resolved: string;
  party_created: boolean;
  source_resolved: string;
  source_created: boolean;
  topics_in_payload: number;
  topics_matched: number;
  topics_unmatched: UnmatchedTopic[];
  peer_references_created: number;
  peer_references_updated: number;
  urls_added: number;
  urls_skipped: number;
};

export async function importPeerReferences(
  payload: PeerRefExportEnvelope,
  dryRun: boolean,
): Promise<ImportSummary> {
  const qs = dryRun ? "?dry_run=true" : "";
  return request<ImportSummary>(`/manage/import/peer-references${qs}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
