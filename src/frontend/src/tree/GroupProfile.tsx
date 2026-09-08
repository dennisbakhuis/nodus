/**
 * The group profile, as the tree shows it.
 *
 * A family's profile is curated under **Manage ▸ Groups**, but the tree is
 * where anyone actually meets a family, so it has to be readable here. Two
 * shapes over one body of content:
 *
 *   - `GroupProfileSection` — the content alone, for embedding in the shared
 *     detail panel that a *technology* group already opens.
 *   - `GroupPanel` — a light panel for a **label group**, which has no
 *     technology behind it and so has never had a panel of its own.
 *
 * `GroupPanel` deliberately has no backdrop. The radar's detail panel covers
 * the page with a click-to-close overlay, which is right when the panel is the
 * whole subject; here the tree behind it stays the subject, and folding a
 * branch with the profile open should not first mean dismissing it.
 */

import { useEffect, useState } from "react";
import { getTopic } from "../api/client";

/** Roles the group profile offers; the rest belong to a piece of work. */
const ROLE_LABELS: Record<string, string> = {
  Owner: "Owner",
  SubjectMatterExpert: "Subject Matter Expert",
  Contact: "Contact",
};

type Person = { name: string; role: string; detail: string };

/**
 * People linked to a topic, in the public schema.
 *
 * Fetched here rather than carried on the tree payload: the groups tree is
 * loaded for every render of the canvas, and most families are never opened.
 */
function usePeople(slug: string | null): {
  people: Person[];
  loading: boolean;
} {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!slug) {
      setPeople([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getTopic(slug)
      .then((topic) => {
        if (cancelled) return;
        setPeople(
          (topic.persons ?? [])
            .filter((link) => link.link_role in ROLE_LABELS)
            .map((link) => ({
              name: link.person.full_name,
              role: ROLE_LABELS[link.link_role] ?? link.link_role,
              detail: [link.person.company, link.person.role]
                .filter(Boolean)
                .join(" · "),
            })),
        );
      })
      .catch(() => {
        // A profile is supporting detail, not the point of the view: a failed
        // lookup should cost the people list, not the panel.
        if (!cancelled) setPeople([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { people, loading };
}

export type GroupProfileProps = {
  name: string;
  slug: string;
  description: string | null;
  scope: string | null;
  /** How many technologies sit anywhere beneath it. */
  memberCount: number;
};

export function GroupProfileSection({
  slug,
  description,
  scope,
  memberCount,
}: Omit<GroupProfileProps, "name">) {
  const { people, loading } = usePeople(slug);
  const empty = !description && !scope && people.length === 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        fontFamily: "var(--font-family)",
      }}
    >
      <Row label="Members">
        {memberCount === 1 ? "1 technology" : `${memberCount} technologies`}
      </Row>

      {description && <Row label="What this family covers">{description}</Row>}
      {scope && <Row label="What belongs here">{scope}</Row>}

      {people.length > 0 && (
        <Row label="People">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-1)",
            }}
          >
            {people.map((p) => (
              <span key={`${p.name}-${p.role}`}>
                <strong>{p.name}</strong>
                <span style={{ color: "var(--color-muted-text)" }}>
                  {" — "}
                  {p.role}
                  {p.detail && ` · ${p.detail}`}
                </span>
              </span>
            ))}
          </div>
        </Row>
      )}

      {empty && !loading && (
        <p
          style={{
            margin: 0,
            fontSize: "var(--font-size-sm)",
            color: "var(--color-muted-text)",
            fontStyle: "italic",
          }}
        >
          No profile yet. Writers can describe this family under Manage ▸
          Groups.
        </p>
      )}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span
        style={{
          fontSize: "11px",
          fontWeight: "var(--font-weight-bold)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--color-muted-text)",
        }}
      >
        {label}
      </span>
      <div
        style={{
          fontSize: "var(--font-size-body)",
          lineHeight: 1.5,
          color: "var(--color-dark-text)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

type PanelProps = GroupProfileProps & {
  collapsed: boolean;
  onToggleBranch: () => void;
  onFocus: () => void;
  onClose: () => void;
};

export function GroupPanel({
  name,
  slug,
  description,
  scope,
  memberCount,
  collapsed,
  onToggleBranch,
  onFocus,
  onClose,
}: PanelProps) {
  return (
    <aside
      aria-label={`Group profile for ${name}`}
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(380px, 90%)",
        zIndex: 3,
        background: "var(--color-white)",
        borderLeft: "1px solid var(--color-border)",
        boxShadow: "var(--shadow-md)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-family)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "var(--space-2)",
          padding: "var(--space-4) var(--space-4) var(--space-3)",
          background: "var(--color-brand-dark-blue)",
          color: "var(--color-white)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              opacity: 0.8,
            }}
          >
            Group
          </div>
          <h2
            style={{
              margin: "2px 0 0",
              fontSize: "1.15rem",
              lineHeight: 1.25,
              fontWeight: "var(--font-weight-bold)",
              // The global heading rule paints every h2 brand blue, which on
              // this header is the background colour.
              color: "var(--color-white)",
            }}
          >
            {name}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close group profile"
          style={{
            border: "none",
            background: "transparent",
            color: "inherit",
            font: "inherit",
            fontSize: 18,
            lineHeight: 1,
            cursor: "pointer",
            padding: 2,
          }}
        >
          ×
        </button>
      </header>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--space-4)",
        }}
      >
        <GroupProfileSection
          slug={slug}
          description={description}
          scope={scope}
          memberCount={memberCount}
        />
      </div>

      <footer
        style={{
          display: "flex",
          gap: "var(--space-2)",
          padding: "var(--space-3) var(--space-4)",
          borderTop: "1px solid var(--color-border)",
        }}
      >
        <PanelButton onClick={onToggleBranch}>
          {collapsed ? "Unfold branch" : "Fold branch"}
        </PanelButton>
        <PanelButton onClick={onFocus}>Focus on this</PanelButton>
      </footer>
    </aside>
  );
}

function PanelButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "6px 10px",
        border: "1px solid var(--color-border-strong)",
        borderRadius: "var(--radius-sm)",
        background: "var(--color-white)",
        color: "var(--color-dark-text)",
        fontFamily: "inherit",
        fontSize: "var(--font-size-sm)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
