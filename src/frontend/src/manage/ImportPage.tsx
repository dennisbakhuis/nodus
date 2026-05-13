import { useEffect, useMemo, useRef, useState } from "react";
import { importPeerReferences, type ImportSummary } from "../api/peer-import";
import { listTopics } from "../api/topics";
import { listParties, type PartyRead } from "../api/parties";
import type {
  PeerRefExportEnvelope,
  PeerRefExportSource,
  PeerRefExportTopic,
} from "../radar/dataExport/jsonPeerRef";
import type { TopicRead } from "./types";
import { LoadingState } from "../shared/LoadingState";
import { StatusBanner } from "../shared/StatusBanner";
import styles from "./ImportPage.module.css";

const EXPECTED_FORMAT = "nodus-peer-reference";

type ParsedFile = {
  envelope: PeerRefExportEnvelope;
  filename: string;
};

type RowState = {
  include: boolean;
  targetTopicId: string | null;
  autoMatched: boolean;
};

function validate(parsed: unknown): PeerRefExportEnvelope {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("File is not a JSON object.");
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.format !== EXPECTED_FORMAT) {
    throw new Error(
      `Wrong format. Expected ${EXPECTED_FORMAT}, got ${String(obj.format)}.`,
    );
  }
  if (typeof obj.version !== "string") {
    throw new Error("Missing version field.");
  }
  if (typeof obj.source !== "object" || obj.source === null) {
    throw new Error("Missing source block.");
  }
  if (!Array.isArray(obj.topics)) {
    throw new Error("Missing topics array.");
  }
  return parsed as PeerRefExportEnvelope;
}

function autoMatch(
  source: PeerRefExportTopic,
  bySlug: Map<string, TopicRead>,
  byName: Map<string, TopicRead>,
): TopicRead | null {
  const slugHit = bySlug.get(source.slug);
  if (slugHit) return slugHit;
  const nameHit = byName.get(source.canonical_name.trim().toLowerCase());
  return nameHit ?? null;
}

