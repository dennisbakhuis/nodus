import { useState, useRef, useEffect } from "react";
import type { RadarEntry } from "./types";

type Props = {
  entries: RadarEntry[];
  value: string;
  onChange: (value: string) => void;
  onSelect: (entry: RadarEntry) => void;
};

export function SearchBox({ entries, value, onChange, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const q = value.toLowerCase().trim();
  const matches =
    q.length >= 1
      ? entries
          .filter((e) => {
            if (e.canonical_name.toLowerCase().includes(q)) return true;
            return e.peer_references.some((pr) =>
              pr.peer_title.toLowerCase().includes(q),
            );
          })
          .slice(0, 8)
      : [];

  useEffect(() => {
    setActiveIndex(-1);
  }, [q]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = activeIndex >= 0 ? matches[activeIndex] : matches[0];
      if (target) {
        onSelect(target);
        onChange(target.canonical_name);
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      onChange("");
      setOpen(false);
    }
  }

  function handleSelect(entry: RadarEntry) {
    onSelect(entry);
    onChange(entry.canonical_name);
    setOpen(false);
    inputRef.current?.blur();
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        fontFamily: "var(--font-family)",
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label="Search technologies"
        aria-expanded={open && matches.length > 0}
        aria-autocomplete="list"
        aria-controls="search-listbox"
        aria-activedescendant={
          activeIndex >= 0 ? `search-option-${activeIndex}` : undefined
        }
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search technologies…"
        style={{
          width: "100%",
          padding: "6px 10px",
          border: "1px solid var(--color-ring-boundary)",
          borderRadius: "4px",
          fontSize: "13px",
          fontFamily: "var(--font-family)",
          background: "var(--color-white)",
          color: "var(--color-dark-text)",
          boxSizing: "border-box",
        }}
      />
      {open && matches.length > 0 && (
        <ul
          ref={listRef}
          id="search-listbox"
          role="listbox"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "var(--color-white)",
            border: "1px solid var(--color-ring-boundary)",
            borderTop: "none",
            borderRadius: "0 0 4px 4px",
            boxShadow: "var(--shadow-md)",
            margin: 0,
            padding: 0,
            listStyle: "none",
            zIndex: 300,
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          {matches.map((entry, i) => (
            <li
              key={entry.id}
              id={`search-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(entry);
              }}
              style={{
                padding: "8px 12px",
                cursor: "pointer",
                fontSize: "13px",
                background:
                  i === activeIndex
                    ? "var(--color-active-filter)"
                    : "transparent",
                color:
                  i === activeIndex
                    ? "var(--color-white)"
                    : "var(--color-dark-text)",
              }}
            >
              <span style={{ fontWeight: "var(--font-weight-medium)" }}>
                {entry.canonical_name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
