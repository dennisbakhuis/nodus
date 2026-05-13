import { useEffect, useState } from "react";
import {
  createInitiative,
  deleteInitiative,
  listInitiatives,
  updateInitiative,
} from "../api/initiatives";
import { createPerson, listPersons } from "../api/persons";
import {
  INITIATIVE_STATUSES,
  INITIATIVE_STATUS_DISPLAY,
  type InitiativeRead,
  type InitiativeStatus,
  type PersonReadManagement,
} from "../manage/types";
import { Modal } from "../shared/Modal";

type Props = {
  technologyId: string;
  /** When true, render add/edit/delete affordances. When false, read-only display. */
  editable?: boolean;
  /** Optional callback invoked after any mutation completes. */
  onChange?: () => void;
};

type DraftInitiative = {
  title: string;
  description: string;
  status: InitiativeStatus;
  contact_person_id: string | null;
  contact_person_name: string;
};

function emptyDraft(): DraftInitiative {
  return {
    title: "",
    description: "",
    status: "Idea",
    contact_person_id: null,
    contact_person_name: "",
  };
}

const STATUS_PILL_COLORS: Record<InitiativeStatus, string> = {
  Idea: "var(--color-muted-text)",
  Scoping: "var(--color-ring-watch)",
  Pilot: "var(--color-ring-trial)",
  InProduction: "var(--color-ring-invest)",
  Paused: "var(--color-muted-text)",
  Dropped: "#c0392b",
};

function StatusPill({ status }: { status: InitiativeStatus }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: "var(--font-weight-medium)",
        padding: "2px 8px",
        borderRadius: 999,
        background: STATUS_PILL_COLORS[status],
        color: "var(--color-white)",
      }}
    >
      {INITIATIVE_STATUS_DISPLAY[status]}
    </span>
  );
}

function ContactSearchInput({
  value,
  onChange,
  onRequestCreate,
}: {
  value: { id: string | null; name: string };
  onChange: (next: { id: string | null; name: string }) => void;
  onRequestCreate: (presetName: string) => void;
}) {
  const [results, setResults] = useState<PersonReadManagement[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  async function runSearch(q: string) {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const r = await listPersons({ search: q, limit: 8 });
      setResults(r);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        value={value.name}
        onChange={(e) => {
          onChange({ id: null, name: e.target.value });
          void runSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        placeholder="Search a contact…"
        style={{
          width: "100%",
          padding: "4px 8px",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          fontSize: 12,
          boxSizing: "border-box",
        }}
      />
      {open && (results.length > 0 || searching || value.name.trim()) && (
        <ul
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 30,
            margin: 0,
            padding: 4,
            background: "var(--color-white)",
            border: "1px solid var(--color-border-strong)",
            borderRadius: "var(--radius-sm)",
            listStyle: "none",
            maxHeight: 200,
            overflowY: "auto",
            fontSize: 12,
          }}
        >
          {searching && (
            <li
              style={{ padding: "4px 6px", color: "var(--color-muted-text)" }}
            >
              Searching…
            </li>
          )}
          {results.map((p) => (
            <li
              key={p.id}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange({ id: p.id, name: p.full_name });
                setOpen(false);
              }}
              style={{
                padding: "4px 6px",
                cursor: "pointer",
                borderRadius: 4,
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLLIElement).style.background =
                  "var(--color-page-background)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLLIElement).style.background =
                  "transparent")
              }
            >
              {p.full_name}
              <span style={{ color: "var(--color-muted-text)" }}>
                {" "}
                — {p.company}
              </span>
            </li>
          ))}
          {value.name.trim() && !searching && results.length === 0 && (
            <>
              <li
                onMouseDown={(e) => {
                  e.preventDefault();
                  onRequestCreate(value.name.trim());
                  setOpen(false);
                }}
                style={{
                  padding: "4px 6px",
                  color: "var(--color-brand-dark-blue)",
                  cursor: "pointer",
                  fontWeight: "var(--font-weight-medium)",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLLIElement).style.background =
                    "var(--color-page-background)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLLIElement).style.background =
                    "transparent")
                }
              >
                + Create new person “{value.name.trim()}”
              </li>
              <li
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange({ id: null, name: "" });
                  setOpen(false);
                }}
                style={{
                  padding: "4px 6px",
                  color: "var(--color-muted-text)",
                  fontStyle: "italic",
                  cursor: "pointer",
                }}
              >
                No match — clear contact
              </li>
            </>
          )}
        </ul>
      )}
    </div>
  );
}

