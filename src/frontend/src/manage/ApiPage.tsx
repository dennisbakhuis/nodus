import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  type ApiKeyCreatePayload,
  type ApiKeyRead,
} from "../api/api-keys";
import { listUsers, type UserAdminRead } from "../api/users";
import { useAuth } from "../shared/AuthContext";
import { useConfirm } from "../shared/ConfirmDialog";
import { LoadingState } from "../shared/LoadingState";
import { Modal } from "../shared/Modal";
import { StatusBanner } from "../shared/StatusBanner";
import { Table } from "../shared/Table";
import styles from "./ApiPage.module.css";

const API_BASE = "/api";

function formatTs(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore — clipboard unavailable */
    }
  }
  return (
    <div className={styles.codeBlockWrap}>
      <div className={styles.codeBlockHeader}>
        <span>{language}</span>
        <button
          type="button"
          className={styles.copyBtn}
          onClick={handleCopy}
          aria-label={`Copy ${language} snippet`}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className={styles.codeBlock}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

type EndpointDoc = {
  method: string;
  path: string;
  description: string;
  params?: { name: string; desc: string }[];
  curl: string;
  python: string;
};

function buildEndpoints(origin: string): EndpointDoc[] {
  const base = `${origin}${API_BASE}`;
  return [
    {
      method: "GET",
      path: "/api/radar/current",
      description:
        "Returns the current radar snapshot — topics grouped by segment and ring, with technology metadata, peer references, and persons attached.",
      params: [
        { name: "segment", desc: "Slug filter, e.g. 'digital-data'." },
        { name: "ring", desc: "Filter by ring (Adopt, Trial, Assess, Hold)." },
        {
          name: "include_status",
          desc: "Comma-separated registry statuses to include.",
        },
        {
          name: "include_candidates",
          desc: "Set true to include off-radar candidates.",
        },
      ],
      curl: `curl -H "Authorization: Bearer $NTR_TOKEN" \\
  "${base}/radar/current?segment=digital-data"`,
      python: `import os, requests

resp = requests.get(
    "${base}/radar/current",
    headers={"Authorization": f"Bearer {os.environ['NTR_TOKEN']}"},
    params={"segment": "digital-data"},
    timeout=30,
)
resp.raise_for_status()
radar = resp.json()`,
    },
    {
      method: "GET",
      path: "/api/topics",
      description:
        "List topics in the registry. Supports filtering, full-text search, and pagination.",
      params: [
        { name: "segment_id", desc: "Filter by segment UUID." },
        { name: "ring", desc: "Filter by ring." },
        { name: "registry_status", desc: "OnRadar, Candidate, Archived…" },
        { name: "q", desc: "Search by name or alias (substring)." },
        { name: "limit", desc: "Page size (max 200, default 100)." },
        { name: "offset", desc: "Pagination offset." },
      ],
      curl: `curl -H "Authorization: Bearer $NTR_TOKEN" \\
  "${base}/topics?q=graph&limit=50"`,
      python: `import os, requests

resp = requests.get(
    "${base}/topics",
    headers={"Authorization": f"Bearer {os.environ['NTR_TOKEN']}"},
    params={"q": "graph", "limit": 50},
    timeout=30,
)
topics = resp.json()`,
    },
    {
      method: "GET",
      path: "/api/topics/{slug}",
      description:
        "Full detail for a single topic — technology, factsheet, assessment, aliases, peer references, persons, hero image. Fields are filtered by your role.",
      curl: `curl -H "Authorization: Bearer $NTR_TOKEN" \\
  "${base}/topics/digital-twin"`,
      python: `import os, requests

slug = "digital-twin"
resp = requests.get(
    f"${base}/topics/{slug}",
    headers={"Authorization": f"Bearer {os.environ['NTR_TOKEN']}"},
    timeout=30,
)
topic = resp.json()`,
    },
    {
      method: "GET",
      path: "/api/cycles/{cycle_id}/deliverables/radar.json",
      description:
        "Canonical radar snapshot for a given cycle. Use this to pin an Agent to a specific point in time rather than the live current radar.",
      curl: `curl -H "Authorization: Bearer $NTR_TOKEN" \\
  "${base}/cycles/$CYCLE_ID/deliverables/radar.json"`,
      python: `import os, requests

cycle_id = "..."
resp = requests.get(
    f"${base}/cycles/{cycle_id}/deliverables/radar.json",
    headers={"Authorization": f"Bearer {os.environ['NTR_TOKEN']}"},
    timeout=30,
)
snapshot = resp.json()`,
    },
    {
      method: "GET",
      path: "/api/admin/backup",
      description:
        "Pull a full database + media backup as a single zip. Requires an admin-scoped API key. The response is a binary stream — write it straight to disk. Use this from another instance or a scheduled job to sync state.",
      curl: `curl -H "Authorization: Bearer $NTR_TOKEN" \\
  -o nodus-backup.zip \\
  "${base}/admin/backup"`,
      python: `import os, requests

resp = requests.get(
    "${base}/admin/backup",
    headers={"Authorization": f"Bearer {os.environ['NTR_TOKEN']}"},
    stream=True,
    timeout=300,
)
resp.raise_for_status()
with open("nodus-backup.zip", "wb") as fh:
    for chunk in resp.iter_content(chunk_size=1024 * 1024):
        fh.write(chunk)`,
    },
    {
      method: "POST",
      path: "/api/admin/backup/download",
      description:
        "Same backup as GET /api/admin/backup, but accepts an optional password in the request body to wrap the zip in an AES-256-GCM envelope. Use this when the backup may rest somewhere less trusted than the API key itself.",
      params: [
        {
          name: "password",
          desc: "Form field. Optional. Encrypts the backup with AES-256-GCM (PBKDF2-SHA256, 600k iterations).",
        },
      ],
      curl: `curl -H "Authorization: Bearer $NTR_TOKEN" \\
  -F password="$BACKUP_PASS" \\
  -o nodus-backup-encrypted.bin \\
  "${base}/admin/backup/download"`,
      python: `import os, requests

resp = requests.post(
    "${base}/admin/backup/download",
    headers={"Authorization": f"Bearer {os.environ['NTR_TOKEN']}"},
    data={"password": os.environ["BACKUP_PASS"]},
    stream=True,
    timeout=300,
)
resp.raise_for_status()
with open("nodus-backup-encrypted.bin", "wb") as fh:
    for chunk in resp.iter_content(chunk_size=1024 * 1024):
        fh.write(chunk)`,
    },
  ];
}

type CreateModalState =
  | { kind: "closed" }
  | { kind: "form" }
  | { kind: "submitting" }
  | { kind: "revealed"; token: string; key: ApiKeyRead };

function emptyForm(defaultUserId: string): ApiKeyCreatePayload {
  return {
    name: "",
    description: "",
    user_id: defaultUserId,
    expires_at: null,
  };
}

export function ApiPage() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [keys, setKeys] = useState<ApiKeyRead[]>([]);
  const [users, setUsers] = useState<UserAdminRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRevoked, setShowRevoked] = useState(false);
  const [modal, setModal] = useState<CreateModalState>({ kind: "closed" });
  const [form, setForm] = useState<ApiKeyCreatePayload>(() =>
    emptyForm(user?.id ?? ""),
  );
  const [tokenCopied, setTokenCopied] = useState(false);
  const [ack, setAck] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [k, u] = await Promise.all([listApiKeys(), listUsers()]);
      setKeys(k);
      setUsers(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleKeys = useMemo(
    () => (showRevoked ? keys : keys.filter((k) => k.revoked_at === null)),
    [keys, showRevoked],
  );

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://…";
  const endpoints = useMemo(() => buildEndpoints(origin), [origin]);

  function openCreate() {
    setForm(emptyForm(user?.id ?? ""));
    setAck(false);
    setTokenCopied(false);
    setModal({ kind: "form" });
  }

  function closeModal() {
    setModal({ kind: "closed" });
    setAck(false);
    setTokenCopied(false);
  }

  async function handleSubmitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setModal({ kind: "submitting" });
    try {
      const body = await createApiKey({
        name: form.name.trim(),
        description: form.description?.trim() ? form.description.trim() : null,
        user_id: form.user_id ?? null,
        expires_at: form.expires_at ?? null,
      });
      setModal({ kind: "revealed", token: body.token, key: body.api_key });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
      setModal({ kind: "form" });
    }
  }

  async function copyToken(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setTokenCopied(true);
      window.setTimeout(() => setTokenCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  async function handleRevoke(key: ApiKeyRead) {
    const ok = await confirm({
      title: `Revoke "${key.name}"?`,
      body: (
        <p>
          Revoking immediately invalidates this token. Any Agent or tool using
          it will get a 401 on its next request. This cannot be undone.
        </p>
      ),
      danger: true,
      confirmLabel: "Revoke",
    });
    if (!ok) return;
    try {
      await revokeApiKey(key.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke key");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>API</h1>
        <p>
          The Technology Radar exposes a REST API for Agents and external tools.
          This page documents the most useful endpoints for read-only
          integration and lets you mint long-lived API keys.
        </p>
      </div>

      <StatusBanner
        variant="error"
        message={error}
        onDismiss={() => setError(null)}
      />

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Quick start</h2>
        <p className={styles.sectionDesc}>
          Base URL for all endpoints:{" "}
          <code className={styles.mono}>
            {origin}
            {API_BASE}
          </code>
          . Every endpoint returns JSON. Authenticate with an API key in the{" "}
          <code className={styles.mono}>Authorization</code> header. The
          interactive Swagger UI lists every endpoint with try-it-out, request
          bodies, and response shapes.
        </p>
        <div className={styles.linkRow}>
          <a
            className={styles.link}
            href="/docs"
            target="_blank"
            rel="noreferrer"
          >
            Open Swagger UI →
          </a>
          <a
            className={styles.link}
            href="/redoc"
            target="_blank"
            rel="noreferrer"
          >
            Open ReDoc →
          </a>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Authentication</h2>
        <p className={styles.sectionDesc}>
          Pass an API key as a bearer token. Keys begin with{" "}
          <code className={styles.mono}>ntr_</code> and are tied to a specific
          user — they inherit that user's role at request time. Tokens are shown{" "}
          <em>once</em> at creation and never displayed again; if you lose one,
          revoke it and mint a new key. MFA does not apply to API keys. Anchor
          below:{" "}
          <a className={styles.link} href="#api-keys">
            Manage keys
          </a>
          .
        </p>
        <CodeBlock
          language="bash"
          code={`export NTR_TOKEN="ntr_..."
curl -H "Authorization: Bearer $NTR_TOKEN" "${origin}${API_BASE}/radar/current"`}
        />
        <CodeBlock
          language="python"
          code={`import os, requests

resp = requests.get(
    "${origin}${API_BASE}/radar/current",
    headers={"Authorization": f"Bearer {os.environ['NTR_TOKEN']}"},
    timeout=30,
)
resp.raise_for_status()`}
        />
      </section>

      <section id="api-keys" className={styles.section}>
        <h2 className={styles.sectionTitle}>API keys</h2>
        <p className={styles.sectionDesc}>
          Create keys for each Agent or integration. The token is the secret;
          everything else here is metadata. Revoke a key the moment it's no
          longer needed.
        </p>
        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={openCreate}
          >
            Create new key
          </button>
          <div className={styles.toolbarRight}>
            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={showRevoked}
                onChange={(e) => setShowRevoked(e.target.checked)}
              />
              Show revoked
            </label>
          </div>
        </div>

        {loading ? (
          <LoadingState>Loading API keys…</LoadingState>
        ) : (
          <Table<ApiKeyRead>
            rows={visibleKeys}
            getRowKey={(k) => k.id}
            emptyMessage={
              showRevoked
                ? "No API keys yet."
                : "No active API keys. Create one to give an Agent access."
            }
            columns={[
              {
                key: "name",
                header: "Name",
                render: (k) => (
                  <span
                    className={k.revoked_at ? styles.revokedRow : undefined}
                  >
                    {k.name}
                    {k.description ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--color-muted-text)",
                        }}
                      >
                        {k.description}
                      </div>
                    ) : null}
                  </span>
                ),
              },
              {
                key: "owner",
                header: "Acts as",
                render: (k) => (
                  <span className={styles.mono}>{k.owner_username}</span>
                ),
              },
              {
                key: "prefix",
                header: "Prefix",
                render: (k) => (
                  <span className={styles.mono}>{k.token_prefix}…</span>
                ),
              },
              {
                key: "created",
                header: "Created",
                render: (k) => formatTs(k.created_at),
              },
              {
                key: "last_used",
                header: "Last used",
                render: (k) => formatTs(k.last_used_at),
              },
              {
                key: "expires",
                header: "Expires",
                render: (k) => formatTs(k.expires_at),
              },
              {
                key: "status",
                header: "Status",
                render: (k) =>
                  k.revoked_at ? (
                    <span className={styles.revokedTag}>Revoked</span>
                  ) : (
                    "Active"
                  ),
              },
              {
                key: "action",
                header: "",
                render: (k) =>
                  k.revoked_at ? null : (
                    <button
                      type="button"
                      className={styles.dangerBtn}
                      onClick={() => void handleRevoke(k)}
                    >
                      Revoke
                    </button>
                  ),
              },
            ]}
          />
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Endpoint reference</h2>
        <p className={styles.sectionDesc}>
          A curated subset of the API, chosen for typical Agent read-only use
          cases. The full catalog (including write endpoints) lives in the
          Swagger UI linked above.
        </p>
        {endpoints.map((ep) => (
          <div key={`${ep.method} ${ep.path}`} className={styles.endpoint}>
            <div className={styles.endpointHeader}>
              <span className={styles.method}>{ep.method}</span>
              <span className={styles.path}>{ep.path}</span>
            </div>
            <p className={styles.sectionDesc} style={{ margin: 0 }}>
              {ep.description}
            </p>
            {ep.params && ep.params.length > 0 ? (
              <ul className={styles.paramsList}>
                {ep.params.map((p) => (
                  <li key={p.name}>
                    <span className={styles.paramName}>{p.name}</span> —{" "}
                    {p.desc}
                  </li>
                ))}
              </ul>
            ) : null}
            <CodeBlock language="bash" code={ep.curl} />
            <CodeBlock language="python" code={ep.python} />
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Notes</h2>
        <ul
          style={{
            margin: 0,
            paddingLeft: "1.2em",
            color: "var(--color-muted-text)",
            fontSize: "var(--font-size-sm)",
          }}
        >
          <li>
            An API key inherits the role of the user it was minted for. A key
            for a reader can read; a key for a writer can also create/update.
          </li>
          <li>
            There is no formal rate limit yet — be reasonable. Cache
            aggressively on the client side.
          </li>
          <li>
            Always send the token in the{" "}
            <code className={styles.mono}>Authorization</code> header, never as
            a query string — query strings leak into proxy and browser logs.
          </li>
          <li>
            Lost a token? You cannot recover it — revoke and mint a new one.
          </li>
        </ul>
      </section>

      <Modal
        open={modal.kind !== "closed"}
        onClose={closeModal}
        title={
          modal.kind === "revealed" ? "Save this token now" : "Create API key"
        }
      >
        {modal.kind === "revealed" ? (
          <div className={styles.modalBody}>
            <div className={styles.tokenReveal}>
              <p className={styles.tokenRevealWarn}>
                This is the only time the plaintext token will be shown. Copy it
                now and store it somewhere secure (a password manager, a secret
                store, an Agent's env). Closing this dialog discards it.
              </p>
              <div className={styles.tokenRow}>
                <code className={styles.tokenValue}>{modal.token}</code>
                <button
                  type="button"
                  className={styles.tokenCopyBtn}
                  onClick={() => void copyToken(modal.token)}
                >
                  {tokenCopied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <label className={styles.ackRow}>
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              I have saved this token. I understand it cannot be recovered.
            </label>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={!ack}
                onClick={closeModal}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form className={styles.modalBody} onSubmit={handleSubmitCreate}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="api-key-name">
                Name
              </label>
              <input
                id="api-key-name"
                className={styles.input}
                value={form.name}
                placeholder="e.g. weekly digest agent"
                autoFocus
                required
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="api-key-desc">
                Description (optional)
              </label>
              <textarea
                id="api-key-desc"
                className={styles.textarea}
                value={form.description ?? ""}
                placeholder="What is this key for? Who owns the integration?"
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="api-key-user">
                Acts as
              </label>
              <select
                id="api-key-user"
                className={styles.select}
                value={form.user_id ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, user_id: e.target.value }))
                }
              >
                {users
                  .filter((u) => u.is_active)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username} ({u.role})
                    </option>
                  ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="api-key-exp">
                Expires (optional)
              </label>
              <input
                id="api-key-exp"
                type="date"
                className={styles.input}
                value={form.expires_at ? form.expires_at.slice(0, 10) : ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    expires_at: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  }))
                }
              />
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={closeModal}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.primaryBtn}
                disabled={modal.kind === "submitting" || !form.name.trim()}
              >
                {modal.kind === "submitting" ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
