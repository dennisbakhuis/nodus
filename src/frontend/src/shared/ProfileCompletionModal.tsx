import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { Modal } from "./Modal";
import { Field } from "./Field";
import {
  getMyProfile,
  getProfileCandidates,
  linkMyProfile,
  updateMyProfile,
} from "../api/profile";
import type { PersonReadManagement } from "../manage/types";

type Form = {
  full_name: string;
  company: string;
  email: string;
  department: string;
  role: string;
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "var(--space-2)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  fontSize: "var(--font-size-body)",
};

const primaryBtn: React.CSSProperties = {
  padding: "var(--space-2) var(--space-4)",
  backgroundColor: "var(--color-brand-orange)",
  color: "var(--color-white)",
  border: "none",
  borderRadius: "var(--radius-md)",
  fontWeight: "var(--font-weight-bold)",
  cursor: "pointer",
};

/**
 * Blocking first-login popup: shown while the signed-in user's linked People
 * profile is still missing required fields (company + email). When account-less
 * People records match the user's name, it first offers to claim one of them
 * (so a duplicate isn't created); otherwise it collects the missing details.
 * The user cannot dismiss it; finishing flips `profile_incomplete`.
 */
export function ProfileCompletionModal() {
  const { user, isAuthenticated, refreshUser } = useAuth();
  const open = isAuthenticated && user?.profile_incomplete === true;

  const [form, setForm] = useState<Form>({
    full_name: "",
    company: "",
    email: "",
    department: "",
    role: "",
  });
  const [candidates, setCandidates] = useState<PersonReadManagement[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    Promise.all([
      getMyProfile().catch(() => null),
      getProfileCandidates().catch(() => []),
    ])
      .then(([p, cands]) => {
        if (cancelled) return;
        if (p) {
          setForm({
            full_name: p.full_name ?? "",
            company: p.company ?? "",
            email: p.email ?? "",
            department: p.department ?? "",
            role: p.role ?? "",
          });
        }
        setCandidates(cands);
        setShowForm(cands.length === 0);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loaded]);

  if (!open) return null;

  async function handleLink(personId: string) {
    setError(null);
    setSaving(true);
    try {
      await linkMyProfile(personId);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link profile");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.company.trim() || !form.email.trim()) {
      setError("Company and email are required.");
      return;
    }
    setSaving(true);
    try {
      await updateMyProfile({
        full_name: form.full_name.trim() || undefined,
        company: form.company.trim(),
        email: form.email.trim(),
        department: form.department.trim() || undefined,
        role: form.role.trim() || undefined,
      });
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const showPicker = candidates.length > 0 && !showForm;

  return (
    <Modal
      open={open}
      onClose={() => {}}
      dismissible={false}
      title={showPicker ? "Is one of these you?" : "Complete your profile"}
    >
      {showPicker ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <p style={{ margin: 0, color: "var(--color-muted-text)" }}>
            We found existing People records that match your name. Link the one
            that's you so we don't create a duplicate — or create a new profile.
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {candidates.map((c) => (
              <li
                key={c.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  padding: "var(--space-2) 0",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <span>
                  <strong>{c.full_name}</strong>
                  {c.company ? ` — ${c.company}` : ""}
                  {c.email ? ` · ${c.email}` : ""}
                </span>
                <button
                  type="button"
                  style={primaryBtn}
                  disabled={saving}
                  onClick={() => void handleLink(c.id)}
                >
                  This is me
                </button>
              </li>
            ))}
          </ul>
          {error && (
            <span role="alert" style={{ color: "var(--color-danger)" }}>
              {error}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowForm(true)}
            style={{
              alignSelf: "flex-start",
              background: "none",
              border: "none",
              color: "var(--color-brand-dark-blue)",
              cursor: "pointer",
              textDecoration: "underline",
              padding: 0,
            }}
          >
            None of these — create a new profile
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-4)",
          }}
        >
          <p style={{ margin: 0, color: "var(--color-muted-text)" }}>
            Welcome! Add a few details so your People profile is complete.
            Company and email are required.
          </p>
          <Field label="Full name">
            {({ id }) => (
              <input
                id={id}
                style={inputStyle}
                value={form.full_name}
                onChange={set("full_name")}
              />
            )}
          </Field>
          <Field label="Company" required>
            {({ id, required }) => (
              <input
                id={id}
                style={inputStyle}
                value={form.company}
                onChange={set("company")}
                aria-required={required}
              />
            )}
          </Field>
          <Field label="Email" required>
            {({ id, required }) => (
              <input
                id={id}
                type="email"
                style={inputStyle}
                value={form.email}
                onChange={set("email")}
                aria-required={required}
              />
            )}
          </Field>
          <Field label="Department">
            {({ id }) => (
              <input
                id={id}
                style={inputStyle}
                value={form.department}
                onChange={set("department")}
              />
            )}
          </Field>
          <Field label="Role / title">
            {({ id }) => (
              <input
                id={id}
                style={inputStyle}
                value={form.role}
                onChange={set("role")}
              />
            )}
          </Field>
          {error && (
            <span role="alert" style={{ color: "var(--color-danger)" }}>
              {error}
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            style={{
              ...primaryBtn,
              alignSelf: "flex-end",
              cursor: saving ? "default" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
        </form>
      )}
    </Modal>
  );
}
