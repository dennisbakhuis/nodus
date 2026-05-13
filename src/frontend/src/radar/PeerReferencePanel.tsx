import { useEffect, useRef, useState } from "react";

type PeerReferenceUrl = {
  id: string;
  url: string;
  label: string | null;
  display_order: number;
};

type PeerReferenceSummary = {
  id: string;
  topic_id: string;
  party_id: string;
  party_name: string;
  party_slug: string;
  peer_title: string;
  peer_ring_label: string | null;
  peer_segment_label: string | null;
  summary: string | null;
  urls?: PeerReferenceUrl[];
};

type Props = {
  references: PeerReferenceSummary[];
};

function PeerReferenceCard({ reference }: { reference: PeerReferenceSummary }) {
  const partyName = reference.party_name?.trim() || "Unknown peer";
  const sortedUrls = [...(reference.urls ?? [])].sort(
    (a, b) => a.display_order - b.display_order,
  );
  const primaryUrl = sortedUrls[0];
  const secondaryUrls = sortedUrls.slice(1);

  return (
    <article
      style={{
        border: "1px solid var(--color-border-strong)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        background: "var(--color-white)",
        boxShadow: "var(--shadow-sm)",
        display: "flex",
        alignItems: "stretch",
      }}
      data-testid="peer-reference-card"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--space-2) var(--space-1)",
          background:
            "linear-gradient(135deg, var(--color-brand-dark-blue) 0%, color-mix(in srgb, var(--color-brand-dark-blue) 65%, var(--color-brand-bright-blue)) 100%)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            fontSize: "var(--font-size-xs)",
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-white)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            whiteSpace: "nowrap",
          }}
          data-testid="peer-party-name"
        >
          {partyName}
        </span>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{ padding: "var(--space-3) var(--space-4) var(--space-4)" }}
        >
          <div
            style={{
              fontSize: "var(--font-size-body)",
              fontWeight: "var(--font-weight-medium)",
              color: "var(--color-dark-text)",
              marginBottom: "var(--space-2)",
              lineHeight: 1.3,
            }}
            data-testid="peer-title"
          >
            {reference.peer_title}
          </div>

          {(reference.peer_ring_label ?? reference.peer_segment_label) && (
            <div
              style={{
                display: "flex",
                gap: "var(--space-1)",
                flexWrap: "wrap",
                marginBottom: "var(--space-2)",
              }}
            >
              {reference.peer_ring_label && (
                <span
                  style={{
                    fontSize: "var(--font-size-xs)",
                    padding: "2px 8px",
                    borderRadius: "var(--radius-full)",
                    background: "var(--color-brand-dark-blue)",
                    color: "var(--color-white)",
                    fontWeight: "var(--font-weight-medium)",
                  }}
                  data-testid="peer-ring-label"
                >
                  {reference.peer_ring_label}
                </span>
              )}
              {reference.peer_segment_label && (
                <span
                  style={{
                    fontSize: "var(--font-size-xs)",
                    padding: "2px 8px",
                    borderRadius: "var(--radius-full)",
                    background: "var(--color-page-background)",
                    color: "var(--color-muted-text)",
                    border: "1px solid var(--color-border)",
                  }}
                  data-testid="peer-segment-label"
                >
                  {reference.peer_segment_label}
                </span>
              )}
            </div>
          )}

          {reference.summary && (
            <p
              style={{
                margin: "0 0 var(--space-2) 0",
                fontSize: "var(--font-size-xs)",
                color: "var(--color-muted-text)",
                lineHeight: 1.5,
              }}
              data-testid="peer-summary"
            >
              {reference.summary}
            </p>
          )}

          {primaryUrl && (
            <div style={{ marginTop: "var(--space-2)" }}>
              <a
                href={primaryUrl.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block",
                  fontSize: "var(--font-size-xs)",
                  color: "var(--color-white)",
                  background: "var(--color-brand-dark-blue)",
                  borderRadius: "var(--radius-md)",
                  padding: "4px 10px",
                  textDecoration: "none",
                  fontWeight: "var(--font-weight-medium)",
                }}
                data-testid="peer-primary-url"
              >
                {primaryUrl.label ?? `View on ${partyName}`}
              </a>

              {secondaryUrls.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "var(--space-1)",
                    marginTop: "var(--space-2)",
                  }}
                >
                  {secondaryUrls.map((u) => (
                    <a
                      key={u.id}
                      href={u.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: "var(--font-size-xs)",
                        color: "var(--color-brand-dark-blue)",
                        textDecoration: "underline",
                      }}
                      data-testid="peer-secondary-url"
                    >
                      {u.label ?? u.url}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function PeerReferencePanel({ references }: Props) {
  if (references.length === 0) {
    return null;
  }

  return (
    <section
      style={{ marginBottom: "var(--space-6)" }}
      data-testid="peer-reference-panel"
    >
      <h3
        style={{
          margin: "0 0 var(--space-3) 0",
          fontSize: "13px",
          fontWeight: "var(--font-weight-bold)",
          color: "var(--color-dark-blue)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Peer References ({references.length})
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "var(--space-3)",
          alignItems: "start",
        }}
      >
        {references.map((ref) => (
          <PeerReferenceCard key={ref.id} reference={ref} />
        ))}
      </div>
    </section>
  );
}

export type EditablePeerRef = {
  id: string;
  party_id: string;
  party_name: string;
  peer_title: string;
  peer_ring_label: string | null;
  peer_segment_label: string | null;
  peer_time_to_mainstream_label: string | null;
  summary: string | null;
  urls: {
    id: string;
    url: string;
    label: string | null;
    display_order: number;
  }[];
  _newUrl?: { url: string; label: string };
  _deleted?: boolean;
  /** Marker for cards staged for creation (not yet POSTed). id starts with `__newref_` */
  _isNew?: boolean;
};

export type PartyOption = { id: string; name: string };

const _editInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--color-border-strong)",
  fontFamily: "var(--font-family)",
  fontSize: "13px",
  background: "var(--color-white)",
  marginBottom: 4,
};
const _editTextareaStyle: React.CSSProperties = {
  ..._editInputStyle,
  minHeight: 80,
  resize: "vertical",
  lineHeight: 1.4,
};

