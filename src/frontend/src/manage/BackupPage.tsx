import { useMemo, useRef, useState } from "react";
import {
  downloadBackup,
  inspectBackup,
  restoreBackup,
  type BackupConflict,
  type BackupInspectionReport,
  type DownloadProgress,
} from "./api";
import { useConfirm } from "../shared/ConfirmDialog";
import { StatusBanner } from "../shared/StatusBanner";
import styles from "./BackupPage.module.css";

type RestoreMode = "fresh" | "addon";
type Resolution = "skip" | "overwrite";

function naturalKeyOf(c: BackupConflict): string {
  const value =
    c.natural_key && typeof c.incoming[c.natural_key] === "string"
      ? (c.incoming[c.natural_key] as string)
      : ((c.incoming.id as string | undefined) ?? "?");
  return `${c.table}:${value}`;
}

function naturalKeyDisplay(c: BackupConflict): string {
  if (c.natural_key && typeof c.incoming[c.natural_key] === "string") {
    return c.incoming[c.natural_key] as string;
  }
  return (c.incoming.id as string | undefined) ?? "?";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function BackupPage() {
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [downloadPwd, setDownloadPwd] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadErr, setDownloadErr] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] =
    useState<DownloadProgress | null>(null);

  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePwd, setRestorePwd] = useState("");
  const [restoreMode, setRestoreMode] = useState<RestoreMode>("addon");
  const [report, setReport] = useState<BackupInspectionReport | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>(
    {},
  );
  const [inspecting, setInspecting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreErr, setRestoreErr] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<string | null>(null);

  const conflictStats = useMemo(() => {
    if (!report) return { total: 0, skip: 0, overwrite: 0 };
    let skip = 0;
    let overwrite = 0;
    for (const c of report.conflicts) {
      const key = naturalKeyOf(c);
      if ((resolutions[key] ?? "skip") === "overwrite") overwrite += 1;
      else skip += 1;
    }
    return { total: report.conflicts.length, skip, overwrite };
  }, [report, resolutions]);

  function resetRestoreState() {
    setReport(null);
    setResolutions({});
    setRestoreErr(null);
    setRestoreResult(null);
  }

  function clearFile() {
    setRestoreFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    resetRestoreState();
  }

  async function handleDownload() {
    setDownloading(true);
    setDownloadErr(null);
    setDownloadProgress({ loaded: 0, total: null });
    try {
      const blob = await downloadBackup(downloadPwd || undefined, (p) =>
        setDownloadProgress(p),
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      const ext = downloadPwd ? "bin" : "zip";
      a.download = `nodus-backup-${stamp}${downloadPwd ? "-encrypted" : ""}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDownloadErr(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
      setDownloadProgress(null);
    }
  }

  async function handleInspect() {
    if (!restoreFile) return;
    setInspecting(true);
    setRestoreErr(null);
    setReport(null);
    setRestoreResult(null);
    try {
      const r = await inspectBackup(restoreFile, restorePwd || undefined);
      setReport(r);
      const initial: Record<string, Resolution> = {};
      for (const c of r.conflicts) initial[naturalKeyOf(c)] = "skip";
      setResolutions(initial);
    } catch (e) {
      setRestoreErr(e instanceof Error ? e.message : "Inspect failed");
    } finally {
      setInspecting(false);
    }
  }

  async function handleRestore() {
    if (!restoreFile) return;
    if (restoreMode === "fresh") {
      const ok = await confirm({
        title: "Wipe & restore",
        body:
          "Fresh restore will WIPE every existing topic, technology, factsheet, " +
          "person, and media row before applying the backup. This cannot be undone. Continue?",
        danger: true,
        confirmLabel: "Wipe & restore",
      });
      if (!ok) return;
    }
    setRestoring(true);
    setRestoreErr(null);
    setRestoreResult(null);
    try {
      const result = await restoreBackup({
        file: restoreFile,
        password: restorePwd || undefined,
        mode: restoreMode,
        resolutions,
      });
      setRestoreResult(
        `Restored. Inserted ${result.inserted}, overwritten ${result.overwritten}, skipped ${result.skipped}.`,
      );
    } catch (e) {
      setRestoreErr(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoring(false);
    }
  }

  function setAllResolutions(value: Resolution) {
    if (!report) return;
    const next: Record<string, Resolution> = {};
    for (const c of report.conflicts) next[naturalKeyOf(c)] = value;
    setResolutions(next);
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Backup &amp; Restore</h1>
        <p>
          Download the entire database (topics, technologies, factsheets,
          persons, settings, media images) as a single file. Optionally
          password-protect with AES-256-GCM. Restore can replace everything
          (fresh) or merge new rows with per-row conflict choices (add-on).
        </p>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Download backup</h2>
        <p className={styles.sectionDesc}>
          Leave the password blank for a plain zip. Setting a password wraps the
          zip in an encrypted envelope; you'll need the same password to restore
          it.
        </p>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="download-password">
            Password (optional)
          </label>
          <input
            id="download-password"
            className={styles.input}
            type="password"
            placeholder="Leave blank for plain .zip"
            value={downloadPwd}
            onChange={(e) => setDownloadPwd(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <StatusBanner
          variant="error"
          message={downloadErr}
          onDismiss={() => setDownloadErr(null)}
        />
        <div className={styles.actions}>
          {downloading && downloadProgress && (
            <span className={styles.actionsLeft + " " + styles.progress}>
              {downloadProgress.total === null
                ? `Streaming ${formatBytes(downloadProgress.loaded)}…`
                : `${formatBytes(downloadProgress.loaded)} / ${formatBytes(downloadProgress.total)}`}
            </span>
          )}
          <button
            className={styles.primaryBtn}
            onClick={() => void handleDownload()}
            disabled={downloading}
            type="button"
          >
            {downloading ? "Preparing…" : "Download backup"}
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Restore from backup</h2>
        <p className={styles.sectionDesc}>
          Apply a previously downloaded backup file.{" "}
          <strong>Fresh install</strong> wipes existing data first;{" "}
          <strong>add-on</strong> merges new rows and lets you decide what
          happens with each conflict.
        </p>

        <div className={styles.step}>
          <h3 className={styles.stepTitle}>1. Choose file</h3>
          <div className={styles.fileRow}>
            <button
              type="button"
              className={styles.fileButton}
              onClick={() => fileInputRef.current?.click()}
            >
              {restoreFile ? "Replace file…" : "Choose file…"}
            </button>
            {restoreFile && (
              <button
                type="button"
                className={styles.fileButton}
                onClick={clearFile}
              >
                Clear
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,.bin,application/zip,application/octet-stream"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setRestoreFile(f);
                resetRestoreState();
              }}
              aria-label="Backup file"
            />
            {restoreFile && (
              <span className={styles.fileMeta}>
                <strong>{restoreFile.name}</strong> ·{" "}
                {formatBytes(restoreFile.size)}
              </span>
            )}
          </div>

          {restoreFile && (
            <>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="restore-password">
                  Password (if encrypted)
                </label>
                <input
                  id="restore-password"
                  className={styles.input}
                  type="password"
                  placeholder="Leave blank for plain .zip"
                  value={restorePwd}
                  onChange={(e) => setRestorePwd(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>Restore mode</span>
                <div className={styles.radioGroup}>
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="restore-mode"
                      value="addon"
                      checked={restoreMode === "addon"}
                      onChange={() => {
                        setRestoreMode("addon");
                        setRestoreResult(null);
                      }}
                    />
                    <span>
                      Add-on (merge)
                      <span className={styles.radioHint}>
                        Insert new rows, choose per row what to do with
                        conflicts.
                      </span>
                    </span>
                  </label>
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="restore-mode"
                      value="fresh"
                      checked={restoreMode === "fresh"}
                      onChange={() => {
                        setRestoreMode("fresh");
                        setRestoreResult(null);
                      }}
                    />
                    <span>
                      Fresh install (wipe first)
                      <span className={styles.radioHint}>
                        Truncate all existing rows, then load the backup. Cannot
                        be undone.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            </>
          )}
        </div>

        <div className={styles.step}>
          <h3 className={styles.stepTitle}>2. Inspect</h3>
          <p className={styles.sectionDesc}>
            Read the backup's manifest and detect conflicts. Nothing is written
            yet.
          </p>
          <div className={styles.actions}>
            <button
              className={styles.secondaryBtn}
              onClick={() => void handleInspect()}
              disabled={!restoreFile || inspecting}
              type="button"
            >
              {inspecting ? "Reading…" : "Inspect"}
            </button>
          </div>

          <StatusBanner
            variant="error"
            message={restoreErr}
            onDismiss={() => setRestoreErr(null)}
          />

          {report && (
            <>
              <div className={styles.summary}>
                <div className={styles.summaryCard}>
                  <p className={styles.summaryLabel}>Format version</p>
                  <p className={styles.summaryValue}>{report.format_version}</p>
                </div>
                <div className={styles.summaryCard}>
                  <p className={styles.summaryLabel}>Exported at</p>
                  <p className={styles.summaryValueText}>
                    {report.exported_at ?? "unknown"}
                  </p>
                </div>
                <div className={styles.summaryCard}>
                  <p className={styles.summaryLabel}>Encrypted</p>
                  <p className={styles.summaryValueText}>
                    {report.encrypted ? "yes" : "no"}
                  </p>
                </div>
                <div className={styles.summaryCard}>
                  <p className={styles.summaryLabel}>Conflicts</p>
                  <p className={styles.summaryValue}>
                    {report.conflicts.length}
                  </p>
                </div>
              </div>

              <h4 className={styles.stepTitle}>Row counts per table</h4>
              <div className={styles.summary}>
                {Object.entries(report.table_counts)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([table, count]) => (
                    <div key={table} className={styles.summaryCard}>
                      <p className={styles.summaryLabel}>{table}</p>
                      <p className={styles.summaryValue}>{count}</p>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>

        {report && (
          <div className={styles.step}>
            <h3 className={styles.stepTitle}>3. Apply</h3>

            {restoreMode === "addon" && report.conflicts.length === 0 && (
              <p className={styles.empty}>
                No conflicts — every row in the file is new.
              </p>
            )}

            {restoreMode === "addon" && report.conflicts.length > 0 && (
              <>
                <div className={styles.tableToolbar}>
                  <span className={styles.toolbarLeft}>
                    <strong>{conflictStats.total}</strong> conflict
                    {conflictStats.total === 1 ? "" : "s"}
                    <span>·</span>
                    <span className={styles.chip + " " + styles.chipMuted}>
                      Skip: {conflictStats.skip}
                    </span>
                    <span className={styles.chip + " " + styles.chipWarn}>
                      Overwrite: {conflictStats.overwrite}
                    </span>
                  </span>
                  <span className={styles.toolbarLeft}>
                    <button
                      type="button"
                      className={styles.toolbarLink}
                      onClick={() => setAllResolutions("skip")}
                    >
                      Set all skip
                    </button>
                    <button
                      type="button"
                      className={styles.toolbarLink}
                      onClick={() => setAllResolutions("overwrite")}
                    >
                      Set all overwrite
                    </button>
                  </span>
                </div>

                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Table</th>
                        <th>Key</th>
                        <th>Resolution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.conflicts.map((c) => {
                        const key = naturalKeyOf(c);
                        const value = naturalKeyDisplay(c);
                        const choice = resolutions[key] ?? "skip";
                        return (
                          <tr key={key}>
                            <td>
                              <span className={styles.chip}>{c.table}</span>
                            </td>
                            <td>
                              <span className={styles.keyCell}>
                                <code>{value}</code>
                                {c.natural_key && (
                                  <span
                                    className={
                                      styles.chip + " " + styles.chipMuted
                                    }
                                  >
                                    {c.natural_key}
                                  </span>
                                )}
                              </span>
                            </td>
                            <td>
                              <span className={styles.toggleGroup}>
                                <button
                                  type="button"
                                  className={
                                    styles.toggleBtn +
                                    (choice === "skip"
                                      ? " " + styles.toggleBtnActive
                                      : "")
                                  }
                                  onClick={() =>
                                    setResolutions((prev) => ({
                                      ...prev,
                                      [key]: "skip",
                                    }))
                                  }
                                  aria-pressed={choice === "skip"}
                                >
                                  Skip
                                </button>
                                <button
                                  type="button"
                                  className={
                                    styles.toggleBtn +
                                    " " +
                                    styles.toggleBtnDanger +
                                    (choice === "overwrite"
                                      ? " " + styles.toggleBtnActive
                                      : "")
                                  }
                                  onClick={() =>
                                    setResolutions((prev) => ({
                                      ...prev,
                                      [key]: "overwrite",
                                    }))
                                  }
                                  aria-pressed={choice === "overwrite"}
                                >
                                  Overwrite
                                </button>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {restoreMode === "fresh" && (
              <div className={styles.wipeCallout}>
                <strong>Fresh restore will wipe these tables first.</strong>{" "}
                Every row will be deleted before the backup is applied.
                <ul className={styles.wipeCalloutList}>
                  {Object.keys(report.table_counts)
                    .sort()
                    .map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                </ul>
              </div>
            )}

            <div className={styles.actions}>
              {restoreMode === "addon" && conflictStats.overwrite > 0 && (
                <span className={styles.actionsLeft}>
                  {conflictStats.overwrite} existing row
                  {conflictStats.overwrite === 1 ? "" : "s"} will be
                  overwritten.
                </span>
              )}
              <button
                className={
                  restoreMode === "fresh" ? styles.dangerBtn : styles.primaryBtn
                }
                onClick={() => void handleRestore()}
                disabled={restoring}
                type="button"
              >
                {restoring
                  ? "Restoring…"
                  : restoreMode === "fresh"
                    ? "Wipe and restore"
                    : "Apply restore"}
              </button>
            </div>
          </div>
        )}

        <StatusBanner
          variant="success"
          message={restoreResult}
          onDismiss={() => setRestoreResult(null)}
        />
      </section>
    </div>
  );
}
