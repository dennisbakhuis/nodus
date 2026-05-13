import { useEffect, useRef, useState } from "react";
import type {
  ColorMode,
  FilterState,
  MovementStatus,
  RadarData,
  RadarEntry,
  RegistryStatusName,
  RingName,
  ShapeMode,
} from "./types";
import { COLOR_MODE_LABELS, SHAPE_MODE_LABELS } from "./types";
import { SearchBox } from "./SearchBox";
import { themeByKey, SEGMENT_THEMES } from "./segmentThemes";
import { useAuth } from "../shared/AuthContext";
import { Chip as SharedChip } from "../shared/Chip";
import { CyclePicker } from "../shared/CyclePicker";
import { NodusFooterLink } from "../shared/NodusFooterLink";
import { useReadOnlyRadar } from "./ReadOnlyRadarContext";
import { useConfirm } from "../shared/ConfirmDialog";
import {
  createSegment,
  deleteSegment,
  listPersons,
  listSegments,
  reorderSegments,
  updateSegment,
} from "../manage/api";
import type { SegmentAdmin } from "../manage/types";

const RING_NAMES: RingName[] = ["Invest", "Pilot", "Explore", "Monitor"];
const MOVEMENT_OPTIONS: { value: MovementStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "promoted", label: "Promoted" },
  { value: "demoted", label: "Demoted" },
  { value: "unchanged", label: "Unchanged" },
];
const STRATEGIC_RELEVANCE_OPTIONS: { value: string; label: string }[] = [
  { value: "High", label: "High" },
  { value: "Medium", label: "Medium" },
  { value: "Low", label: "Low" },
];
const TRL_THRESHOLDS = [1, 4, 7, 9] as const;
const REGISTRY_STATUS_OPTIONS: { value: RegistryStatusName; label: string }[] =
  [
    { value: "On Radar", label: "On Radar" },
    { value: "Backlog", label: "Backlog" },
    { value: "Archive", label: "Archive" },
  ];
const TIME_TO_MAINSTREAM_OPTIONS = ["0-2 yr", "2-5 yr", "5-7 yr", "7-10 yr"];

type Props = {
  variant?: "radar" | "list";
  showZoom?: boolean;
  zoom?: number;
  fitZoom?: number;
  onZoomSet?: (percent: number) => void;
  onZoomReset?: () => void;
  entries: RadarEntry[];
  search: string;
  onSearchChange: (s: string) => void;
  onSearchSelect: (e: RadarEntry) => void;
  data: RadarData;
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
  colorMode?: ColorMode;
  onColorModeChange?: (mode: ColorMode) => void;
  shapeMode?: ShapeMode;
  onShapeModeChange?: (mode: ShapeMode) => void;
  onSegmentsChanged?: () => void;
};

const ZOOM_STEP_PERCENT = 10;

