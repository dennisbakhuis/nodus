import { useCallback, useEffect, useMemo, useState } from "react";
import { createPerson, deletePerson, listPersons, updatePerson } from "./api";
import type { PersonReadManagement } from "./types";
import styles from "./ManagePage.module.css";
import { useConfirm } from "../shared/ConfirmDialog";
import { LoadingState } from "../shared/LoadingState";

type FormState = {
  full_name: string;
  company: string;
  email: string;
  role: string;
  department: string;
  notes: string;
};

function emptyForm(): FormState {
  return {
    full_name: "",
    company: "",
    email: "",
    role: "",
    department: "",
    notes: "",
  };
}

function fromPerson(p: PersonReadManagement): FormState {
  return {
    full_name: p.full_name,
    company: p.company,
    email: p.email ?? "",
    role: p.role ?? "",
    department: p.department ?? "",
    notes: p.notes ?? "",
  };
}

export function PersonsPage() {
  const confirm = useConfirm();
  const [persons, setPersons] = useState<PersonReadManagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<PersonReadManagement | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPersons(await listPersons({ limit: 200 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load persons");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return persons;
    return persons.filter((p) => {
      const haystack = [
        p.full_name,
        p.company,
        p.role ?? "",
        p.department ?? "",
        p.email ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [persons, search]);

  function startCreate() {
    setForm(emptyForm());
    setCreating(true);
    setEditing(null);
  }

  function startEdit(p: PersonReadManagement) {
    setForm(fromPerson(p));
    setEditing(p);
    setCreating(false);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
    setForm(emptyForm());
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        company: form.company.trim(),
        email: form.email.trim() || null,
        role: form.role.trim() || null,
        department: form.department.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (!payload.full_name || !payload.company) {
        setError("Name and company are required.");
        setSaving(false);
        return;
      }
      if (editing) {
        await updatePerson(editing.id, payload);
      } else {
        await createPerson({
          full_name: payload.full_name,
          company: payload.company,
          email: payload.email ?? undefined,
          role: payload.role ?? undefined,
          department: payload.department ?? undefined,
          notes: payload.notes ?? undefined,
        });
      }
      closeForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: PersonReadManagement) {
    const ok = await confirm({
      title: "Delete person",
      body: `Delete ${p.full_name}?`,
      danger: true,
    });
    if (!ok) return;
    setError(null);
    try {
      await deletePerson(p.id);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      // The backend returns 409 with a JSON body when the person is still
      // linked to topics; surface that to the curator instead of the raw text.
      const match = msg.match(/link_count[":\s]+(\d+)/);
      if (match) {
        setError(
          `Cannot delete ${p.full_name} — still linked to ${match[1]} topic(s). Unlink them first via the technology card.`,
        );
      } else {
        setError(msg);
      }
    }
  }

  if (loading) return <LoadingState>Loading people…</LoadingState>;

  return (
    <div className={styles.subPage}>
      <div className={styles.header}>
        <h1>People</h1>
        <p>
          The shared registry of people who appear on technology cards. Editing
          here updates them everywhere they are linked. People still linked to a
          topic cannot be deleted; remove their link from the card first.
        </p>
      </div>

      {error && (
        <div className={styles.statusErr} style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <section className={styles.section}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "var(--space-3)",
            gap: "var(--space-3)",
          }}
        >
          <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
            All people ({persons.length})
          </h2>
          <input
            className={styles.input}
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: 220 }}
          />
          {!creating && !editing && (
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={startCreate}
            >
              Add person
            </button>
          )}
        </div>

        {(creating || editing) && (
          <form
            onSubmit={(e) => void handleSave(e)}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "var(--space-3)",
              marginBottom: "var(--space-4)",
              padding: "var(--space-4)",
              border: "1px dashed var(--color-ring-boundary)",
              borderRadius: 6,
            }}
          >
            <label>
              Full name *
              <input
                className={styles.input}
                value={form.full_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, full_name: e.target.value }))
                }
                required
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <label>
              Company *
              <input
                className={styles.input}
                value={form.company}
                onChange={(e) =>
                  setForm((f) => ({ ...f, company: e.target.value }))
                }
                required
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <label>
              Role
              <input
                className={styles.input}
                value={form.role}
                onChange={(e) =>
                  setForm((f) => ({ ...f, role: e.target.value }))
                }
                placeholder="e.g. Lead Architect"
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <label>
              Department
              <input
                className={styles.input}
                value={form.department}
                onChange={(e) =>
                  setForm((f) => ({ ...f, department: e.target.value }))
                }
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Email
              <input
                type="email"
                className={styles.input}
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Notes
              <textarea
                className={styles.input}
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                rows={3}
                style={{
                  width: "100%",
                  marginTop: 4,
                  resize: "vertical",
                  height: "auto",
                }}
              />
            </label>
            <div className={styles.actionsRow} style={{ gridColumn: "1 / -1" }}>
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={saving}
              >
                {saving
                  ? "Saving…"
                  : editing
                    ? "Save changes"
                    : "Create person"}
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={closeForm}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Company</th>
              <th>Role</th>
              <th>Department</th>
              <th>Email</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    color: "var(--color-muted-text)",
                    padding: "var(--space-4)",
                  }}
                >
                  {persons.length === 0
                    ? "No people yet. Add your first person to enable autocomplete on technology cards."
                    : "No matches for your search."}
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.full_name}</strong>
                  </td>
                  <td>{p.company}</td>
                  <td>{p.role ?? <span style={{ opacity: 0.6 }}>—</span>}</td>
                  <td>
                    {p.department ?? <span style={{ opacity: 0.6 }}>—</span>}
                  </td>
                  <td>{p.email ?? <span style={{ opacity: 0.6 }}>—</span>}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={() => startEdit(p)}
                    >
                      Edit
                    </button>{" "}
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={() => void handleDelete(p)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
