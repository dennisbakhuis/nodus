import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  listCycles,
  createCycle,
  closeCycle,
  getDeliverable,
  updateCycle,
} from "./api";
import type { CycleRead, DeliverableType } from "./types";
import { useConfirm } from "../shared/ConfirmDialog";
import { LoadingState } from "../shared/LoadingState";
import { CycleColorPicker } from "../shared/CycleColorPicker";
import { themeByKey, DEFAULT_SEGMENT_THEME } from "../radar/segmentThemes";
import styles from "./CyclesPage.module.css";

type NewCycleForm = {
  name: string;
  start_date: string;
  color: string;
};

const DELIVERABLE_LABELS: Record<DeliverableType, string> = {
  "radar.json": "Radar JSON",
  "summary.md": "Summary Brief",
  "detailed.md": "Detailed Report",
  "delta.md": "Delta Document",
};

const ALL_DELIVERABLE_TYPES: DeliverableType[] = [
  "radar.json",
  "summary.md",
  "detailed.md",
  "delta.md",
];

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadJson(content: Record<string, unknown>, filename: string) {
  const blob = new Blob([JSON.stringify(content, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function daysSince(isoDate: string): number {
  const start = new Date(isoDate).getTime();
  if (Number.isNaN(start)) return 0;
  const ms = Date.now() - start;
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function ColorPill({ colorKey }: { colorKey: string | null | undefined }) {
  const theme = themeByKey(colorKey);
  return (
    <span
      className={styles.colorPill}
      style={{ background: theme.labelText }}
      aria-label={`Color: ${theme.label}`}
    />
  );
}

type EditForm = { name: string; color: string };

export function CyclesPage() {
  const confirm = useConfirm();
  const [cycles, setCycles] = useState<CycleRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState<NewCycleForm>({
    name: "",
    start_date: new Date().toISOString().slice(0, 10),
    color: DEFAULT_SEGMENT_THEME.key,
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deltaPreview, setDeltaPreview] = useState<string | null>(null);
  const [deltaLoading, setDeltaLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: "", color: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listCycles();
      setCycles(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load cycles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCycle = useMemo(
    () => cycles.find((c) => c.end_date === null) ?? null,
    [cycles],
  );
  const closedCycles = useMemo(
    () => cycles.filter((c) => c.end_date !== null),
    [cycles],
  );
  const mostRecentClosed = closedCycles[0] ?? null;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newForm.name.trim() || !newForm.start_date) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createCycle({
        name: newForm.name.trim(),
        start_date: newForm.start_date,
        color: newForm.color || null,
      });
      setShowNewForm(false);
      setNewForm({
        name: "",
        start_date: new Date().toISOString().slice(0, 10),
        color: DEFAULT_SEGMENT_THEME.key,
      });
      void load();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create cycle");
    } finally {
      setCreating(false);
    }
  }

  async function handleClose(cycle: CycleRead) {
    const ok = await confirm({
      title: "Close cycle",
      body: `Close cycle "${cycle.name}"? Closing freezes a snapshot of every On-Radar technology and creates a new baseline for the next cycle.`,
      confirmLabel: "Close cycle",
    });
    if (!ok) return;
    try {
      await closeCycle(cycle.id, {
        end_date: new Date().toISOString().slice(0, 10),
      });
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to close cycle");
    }
  }

  function startEdit(cycle: CycleRead) {
    setEditingId(cycle.id);
    setEditForm({
      name: cycle.name,
      color: cycle.color ?? DEFAULT_SEGMENT_THEME.key,
    });
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(cycle: CycleRead) {
    if (!editForm.name.trim()) {
      setEditError("Name is required");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await updateCycle(cycle.id, {
        name: editForm.name.trim() !== cycle.name ? editForm.name.trim() : null,
        color: editForm.color !== (cycle.color ?? "") ? editForm.color : null,
      });
      setEditingId(null);
      void load();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to update cycle");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDownload(
    cycleId: string,
    type: DeliverableType,
    cycleName: string,
  ) {
    try {
      const content = await getDeliverable(cycleId, type);
      const safeSlug = cycleName.replace(/[^a-zA-Z0-9-]/g, "_");
      if (type === "radar.json") {
        downloadJson(
          content as Record<string, unknown>,
          `${safeSlug}-radar.json`,
        );
      } else {
        const ext = type.split(".")[1] ?? "md";
        const base = type.split(".")[0] ?? type;
        downloadText(content as string, `${safeSlug}-${base}.${ext}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    }
  }

  async function handleDeltaPreview() {
    if (!mostRecentClosed) return;
    setDeltaLoading(true);
    try {
      const content = (await getDeliverable(
        mostRecentClosed.id,
        "delta.md",
      )) as string;
      setDeltaPreview(content);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delta preview failed");
    } finally {
      setDeltaLoading(false);
    }
  }

  function renderEditForm(cycle: CycleRead) {
    return (
      <div className={styles.editForm}>
        <div>
          <label className={styles.editLabel} htmlFor={`edit-name-${cycle.id}`}>
            Cycle name
          </label>
          <input
            id={`edit-name-${cycle.id}`}
            className={styles.input}
            type="text"
            value={editForm.name}
            onChange={(e) =>
              setEditForm((prev) => ({ ...prev, name: e.target.value }))
            }
          />
        </div>
        <div>
          <span className={styles.editLabel}>Color</span>
          <CycleColorPicker
            value={editForm.color}
            onChange={(color) => setEditForm((prev) => ({ ...prev, color }))}
          />
        </div>
        {editError && <p className={styles.error}>{editError}</p>}
        <div className={styles.editActions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={cancelEdit}
            disabled={editSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.createBtn}
            onClick={() => void saveEdit(cycle)}
            disabled={editSaving}
          >
            {editSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <LoadingState>Loading cycles…</LoadingState>;
  }

  return (
    <div>
      <div className={styles.header}>
        <h1>Cycle Management</h1>
        {!showNewForm && (
          <button
            className={styles.newCycleBtn}
            onClick={() => setShowNewForm(true)}
            type="button"
          >
            New Cycle
          </button>
        )}
      </div>

      {showNewForm && (
        <form
          className={styles.newCycleForm}
          onSubmit={(e) => void handleCreate(e)}
        >
          <h2>Create New Cycle</h2>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="cycle-name">
                Cycle Name<span className={styles.required}>*</span>
              </label>
              <input
                id="cycle-name"
                className={styles.input}
                type="text"
                placeholder="e.g. 2026-Q1"
                value={newForm.name}
                onChange={(e) =>
                  setNewForm((prev) => ({ ...prev, name: e.target.value }))
                }
                required
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="cycle-start">
                Start Date<span className={styles.required}>*</span>
              </label>
              <input
                id="cycle-start"
                className={styles.input}
                type="date"
                value={newForm.start_date}
                onChange={(e) =>
                  setNewForm((prev) => ({
                    ...prev,
                    start_date: e.target.value,
                  }))
                }
                required
              />
            </div>
          </div>
          <div className={styles.field}>
            <span className={styles.label}>Color</span>
            <CycleColorPicker
              value={newForm.color}
              onChange={(color) => setNewForm((prev) => ({ ...prev, color }))}
            />
          </div>
          {createError && <p className={styles.error}>{createError}</p>}
          <div className={styles.formActions}>
            <button
              className={styles.cancelBtn}
              type="button"
              onClick={() => {
                setShowNewForm(false);
                setCreateError(null);
              }}
            >
              Cancel
            </button>
            <button
              className={styles.createBtn}
              type="submit"
              disabled={creating || !newForm.name.trim()}
            >
              {creating ? "Creating..." : "Create Cycle"}
            </button>
          </div>
        </form>
      )}

      {error && <div className={styles.error}>{error}</div>}

      {openCycle ? (
        <div
          className={styles.cycleCard}
          style={{
            borderLeft: "4px solid var(--color-brand-orange)",
            marginBottom: "var(--space-4)",
          }}
        >
          <div className={styles.cycleHeader}>
            <div>
              <p className={styles.cycleName}>
                <ColorPill colorKey={openCycle.color} />
                Active: {openCycle.name}
              </p>
              <p className={styles.cycleMeta}>
                Started {openCycle.start_date} ·{" "}
                {daysSince(openCycle.start_date)} day(s) open
              </p>
            </div>
            <span className={`${styles.badge} ${styles.badgeOpen}`}>Open</span>
          </div>
          {editingId === openCycle.id ? (
            renderEditForm(openCycle)
          ) : (
            <div className={styles.cycleActions}>
              <button
                className={styles.downloadBtn}
                type="button"
                onClick={() => startEdit(openCycle)}
              >
                Edit name &amp; color
              </button>
              <button
                className={styles.closeBtn}
                onClick={() => void handleClose(openCycle)}
                type="button"
              >
                Close cycle &amp; freeze snapshot
              </button>
              {mostRecentClosed && (
                <button
                  className={styles.downloadBtn}
                  type="button"
                  onClick={() => void handleDeltaPreview()}
                  disabled={deltaLoading}
                >
                  {deltaLoading ? "Loading…" : "Preview delta vs last cycle"}
                </button>
              )}
            </div>
          )}
          {deltaPreview && (
            <pre
              style={{
                marginTop: "var(--space-3)",
                background: "var(--color-page-background)",
                padding: "var(--space-3)",
                borderRadius: 6,
                maxHeight: 300,
                overflow: "auto",
                fontSize: 12,
                whiteSpace: "pre-wrap",
              }}
            >
              {deltaPreview}
            </pre>
          )}
        </div>
      ) : (
        <div
          className={styles.emptyState}
          style={{ marginBottom: "var(--space-4)" }}
        >
          No open cycle. Create one to start tracking radar updates.
        </div>
      )}

      {closedCycles.length > 0 && (
        <>
          <h2
            style={{
              fontSize: 16,
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-dark-blue)",
              margin: "var(--space-4) 0 var(--space-3) 0",
            }}
          >
            Closed cycles
          </h2>
          <div className={styles.cycleList}>
            {closedCycles.map((cycle) => (
              <div key={cycle.id} className={styles.cycleCard}>
                <div className={styles.cycleHeader}>
                  <div>
                    <p className={styles.cycleName}>
                      <ColorPill colorKey={cycle.color} />
                      {cycle.name}
                    </p>
                    <p className={styles.cycleMeta}>
                      {cycle.start_date} → {cycle.end_date}
                    </p>
                  </div>
                  <span className={`${styles.badge} ${styles.badgeClosed}`}>
                    Closed
                  </span>
                </div>
                {editingId === cycle.id ? (
                  renderEditForm(cycle)
                ) : (
                  <>
                    <div className={styles.viewLinks}>
                      <Link
                        to={`/radar?cycle=${cycle.id}`}
                        className={styles.downloadBtn}
                      >
                        View on radar
                      </Link>
                      <Link
                        to={`/list?cycle=${cycle.id}`}
                        className={styles.downloadBtn}
                      >
                        View as list
                      </Link>
                      <button
                        type="button"
                        className={styles.downloadBtn}
                        onClick={() => startEdit(cycle)}
                      >
                        Edit name &amp; color
                      </button>
                    </div>
                    <div className={styles.deliverables}>
                      <p className={styles.deliverablesTitle}>Deliverables</p>
                      <div className={styles.deliverableLinks}>
                        {ALL_DELIVERABLE_TYPES.map((type) => (
                          <button
                            key={type}
                            className={styles.downloadBtn}
                            onClick={() =>
                              void handleDownload(cycle.id, type, cycle.name)
                            }
                            type="button"
                            aria-label={`Download ${DELIVERABLE_LABELS[type]} for ${cycle.name}`}
                          >
                            {DELIVERABLE_LABELS[type]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