export function Sidebar({
  variant = "radar",
  showZoom = false,
  zoom = 1,
  fitZoom = 1,
  onZoomSet,
  onZoomReset,
  entries,
  search,
  onSearchChange,
  onSearchSelect,
  data,
  filters,
  onFiltersChange,
  colorMode,
  onColorModeChange,
  shapeMode,
  onShapeModeChange,
  onSegmentsChanged,
}: Props) {
  const isList = variant === "list";
  const { isAdmin, isWriter } = useAuth();
  const readOnly = useReadOnlyRadar();
  const [segmentEditMode, setSegmentEditMode] = useState(false);
  const showColorPicker =
    !isList && colorMode !== undefined && onColorModeChange !== undefined;
  const showShapePicker =
    !isList && shapeMode !== undefined && onShapeModeChange !== undefined;
  const sorted = [...data.segments].sort((a, b) => a.order - b.order);

  function toggleRing(name: RingName) {
    const next = filters.rings.includes(name)
      ? filters.rings.filter((r) => r !== name)
      : [...filters.rings, name];
    onFiltersChange({ ...filters, rings: next });
  }

  function toggleSegment(name: string) {
    const next = filters.segments.includes(name)
      ? filters.segments.filter((s) => s !== name)
      : [...filters.segments, name];
    onFiltersChange({ ...filters, segments: next });
  }

  function toggleMovement(value: MovementStatus) {
    const next = filters.movements.includes(value)
      ? filters.movements.filter((m) => m !== value)
      : [...filters.movements, value];
    onFiltersChange({ ...filters, movements: next });
  }

  function toggleStrategicRelevance(value: string) {
    const next = filters.strategicRelevance.includes(value)
      ? filters.strategicRelevance.filter((s) => s !== value)
      : [...filters.strategicRelevance, value];
    onFiltersChange({ ...filters, strategicRelevance: next });
  }

  function setMinTrl(value: number | null) {
    onFiltersChange({
      ...filters,
      minTrl: filters.minTrl === value ? null : value,
    });
  }

  function toggleRegistryStatus(value: RegistryStatusName) {
    const next = filters.registryStatuses.includes(value)
      ? filters.registryStatuses.filter((s) => s !== value)
      : [...filters.registryStatuses, value];
    onFiltersChange({ ...filters, registryStatuses: next });
  }

  function cycleTriState(current: boolean | null): boolean | null {
    // null → true → false → null
    if (current === null) return true;
    if (current === true) return false;
    return null;
  }

  function toggleHasFactsheet() {
    onFiltersChange({
      ...filters,
      hasFactsheet: cycleTriState(filters.hasFactsheet),
    });
  }

  function toggleHasPeerRefs() {
    onFiltersChange({
      ...filters,
      hasPeerRefs: cycleTriState(filters.hasPeerRefs),
    });
  }

  function toggleTimeToMainstream(value: string) {
    const next = filters.timeToMainstream.includes(value)
      ? filters.timeToMainstream.filter((s) => s !== value)
      : [...filters.timeToMainstream, value];
    onFiltersChange({ ...filters, timeToMainstream: next });
  }

  function clearAll() {
    onFiltersChange({
      segments: [],
      rings: [],
      movements: [],
      search: "",
      strategicRelevance: [],
      minTrl: null,
      registryStatuses: ["On Radar"],
      hasFactsheet: null,
      hasPeerRefs: null,
      timeToMainstream: [],
      personIds: [],
      candidatesOnly: false,
      visibility: isList && isWriter ? "public" : "all",
    });
    onSearchChange("");
    if (showColorPicker && colorMode !== "segment") {
      onColorModeChange?.("segment");
    }
    if (showShapePicker && shapeMode !== "dot") {
      onShapeModeChange?.("dot");
    }
  }

  function togglePerson(id: string) {
    const cur = filters.personIds ?? [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    onFiltersChange({ ...filters, personIds: next });
  }

  const defaultVisibility = isList && isWriter ? "public" : "all";
  const hasFilters =
    filters.segments.length > 0 ||
    filters.rings.length > 0 ||
    filters.movements.length > 0 ||
    filters.strategicRelevance.length > 0 ||
    filters.minTrl != null ||
    filters.hasFactsheet !== null ||
    filters.hasPeerRefs !== null ||
    filters.timeToMainstream.length > 0 ||
    (filters.personIds?.length ?? 0) > 0 ||
    (isList &&
      (filters.registryStatuses.length !== 1 ||
        filters.registryStatuses[0] !== "On Radar")) ||
    (isList && filters.candidatesOnly) ||
    (isList && filters.visibility !== defaultVisibility) ||
    (showColorPicker && colorMode !== "segment") ||
    (showShapePicker && shapeMode !== "dot") ||
    search.trim().length > 0;

  return (
    <aside
      style={{
        width: 200,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--color-white)",
        borderRight: "1px solid var(--color-ring-boundary)",
        overflow: "hidden",
        fontFamily: "var(--font-family)",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
          padding: "var(--space-3) var(--space-3)",
        }}
      >
        <CyclePicker />
        {readOnly && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--color-brand-orange)",
              background: "rgba(255, 165, 0, 0.08)",
              padding: "4px 8px",
              borderRadius: 4,
              textAlign: "center",
            }}
          >
            Read-only — closed cycle
          </div>
        )}

        {showZoom && (
          <ZoomRow
            zoom={zoom}
            fitZoom={fitZoom}
            onZoomSet={onZoomSet}
            onZoomReset={onZoomReset}
          />
        )}

        {!isList && <Hr />}

        <SectionHeader
          label="Filters"
          onReset={hasFilters ? clearAll : undefined}
          resetLabel="Reset all filters"
        />

        {/* ── Search ── */}
        <SearchBox
          entries={entries}
          value={search}
          onChange={onSearchChange}
          onSelect={onSearchSelect}
        />

        {showColorPicker && (
          <>
            <Hr />
            <SectionHeader
              label="Color dots by"
              onReset={
                colorMode !== "segment"
                  ? () => onColorModeChange?.("segment")
                  : undefined
              }
              resetLabel="Reset color encoding"
            />
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--space-1)",
              }}
            >
              {(Object.keys(COLOR_MODE_LABELS) as ColorMode[]).map((m) => (
                <Chip
                  key={m}
                  active={colorMode === m}
                  onClick={() => onColorModeChange?.(m)}
                  label={COLOR_MODE_LABELS[m]}
                />
              ))}
            </div>
          </>
        )}

        {showShapePicker && (
          <>
            <Hr />
            <SectionHeader
              label="Shape dots by"
              onReset={
                shapeMode !== "dot"
                  ? () => onShapeModeChange?.("dot")
                  : undefined
              }
              resetLabel="Reset shape encoding"
            />
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--space-1)",
              }}
            >
              {(Object.keys(SHAPE_MODE_LABELS) as ShapeMode[]).map((m) => (
                <Chip
                  key={m}
                  active={shapeMode === m}
                  onClick={() => onShapeModeChange?.(m)}
                  label={SHAPE_MODE_LABELS[m]}
                />
              ))}
            </div>
          </>
        )}

        {isList && (
          <>
            <Hr />
            {/* ── Registry Status ── */}
            <SectionHeader
              label="Registry Status"
              onReset={
                filters.registryStatuses.length !== 1 ||
                filters.registryStatuses[0] !== "On Radar"
                  ? () =>
                      onFiltersChange({
                        ...filters,
                        registryStatuses: ["On Radar"],
                      })
                  : undefined
              }
              resetLabel="Reset registry status filter"
            />
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--space-1)",
              }}
            >
              {REGISTRY_STATUS_OPTIONS.map(({ value, label }) => (
                <Chip
                  key={value}
                  active={filters.registryStatuses.includes(value)}
                  onClick={() => toggleRegistryStatus(value)}
                  label={label}
                />
              ))}
            </div>
          </>
        )}

        {/* Writer-only intake / visibility filters — list view only. */}
        {isList && isWriter && (
          <>
            <Hr />
            <SectionHeader
              label="Candidates"
              onReset={
                filters.candidatesOnly
                  ? () => onFiltersChange({ ...filters, candidatesOnly: false })
                  : undefined
              }
              resetLabel="Reset candidates filter"
            />
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--space-1)",
              }}
            >
              <Chip
                active={filters.candidatesOnly}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    candidatesOnly: !filters.candidatesOnly,
                  })
                }
                label="Candidates only"
              />
            </div>
            <Hr />
            <SectionHeader
              label="Visibility"
              onReset={
                filters.visibility !== "all"
                  ? () => onFiltersChange({ ...filters, visibility: "all" })
                  : undefined
              }
              resetLabel="Reset visibility filter"
            />
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--space-1)",
              }}
            >
              {(["all", "public", "private"] as const).map((v) => (
                <Chip
                  key={v}
                  active={filters.visibility === v}
                  onClick={() => onFiltersChange({ ...filters, visibility: v })}
                  label={
                    v === "all"
                      ? "All"
                      : v === "public"
                        ? "🌐 Public"
                        : "🔒 Private"
                  }
                />
              ))}
            </div>
          </>
        )}

        <Hr />

        {/* ── Segment filter ── */}
        <SectionHeader
          label="Segment"
          onReset={
            filters.segments.length > 0
              ? () => onFiltersChange({ ...filters, segments: [] })
              : undefined
          }
          resetLabel="Reset segment filter"
          rightAction={
            isList && isAdmin
              ? {
                  label: segmentEditMode ? "Done" : "Edit",
                  onClick: () => setSegmentEditMode((v) => !v),
                }
              : undefined
          }
        />
        {segmentEditMode ? (
          <SegmentAdminPanel
            segments={sorted}
            onChanged={() => {
              onSegmentsChanged?.();
            }}
          />
        ) : (
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}
          >
            {sorted.map((seg) => {
              const theme = themeByKey(seg.theme_key);
              return (
                <Chip
                  key={seg.id}
                  active={filters.segments.includes(seg.name)}
                  onClick={() => toggleSegment(seg.name)}
                  label={seg.name}
                  inactiveBg={theme.chipBg}
                  inactiveText={theme.chipText}
                />
              );
            })}
          </div>
        )}

        <Hr />

        {/* ── Ring filter ── */}
        <SectionHeader
          label="Rings"
          onReset={
            filters.rings.length > 0
              ? () => onFiltersChange({ ...filters, rings: [] })
              : undefined
          }
          resetLabel="Reset ring filter"
        />
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}
        >
          {RING_NAMES.map((r) => (
            <Chip
              key={r}
              active={filters.rings.includes(r)}
              onClick={() => toggleRing(r)}
              label={r}
            />
          ))}
        </div>

        <Hr />

        {/* ── Movement filter ── */}
        <SectionHeader
          label="Movement"
          onReset={
            filters.movements.length > 0
              ? () => onFiltersChange({ ...filters, movements: [] })
              : undefined
          }
          resetLabel="Reset movement filter"
        />
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}
        >
          {MOVEMENT_OPTIONS.map(({ value, label }) => (
            <Chip
              key={value}
              active={filters.movements.includes(value)}
              onClick={() => toggleMovement(value)}
              label={label}
            />
          ))}
        </div>

        {isList && (
          <>
            <Hr />
            {/* ── Strategic Relevance ── */}
            <SectionHeader
              label="Strategic Relevance"
              onReset={
                filters.strategicRelevance.length > 0
                  ? () =>
                      onFiltersChange({ ...filters, strategicRelevance: [] })
                  : undefined
              }
              resetLabel="Reset strategic relevance filter"
            />
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--space-1)",
              }}
            >
              {STRATEGIC_RELEVANCE_OPTIONS.map(({ value, label }) => (
                <Chip
                  key={value}
                  active={filters.strategicRelevance.includes(value)}
                  onClick={() => toggleStrategicRelevance(value)}
                  label={label}
                />
              ))}
            </div>

            <Hr />
            {/* ── Min TRL ── */}
            <SectionHeader
              label="Min TRL"
              onReset={
                filters.minTrl != null
                  ? () => onFiltersChange({ ...filters, minTrl: null })
                  : undefined
              }
              resetLabel="Reset minimum TRL filter"
            />
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--space-1)",
              }}
            >
              {TRL_THRESHOLDS.map((t) => (
                <Chip
                  key={t}
                  active={filters.minTrl === t}
                  onClick={() => setMinTrl(t)}
                  label={`${t}+`}
                />
              ))}
            </div>

            <Hr />
            {/* ── Time to mainstream ── */}
            <SectionHeader
              label="Time to mainstream"
              onReset={
                filters.timeToMainstream.length > 0
                  ? () => onFiltersChange({ ...filters, timeToMainstream: [] })
                  : undefined
              }
              resetLabel="Reset time-to-mainstream filter"
            />
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--space-1)",
              }}
            >
              {TIME_TO_MAINSTREAM_OPTIONS.map((label) => (
                <Chip
                  key={label}
                  active={filters.timeToMainstream.includes(label)}
                  onClick={() => toggleTimeToMainstream(label)}
                  label={label}
                />
              ))}
            </div>

            <Hr />
            <PersonFilter
              selectedIds={filters.personIds ?? []}
              onToggle={togglePerson}
              onClear={() => onFiltersChange({ ...filters, personIds: [] })}
            />

            <Hr />
            {/* ── Data completeness (tri-state toggles) ── */}
            <SectionHeader
              label="Completeness"
              onReset={
                filters.hasFactsheet !== null || filters.hasPeerRefs !== null
                  ? () =>
                      onFiltersChange({
                        ...filters,
                        hasFactsheet: null,
                        hasPeerRefs: null,
                      })
                  : undefined
              }
              resetLabel="Reset completeness filters"
            />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-1)",
              }}
            >
              <TriStateChip
                label="Factsheet"
                value={filters.hasFactsheet}
                onClick={toggleHasFactsheet}
              />
              <TriStateChip
                label="Peer references"
                value={filters.hasPeerRefs}
                onClick={toggleHasPeerRefs}
              />
            </div>
          </>
        )}
      </div>
      <NodusFooterLink />
    </aside>
  );
}

