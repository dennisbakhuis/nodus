import { useCallback, useEffect, useState } from "react";
import {
  createSegment,
  deleteSegment,
  listSegments,
  reorderSegments,
  updateSegment,
} from "./api";
import { SEGMENT_THEMES, themeByKey } from "../radar/segmentThemes";
import { useConfirm } from "../shared/ConfirmDialog";
import { LoadingState } from "../shared/LoadingState";
import { StatusBanner } from "../shared/StatusBanner";
import type { SegmentAdmin } from "./types";
import styles from "./ManagePage.module.css";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function SegmentsPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<SegmentAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTheme, setNewTheme] = useState(
    SEGMENT_THEMES[0]?.key ?? "dark-blue",
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSegments({ includeInactive: true });
      setItems(data.sort((a, b) => a.display_order - b.display_order));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load segments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRename(id: string) {
    const value = renameValue.trim();
    if (!value) {
      setRenamingId(null);
      return;
    }
    try {
      await updateSegment(id, { name: value });
      setRenamingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed");
    }
  }

  async function move(id: string, direction: -1 | 1) {
    const idx = items.findIndex((s) => s.id === id);
    const newIdx = idx + direction;
    if (idx === -1 || newIdx < 0 || newIdx >= items.length) return;
    const next = [...items];
    const a = next[idx];
    const b = next[newIdx];
    if (!a || !b) return;
    next[idx] = b;
    next[newIdx] = a;
    try {
      await reorderSegments(next.map((s) => s.id));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reorder failed");
    }
  }

  async function changeTheme(seg: SegmentAdmin, themeKey: string) {
    try {
      await updateSegment(seg.id, { theme_key: themeKey });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Theme change failed");
    }
  }

  async function toggleActive(seg: SegmentAdmin) {
    try {
      await updateSegment(seg.id, { is_active: !seg.is_active });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toggle failed");
    }
  }

  async function handleDelete(seg: SegmentAdmin) {
    if (seg.usage_count > 0) {
      setError(
        `Cannot delete "${seg.name}" — still used by ${seg.usage_count} technologies. Reassign them first.`,
      );
      return;
    }
    const ok = await confirm({
      title: "Delete segment",
      body: `Delete segment "${seg.name}"?`,
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteSegment(seg.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    try {
      await createSegment({
        name,
        slug: slugify(name),
        theme_key: newTheme,
        is_active: true,
      });
      setAdding(false);
      setNewName("");
      setNewTheme(SEGMENT_THEMES[0]?.key ?? "dark-blue");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    }
  }

  if (loading) return <LoadingState>Loading segments…</LoadingState>;

  return (
    <div className={styles.subPage}>
      <div className={styles.header}>
        <h1>Segments</h1>
        <p>
          Add, rename, reorder, theme, deactivate, and delete the radar
          quadrants. Segments still in use cannot be deleted; reassign their
          technologies first.
        </p>
      </div>

      <StatusBanner
        variant="error"
        message={error}
        onDismiss={() => setError(null)}
      />

      <section className={styles.section}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "var(--space-3)",
          }}
        >
          <h2 className={styles.sectionTitle}>All segments</h2>
          {!adding && (
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => setAdding(true)}
            >
              Add segment
            </button>
          )}
        </div>

        {adding && (
          <form
            onSubmit={(e) => void handleCreate(e)}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 220px auto auto",
              gap: "var(--space-3)",
              alignItems: "end",
              marginBottom: "var(--space-4)",
              padding: "var(--space-4)",
              border: "1px dashed var(--color-ring-boundary)",
              borderRadius: 6,
            }}
          >
            <label>
              Name
              <input
                className={styles.input}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Operational Technology"
                required
                autoFocus
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <label>
              Theme
              <select
                className={styles.input}
                value={newTheme}
                onChange={(e) => setNewTheme(e.target.value)}
                style={{ width: "100%", marginTop: 4 }}
              >
                {SEGMENT_THEMES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={styles.btnPrimary}>
              Create
            </button>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => {
                setAdding(false);
                setNewName("");
              }}
            >
              Cancel
            </button>
          </form>
        )}

        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 60 }}>Order</th>
              <th>Name</th>
              <th>Theme</th>
              <th>Slug</th>
              <th>Usage</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {items.map((seg, idx) => {
              const theme = themeByKey(seg.theme_key);
              const isRenaming = renamingId === seg.id;
              return (
                <tr key={seg.id}>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        type="button"
                        className={styles.btnSecondary}
                        style={{ padding: "2px 6px", fontSize: 11 }}
                        disabled={idx === 0}
                        onClick={() => void move(seg.id, -1)}
                        aria-label="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={styles.btnSecondary}
                        style={{ padding: "2px 6px", fontSize: 11 }}
                        disabled={idx === items.length - 1}
                        onClick={() => void move(seg.id, 1)}
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td>
                    {isRenaming ? (
                      <input
                        className={styles.input}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => void handleRename(seg.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleRename(seg.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        autoFocus
                        style={{ width: "100%" }}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingId(seg.id);
                          setRenameValue(seg.name);
                        }}
                        title="Click to rename"
                        style={{
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          color: "var(--color-dark-text)",
                          fontSize: "var(--font-size-body)",
                          cursor: "text",
                          textAlign: "left",
                          fontWeight: "var(--font-weight-bold)",
                        }}
                      >
                        {seg.name}
                      </button>
                    )}
                  </td>
                  <td>
                    <select
                      className={styles.input}
                      value={seg.theme_key}
                      onChange={(e) => void changeTheme(seg, e.target.value)}
                      style={{
                        background: theme.chipBg,
                        color: theme.chipText,
                      }}
                    >
                      {SEGMENT_THEMES.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <code style={{ fontSize: 11 }}>{seg.slug}</code>
                  </td>
                  <td>
                    <span className={styles.chip}>{seg.usage_count}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={() => void toggleActive(seg)}
                      title={
                        !seg.is_active
                          ? "Reactivate"
                          : seg.usage_count > 0
                            ? "Cannot deactivate while in use"
                            : "Deactivate"
                      }
                      disabled={seg.is_active && seg.usage_count > 0}
                    >
                      {seg.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={() => void handleDelete(seg)}
                      disabled={seg.usage_count > 0}
                      title={
                        seg.usage_count > 0
                          ? "In use — reassign technologies first"
                          : "Delete segment"
                      }
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
