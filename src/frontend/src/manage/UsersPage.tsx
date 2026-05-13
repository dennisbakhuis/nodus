import { useCallback, useEffect, useState } from "react";
import {
  createUser,
  deactivateUser,
  getSetting,
  listUsers,
  resetUserPassword,
  updateUser,
  upsertSetting,
  type UserAdminCreatePayload,
  type UserAdminRead,
} from "./api";
import { Field } from "../shared/Field";
import { LoadingState } from "../shared/LoadingState";
import { StatusBanner } from "../shared/StatusBanner";
import { useAuth } from "../shared/AuthContext";
import styles from "./ManagePage.module.css";

const HIDE_LOCAL_ADMIN_BADGE_KEY = "auth.hide_local_admin_badge";

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "public_reader", label: "Public reader" },
  { value: "reader", label: "Reader" },
  { value: "writer", label: "Writer" },
  { value: "admin", label: "Admin" },
];

const ROLE_LABEL: Record<string, string> = {
  public_reader: "Public reader",
  reader: "Reader",
  writer: "Writer",
  admin: "Admin",
};

function emptyForm(): UserAdminCreatePayload {
  return {
    username: "",
    first_name: "",
    last_name: "",
    role: "reader",
    initial_password: "",
    must_change_password: true,
  };
}