function SectionHeader({
  label,
  onReset,
  resetLabel,
  rightAction,
}: {
  label: string;
  onReset?: () => void;
  resetLabel: string;
  rightAction?: { label: string; onClick: () => void };
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-2)",
      }}
    >
      <SectionLabel>{label}</SectionLabel>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {rightAction && (
          <button
            onClick={rightAction.onClick}
            type="button"
            style={{
              background: "transparent",
              border: "1px solid var(--color-ring-boundary)",
              borderRadius: 4,
              padding: "1px 6px",
              fontSize: 10,
              color: "var(--color-muted-text)",
              cursor: "pointer",
              fontFamily: "var(--font-family)",
            }}
          >
            {rightAction.label}
          </button>
        )}
        {onReset && <ResetButton onClick={onReset} aria-label={resetLabel} />}
      </div>
    </div>
  );
}

function ResetButton({
  onClick,
  "aria-label": ariaLabel,
}: {
  onClick: () => void;
  "aria-label": string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      style={{
        background: "var(--color-white)",
        border: "1px solid var(--color-ring-boundary)",
        borderRadius: "6px",
        width: 18,
        height: 18,
        padding: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "11px",
        lineHeight: 1,
        color: "var(--color-muted-text)",
        cursor: "pointer",
        fontFamily: "var(--font-family)",
        flexShrink: 0,
      }}
    >
      ↺
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: "10px",
        fontWeight: "var(--font-weight-bold)",
        color: "var(--color-muted-text)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {children}
    </span>
  );
}

