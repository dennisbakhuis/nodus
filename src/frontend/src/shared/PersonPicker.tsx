import { useEffect, useRef, useState } from "react";
import { listPersons, createPerson } from "../api/client";
import type { PersonCreate, PersonReadManagement } from "../api/client";

type Props = {
  onSelect: (person: PersonReadManagement) => void;
  onCancel?: () => void;
  searchDelayMs?: number;
};

const DEFAULT_DELAY_MS = 200;

export function PersonPicker({
  onSelect,
  onCancel,
  searchDelayMs = DEFAULT_DELAY_MS,
}: Props) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PersonReadManagement[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"search" | "create">("search");
  const [createForm, setCreateForm] = useState<PersonCreate>({
    full_name: "",
    company: "",
    email: null,
    department: null,
    role: null,
    notes: null,
    user_id: null,
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mode !== "search") return;
    if (searchTimerRef.current !== null) {
      clearTimeout(searchTimerRef.current);
    }
    setLoading(true);
    searchTimerRef.current = setTimeout(() => {
      void listPersons({ search: search || null })
        .then((rows) => setResults(rows))
        .finally(() => setLoading(false));
    }, searchDelayMs);
    return () => {
      if (searchTimerRef.current !== null) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [search, mode, searchDelayMs]);

  async function handleCreate() {
    if (
      createForm.full_name.trim() === "" ||
      createForm.company.trim() === ""
    ) {
      setCreateError("Full name and company are required");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createPerson(createForm);
      onSelect(created);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  if (mode === "create") {
    return (
      <div
        role="dialog"
        aria-label="Create new person"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
          padding: "var(--space-3)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          backgroundColor: "var(--color-white)",
        }}
      >
        <input
          type="text"
          placeholder="Full name *"
          value={createForm.full_name}
          onChange={(e) =>
            setCreateForm({ ...createForm, full_name: e.target.value })
          }
          aria-label="Full name"
          style={inputStyle()}
        />
        <input
          type="text"
          placeholder="Company *"
          value={createForm.company}
          onChange={(e) =>
            setCreateForm({ ...createForm, company: e.target.value })
          }
          aria-label="Company"
          style={inputStyle()}
        />
        <input
          type="email"
          placeholder="Email (optional)"
          value={createForm.email ?? ""}
          onChange={(e) =>
            setCreateForm({
              ...createForm,
              email: e.target.value === "" ? null : e.target.value,
            })
          }
          aria-label="Email"
          style={inputStyle()}
        />
        <input
          type="text"
          placeholder="Department (optional)"
          value={createForm.department ?? ""}
          onChange={(e) =>
            setCreateForm({
              ...createForm,
              department: e.target.value === "" ? null : e.target.value,
            })
          }
          aria-label="Department"
          style={inputStyle()}
        />
        <input
          type="text"
          placeholder="Role (optional)"
          value={createForm.role ?? ""}
          onChange={(e) =>
            setCreateForm({
              ...createForm,
              role: e.target.value === "" ? null : e.target.value,
            })
          }
          aria-label="Role"
          style={inputStyle()}
        />
        {createError !== null && (
          <span
            role="alert"
            style={{
              color: "var(--color-danger)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            {createError}
          </span>
        )}
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <button
            type="button"
            onClick={() => {
              void handleCreate();
            }}
            disabled={creating}
            style={primaryButtonStyle(creating)}
          >
            {creating ? "Creating…" : "Create"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("search");
              setCreateError(null);
            }}
            style={secondaryButtonStyle()}
          >
            Back to search
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
      }}
    >
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or company…"
        aria-label="Person search"
        style={inputStyle()}
      />
      <div
        role="listbox"
        aria-label="Person results"
        style={{
          maxHeight: 200,
          overflowY: "auto",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          backgroundColor: "var(--color-white)",
        }}
      >
        {loading && (
          <div
            style={{
              padding: "var(--space-2)",
              color: "var(--color-muted-text)",
              fontSize: "var(--font-size-sm)",
            }}
          >
            Searching…
          </div>
        )}
        {!loading && results.length === 0 && (
          <div
            style={{
              padding: "var(--space-2)",
              color: "var(--color-muted-text)",
              fontSize: "var(--font-size-sm)",
            }}
          >
            No matches
          </div>
        )}
        {!loading &&
          results.map((p) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => onSelect(p)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                width: "100%",
                padding: "var(--space-2)",
                border: "none",
                background: "none",
                textAlign: "left",
                cursor: "pointer",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <span style={{ fontWeight: "var(--font-weight-medium)" }}>
                {p.full_name}
              </span>
              <span
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--color-muted-text)",
                }}
              >
                {p.company}
                {p.role !== null && ` · ${p.role}`}
              </span>
            </button>
          ))}
      </div>
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <button
          type="button"
          onClick={() => setMode("create")}
          style={secondaryButtonStyle()}
        >
          + Create new person
        </button>
        {onCancel != null && (
          <button
            type="button"
            onClick={onCancel}
            style={secondaryButtonStyle()}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function inputStyle() {
  return {
    padding: "var(--space-1) var(--space-2)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--font-size-sm)",
  } as const;
}

function primaryButtonStyle(disabled: boolean) {
  return {
    padding: "var(--space-1) var(--space-3)",
    border: "1px solid var(--color-brand-dark-blue)",
    backgroundColor: "var(--color-brand-dark-blue)",
    color: "var(--color-white)",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--font-size-sm)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  } as const;
}

function secondaryButtonStyle() {
  return {
    padding: "var(--space-1) var(--space-3)",
    border: "1px solid var(--color-border-strong)",
    backgroundColor: "var(--color-white)",
    color: "var(--color-dark-text)",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--font-size-sm)",
    cursor: "pointer",
  } as const;
}