export function UsersPage() {
  const { authEnabled } = useAuth();
  const [users, setUsers] = useState<UserAdminRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<UserAdminCreatePayload>(emptyForm);
  const [creating, setCreating] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserAdminRead | null>(null);
  const [resetPwd, setResetPwd] = useState("");
  const [resetSaving, setResetSaving] = useState(false);
  const [hideBadge, setHideBadge] = useState(false);
  const [savedHideBadge, setSavedHideBadge] = useState(false);
  const [savingBadge, setSavingBadge] = useState(false);
  const [badgeStatus, setBadgeStatus] = useState<{
    kind: "ok" | "err";
    msg: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSetting(HIDE_LOCAL_ADMIN_BADGE_KEY)
      .then((s) => {
        if (cancelled) return;
        const on = s.value === "true";
        setHideBadge(on);
        setSavedHideBadge(on);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSaveBadge() {
    setSavingBadge(true);
    setBadgeStatus(null);
    try {
      const row = await upsertSetting(
        HIDE_LOCAL_ADMIN_BADGE_KEY,
        hideBadge ? "true" : "false",
      );
      const on = row.value === "true";
      setHideBadge(on);
      setSavedHideBadge(on);
      setBadgeStatus({ kind: "ok", msg: "Saved. Reload to see the change." });
    } catch (e) {
      setBadgeStatus({
        kind: "err",
        msg: e instanceof Error ? e.message : "Save failed",
      });
    } finally {
      setSavingBadge(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listUsers());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await createUser(form);
      setShowCreate(false);
      setForm(emptyForm());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  }

  async function handleRoleChange(user: UserAdminRead, role: string) {
    setError(null);
    try {
      await updateUser(user.id, { role });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change role");
    }
  }

  async function handleToggleActive(user: UserAdminRead) {
    setError(null);
    try {
      if (user.is_active) {
        await deactivateUser(user.id);
      } else {
        await updateUser(user.id, { is_active: true });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update user");
    }
  }

  async function handleResetSubmit() {
    if (!resetTarget || resetPwd.length < 4) return;
    setResetSaving(true);
    setError(null);
    try {
      await resetUserPassword(resetTarget.id, resetPwd, true);
      setResetTarget(null);
      setResetPwd("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset password");
    } finally {
      setResetSaving(false);
    }
  }

  if (loading) return <LoadingState>Loading users…</LoadingState>;

  return (
    <div className={styles.subPage}>
      <div className={styles.header}>
        <h1>Users</h1>
        <p>
          Create users, change roles, reset passwords, or deactivate accounts.
        </p>
      </div>

      <StatusBanner
        variant="error"
        message={error}
        onDismiss={() => setError(null)}
      />

      <section className={styles.section}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "var(--space-3)",
          }}
        >
          <h2 className={styles.sectionTitle}>All users</h2>
          {!showCreate && (
            <button
              className={styles.btnPrimary}
              type="button"
              onClick={() => setShowCreate(true)}
            >
              Add user
            </button>
          )}
        </div>

        {showCreate && (
          <form
            onSubmit={(e) => void handleCreate(e)}
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
            <Field label="Username" required>
              {({ id, invalid, required }) => (
                <input
                  id={id}
                  className={styles.input}
                  value={form.username}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, username: e.target.value }))
                  }
                  required={required}
                  aria-invalid={invalid}
                  style={{ width: "100%" }}
                />
              )}
            </Field>
            <Field label="Role">
              {({ id }) => (
                <select
                  id={id}
                  className={styles.input}
                  value={form.role}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, role: e.target.value }))
                  }
                  style={{ width: "100%" }}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="First name" required>
              {({ id, invalid, required }) => (
                <input
                  id={id}
                  className={styles.input}
                  value={form.first_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, first_name: e.target.value }))
                  }
                  required={required}
                  aria-invalid={invalid}
                  style={{ width: "100%" }}
                />
              )}
            </Field>
            <Field label="Last name" required>
              {({ id, invalid, required }) => (
                <input
                  id={id}
                  className={styles.input}
                  value={form.last_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, last_name: e.target.value }))
                  }
                  required={required}
                  aria-invalid={invalid}
                  style={{ width: "100%" }}
                />
              )}
            </Field>
            <div style={{ gridColumn: "1 / -1" }}>
              <Field label="Initial password" required>
                {({ id, invalid, required }) => (
                  <input
                    id={id}
                    className={styles.input}
                    type="password"
                    value={form.initial_password}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        initial_password: e.target.value,
                      }))
                    }
                    required={required}
                    aria-invalid={invalid}
                    minLength={4}
                    style={{ width: "100%" }}
                  />
                )}
              </Field>
            </div>
            <label
              style={{
                gridColumn: "1 / -1",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <input
                type="checkbox"
                checked={form.must_change_password ?? true}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    must_change_password: e.target.checked,
                  }))
                }
              />
              Force password change on first login
            </label>
            <div className={styles.actionsRow} style={{ gridColumn: "1 / -1" }}>
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={creating}
              >
                {creating ? "Creating…" : "Create user"}
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => {
                  setShowCreate(false);
                  setForm(emptyForm());
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Username</th>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Flags</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>
                  {u.first_name} {u.last_name}
                </td>
                <td>
                  <select
                    className={styles.input}
                    value={u.role}
                    onChange={(e) => void handleRoleChange(u, e.target.value)}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {ROLE_LABEL[r.value]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <span
                    className={`${styles.chip} ${u.is_active ? "" : styles.chipMuted}`}
                  >
                    {u.is_active ? "active" : "inactive"}
                  </span>
                </td>
                <td>
                  {u.mfa_enabled && <span className={styles.chip}>MFA</span>}{" "}
                  {u.must_change_password && (
                    <span className={styles.chip}>must-reset</span>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => {
                      setResetTarget(u);
                      setResetPwd("");
                    }}
                  >
                    Reset password
                  </button>{" "}
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => void handleToggleActive(u)}
                  >
                    {u.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {!authEnabled && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Auth-disabled banner</h2>
          <p className={styles.sectionDesc}>
            When the server runs with <code>NODUS_AUTH_DISABLED</code>, the
            header shows an orange <em>Auth disabled — local admin</em> badge so
            it's obvious every request is acting as the synthetic admin. Hiding
            it is useful for clean screenshots and demos. The setting is
            persisted and included in backup/restore.
          </p>

          <div style={{ marginBottom: "var(--space-3)" }}>
            <Field
              label="Hide the 'Auth disabled — local admin' badge"
              helper="Takes effect on the next page reload."
            >
              {({ id, describedBy }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  type="checkbox"
                  checked={hideBadge}
                  onChange={(e) => setHideBadge(e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
              )}
            </Field>
          </div>

          <StatusBanner
            variant={badgeStatus?.kind === "ok" ? "success" : "error"}
            message={badgeStatus ? badgeStatus.msg : null}
            onDismiss={() => setBadgeStatus(null)}
          />
          <div className={styles.actionsRow}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => void handleSaveBadge()}
              disabled={savingBadge || hideBadge === savedHideBadge}
            >
              {savingBadge ? "Saving…" : "Save"}
            </button>
          </div>
        </section>
      )}

      {resetTarget && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={() => setResetTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--color-white)",
              padding: "var(--space-6)",
              borderRadius: 8,
              minWidth: 360,
            }}
          >
            <h2 className={styles.sectionTitle}>
              Reset password for {resetTarget.username}
            </h2>
            <p className={styles.sectionDesc}>
              The user will be required to change this on their next login.
            </p>
            <input
              className={styles.input}
              type="password"
              value={resetPwd}
              onChange={(e) => setResetPwd(e.target.value)}
              placeholder="New password (min 4 chars)"
              style={{ width: "100%" }}
              autoFocus
            />
            <div className={styles.actionsRow}>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={resetSaving || resetPwd.length < 4}
                onClick={() => void handleResetSubmit()}
              >
                {resetSaving ? "Saving…" : "Set password"}
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setResetTarget(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
