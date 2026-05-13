import { useEffect, useRef, useState } from "react";
import type { FilterState, RadarData, RadarEntry, RingName } from "./types";
import { applyListFilters } from "./filtering";
import { themeByKey } from "./segmentThemes";
import { MovementIndicator } from "../shared/MovementIndicator";

type Props = {
  data: RadarData;
  filters: FilterState;
  onRowClick: (entry: RadarEntry) => void;
  /**
   * When true (writers/admins) the list shows the Visibility column
   * (🌐 Public / 🔒 Private) read from ``entry.not_for_external_publication``.
   * Anonymous and PublicReader callers never see private topics anyway, so
   * the column would always be 🌐 — hiding it removes the visual noise.
   */
  showVisibility?: boolean;
  /** Set of currently selected entry IDs (lifted to the parent so it
   * survives filter changes and feeds the export menu). Optional — when
   * absent the checkbox column is hidden, preserving the legacy read-only
   * mode for other call sites. */
  selectedIds?: Set<string>;
  onSelectionChange?: (next: Set<string>) => void;
};

type SortKey = "name" | "status" | "ring" | "segment" | "movement" | "trl";
type SortDir = "asc" | "desc";

const RING_ORDER: RingName[] = ["Invest", "Pilot", "Explore", "Monitor"];

const RING_BADGE_COLORS: Record<string, string> = {
  Invest: "var(--color-ring-invest)",
  Pilot: "var(--color-ring-trial)",
  Explore: "var(--color-ring-assess)",
  Monitor: "var(--color-ring-watch)",
};

