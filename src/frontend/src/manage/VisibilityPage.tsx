import { useEffect, useMemo, useState } from "react";
import {
  getVisibilityConfig,
  saveVisibilityConfig,
  type VisibilityConfig,
} from "./api";
import { LoadingState } from "../shared/LoadingState";
import styles from "./ManagePage.module.css";

const ROLES: { value: string; label: string }[] = [
  { value: "public_reader", label: "Public reader" },
  { value: "reader", label: "Reader" },
  { value: "writer", label: "Writer" },
  { value: "admin", label: "Admin" },
];

type FieldDef = {
  path: string;
  label: string;
  description: string;
};

// Fields surfaced in the topic detail / radar shape that may carry sensitive
// data. Mirror DEFAULT_FIELD_ROLES on the backend; missing keys fall back to
// the backend defaults so this list isn't authoritative.
const FIELDS: FieldDef[] = [
  {
    path: "persons",
    label: "Linked persons",
    description: "Names, companies, and roles of people linked to a topic.",
  },
  {
    path: "created_by",
    label: "Created by",
    description: "Account that originally created the technology card.",
  },
  {
    path: "peer_references",
    label: "Peer references",
    description: "Other organisations' radar entries for this topic.",
  },
  {
    path: "recent_events",
    label: "Recent events",
    description: "Movement / status change audit log on the topic.",
  },
  {
    path: "aliases",
    label: "Aliases",
    description: "Alternate names used to deduplicate this topic.",
  },
  {
    path: "factsheet.tax_credit_candidate",
    label: "Tax-credit candidate flag",
    description: "R&D tax-credit candidacy marker (sensitive).",
  },
  {
    path: "factsheet.publication_links",
    label: "Publication links",
    description: "Links to external publications about the topic.",
  },
  {
    path: "factsheet.key_players",
    label: "Key players",
    description: "Vendors, researchers, or organisations active in the field.",
  },
  {
    path: "factsheet.recommended_next_steps",
    label: "Recommended next steps",
    description: "Internal recommendations for how to proceed.",
  },
  {
    path: "factsheet.current_challenges",
    label: "Current challenges",
    description: "Open obstacles for adoption / scaling.",
  },
  {
    path: "assessment",
    label: "Assessment scores",
    description: "TRL, strategic relevance, time-to-mainstream, etc.",
  },
];

const DEFAULT_FIELD_ROLES: Record<string, string[]> = {
  persons: ["reader", "writer", "admin"],
  created_by: ["reader", "writer", "admin"],
  peer_references: ["public_reader", "reader", "writer", "admin"],
  recent_events: ["reader", "writer", "admin"],
  aliases: ["public_reader", "reader", "writer", "admin"],
  "factsheet.tax_credit_candidate": ["writer", "admin"],
  "factsheet.publication_links": ["public_reader", "reader", "writer", "admin"],
  "factsheet.key_players": ["reader", "writer", "admin"],
  "factsheet.recommended_next_steps": ["writer", "admin"],
  "factsheet.current_challenges": ["reader", "writer", "admin"],
  assessment: ["public_reader", "reader", "writer", "admin"],
};

function mergeWithDefaults(saved: VisibilityConfig): VisibilityConfig {
  const out: VisibilityConfig = { ...DEFAULT_FIELD_ROLES };
  for (const [k, v] of Object.entries(saved)) {
    if (Array.isArray(v)) out[k] = v;
  }
  return out;
}

export function VisibilityPage() {
  const [config, setConfig] = useState<VisibilityConfig>({});
  const [savedConfig, setSavedConfig] = useState<VisibilityConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{
    kind: "ok" | "err";
    msg: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const remote = await getVisibilityConfig();
        const merged = mergeWithDefaults(remote);
        if (cancelled) return;
        setConfig(merged);
        setSavedConfig(merged);
      } catch (e) {
        if (cancelled) return;
        setStatus({
          kind: "err",
          msg: e instanceof Error ? e.message : "Failed to load",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(
    () => JSON.stringify(config) !== JSON.stringify(savedConfig),
    [config, savedConfig],
  );

  function toggle(path: string, role: string) {
    setConfig((prev) => {
      const current = prev[path] ?? DEFAULT_FIELD_ROLES[path] ?? [];
      const next = current.includes(role)
        ? current.filter((r) => r !== role)
        : [...current, role];
      // Always keep admin selected; it's the failsafe.
      const guarded = next.includes("admin") ? next : [...next, "admin"];
      return { ...prev, [path]: guarded };
    });
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      await saveVisibilityConfig(config);
      setSavedConfig(config);
      setStatus({ kind: "ok", msg: "Saved." });
    } catch (e) {
      setStatus({
        kind: "err",
        msg: e instanceof Error ? e.message : "Save failed",
      });
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setConfig(DEFAULT_FIELD_ROLES);
  }

  if (loading) return <LoadingState>Loading visibility config…</LoadingState>;

  return (
    <div className={styles.subPage}>
      <div className={styles.header}>
        <h1>Data Visibility</h1>
        <p>
          Choose which roles can see each sensitive field on a technology card.
          Admins always see everything. Anonymous visitors are treated as
          “public reader”.
        </p>
      </div>

      <section className={styles.section}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Field</th>
              {ROLES.map((r) => (
                <th key={r.value} style={{ textAlign: "center" }}>
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FIELDS.map((field) => {
              const roles =
                config[field.path] ?? DEFAULT_FIELD_ROLES[field.path] ?? [];
              return (
                <tr key={field.path}>
                  <td>
                    <strong>{field.label}</strong>
                    <div
                      style={{
                        color: "var(--color-muted-text)",
                        fontSize: 12,
                        marginTop: 2,
                      }}
                    >
                      {field.description}
                    </div>
                    <code
                      style={{
                        fontSize: 11,
                        color: "var(--color-muted-text)",
                      }}
                    >
                      {field.path}
                    </code>
                  </td>
                  {ROLES.map((r) => {
                    const checked = roles.includes(r.value);
                    const isAdmin = r.value === "admin";
                    return (
                      <td key={r.value} style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={checked || isAdmin}
                          disabled={isAdmin}
                          onChange={() => toggle(field.path, r.value)}
                          aria-label={`Allow ${r.label} to see ${field.label}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className={styles.actionsRow}>
          {status && (
            <span
              className={
                status.kind === "ok" ? styles.statusOk : styles.statusErr
              }
            >
              {status.msg}
            </span>
          )}
          <button
            className={styles.btnPrimary}
            onClick={() => void handleSave()}
            disabled={saving || !dirty}
            type="button"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button className={styles.btnSecondary} onClick={reset} type="button">
            Reset to defaults
          </button>
        </div>
      </section>
    </div>
  );
}
