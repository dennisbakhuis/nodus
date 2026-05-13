import { useState, type CSSProperties } from "react";
import { Chip } from "./Chip";

type Props = {
  aliases: string[];
  onAdd: (alias: string) => void;
  onRemove: (alias: string) => void;
  disabled?: boolean;
  placeholder?: string;
  style?: CSSProperties;
};

export function normalizeAliasClient(name: string): string {
  return name
    .toLowerCase()
    .replace(/\p{P}/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function AliasList({
  aliases,
  onAdd,
  onRemove,
  disabled,
  placeholder = "Add alias…",
  style,
}: Props) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    const trimmed = draft.trim();
    if (trimmed === "") return;
    const normalised = normalizeAliasClient(trimmed);
    if (normalised === "") {
      setError("Alias must contain at least one character");
      return;
    }
    const collision = aliases.find(
      (a) => normalizeAliasClient(a) === normalised,
    );
    if (collision != null) {
      setError(`"${trimmed}" duplicates existing "${collision}"`);
      return;
    }
    onAdd(trimmed);
    setDraft("");
    setError(null);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        ...style,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
        {aliases.map((alias) => (
          <Chip
            key={alias}
            onRemove={disabled === true ? undefined : () => onRemove(alias)}
            disabled={disabled}
          >
            {alias}
          </Chip>
        ))}
        {aliases.length === 0 && (
          <span
            style={{
              color: "var(--color-muted-text)",
              fontSize: "var(--font-size-sm)",
            }}
          >
            No aliases yet
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <input
          type="text"
          value={draft}
          disabled={disabled}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error !== null) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder={placeholder}
          aria-label="New alias"
          style={{
            flex: 1,
            padding: "var(--space-1) var(--space-2)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--font-size-sm)",
          }}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={disabled === true || draft.trim() === ""}
          style={{
            padding: "var(--space-1) var(--space-3)",
            border: "1px solid var(--color-brand-dark-blue)",
            backgroundColor: "var(--color-brand-dark-blue)",
            color: "var(--color-white)",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--font-size-sm)",
            cursor:
              disabled === true || draft.trim() === ""
                ? "not-allowed"
                : "pointer",
            opacity: disabled === true || draft.trim() === "" ? 0.5 : 1,
          }}
        >
          Add
        </button>
      </div>
      {error !== null && (
        <span
          role="alert"
          style={{
            color: "var(--color-danger)",
            fontSize: "var(--font-size-xs)",
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