export function PeerReferenceEditPanel({
  refs,
  onChange,
  partyOptions,
}: {
  refs: EditablePeerRef[];
  onChange: (next: EditablePeerRef[]) => void;
  partyOptions: PartyOption[];
}) {
  const updateRef = (id: string, patch: Partial<EditablePeerRef>) =>
    onChange(refs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addNewRef = () => {
    const id = `__newref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    onChange([
      ...refs,
      {
        id,
        party_id: "",
        party_name: "",
        peer_title: "",
        peer_ring_label: null,
        peer_segment_label: null,
        peer_time_to_mainstream_label: null,
        summary: null,
        urls: [],
        _newUrl: { url: "", label: "" },
        _isNew: true,
      },
    ]);
  };
  const stagePushUrl = (id: string) => {
    const r = refs.find((x) => x.id === id);
    if (!r?._newUrl?.url.trim()) return;
    const next: EditablePeerRef["urls"] = [
      ...r.urls,
      {
        id: `__new_${Date.now()}_${Math.random()}`,
        url: r._newUrl.url.trim(),
        label: r._newUrl.label.trim() || null,
        display_order: (r.urls[r.urls.length - 1]?.display_order ?? -1) + 1,
      },
    ];
    updateRef(id, { urls: next, _newUrl: { url: "", label: "" } });
  };
  const removeUrl = (id: string, urlId: string) => {
    const r = refs.find((x) => x.id === id);
    if (!r) return;
    updateRef(id, { urls: r.urls.filter((u) => u.id !== urlId) });
  };

  const visible = refs.filter((r) => !r._deleted);

  return (
    <section style={{ marginBottom: "var(--space-6)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--space-3)",
          gap: 8,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: "13px",
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-dark-blue)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Peer References ({visible.length})
        </h3>
        <button
          type="button"
          onClick={addNewRef}
          style={{
            background: "var(--color-brand-dark-blue)",
            color: "white",
            border: "none",
            borderRadius: "var(--radius-md)",
            padding: "4px 12px",
            cursor: "pointer",
            fontFamily: "var(--font-family)",
            fontSize: 12,
          }}
        >
          + Add peer reference
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: "var(--space-3)",
          alignItems: "start",
        }}
      >
        {visible.map((r) => (
          <article
            key={r.id}
            style={{
              border: "1px solid var(--color-border-strong)",
              borderRadius: "var(--radius-lg)",
              background: "var(--color-white)",
              boxShadow: "var(--shadow-sm)",
              padding: "var(--space-3)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 6,
                marginBottom: 6,
              }}
            >
              <div style={{ flex: 1 }}>
                <label
                  style={{ fontSize: 11, color: "var(--color-muted-text)" }}
                >
                  Party
                </label>
                <PartyCombobox
                  value={r.party_name}
                  options={partyOptions}
                  onChange={(name, partyId) =>
                    updateRef(r.id, {
                      party_name: name,
                      party_id: partyId ?? "",
                    })
                  }
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  r._isNew
                    ? onChange(refs.filter((x) => x.id !== r.id))
                    : updateRef(r.id, { _deleted: true })
                }
                aria-label="Delete peer reference"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#c0392b",
                  cursor: "pointer",
                  fontSize: 14,
                  alignSelf: "flex-end",
                  paddingBottom: 4,
                }}
              >
                🗑 Delete
              </button>
            </div>
            <label style={{ fontSize: 11, color: "var(--color-muted-text)" }}>
              Peer title
            </label>
            <input
              type="text"
              value={r.peer_title}
              onChange={(e) => updateRef(r.id, { peer_title: e.target.value })}
              style={_editInputStyle}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
              }}
            >
              <div>
                <label
                  style={{ fontSize: 11, color: "var(--color-muted-text)" }}
                >
                  Ring label
                </label>
                <input
                  type="text"
                  value={r.peer_ring_label ?? ""}
                  onChange={(e) =>
                    updateRef(r.id, { peer_ring_label: e.target.value || null })
                  }
                  style={_editInputStyle}
                />
              </div>
              <div>
                <label
                  style={{ fontSize: 11, color: "var(--color-muted-text)" }}
                >
                  Segment label
                </label>
                <input
                  type="text"
                  value={r.peer_segment_label ?? ""}
                  onChange={(e) =>
                    updateRef(r.id, {
                      peer_segment_label: e.target.value || null,
                    })
                  }
                  style={_editInputStyle}
                />
              </div>
            </div>
            <label style={{ fontSize: 11, color: "var(--color-muted-text)" }}>
              Time to mainstream label
            </label>
            <input
              type="text"
              value={r.peer_time_to_mainstream_label ?? ""}
              onChange={(e) =>
                updateRef(r.id, {
                  peer_time_to_mainstream_label: e.target.value || null,
                })
              }
              style={_editInputStyle}
            />
            <label style={{ fontSize: 11, color: "var(--color-muted-text)" }}>
              Summary
            </label>
            <textarea
              value={r.summary ?? ""}
              onChange={(e) =>
                updateRef(r.id, { summary: e.target.value || null })
              }
              style={_editTextareaStyle}
            />
            <div style={{ marginTop: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--color-muted-text)",
                  marginBottom: 4,
                }}
              >
                URLs
              </div>
              {r.urls.length === 0 && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--color-muted-text)",
                    fontStyle: "italic",
                  }}
                >
                  No URLs yet
                </div>
              )}
              {r.urls.map((u) => (
                <div
                  key={u.id}
                  style={{
                    display: "flex",
                    gap: 4,
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: 12,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: "var(--color-dark-text)",
                    }}
                    title={u.url}
                  >
                    {u.label ? `${u.label} — ` : ""}
                    {u.url}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeUrl(r.id, u.id)}
                    aria-label="Remove URL"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#c0392b",
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                <input
                  type="text"
                  placeholder="https://…"
                  value={r._newUrl?.url ?? ""}
                  onChange={(e) =>
                    updateRef(r.id, {
                      _newUrl: {
                        url: e.target.value,
                        label: r._newUrl?.label ?? "",
                      },
                    })
                  }
                  style={{ ..._editInputStyle, flex: 2, marginBottom: 0 }}
                />
                <input
                  type="text"
                  placeholder="label"
                  value={r._newUrl?.label ?? ""}
                  onChange={(e) =>
                    updateRef(r.id, {
                      _newUrl: {
                        url: r._newUrl?.url ?? "",
                        label: e.target.value,
                      },
                    })
                  }
                  style={{ ..._editInputStyle, flex: 1, marginBottom: 0 }}
                />
                <button
                  type="button"
                  onClick={() => stagePushUrl(r.id)}
                  style={{
                    background: "var(--color-brand-dark-blue)",
                    color: "white",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    padding: "0 12px",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  +
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PartyCombobox({
  value,
  options,
  onChange,
}: {
  value: string;
  options: PartyOption[];
  onChange: (name: string, partyId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);
  const q = value.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.name.toLowerCase().includes(q))
    : options;
  const exact = options.find((o) => o.name.toLowerCase() === q);
  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const name = e.target.value;
          const match = options.find(
            (o) => o.name.toLowerCase() === name.toLowerCase(),
          );
          onChange(name, match ? match.id : null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Type or pick a party (e.g. Hooli)"
        style={_editInputStyle}
      />
      {open && filtered.length + (q && !exact ? 1 : 0) > 0 && (
        <ul
          role="listbox"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 1000,
            margin: 0,
            padding: 4,
            listStyle: "none",
            background: "var(--color-white)",
            border: "1px solid var(--color-border-strong)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-md)",
            maxHeight: 220,
            overflowY: "auto",
            fontSize: 13,
          }}
        >
          {filtered.map((p) => (
            <li
              key={p.id}
              role="option"
              aria-selected={p.id === exact?.id}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(p.name, p.id);
                setOpen(false);
              }}
              style={{
                padding: "6px 10px",
                cursor: "pointer",
                borderRadius: "var(--radius-sm)",
                color: "var(--color-dark-text)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLLIElement).style.background =
                  "var(--color-page-background)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLLIElement).style.background =
                  "transparent";
              }}
            >
              {p.name}
            </li>
          ))}
          {q && !exact && (
            <li
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(value, null);
                setOpen(false);
              }}
              style={{
                padding: "6px 10px",
                cursor: "pointer",
                borderRadius: "var(--radius-sm)",
                color: "var(--color-dark-blue)",
                fontStyle: "italic",
                borderTop: filtered.length
                  ? "1px solid var(--color-border)"
                  : "none",
              }}
            >
              + Create new party "{value}"
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
