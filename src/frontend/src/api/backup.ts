/** Admin: backup + restore API.
 *
 * Multipart helpers use raw fetch because request<T> sets
 * Content-Type: application/json which corrupts multipart FormData;
 * blob downloads also bypass JSON parsing. Auth headers come from the shared
 * tokenStore so the auth layer stays consolidated.
 *
 * Password handling: when no password is set we GET the plain zip — that
 * matches the documented "pull from elsewhere" workflow that lives on the
 * API page. When a password is set we POST it in the body so it does not
 * leak into proxy/access logs or browser history.
 */

import { buildAuthHeaders } from "../shared/tokenStore";

const BASE = "/api";

export type DownloadProgress = {
  /** Bytes received so far. */
  loaded: number;
  /** Total bytes if the server set Content-Length, else null. */
  total: number | null;
};

async function consumeStream(
  res: Response,
  onProgress?: (p: DownloadProgress) => void,
): Promise<Blob> {
  const totalHeader = res.headers.get("Content-Length");
  const total = totalHeader ? Number(totalHeader) : null;
  if (!res.body || !onProgress) {
    return await res.blob();
  }
  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress({ loaded, total });
    }
  }
  const type = res.headers.get("Content-Type") ?? "application/octet-stream";
  return new Blob(chunks, { type });
}

export async function downloadBackup(
  password?: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<Blob> {
  let res: Response;
  if (password) {
    const fd = new FormData();
    fd.append("password", password);
    res = await fetch(`${BASE}/admin/backup/download`, {
      method: "POST",
      body: fd,
      headers: buildAuthHeaders(),
    });
  } else {
    res = await fetch(`${BASE}/admin/backup`, {
      headers: buildAuthHeaders(),
    });
  }
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return await consumeStream(res, onProgress);
}

export type BackupConflict = {
  table: string;
  natural_key: string | null;
  incoming: Record<string, unknown>;
  existing: Record<string, unknown>;
};

export type BackupInspectionReport = {
  format_version: number;
  exported_at: string | null;
  encrypted: boolean;
  table_counts: Record<string, number>;
  conflicts: BackupConflict[];
};

export async function inspectBackup(
  file: File,
  password?: string,
): Promise<BackupInspectionReport> {
  const fd = new FormData();
  fd.append("file", file);
  if (password) fd.append("password", password);
  const res = await fetch(`${BASE}/admin/backup/inspect`, {
    method: "POST",
    body: fd,
    headers: buildAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as BackupInspectionReport;
}

export type BackupRestoreResult = {
  inserted: number;
  skipped: number;
  overwritten: number;
};

export async function restoreBackup(args: {
  file: File;
  password?: string;
  mode: "fresh" | "addon";
  resolutions?: Record<string, "skip" | "overwrite">;
}): Promise<BackupRestoreResult> {
  const fd = new FormData();
  fd.append("file", args.file);
  fd.append("mode", args.mode);
  if (args.password) fd.append("password", args.password);
  if (args.resolutions) {
    fd.append("resolutions_json", JSON.stringify(args.resolutions));
  }
  const res = await fetch(`${BASE}/admin/backup/restore`, {
    method: "POST",
    body: fd,
    headers: buildAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as BackupRestoreResult;
}