type CreatePersonTarget = "draft" | "edit";

type CreatePersonDraft = {
  full_name: string;
  email: string;
  company: string;
  department: string;
};

export function InitiativeEditor({
  technologyId,
  editable = true,
  onChange,
}: Props) {
  const [items, setItems] = useState<InitiativeRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draft, setDraft] = useState<DraftInitiative>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftInitiative>(emptyDraft());
  const [contactNames, setContactNames] = useState<Record<string, string>>({});
  // Create-new-person popup state.
  const [createPersonTarget, setCreatePersonTarget] =
    useState<CreatePersonTarget | null>(null);
  const [createPersonDraft, setCreatePersonDraft] = useState<CreatePersonDraft>(
    {
      full_name: "",
      email: "",
      company: "",
      department: "",
    },
  );
  const [creatingPerson, setCreatingPerson] = useState(false);
  const [createPersonError, setCreatePersonError] = useState<string | null>(
    null,
  );

  function openCreatePerson(target: CreatePersonTarget, presetName: string) {
    setCreatePersonTarget(target);
    setCreatePersonDraft({
      full_name: presetName,
      email: "",
      company: "",
      department: "",
    });
    setCreatePersonError(null);
  }

  function closeCreatePerson() {
    setCreatePersonTarget(null);
    setCreatePersonError(null);
  }

  async function handleCreateAndSelectPerson() {
    if (
      !createPersonDraft.full_name.trim() ||
      !createPersonDraft.company.trim() ||
      !createPersonDraft.email.trim()
    ) {
      setCreatePersonError("Full name, company, and email are required.");
      return;
    }
    setCreatingPerson(true);
    setCreatePersonError(null);
    try {
      const created = await createPerson({
        full_name: createPersonDraft.full_name.trim(),
        company: createPersonDraft.company.trim(),
        email: createPersonDraft.email.trim(),
        department: createPersonDraft.department.trim() || null,
      });
      const next = { id: created.id, name: created.full_name };
      if (createPersonTarget === "draft") {
        setDraft((d) => ({
          ...d,
          contact_person_id: next.id,
          contact_person_name: next.name,
        }));
      } else if (createPersonTarget === "edit") {
        setEditDraft((d) => ({
          ...d,
          contact_person_id: next.id,
          contact_person_name: next.name,
        }));
      }
      setContactNames((map) => ({ ...map, [created.id]: created.full_name }));
      closeCreatePerson();
    } catch (e) {
      setCreatePersonError(
        e instanceof Error ? e.message : "Failed to create person",
      );
    } finally {
      setCreatingPerson(false);
    }
  }

  async function refetch() {
    setLoading(true);
    setError(null);
    try {
      const rows = await listInitiatives(technologyId);
      setItems(rows);
      const ids = rows
        .map((r) => r.contact_person_id)
        .filter((v): v is string => !!v);
      if (ids.length > 0) {
        try {
          const persons = await listPersons({ limit: 200 });
          const byId = new Map(persons.map((p) => [p.id, p.full_name]));
          const next: Record<string, string> = {};
          for (const id of ids) {
            const name = byId.get(id);
            if (name) next[id] = name;
          }
          setContactNames(next);
        } catch {
          // Non-fatal — just don't show names.
        }
      } else {
        setContactNames({});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load initiatives");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [technologyId]);

  async function handleCreate() {
    if (!draft.title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createInitiative(technologyId, {
        title: draft.title.trim(),
        description: draft.description,
        status: draft.status,
        contact_person_id: draft.contact_person_id,
        display_order: items.length,
      });
      setDraft(emptyDraft());
      setDraftOpen(false);
      await refetch();
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create initiative");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(id: string) {
    if (!editDraft.title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await updateInitiative(id, {
        title: editDraft.title.trim(),
        description: editDraft.description,
        status: editDraft.status,
        contact_person_id: editDraft.contact_person_id,
      });
      setEditingId(null);
      await refetch();
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteInitiative(id);
      await refetch();
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  function beginEdit(item: InitiativeRead) {
    setEditingId(item.id);
    setEditDraft({
      title: item.title,
      description: item.description,
      status: (item.status as InitiativeStatus) ?? "Idea",
      contact_person_id: item.contact_person_id ?? null,
      contact_person_name: item.contact_person_id
        ? (contactNames[item.contact_person_id] ?? "")
        : "",
    });
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "4px 8px",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 12,
    boxSizing: "border-box",
    fontFamily: "var(--font-family)",
  };

  return (
    <section style={{ marginBottom: "var(--space-5)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--space-2)",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-dark-blue)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Initiatives
        </h3>
        {editable && !draftOpen && (
          <button
            type="button"
            onClick={() => setDraftOpen(true)}
            style={{
              background: "var(--color-brand-dark-blue)",
              color: "var(--color-white)",
              border: "none",
              borderRadius: "var(--radius-md)",
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            + Add initiative
          </button>
        )}
      </div>

      {error && (
        <p
          role="alert"
          style={{
            fontSize: 12,
            color: "var(--color-danger)",
            margin: "0 0 var(--space-2) 0",
          }}
        >
          {error}
        </p>
      )}

      {loading && items.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--color-muted-text)" }}>
          Loading…
        </p>
      )}

      {!loading && items.length === 0 && !draftOpen && (
        <p
          style={{
            fontSize: 12,
            color: "var(--color-muted-text)",
            fontStyle: "italic",
            margin: 0,
          }}
        >
          No initiatives yet.
        </p>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        {items.map((item) =>
          editingId === item.id ? (
            <article
              key={item.id}
              style={{
                border: "1px dashed var(--color-brand-dark-blue)",
                borderRadius: "var(--radius-md)",
                background: "var(--color-white)",
                padding: "var(--space-3)",
              }}
            >
              <div style={{ display: "grid", gap: 6 }}>
                <input
                  type="text"
                  value={editDraft.title}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, title: e.target.value })
                  }
                  placeholder="Title"
                  style={inputStyle}
                />
                <textarea
                  value={editDraft.description}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, description: e.target.value })
                  }
                  placeholder="Description"
                  style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 6,
                  }}
                >
                  <label
                    style={{ fontSize: 11, color: "var(--color-muted-text)" }}
                  >
                    Status
                    <select
                      value={editDraft.status}
                      onChange={(e) =>
                        setEditDraft({
                          ...editDraft,
                          status: e.target.value as InitiativeStatus,
                        })
                      }
                      style={inputStyle}
                    >
                      {INITIATIVE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {INITIATIVE_STATUS_DISPLAY[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label
                    style={{ fontSize: 11, color: "var(--color-muted-text)" }}
                  >
                    Contact
                    <ContactSearchInput
                      value={{
                        id: editDraft.contact_person_id,
                        name: editDraft.contact_person_name,
                      }}
                      onChange={(v) =>
                        setEditDraft({
                          ...editDraft,
                          contact_person_id: v.id,
                          contact_person_name: v.name,
                        })
                      }
                      onRequestCreate={(name) => openCreatePerson("edit", name)}
                    />
                  </label>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    style={{
                      background: "none",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "4px 10px",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveEdit(item.id)}
                    disabled={saving}
                    style={{
                      background: "var(--color-brand-dark-blue)",
                      color: "var(--color-white)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      padding: "4px 10px",
                      fontSize: 11,
                      cursor: saving ? "wait" : "pointer",
                    }}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </article>
          ) : (
            <article
              key={item.id}
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                background: "var(--color-white)",
                padding: "var(--space-3)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flex: 1,
                  }}
                >
                  <strong style={{ fontSize: 14 }}>{item.title}</strong>
                  <StatusPill
                    status={(item.status as InitiativeStatus) ?? "Idea"}
                  />
                </div>
                {editable && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => beginEdit(item)}
                      style={{
                        background: "none",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-sm)",
                        padding: "2px 8px",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(item.id)}
                      aria-label={`Delete initiative ${item.title}`}
                      style={{
                        background: "none",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-sm)",
                        padding: "2px 8px",
                        fontSize: 11,
                        cursor: "pointer",
                        color: "#c0392b",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
              {item.description && (
                <p
                  style={{
                    margin: "var(--space-2) 0 0 0",
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: "var(--color-dark-text)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {item.description}
                </p>
              )}
              {item.contact_person_id &&
                contactNames[item.contact_person_id] && (
                  <p
                    style={{
                      margin: "var(--space-2) 0 0 0",
                      fontSize: 11,
                      color: "var(--color-muted-text)",
                    }}
                  >
                    Contact: {contactNames[item.contact_person_id]}
                  </p>
                )}
            </article>
          ),
        )}

        {editable && draftOpen && (
          <article
            style={{
              border: "1px dashed var(--color-brand-dark-blue)",
              borderRadius: "var(--radius-md)",
              background: "var(--color-white)",
              padding: "var(--space-3)",
            }}
          >
            <div style={{ display: "grid", gap: 6 }}>
              <input
                type="text"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Title"
                style={inputStyle}
              />
              <textarea
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
                placeholder="Description"
                style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                }}
              >
                <label
                  style={{ fontSize: 11, color: "var(--color-muted-text)" }}
                >
                  Status
                  <select
                    value={draft.status}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        status: e.target.value as InitiativeStatus,
                      })
                    }
                    style={inputStyle}
                  >
                    {INITIATIVE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {INITIATIVE_STATUS_DISPLAY[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  style={{ fontSize: 11, color: "var(--color-muted-text)" }}
                >
                  Contact
                  <ContactSearchInput
                    value={{
                      id: draft.contact_person_id,
                      name: draft.contact_person_name,
                    }}
                    onChange={(v) =>
                      setDraft({
                        ...draft,
                        contact_person_id: v.id,
                        contact_person_name: v.name,
                      })
                    }
                    onRequestCreate={(name) => openCreatePerson("draft", name)}
                  />
                </label>
              </div>
              <div
                style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setDraftOpen(false);
                    setDraft(emptyDraft());
                  }}
                  style={{
                    background: "none",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "4px 10px",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={saving || !draft.title.trim()}
                  style={{
                    background: "var(--color-brand-dark-blue)",
                    color: "var(--color-white)",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    padding: "4px 10px",
                    fontSize: 11,
                    cursor: saving ? "wait" : "pointer",
                  }}
                >
                  {saving ? "Saving…" : "Add"}
                </button>
              </div>
            </div>
          </article>
        )}
      </div>
      <Modal
        open={createPersonTarget !== null}
        onClose={closeCreatePerson}
        title="Create new person"
        size="default"
      >
        <div style={{ display: "grid", gap: 10, padding: "var(--space-3)" }}>
          {createPersonError && (
            <p
              role="alert"
              style={{
                margin: 0,
                color: "var(--color-danger)",
                fontSize: 12,
              }}
            >
              {createPersonError}
            </p>
          )}
          <label style={{ fontSize: 12, color: "var(--color-muted-text)" }}>
            Full name
            <input
              type="text"
              value={createPersonDraft.full_name}
              onChange={(e) =>
                setCreatePersonDraft({
                  ...createPersonDraft,
                  full_name: e.target.value,
                })
              }
              autoFocus
              style={{
                width: "100%",
                padding: "6px 8px",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                fontSize: 13,
                boxSizing: "border-box",
                marginTop: 4,
                fontFamily: "var(--font-family)",
              }}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--color-muted-text)" }}>
            Email
            <input
              type="email"
              value={createPersonDraft.email}
              onChange={(e) =>
                setCreatePersonDraft({
                  ...createPersonDraft,
                  email: e.target.value,
                })
              }
              style={{
                width: "100%",
                padding: "6px 8px",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                fontSize: 13,
                boxSizing: "border-box",
                marginTop: 4,
                fontFamily: "var(--font-family)",
              }}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--color-muted-text)" }}>
            Company
            <input
              type="text"
              value={createPersonDraft.company}
              onChange={(e) =>
                setCreatePersonDraft({
                  ...createPersonDraft,
                  company: e.target.value,
                })
              }
              style={{
                width: "100%",
                padding: "6px 8px",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                fontSize: 13,
                boxSizing: "border-box",
                marginTop: 4,
                fontFamily: "var(--font-family)",
              }}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--color-muted-text)" }}>
            Department
            <input
              type="text"
              value={createPersonDraft.department}
              onChange={(e) =>
                setCreatePersonDraft({
                  ...createPersonDraft,
                  department: e.target.value,
                })
              }
              style={{
                width: "100%",
                padding: "6px 8px",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                fontSize: 13,
                boxSizing: "border-box",
                marginTop: 4,
                fontFamily: "var(--font-family)",
              }}
            />
          </label>
          <div
            style={{
              display: "flex",
              gap: 6,
              justifyContent: "flex-end",
              marginTop: 4,
            }}
          >
            <button
              type="button"
              onClick={closeCreatePerson}
              disabled={creatingPerson}
              style={{
                background: "none",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                padding: "6px 12px",
                fontSize: 12,
                cursor: creatingPerson ? "wait" : "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleCreateAndSelectPerson()}
              disabled={creatingPerson}
              style={{
                background: "var(--color-brand-dark-blue)",
                color: "var(--color-white)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                padding: "6px 12px",
                fontSize: 12,
                cursor: creatingPerson ? "wait" : "pointer",
              }}
            >
              {creatingPerson ? "Creating…" : "Create & select"}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