export function ImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [editedSource, setEditedSource] = useState<PeerRefExportSource | null>(
    null,
  );

  const [topics, setTopics] = useState<TopicRead[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [topicsError, setTopicsError] = useState<string | null>(null);

  const [parties, setParties] = useState<PartyRead[]>([]);
  const [existingTopicIds, setExistingTopicIds] = useState<Set<string>>(
    new Set(),
  );
  const [existingLoading, setExistingLoading] = useState(false);

  const [rows, setRows] = useState<RowState[]>([]);

  const [previewBusy, setPreviewBusy] = useState(false);
  const [commitBusy, setCommitBusy] = useState(false);
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [committed, setCommitted] = useState<ImportSummary | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTopicsLoading(true);
    (async () => {
      try {
        const pageSize = 200;
        const all: TopicRead[] = [];
        let offset = 0;
        while (!cancelled) {
          const page = await listTopics({ limit: pageSize, offset });
          all.push(...page);
          if (page.length < pageSize) break;
          offset += pageSize;
        }
        if (cancelled) return;
        setTopics(all);
      } catch (e) {
        if (cancelled) return;
        setTopicsError(
          e instanceof Error ? e.message : "Failed to load topics",
        );
      } finally {
        if (!cancelled) setTopicsLoading(false);
      }
    })();
    listParties()
      .then((data) => {
        if (cancelled) return;
        setParties(data);
      })
      .catch(() => {
        // Non-fatal: overwrite detection just degrades silently if parties
        // cannot be loaded.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const topicById = useMemo(() => {
    const m = new Map<string, TopicRead>();
    for (const t of topics) m.set(t.id, t);
    return m;
  }, [topics]);

  const topicBySlug = useMemo(() => {
    const m = new Map<string, TopicRead>();
    for (const t of topics) m.set(t.slug, t);
    return m;
  }, [topics]);

  const topicByName = useMemo(() => {
    const m = new Map<string, TopicRead>();
    for (const t of topics) m.set(t.canonical_name.trim().toLowerCase(), t);
    return m;
  }, [topics]);

  const sortedTopics = useMemo(() => {
    return [...topics].sort((a, b) =>
      a.canonical_name.localeCompare(b.canonical_name),
    );
  }, [topics]);

  const resolvedParty = useMemo<PartyRead | null>(() => {
    if (!editedSource) return null;
    const slug = editedSource.party_slug?.trim().toLowerCase() ?? "";
    const name = editedSource.party_name.trim().toLowerCase();
    if (slug) {
      const bySlug = parties.find((p) => p.slug.toLowerCase() === slug);
      if (bySlug) return bySlug;
    }
    if (name) {
      const byName = parties.find((p) => p.name.trim().toLowerCase() === name);
      if (byName) return byName;
    }
    return null;
  }, [editedSource, parties]);

  useEffect(() => {
    let cancelled = false;
    if (!resolvedParty) {
      setExistingTopicIds(new Set());
      return;
    }
    setExistingLoading(true);
    (async () => {
      try {
        const pageSize = 200;
        const ids = new Set<string>();
        let offset = 0;
        while (!cancelled) {
          const page = await listTopics({
            has_party: resolvedParty.id,
            limit: pageSize,
            offset,
          });
          for (const t of page) ids.add(t.id);
          if (page.length < pageSize) break;
          offset += pageSize;
        }
        if (cancelled) return;
        setExistingTopicIds(ids);
      } catch {
        if (!cancelled) setExistingTopicIds(new Set());
      } finally {
        if (!cancelled) setExistingLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedParty]);

  const overwriteCount = useMemo(() => {
    let count = 0;
    for (const r of rows) {
      if (
        r.include &&
        r.targetTopicId &&
        existingTopicIds.has(r.targetTopicId)
      ) {
        count += 1;
      }
    }
    return count;
  }, [rows, existingTopicIds]);

  function resetState() {
    setParsed(null);
    setParseError(null);
    setEditedSource(null);
    setRows([]);
    setPreview(null);
    setCommitted(null);
    setServerError(null);
  }

  function updateSource(change: Partial<PeerRefExportSource>) {
    setEditedSource((prev) => (prev ? { ...prev, ...change } : prev));
    setPreview(null);
    setCommitted(null);
  }

  async function handleFile(file: File | null) {
    resetState();
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const envelope = validate(json);
      setParsed({ envelope, filename: file.name });
      setEditedSource({ ...envelope.source });
      const nextRows: RowState[] = envelope.topics.map((src) => {
        const match = autoMatch(src, topicBySlug, topicByName);
        return {
          include: match !== null,
          targetTopicId: match ? match.id : null,
          autoMatched: match !== null,
        };
      });
      setRows(nextRows);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Could not parse file");
    }
  }

  function updateRow(index: number, change: Partial<RowState>) {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...change } : r)),
    );
    setPreview(null);
    setCommitted(null);
  }

  function selectAllMatched() {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        include: r.targetTopicId !== null,
      })),
    );
    setPreview(null);
    setCommitted(null);
  }

  function selectNone() {
    setRows((prev) => prev.map((r) => ({ ...r, include: false })));
    setPreview(null);
    setCommitted(null);
  }

  function buildEditedEnvelope(): PeerRefExportEnvelope | null {
    if (!parsed || !editedSource) return null;
    const editedTopics: PeerRefExportTopic[] = [];
    parsed.envelope.topics.forEach((src, i) => {
      const r = rows[i];
      if (!r || !r.include || !r.targetTopicId) return;
      const local = topicById.get(r.targetTopicId);
      if (!local) return;
      editedTopics.push({
        ...src,
        canonical_name: local.canonical_name,
        slug: local.slug,
      });
    });
    return {
      ...parsed.envelope,
      source: {
        ...editedSource,
        party_name: editedSource.party_name.trim(),
        party_slug: editedSource.party_slug?.trim() || null,
        party_url: editedSource.party_url?.trim() || null,
        source_name: editedSource.source_name.trim(),
        source_url: editedSource.source_url?.trim() || null,
      },
      topics: editedTopics,
    };
  }

  async function runPreview() {
    const env = buildEditedEnvelope();
    if (!env) return;
    setPreviewBusy(true);
    setServerError(null);
    setCommitted(null);
    try {
      const summary = await importPeerReferences(env, true);
      setPreview(summary);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function runCommit() {
    const env = buildEditedEnvelope();
    if (!env) return;
    setCommitBusy(true);
    setServerError(null);
    try {
      const summary = await importPeerReferences(env, false);
      setCommitted(summary);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setCommitBusy(false);
    }
  }

  const totalRows = rows.length;
  const includedCount = rows.filter((r) => r.include).length;
  const matchedCount = rows.filter((r) => r.targetTopicId !== null).length;
  const unmatchedCount = totalRows - matchedCount;
  const sourceValid =
    editedSource !== null &&
    editedSource.party_name.trim().length > 0 &&
    editedSource.source_name.trim().length > 0;
  const canImport =
    parsed !== null && includedCount > 0 && sourceValid && !commitBusy;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Import References</h1>
        <p>
          Bring peer references in from a JSON file exported by another Nodus
          instance. Review each row, pick the local topic it should link to,
          then run the import.
        </p>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>1. Upload file</h2>
        <p className={styles.sectionDesc}>
          Select a peer-reference JSON file produced by another Nodus radar.
        </p>
        <div className={styles.fileRow}>
          <button
            type="button"
            className={styles.fileButton}
            onClick={() => fileInputRef.current?.click()}
          >
            {parsed ? "Replace file…" : "Choose file…"}
          </button>
          {parsed && (
            <button
              type="button"
              className={styles.fileButton}
              onClick={() => {
                resetState();
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            >
              Clear
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              e.target.value = "";
              void handleFile(file);
            }}
            aria-label="Peer reference JSON file"
          />
          {parsed && (
            <span className={styles.fileMeta}>
              <strong>{parsed.filename}</strong> ·{" "}
              {parsed.envelope.topics.length} reference
              {parsed.envelope.topics.length === 1 ? "" : "s"} from{" "}
              <strong>{parsed.envelope.source.party_name}</strong> (
              <code>{parsed.envelope.source.source_name}</code>)
            </span>
          )}
        </div>
        {parseError && (
          <div style={{ marginTop: "var(--space-3)" }}>
            <StatusBanner variant="error" message={parseError} />
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>2. Review & link</h2>
        <p className={styles.sectionDesc}>
          Each row links one incoming reference to a local topic. Slug or name
          matches are pre-selected; rows without a match are unticked — pick a
          target topic to include them.
        </p>

        {topicsLoading ? (
          <LoadingState>Loading local topics…</LoadingState>
        ) : topicsError ? (
          <StatusBanner variant="error" message={topicsError} />
        ) : !parsed || !editedSource ? (
          <p className={styles.empty}>Upload a file to see references here.</p>
        ) : (
          <>
            <div className={styles.peerCard}>
              <div className={styles.peerCardHead}>
                <h3 className={styles.peerCardTitle}>Peer organization</h3>
                <span className={styles.peerCardMeta}>
                  {resolvedParty ? (
                    <>
                      Matches existing party{" "}
                      <strong>{resolvedParty.name}</strong>
                    </>
                  ) : (
                    <>No matching party — will be created on import</>
                  )}
                </span>
              </div>
              <div className={styles.peerCardGrid}>
                <label className={styles.peerField}>
                  <span className={styles.peerLabel}>Name *</span>
                  <input
                    type="text"
                    className={styles.peerInput}
                    value={editedSource.party_name}
                    placeholder="e.g. Hooli"
                    onChange={(e) =>
                      updateSource({ party_name: e.target.value })
                    }
                  />
                </label>
                <label className={styles.peerField}>
                  <span className={styles.peerLabel}>Slug</span>
                  <input
                    type="text"
                    className={styles.peerInput}
                    value={editedSource.party_slug ?? ""}
                    placeholder="e.g. acme-co"
                    onChange={(e) =>
                      updateSource({ party_slug: e.target.value })
                    }
                  />
                </label>
                <label className={styles.peerField}>
                  <span className={styles.peerLabel}>Website</span>
                  <input
                    type="url"
                    className={styles.peerInput}
                    value={editedSource.party_url ?? ""}
                    placeholder="https://example.com/"
                    onChange={(e) =>
                      updateSource({ party_url: e.target.value })
                    }
                  />
                </label>
                <label className={styles.peerField}>
                  <span className={styles.peerLabel}>Source name *</span>
                  <input
                    type="text"
                    className={styles.peerInput}
                    value={editedSource.source_name}
                    placeholder="e.g. peer-radar-2026"
                    onChange={(e) =>
                      updateSource({ source_name: e.target.value })
                    }
                  />
                </label>
                <label className={styles.peerField}>
                  <span className={styles.peerLabel}>Source URL</span>
                  <input
                    type="url"
                    className={styles.peerInput}
                    value={editedSource.source_url ?? ""}
                    placeholder="https://radar.example.com/"
                    onChange={(e) =>
                      updateSource({ source_url: e.target.value })
                    }
                  />
                </label>
              </div>
            </div>

            <div className={styles.tableToolbar}>
              <div className={styles.toolbarLeft}>
                <span>
                  <strong>{includedCount}</strong> of {totalRows} selected
                </span>
                <span>·</span>
                <span>{matchedCount} auto-matched</span>
                {unmatchedCount > 0 && (
                  <>
                    <span>·</span>
                    <span
                      className={styles.chipWarn}
                      style={{ padding: "2px 8px", borderRadius: 999 }}
                    >
                      {unmatchedCount} unmatched
                    </span>
                  </>
                )}
                {resolvedParty && overwriteCount > 0 && (
                  <>
                    <span>·</span>
                    <span
                      className={styles.chipWarn}
                      style={{ padding: "2px 8px", borderRadius: 999 }}
                    >
                      {overwriteCount} will overwrite
                    </span>
                  </>
                )}
                {existingLoading && (
                  <>
                    <span>·</span>
                    <span className={styles.fileMeta}>
                      checking overwrites…
                    </span>
                  </>
                )}
              </div>
              <div className={styles.toolbarLeft}>
                <button
                  type="button"
                  className={styles.toolbarLink}
                  onClick={selectAllMatched}
                  disabled={matchedCount === 0}
                >
                  Select all matched
                </button>
                <button
                  type="button"
                  className={styles.toolbarLink}
                  onClick={selectNone}
                  disabled={includedCount === 0}
                >
                  Select none
                </button>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        aria-label="Toggle all"
                        checked={
                          includedCount > 0 && includedCount === totalRows
                        }
                        ref={(el) => {
                          if (el) {
                            el.indeterminate =
                              includedCount > 0 && includedCount < totalRows;
                          }
                        }}
                        onChange={(e) => {
                          const next = e.target.checked;
                          setRows((prev) =>
                            prev.map((r) => ({
                              ...r,
                              include: next && r.targetTopicId !== null,
                            })),
                          );
                          setPreview(null);
                          setCommitted(null);
                        }}
                      />
                    </th>
                    <th>From peer</th>
                    <th>Ring</th>
                    <th>Segment</th>
                    <th>Links to local topic</th>
                    <th style={{ width: 90 }}>Match</th>
                    <th style={{ width: 110 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.envelope.topics.map((src, i) => {
                    const row = rows[i];
                    if (!row) return null;
                    const unmatched = row.targetTopicId === null;
                    const willOverwrite =
                      row.targetTopicId !== null &&
                      existingTopicIds.has(row.targetTopicId);
                    const trClass = [
                      !row.include && styles.rowMuted,
                      unmatched && styles.rowUnmatched,
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <tr key={`${src.slug}-${i}`} className={trClass}>
                        <td>
                          <input
                            type="checkbox"
                            className={styles.checkbox}
                            checked={row.include}
                            disabled={row.targetTopicId === null}
                            onChange={(e) =>
                              updateRow(i, { include: e.target.checked })
                            }
                            aria-label={`Include ${src.peer_title}`}
                          />
                        </td>
                        <td>
                          <span className={styles.sourceTitle}>
                            {src.peer_title}
                          </span>
                          <span className={styles.sourceSlug}>{src.slug}</span>
                        </td>
                        <td>
                          {src.peer_ring_label ? (
                            <span className={styles.chip}>
                              {src.peer_ring_label}
                            </span>
                          ) : (
                            <span
                              className={styles.chip + " " + styles.chipMuted}
                            >
                              —
                            </span>
                          )}
                        </td>
                        <td>
                          {src.peer_segment_label ? (
                            <span
                              className={styles.chip + " " + styles.chipMuted}
                            >
                              {src.peer_segment_label}
                            </span>
                          ) : (
                            <span
                              className={styles.chip + " " + styles.chipMuted}
                            >
                              —
                            </span>
                          )}
                        </td>
                        <td>
                          <select
                            className={styles.select}
                            value={row.targetTopicId ?? ""}
                            onChange={(e) => {
                              const id = e.target.value || null;
                              updateRow(i, {
                                targetTopicId: id,
                                autoMatched: false,
                                include: id !== null ? row.include : false,
                              });
                            }}
                            aria-label={`Target topic for ${src.peer_title}`}
                          >
                            <option value="">— skip (no link) —</option>
                            {sortedTopics.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.canonical_name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {row.targetTopicId === null ? (
                            <span
                              className={styles.chip + " " + styles.chipWarn}
                            >
                              unmatched
                            </span>
                          ) : row.autoMatched ? (
                            <span className={styles.chip + " " + styles.chipOk}>
                              auto
                            </span>
                          ) : (
                            <span className={styles.chip}>manual</span>
                          )}
                        </td>
                        <td>
                          {row.targetTopicId === null ? (
                            <span
                              className={styles.chip + " " + styles.chipMuted}
                            >
                              —
                            </span>
                          ) : willOverwrite ? (
                            <span
                              className={styles.chip + " " + styles.chipWarn}
                              title="A peer reference for this peer already exists on this topic — running import will overwrite it."
                            >
                              ↻ overwrite
                            </span>
                          ) : (
                            <span className={styles.chip + " " + styles.chipOk}>
                              + new
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>3. Import</h2>
        <p className={styles.sectionDesc}>
          Run a preview first to see exactly what will change, then confirm to
          write. The party and source rows are created on first import.
        </p>

        {serverError && (
          <div style={{ marginBottom: "var(--space-3)" }}>
            <StatusBanner variant="error" message={serverError} />
          </div>
        )}

        {preview && !committed && (
          <SummaryGrid label="Preview (dry run)" summary={preview} />
        )}
        {committed && (
          <SummaryGrid
            label="Imported"
            summary={committed}
            variant="committed"
          />
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => void runPreview()}
            disabled={!canImport || previewBusy}
          >
            {previewBusy ? "Previewing…" : "Run preview"}
          </button>
          <button
            type="button"
            className={styles.saveBtn}
            onClick={() => void runCommit()}
            disabled={
              !canImport || !preview || commitBusy || committed !== null
            }
          >
            {commitBusy
              ? "Importing…"
              : committed
                ? "Imported"
                : `Import ${includedCount} reference${includedCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </section>
    </div>
  );
}

function SummaryGrid({
  label,
  summary,
  variant = "preview",
}: {
  label: string;
  summary: ImportSummary;
  variant?: "preview" | "committed";
}) {
  return (
    <div>
      <h3
        style={{
          fontSize: 13,
          fontWeight: 700,
          margin: "0 0 var(--space-2) 0",
          color:
            variant === "committed"
              ? "var(--color-dark-blue)"
              : "var(--color-dark-text)",
        }}
      >
        {label}
      </h3>
      <div className={styles.summary}>
        <Cell
          label="Party"
          value={`${summary.party_resolved}${summary.party_created ? " (new)" : ""}`}
        />
        <Cell
          label="Source"
          value={`${summary.source_resolved}${summary.source_created ? " (new)" : ""}`}
        />
        <Cell label="Matched" value={summary.topics_matched} />
        <Cell label="Unmatched" value={summary.topics_unmatched.length} />
        <Cell
          label="Refs created"
          value={summary.peer_references_created}
          highlight
        />
        <Cell label="Refs updated" value={summary.peer_references_updated} />
        <Cell label="URLs added" value={summary.urls_added} />
        <Cell label="URLs already present" value={summary.urls_skipped} />
      </div>
      {summary.topics_unmatched.length > 0 && (
        <details style={{ marginTop: "var(--space-3)" }}>
          <summary
            style={{
              cursor: "pointer",
              fontSize: 12,
              color: "var(--color-muted-text)",
            }}
          >
            Unmatched on server ({summary.topics_unmatched.length}) — check why
            mapping was rejected
          </summary>
          <ul
            style={{
              marginTop: 6,
              fontSize: 12,
              color: "var(--color-muted-text)",
            }}
          >
            {summary.topics_unmatched.map((t) => (
              <li key={t.slug}>
                <code>{t.slug}</code> — {t.canonical_name}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Cell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className={styles.summaryCard}>
      <p className={styles.summaryLabel}>{label}</p>
      <p
        className={
          styles.summaryValue + (highlight ? " " + styles.summaryNew : "")
        }
      >
        {value}
      </p>
    </div>
  );
}
