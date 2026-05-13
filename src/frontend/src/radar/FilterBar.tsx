import { Chip } from "../shared/Chip";
import type { FilterState, RadarData, MovementStatus, RingName } from "./types";

type Props = {
  data: RadarData;
  filters: FilterState;
  onChange: (next: FilterState) => void;
};

const RING_NAMES: RingName[] = ["Invest", "Pilot", "Explore", "Monitor"];
const MOVEMENT_OPTIONS: { value: MovementStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "promoted", label: "Promoted" },
  { value: "demoted", label: "Demoted" },
  { value: "unchanged", label: "Unchanged" },
];

export function FilterBar({ data, filters, onChange }: Props) {
  const sorted = [...data.segments].sort((a, b) => a.order - b.order);

  function toggleSegment(name: string) {
    const next = filters.segments.includes(name)
      ? filters.segments.filter((s) => s !== name)
      : [...filters.segments, name];
    onChange({ ...filters, segments: next });
  }

  function toggleRing(name: RingName) {
    const next = filters.rings.includes(name)
      ? filters.rings.filter((r) => r !== name)
      : [...filters.rings, name];
    onChange({ ...filters, rings: next });
  }

  function toggleMovement(value: MovementStatus) {
    const next = filters.movements.includes(value)
      ? filters.movements.filter((m) => m !== value)
      : [...filters.movements, value];
    onChange({ ...filters, movements: next });
  }

  function clearAll() {
    onChange({
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
      visibility: "all",
    });
  }

  const hasFilters =
    filters.segments.length > 0 ||
    filters.rings.length > 0 ||
    filters.movements.length > 0 ||
    filters.search.trim().length > 0;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "var(--space-2)",
        alignItems: "center",
        padding: "var(--space-3) var(--space-4)",
        background: "var(--color-white)",
        borderBottom: "1px solid var(--color-ring-boundary)",
        fontFamily: "var(--font-family)",
      }}
      role="group"
      aria-label="Radar filters"
    >
      <FilterGroup label="Segment">
        {sorted.map((seg) => (
          <Chip
            key={seg.id}
            variant="filter"
            active={filters.segments.includes(seg.name)}
            onClick={() => toggleSegment(seg.name)}
          >
            {seg.name}
          </Chip>
        ))}
      </FilterGroup>

      <Divider />

      <FilterGroup label="Ring">
        {RING_NAMES.map((r) => (
          <Chip
            key={r}
            variant="filter"
            active={filters.rings.includes(r)}
            onClick={() => toggleRing(r)}
          >
            {r}
          </Chip>
        ))}
      </FilterGroup>

      <Divider />

      <FilterGroup label="Movement">
        {MOVEMENT_OPTIONS.map(({ value, label }) => (
          <Chip
            key={value}
            variant="filter"
            active={filters.movements.includes(value)}
            onClick={() => toggleMovement(value)}
          >
            {label}
          </Chip>
        ))}
      </FilterGroup>

      {hasFilters && (
        <button
          onClick={clearAll}
          style={{
            marginLeft: "auto",
            background: "none",
            border: "1px solid var(--color-ring-boundary)",
            borderRadius: "4px",
            padding: "4px 10px",
            cursor: "pointer",
            fontSize: "12px",
            color: "var(--color-muted-text)",
            fontFamily: "var(--font-family)",
          }}
        >
          Clear all
        </button>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}
    >
      <span
        style={{
          fontSize: "11px",
          fontWeight: "var(--font-weight-bold)",
          color: "var(--color-muted-text)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
          marginRight: "var(--space-1)",
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        width: 1,
        height: 24,
        background: "var(--color-ring-boundary)",
        flexShrink: 0,
      }}
      aria-hidden="true"
    />
  );
}

// FilterBar uses shared/Chip with variant="filter". Call sites pass `label`
// as children, keeping `active` and `onClick`.