export function ListView({
  data,
  filters,
  onRowClick,
  showVisibility = false,
  selectedIds,
  onSelectionChange,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const lastClickIdxRef = useRef<number | null>(null);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const selectionEnabled =
    selectedIds !== undefined && onSelectionChange !== undefined;

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const visible = applyListFilters(data.entries, filters, data);

  function getSegment(entry: RadarEntry) {
    return data.segments.find((s) => s.id === entry.segment_id);
  }

  function getRingName(entry: RadarEntry): string {
    return data.rings.find((r) => r.name === entry.ring)?.name ?? "";
  }

  function getRingOrder(entry: RadarEntry): number {
    const name = getRingName(entry) as RingName;
    return RING_ORDER.indexOf(name);
  }

  const sorted = [...visible].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "name") {
      cmp = a.canonical_name.localeCompare(b.canonical_name);
    } else if (sortKey === "status") {
      cmp = (a.registry_status ?? "").localeCompare(b.registry_status ?? "");
    } else if (sortKey === "ring") {
      cmp = getRingOrder(a) - getRingOrder(b);
    } else if (sortKey === "segment") {
      cmp = (getSegment(a)?.name ?? "").localeCompare(
        getSegment(b)?.name ?? "",
      );
    } else if (sortKey === "movement") {
      cmp = (a.movement ?? "").localeCompare(b.movement ?? "");
    } else if (sortKey === "trl") {
      const at = a.trl ?? -1;
      const bt = b.trl ?? -1;
      cmp = at - bt;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  function ariaSortFor(key: SortKey): "ascending" | "descending" | "none" {
    if (sortKey !== key) return "none";
    return sortDir === "asc" ? "ascending" : "descending";
  }

  function sortGlyph(key: SortKey): string {
    if (sortKey !== key) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  }

  const thStyle: React.CSSProperties = {
    padding: "10px 12px",
    textAlign: "left",
    fontSize: "10px",
    fontWeight: "var(--font-weight-bold)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--color-muted-text)",
    background: "var(--color-white)",
    borderBottom: "1px solid var(--color-border)",
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    zIndex: 1,
  };

  const sortableThStyle: React.CSSProperties = {
    ...thStyle,
    cursor: "pointer",
    userSelect: "none",
  };

  const tdStyle: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: "13px",
    color: "var(--color-dark-text)",
    borderBottom: "1px solid var(--color-border)",
    verticalAlign: "middle",
    background: "var(--color-white)",
  };

  const visibleIds = sorted.map((e) => e.id);
  const visibleSelectedCount = selectionEnabled
    ? visibleIds.reduce((n, id) => n + (selectedIds!.has(id) ? 1 : 0), 0)
    : 0;
  const allVisibleSelected =
    selectionEnabled &&
    visibleIds.length > 0 &&
    visibleSelectedCount === visibleIds.length;
  const someVisibleSelected =
    selectionEnabled && visibleSelectedCount > 0 && !allVisibleSelected;
  const totalSelectedCount = selectionEnabled ? selectedIds!.size : 0;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  function toggleAllVisible() {
    if (!selectionEnabled) return;
    const next = new Set(selectedIds);
    if (allVisibleSelected) {
      for (const id of visibleIds) next.delete(id);
    } else {
      for (const id of visibleIds) next.add(id);
    }
    onSelectionChange!(next);
  }

  function clearSelection() {
    if (!selectionEnabled) return;
    onSelectionChange!(new Set());
    lastClickIdxRef.current = null;
  }

  function toggleRow(idx: number, entry: RadarEntry, shiftKey: boolean) {
    if (!selectionEnabled) return;
    const next = new Set(selectedIds);
    const anchor = lastClickIdxRef.current;
    if (shiftKey && anchor != null && anchor !== idx) {
      const [lo, hi] = anchor < idx ? [anchor, idx] : [idx, anchor];
      const target = !selectedIds!.has(entry.id);
      for (let i = lo; i <= hi; i++) {
        const e = sorted[i];
        if (!e) continue;
        if (target) next.add(e.id);
        else next.delete(e.id);
      }
    } else if (selectedIds!.has(entry.id)) {
      next.delete(entry.id);
    } else {
      next.add(entry.id);
    }
    lastClickIdxRef.current = idx;
    onSelectionChange!(next);
  }

  return (
    <div
      style={{
        width: "100%",
        padding: "var(--space-4) var(--space-6)",
        background: "var(--color-page-background)",
        fontFamily: "var(--font-family)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: "var(--space-3)",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "1.25rem",
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-brand-dark-blue)",
            letterSpacing: "-0.01em",
          }}
        >
          Technologies
        </h1>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          {selectionEnabled && totalSelectedCount > 0 && (
            <span
              style={{
                fontSize: 12,
                color: "var(--color-brand-dark-blue)",
                fontWeight: "var(--font-weight-medium)",
              }}
            >
              {totalSelectedCount} selected
              {" · "}
              <button
                type="button"
                onClick={clearSelection}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-brand-dark-blue)",
                  cursor: "pointer",
                  fontSize: 12,
                  padding: 0,
                  textDecoration: "underline",
                  fontFamily: "var(--font-family)",
                }}
              >
                Clear
              </button>
            </span>
          )}
          <span style={{ fontSize: "12px", color: "var(--color-muted-text)" }}>
            {sorted.length} of {data.entries.length}
          </span>
        </div>
      </div>

      <div
        style={{
          background: "var(--color-white)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          boxShadow: "var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04))",
        }}
      >
        {sorted.length === 0 ? (
          <div
            style={{
              padding: "var(--space-8)",
              textAlign: "center",
              color: "var(--color-muted-text)",
            }}
          >
            No technologies match the current filters.
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontFamily: "var(--font-family)",
            }}
          >
            <thead>
              <tr>
                {selectionEnabled && (
                  <th
                    scope="col"
                    style={{
                      ...thStyle,
                      width: 32,
                      padding: "10px 0 10px 12px",
                    }}
                    aria-label="Select rows"
                  >
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={
                        allVisibleSelected
                          ? "Deselect all visible rows"
                          : "Select all visible rows"
                      }
                      style={{ cursor: "pointer" }}
                    />
                  </th>
                )}
                <th
                  scope="col"
                  style={sortableThStyle}
                  onClick={() => handleSort("name")}
                  aria-sort={ariaSortFor("name")}
                >
                  Name <span style={{ opacity: 0.6 }}>{sortGlyph("name")}</span>
                </th>
                <th
                  scope="col"
                  style={sortableThStyle}
                  onClick={() => handleSort("status")}
                  aria-sort={ariaSortFor("status")}
                >
                  Status{" "}
                  <span style={{ opacity: 0.6 }}>{sortGlyph("status")}</span>
                </th>
                <th
                  scope="col"
                  style={sortableThStyle}
                  onClick={() => handleSort("ring")}
                  aria-sort={ariaSortFor("ring")}
                >
                  Ring <span style={{ opacity: 0.6 }}>{sortGlyph("ring")}</span>
                </th>
                <th
                  scope="col"
                  style={sortableThStyle}
                  onClick={() => handleSort("segment")}
                  aria-sort={ariaSortFor("segment")}
                >
                  Segment{" "}
                  <span style={{ opacity: 0.6 }}>{sortGlyph("segment")}</span>
                </th>
                <th
                  scope="col"
                  style={sortableThStyle}
                  onClick={() => handleSort("movement")}
                  aria-sort={ariaSortFor("movement")}
                >
                  Movement{" "}
                  <span style={{ opacity: 0.6 }}>{sortGlyph("movement")}</span>
                </th>
                <th
                  scope="col"
                  style={{ ...sortableThStyle, textAlign: "right", width: 60 }}
                  onClick={() => handleSort("trl")}
                  aria-sort={ariaSortFor("trl")}
                >
                  TRL <span style={{ opacity: 0.6 }}>{sortGlyph("trl")}</span>
                </th>
                <th scope="col" style={thStyle}>
                  Summary
                </th>
                <th
                  scope="col"
                  style={{ ...thStyle, textAlign: "right", width: 60 }}
                  title="Peer reference count"
                >
                  Peers
                </th>
                {showVisibility && (
                  <th
                    scope="col"
                    style={{ ...thStyle, width: 100 }}
                    title="Topic visibility flag"
                  >
                    Visibility
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry, idx) => {
                const ringName = getRingName(entry);
                const ringColor =
                  RING_BADGE_COLORS[ringName] ?? "var(--color-brand-dark-blue)";
                const seg = getSegment(entry);
                const theme = themeByKey(seg?.theme_key);
                const zebraBg =
                  idx % 2 === 0
                    ? "var(--color-white)"
                    : "color-mix(in srgb, var(--color-page-background) 50%, var(--color-white))";

                return (
                  <tr
                    key={entry.id}
                    onClick={() => onRowClick(entry)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick(entry);
                      }
                    }}
                    style={{
                      cursor: "pointer",
                      background: zebraBg,
                      transition: "background 80ms",
                    }}
                    onMouseEnter={(e) => {
                      (
                        e.currentTarget as HTMLTableRowElement
                      ).style.background =
                        "color-mix(in srgb, var(--color-brand-dark-blue) 6%, var(--color-white))";
                    }}
                    onMouseLeave={(e) => {
                      (
                        e.currentTarget as HTMLTableRowElement
                      ).style.background = zebraBg;
                    }}
                  >
                    {selectionEnabled && (
                      <td
                        style={{
                          ...tdStyle,
                          background: "transparent",
                          width: 32,
                          padding: "8px 0 8px 12px",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds!.has(entry.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRow(idx, entry, e.shiftKey);
                          }}
                          onChange={() => {
                            /* state lives in onClick to read shiftKey */
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                          aria-label={`Select ${entry.canonical_name}`}
                          style={{ cursor: "pointer" }}
                        />
                      </td>
                    )}
                    <td
                      style={{
                        ...tdStyle,
                        background: "transparent",
                        fontWeight: "var(--font-weight-medium)",
                      }}
                    >
                      {entry.canonical_name}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        background: "transparent",
                        color:
                          entry.registry_status == null
                            ? "var(--color-muted-text)"
                            : "var(--color-dark-text)",
                        fontSize: "11px",
                      }}
                    >
                      {entry.registry_status ?? "Candidate"}
                    </td>
                    <td style={{ ...tdStyle, background: "transparent" }}>
                      {ringName ? (
                        <span
                          style={{
                            background: ringColor,
                            color: "var(--color-white)",
                            fontSize: "10px",
                            fontWeight: "var(--font-weight-bold)",
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            padding: "2px 8px",
                            borderRadius: "10px",
                          }}
                        >
                          {ringName}
                        </span>
                      ) : (
                        <span style={{ color: "var(--color-muted-text)" }}>
                          —
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, background: "transparent" }}>
                      <span
                        style={{
                          background: theme.chipBg,
                          color: theme.chipText,
                          fontSize: "11px",
                          fontWeight: "var(--font-weight-medium)",
                          padding: "2px 8px",
                          borderRadius: "10px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {seg?.name ?? "—"}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, background: "transparent" }}>
                      {entry.movement ? (
                        <MovementIndicator
                          movement={entry.movement}
                          showLabel
                          style={{ fontSize: "11px", gap: 4 }}
                        />
                      ) : (
                        <span style={{ color: "var(--color-muted-text)" }}>
                          —
                        </span>
                      )}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        background: "transparent",
                        textAlign: "right",
                        color:
                          entry.trl == null
                            ? "var(--color-muted-text)"
                            : "var(--color-dark-text)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {entry.trl ?? "—"}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        background: "transparent",
                        color: "var(--color-muted-text)",
                        maxWidth: 360,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={entry.summary ?? undefined}
                    >
                      {entry.summary || "—"}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        background: "transparent",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        color:
                          (entry.peer_reference_count ?? 0) > 0
                            ? "var(--color-dark-text)"
                            : "var(--color-muted-text)",
                      }}
                    >
                      {entry.peer_reference_count ?? 0}
                    </td>
                    {showVisibility && (
                      <td
                        style={{
                          ...tdStyle,
                          background: "transparent",
                          fontSize: "11px",
                          color: entry.not_for_external_publication
                            ? "var(--color-muted-text)"
                            : "var(--color-dark-text)",
                        }}
                        title={
                          entry.not_for_external_publication
                            ? "Not for external publication"
                            : "Visible externally"
                        }
                      >
                        {entry.not_for_external_publication
                          ? "🔒 Private"
                          : "🌐 Public"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