function Hr() {
  return (
    <div
      aria-hidden="true"
      style={{
        height: 1,
        background: "var(--color-ring-boundary)",
        flexShrink: 0,
      }}
    />
  );
}

function TriStateChip({
  label,
  value,
  onClick,
}: {
  label: string;
  value: boolean | null;
  onClick: () => void;
}) {
  const stateLabel =
    value === null ? "Any" : value === true ? "Has" : "Missing";
  const symbol = value === null ? "•" : value === true ? "✓" : "✕";
  const bg =
    value === null
      ? "var(--color-page-background)"
      : value === true
        ? "var(--color-active-filter)"
        : "var(--color-ring-watch)";
  const fg = value === null ? "var(--color-dark-text)" : "var(--color-white)";
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label}: ${stateLabel} (click to cycle)`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 6,
        padding: "4px 10px",
        border: "none",
        borderRadius: "12px",
        background: bg,
        color: fg,
        fontFamily: "var(--font-family)",
        fontSize: "11px",
        fontWeight: "var(--font-weight-medium)",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span>{label}</span>
      <span aria-hidden="true" style={{ fontSize: "10px" }}>
        {symbol} {stateLabel}
      </span>
    </button>
  );
}

const ZOOM_CELL_HEIGHT = 26;

const zoomCellBaseStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: ZOOM_CELL_HEIGHT,
  boxSizing: "border-box",
  border: "1px solid var(--color-ring-boundary)",
  borderRadius: "6px",
  fontFamily: "var(--font-family)",
  fontSize: "12px",
  lineHeight: 1,
  padding: 0,
  background: "var(--color-white)",
  color: "var(--color-dark-text)",
};

function SideButton({
  onClick,
  active,
  children,
  "aria-label": ariaLabel,
}: {
  onClick?: () => void;
  active?: boolean;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      style={{
        ...zoomCellBaseStyle,
        background: active
          ? "var(--color-active-filter)"
          : "var(--color-white)",
        color: active ? "var(--color-white)" : "var(--color-dark-text)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}

function ZoomRow({
  zoom,
  fitZoom,
  onZoomSet,
  onZoomReset,
}: {
  zoom: number;
  fitZoom: number;
  onZoomSet?: (percent: number) => void;
  onZoomReset?: () => void;
}) {
  const displayPercent = Math.round((zoom / (fitZoom || 1)) * 100);
  const [draft, setDraft] = useState<string>(String(displayPercent));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraft(String(displayPercent));
    }
  }, [displayPercent]);

  function commit() {
    const n = Number(draft);
    if (Number.isFinite(n) && n > 0) {
      onZoomSet?.(n);
    } else {
      setDraft(String(displayPercent));
    }
  }

  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}
    >
      <SideButton
        onClick={() => onZoomSet?.(displayPercent - ZOOM_STEP_PERCENT)}
        aria-label="Zoom out"
      >
        −
      </SideButton>
      <div
        style={{
          ...zoomCellBaseStyle,
          flex: "0 0 50px",
          position: "relative",
          padding: 0,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-label="Zoom percentage"
          style={{
            width: "100%",
            height: "100%",
            boxSizing: "border-box",
            border: "none",
            background: "transparent",
            color: "inherit",
            fontFamily: "inherit",
            fontSize: "inherit",
            textAlign: "center",
            paddingRight: 18,
            paddingLeft: 6,
            outline: "none",
          }}
        />
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 5,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: "11px",
            color: "var(--color-muted-text)",
            pointerEvents: "none",
          }}
        >
          %
        </span>
      </div>
      <SideButton onClick={onZoomReset} aria-label="Reset zoom">
        ⌂
      </SideButton>
      <SideButton
        onClick={() => onZoomSet?.(displayPercent + ZOOM_STEP_PERCENT)}
        aria-label="Zoom in"
      >
        +
      </SideButton>
    </div>
  );
}

/**
 * Local label-prop adapter around the shared filter chip. Keeps the
 * `label="…"` prop convention used at call sites while the underlying
 * styling, focus handling, and aria semantics live in `shared/Chip`.
 */
function Chip({
  active,
  onClick,
  label,
  inactiveBg,
  inactiveText,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  inactiveBg?: string;
  inactiveText?: string;
}) {
  return (
    <SharedChip
      variant="filter"
      active={active}
      onClick={onClick}
      inactiveBg={inactiveBg}
      inactiveText={inactiveText}
    >
      {label}
    </SharedChip>
  );
}

function PersonFilter({
  selectedIds,
  onToggle,
  onClear,
}: {
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  type Person = {
    id: string;
    full_name: string;
    company: string;
  };
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [selected, setSelected] = useState<Person[]>([]);
  const selectedRef = useRef<Person[]>(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    if (selectedIds.length === 0) {
      // Functional update returns the same reference when already empty so we
      // don't schedule a no-op render — and crucially don't re-enter this
      // effect from a `selected`-keyed re-render. Putting ``selected`` in the
      // dep array (the previous version) caused an infinite render loop here
      // that wedged the whole page on the List view.
      setSelected((curr) => (curr.length === 0 ? curr : []));
      return;
    }
    const missing = selectedIds.filter(
      (id) => !selectedRef.current.some((p) => p.id === id),
    );
    if (missing.length === 0) return;
    void (async () => {
      try {
        const all = await listPersons({ limit: 200 });
        const byId = new Map(all.map((p) => [p.id, p as unknown as Person]));
        setSelected((curr) => {
          const next = selectedIds
            .map((id) => byId.get(id))
            .filter((p): p is Person => Boolean(p));
          if (
            next.length === curr.length &&
            next.every((p, i) => curr[i]?.id === p.id)
          ) {
            return curr;
          }
          return next;
        });
      } catch {
        /* swallow */
      }
    })();
  }, [selectedIds]);

  useEffect(() => {
    let cancelled = false;
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = window.setTimeout(async () => {
      try {
        const data = await listPersons({ search: query.trim(), limit: 10 });
        if (!cancelled) setResults(data as unknown as Person[]);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-1)",
      }}
    >
      <SectionHeader
        label="Person"
        onReset={selectedIds.length > 0 ? onClear : undefined}
        resetLabel="Clear person filter"
      />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search people…"
        style={{
          fontFamily: "var(--font-family)",
          fontSize: 11,
          padding: "4px 8px",
          border: "1px solid var(--color-ring-boundary)",
          borderRadius: 4,
        }}
      />
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {selected.map((p) => (
            <Chip
              key={p.id}
              active
              onClick={() => onToggle(p.id)}
              label={`× ${p.full_name}`}
            />
          ))}
        </div>
      )}
      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {results
            .filter((p) => !selectedIds.includes(p.id))
            .map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onToggle(p.id);
                  setQuery("");
                  setResults([]);
                }}
                style={{
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  padding: "3px 6px",
                  fontSize: 11,
                  cursor: "pointer",
                  borderRadius: 4,
                  color: "var(--color-dark-text)",
                }}
              >
                {p.full_name}
                {p.company && (
                  <span
                    style={{
                      color: "var(--color-muted-text)",
                      marginLeft: 4,
                    }}
                  >
                    · {p.company}
                  </span>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function SegmentAdminPanel({
  segments,
  onChanged,
}: {
  segments: { id: string; name: string; theme_key: string | null }[];
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [items, setItems] = useState<SegmentAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTheme, setNewTheme] = useState(
    SEGMENT_THEMES[0]?.key ?? "dark-blue",
  );
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await listSegments({ includeInactive: true });
      setItems(data.sort((a, b) => a.display_order - b.display_order));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load segments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRename(id: string) {
    const value = renameValue.trim();
    if (!value) {
      setRenaming(null);
      return;
    }
    try {
      await updateSegment(id, { name: value });
      setRenaming(null);
      await refresh();
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
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reorder failed");
    }
  }

  async function handleDelete(seg: SegmentAdmin) {
    if (seg.usage_count > 0) {
      setError(
        `Cannot delete "${seg.name}" — still used by ${seg.usage_count} technologies.`,
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
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    try {
      await createSegment({ name, slug, theme_key: newTheme, is_active: true });
      setAdding(false);
      setNewName("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    }
  }

  if (loading) {
    return (
      <div style={{ fontSize: 11, color: "var(--color-muted-text)" }}>
        Loading…
      </div>
    );
  }

  void segments;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {error && (
        <div
          style={{
            color: "var(--color-brand-orange)",
            fontSize: 11,
          }}
        >
          {error}
        </div>
      )}
      {items.map((seg, idx) => {
        const theme = themeByKey(seg.theme_key);
        const isRenaming = renaming === seg.id;
        return (
          <div
            key={seg.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 4px",
              borderRadius: 4,
              background: theme.chipBg,
              fontSize: 11,
              color: theme.chipText,
            }}
          >
            <button
              type="button"
              aria-label="Move up"
              disabled={idx === 0}
              onClick={() => void move(seg.id, -1)}
              style={btnArrow}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="Move down"
              disabled={idx === items.length - 1}
              onClick={() => void move(seg.id, 1)}
              style={btnArrow}
            >
              ↓
            </button>
            {isRenaming ? (
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => void handleRename(seg.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleRename(seg.id);
                  if (e.key === "Escape") setRenaming(null);
                }}
                autoFocus
                style={{
                  flex: 1,
                  fontSize: 11,
                  border: "1px solid var(--color-ring-boundary)",
                  borderRadius: 3,
                  padding: "1px 4px",
                  fontFamily: "var(--font-family)",
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setRenaming(seg.id);
                  setRenameValue(seg.name);
                }}
                style={{
                  flex: 1,
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  fontSize: 11,
                  color: theme.chipText,
                  cursor: "text",
                  padding: 0,
                  fontFamily: "var(--font-family)",
                }}
                title="Click to rename"
              >
                {seg.name}{" "}
                {seg.usage_count > 0 && (
                  <span style={{ opacity: 0.65 }}>({seg.usage_count})</span>
                )}
              </button>
            )}
            <button
              type="button"
              aria-label={`Delete ${seg.name}`}
              onClick={() => void handleDelete(seg)}
              style={btnArrow}
            >
              ×
            </button>
          </div>
        );
      })}
      {adding ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: "3px 4px",
            borderRadius: 4,
            border: "1px dashed var(--color-ring-boundary)",
          }}
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Segment name"
            autoFocus
            style={{
              fontSize: 11,
              border: "1px solid var(--color-ring-boundary)",
              borderRadius: 3,
              padding: "2px 4px",
              fontFamily: "var(--font-family)",
            }}
          />
          <select
            value={newTheme}
            onChange={(e) => setNewTheme(e.target.value)}
            style={{ fontSize: 11 }}
          >
            {SEGMENT_THEMES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              type="button"
              onClick={() => void handleCreate()}
              style={{ ...btnArrow, padding: "2px 6px", flex: 1 }}
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setNewName("");
              }}
              style={{ ...btnArrow, padding: "2px 6px", flex: 1 }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          style={{
            ...btnArrow,
            padding: "3px 6px",
            fontSize: 11,
          }}
        >
          + Add segment
        </button>
      )}
    </div>
  );
}

const btnArrow: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--color-ring-boundary)",
  borderRadius: 3,
  padding: "1px 4px",
  fontSize: 11,
  cursor: "pointer",
  color: "var(--color-dark-text)",
  fontFamily: "var(--font-family)",
};
