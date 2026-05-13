import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RadarData, RadarEntry, TechnologyRelation } from "../radar/types";
import { HeroImage } from "../radar/HeroImage";
import { PeerReferencePanel } from "../radar/PeerReferencePanel";
import { PersonChip } from "../radar/PersonChip";
import { getTrlPhase } from "../radar/getTrlPhase";
import { InitiativeEditor } from "./InitiativeEditor";
import {
  addPersonToTopic,
  createPerson,
  listPersons,
  removePersonFromTopic,
} from "../api/persons";
import {
  PERSON_LINK_ROLES,
  PERSON_LINK_ROLE_DISPLAY,
  type PersonLinkRole,
  type PersonReadManagement,
} from "../manage/types";
import type { TopicDetailNested } from "./types";

function AutoGrowTextarea({
  style,
  value,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    handler();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return <textarea ref={ref} value={value} style={style} {...rest} />;
}

export type InlineEditForm = {
  // factsheet text
  summary: string;
  description: string;
  key_players: string;
  recommended_next_steps: string;
  current_challenges: string;
  // assessment scores
  trl: string;
  strategic_relevance: string;
  impact_potential: string;
  implementation_feasibility: string;
  time_to_mainstream: string;
  collaboration_potential: string;
  // assessment notes (tier 2)
  trl_notes: string;
  strategic_relevance_notes: string;
  impact_potential_notes: string;
  implementation_feasibility_notes: string;
  time_to_mainstream_notes: string;
  collaboration_potential_notes: string;
  // additional factsheet fields
  tax_credit_candidate: string;
};

export type PublicationLink = { url: string; description: string };

type InlineEditProps = {
  values: InlineEditForm;
  onChange: (patch: Partial<InlineEditForm>) => void;
  publicationLinks: PublicationLink[];
  onPublicationLinksChange: (next: PublicationLink[]) => void;
  peerRefsContent?: React.ReactNode;
  /**
   * When provided, the inline-edit mode replaces the read-only PersonsSection
   * with an editable PeopleEditor (add / remove people on this topic). The
   * editor commits link/unlink calls immediately and triggers ``onChange`` so
   * the parent can refetch the topic detail.
   */
  peopleEditor?: {
    topicId: string;
    persons: TopicDetailNested["persons"];
    onChange: () => void | Promise<void>;
  };
};

type Props = {
  detail: TopicDetailNested;
  radarContext?: {
    entry: RadarEntry;
    data: RadarData;
    relations: TechnologyRelation[];
    onNavigate: (entry: RadarEntry) => void;
  };
  showHeaderBadges?: boolean;
  showHeroImage?: boolean;
  layout?: "single" | "two-column";
  inlineEdit?: InlineEditProps;
  movements?: Array<{
    id: string;
    event_type: string;
    from_value: string | null;
    to_value: string | null;
    rationale: string;
    timestamp: string;
  }>;
};

const RING_BADGE_COLORS: Record<string, string> = {
  Invest: "var(--color-ring-invest)",
  Pilot: "var(--color-ring-trial)",
  Explore: "var(--color-ring-assess)",
  Monitor: "var(--color-ring-watch)",
};

const MOVEMENT_LABELS: Record<string, string> = {
  new: "New this cycle",
  promoted: "Promoted",
  demoted: "Demoted",
  unchanged: "Unchanged",
  removed: "Removed",
};

function cleanText(raw: string): string {
  const hrIdx = raw.search(/\n---+(\n|$)/);
  const text = hrIdx !== -1 ? raw.slice(0, hrIdx) : raw;
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "").trim();
}

export function TopicView({
  detail,
  radarContext,
  showHeaderBadges = true,
  showHeroImage = true,
  layout = "single",
  inlineEdit,
  movements,
}: Props) {
  const events = movements ?? detail.recent_events;
  const heroImageId =
    (detail.technology?.["hero_image_id"] as string | null | undefined) ?? null;

  const factsheetNode = inlineEdit ? (
    <>
      <FactsheetEditFields edit={inlineEdit} />
      <AdditionalDetailsEditFields edit={inlineEdit} />
    </>
  ) : detail.factsheet ? (
    <FactsheetContent factsheet={detail.factsheet} />
  ) : null;

  const assessmentNode = inlineEdit ? (
    <AssessmentEditFields edit={inlineEdit} />
  ) : detail.assessment ? (
    <AssessmentSection assessment={detail.assessment} />
  ) : null;

  const peerRefsNode = inlineEdit ? (
    (inlineEdit.peerRefsContent ?? null)
  ) : detail.peer_reference_count > 0 ? (
    <PeerReferencePanel references={detail.peer_references} />
  ) : null;

  const technologyId =
    (detail.technology?.["id"] as string | undefined) ?? null;
  const initiativesNode = technologyId ? (
    <InitiativeEditor
      technologyId={technologyId}
      editable={Boolean(inlineEdit)}
    />
  ) : null;

  const main = (
    <>
      {factsheetNode}
      {initiativesNode}
      {peerRefsNode}
    </>
  );

  const side = (
    <>
      {assessmentNode}
      {inlineEdit?.peopleEditor ? (
        <PeopleEditor {...inlineEdit.peopleEditor} />
      ) : (
        (detail.persons ?? []).length > 0 && (
          <PersonsSection persons={detail.persons ?? []} />
        )
      )}
      {radarContext && (
        <RelationsSection
          entry={radarContext.entry}
          relations={radarContext.relations}
          data={radarContext.data}
          onNavigate={radarContext.onNavigate}
        />
      )}
      <MovementTimeline events={events} />
      {detail.created_by && <CreatedByFooter createdBy={detail.created_by} />}
    </>
  );

  const isTwo = layout === "two-column";

  return (
    <div style={{ fontFamily: "var(--font-family)" }}>
      {showHeroImage && heroImageId && (
        <div
          style={{
            marginBottom: "var(--space-4)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
          }}
        >
          <HeroImage
            heroImageId={heroImageId}
            altText={radarContext?.entry.canonical_name ?? "Hero image"}
            height={260}
          />
        </div>
      )}
      {showHeaderBadges && (
        <HeaderBadges detail={detail} radarContext={radarContext ?? null} />
      )}
      {isTwo ? (
        <div className="topic-view-grid">
          <div>{main}</div>
          <div>{side}</div>
          <style>{`
            .topic-view-grid {
              display: grid;
              grid-template-columns: 1fr;
              gap: var(--space-6);
              align-items: start;
            }
            @media (min-width: 900px) {
              .topic-view-grid {
                grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
              }
            }
          `}</style>
        </div>
      ) : (
        <>
          {factsheetNode}
          {inlineEdit?.peopleEditor ? (
            <PeopleEditor {...inlineEdit.peopleEditor} />
          ) : (
            (detail.persons ?? []).length > 0 && (
              <PersonsSection persons={detail.persons ?? []} />
            )
          )}
          {assessmentNode}
          {radarContext && (
            <RelationsSection
              entry={radarContext.entry}
              relations={radarContext.relations}
              data={radarContext.data}
              onNavigate={radarContext.onNavigate}
            />
          )}
          <MovementTimeline events={events} />
          {initiativesNode}
          {peerRefsNode}
          {detail.created_by && (
            <CreatedByFooter createdBy={detail.created_by} />
          )}
        </>
      )}
    </div>
  );
}

function CreatedByFooter({
  createdBy,
}: {
  createdBy: NonNullable<TopicDetailNested["created_by"]>;
}) {
  return (
    <div
      style={{
        marginTop: "var(--space-4)",
        paddingTop: "var(--space-3)",
        borderTop: "1px solid var(--color-border, rgba(0,0,0,0.08))",
        fontSize: 12,
        color: "var(--color-muted-text)",
      }}
    >
      Created by {createdBy.full_name || createdBy.username}
    </div>
  );
}

function _normaliseAlias(s: string): string {
  // Strip everything non-alphanumeric so "OpenAI.", "Open AI", and "open-ai"
  // all dedup against canonical "OpenAI" when AliasChipRow's `exclude` is set.
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function AliasChipRow({
  aliases,
  variant = "dark",
  exclude,
}: {
  aliases: Array<{ alias_name: string }>;
  variant?: "dark" | "light";
  exclude?: string;
}) {
  const excludedNorm = exclude ? _normaliseAlias(exclude) : null;
  const seen = new Set<string>();
  const filtered = aliases.filter((a) => {
    const norm = _normaliseAlias(a.alias_name);
    if (!norm) return false;
    if (excludedNorm && norm === excludedNorm) return false;
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });
  if (filtered.length === 0) return null;
  const isDark = variant === "dark";
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "4px",
      }}
    >
      {filtered.map((a) => (
        <span
          key={a.alias_name}
          style={{
            fontSize: "11px",
            padding: "3px 10px",
            borderRadius: "10px",
            background: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)",
            color: isDark ? "rgba(255,255,255,0.8)" : "var(--color-muted-text)",
            border: isDark
              ? "1px solid rgba(255,255,255,0.18)"
              : "1px solid var(--color-border)",
          }}
        >
          {a.alias_name}
        </span>
      ))}
    </div>
  );
}

function HeaderBadges({
  detail,
  radarContext,
}: {
  detail: TopicDetailNested;
  radarContext: Props["radarContext"] | null;
}) {
  const canonicalName =
    (detail.topic?.["canonical_name"] as string | undefined) ??
    radarContext?.entry.canonical_name;
  if (!radarContext) {
    if (detail.aliases.length === 0) return null;
    return (
      <div style={{ marginBottom: "var(--space-4)" }}>
        <AliasChipRow
          aliases={detail.aliases}
          variant="light"
          exclude={canonicalName}
        />
      </div>
    );
  }
  const segment = radarContext.data.segments.find(
    (s) => s.id === radarContext.entry.segment_id,
  );
  const ring = radarContext.data.rings.find(
    (r) => r.name === radarContext.entry.ring,
  );
  return (
    <div style={{ marginBottom: "var(--space-4)" }}>
      {detail.aliases.length > 0 && (
        <div style={{ marginBottom: "var(--space-2)" }}>
          <AliasChipRow
            aliases={detail.aliases}
            variant="light"
            exclude={canonicalName}
          />
        </div>
      )}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {ring && (
          <span
            style={{
              background:
                RING_BADGE_COLORS[ring.name] ?? "var(--color-dark-blue)",
              color: "white",
              fontSize: "11px",
              padding: "3px 10px",
              borderRadius: "10px",
              fontWeight: "var(--font-weight-bold)",
              letterSpacing: "0.02em",
              textTransform: "uppercase",
            }}
          >
            {ring.name}
          </span>
        )}
        {segment && (
          <span
            style={{
              background: "var(--color-page-background)",
              color: "var(--color-dark-text)",
              fontSize: "11px",
              padding: "3px 10px",
              borderRadius: "10px",
              border: "1px solid var(--color-border)",
            }}
          >
            {segment.name}
          </span>
        )}
        {radarContext.entry.movement &&
          radarContext.entry.movement !== "unchanged" && (
            <span
              style={{
                background: "var(--color-page-background)",
                color: "var(--color-muted-text)",
                fontSize: "11px",
                padding: "3px 10px",
                borderRadius: "10px",
                border: "1px solid var(--color-border)",
              }}
            >
              {MOVEMENT_LABELS[radarContext.entry.movement] ??
                radarContext.entry.movement}
            </span>
          )}
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        margin: "0 0 var(--space-2) 0",
        fontSize: "13px",
        fontWeight: "var(--font-weight-bold)",
        color: "var(--color-dark-blue)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {children}
    </h3>
  );
}

const bodyTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--font-size-body)",
  color: "var(--color-dark-text)",
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
};

function FactsheetContent({
  factsheet,
}: {
  factsheet: Record<string, unknown>;
}) {
  const fields: [string, string][] = [
    ["Description", "description"],
    ["Key Players", "key_players"],
    ["Recommended Next Steps", "recommended_next_steps"],
    ["Current Challenges", "current_challenges"],
  ];

  const links = parsePublicationLinks(factsheet["publication_links"]);

  return (
    <>
      {fields.map(([label, key]) => {
        const raw = factsheet[key];
        if (!raw) return null;
        const cleaned = cleanText(String(raw));
        if (!cleaned) return null;
        return (
          <section key={key} style={{ marginBottom: "var(--space-5)" }}>
            <SectionHeading>{label}</SectionHeading>
            <p style={bodyTextStyle}>{cleaned}</p>
          </section>
        );
      })}
      {links.length > 0 && (
        <section style={{ marginBottom: "var(--space-5)" }}>
          <SectionHeading>Publication Links</SectionHeading>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {links.map((l, i) => (
              <li key={i} style={{ fontSize: "var(--font-size-body)" }}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "var(--color-dark-blue)",
                    textDecoration: "underline",
                  }}
                >
                  {l.description?.trim() ? l.description : l.url}
                </a>
                {l.description?.trim() && (
                  <span
                    style={{
                      marginLeft: 8,
                      color: "var(--color-muted-text)",
                      fontSize: 12,
                    }}
                  >
                    {l.url}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export function parsePublicationLinks(raw: unknown): PublicationLink[] {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const out: PublicationLink[] = [];
  for (const item of parsed) {
    if (typeof item === "string") {
      out.push({ url: item, description: "" });
    } else if (item && typeof item === "object" && "url" in item) {
      const o = item as { url: unknown; description?: unknown };
      out.push({
        url: typeof o.url === "string" ? o.url : "",
        description: typeof o.description === "string" ? o.description : "",
      });
    }
  }
  return out;
}

function PersonsSection({
  persons,
}: {
  persons: TopicDetailNested["persons"];
}) {
  return (
    <section style={{ marginBottom: "var(--space-5)" }}>
      <SectionHeading>People</SectionHeading>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
        {persons.map((link) => (
          <PersonChip
            key={link.link_id ?? `${link.person.id}-${link.link_role}`}
            person={link.person}
            linkRole={link.link_role}
          />
        ))}
      </div>
    </section>
  );
}

type CreatePersonDraft = {
  full_name: string;
  email: string;
  company: string;
  department: string;
};

function PeopleEditor({
  topicId,
  persons,
  onChange,
}: {
  topicId: string;
  persons: TopicDetailNested["persons"];
  onChange: () => void | Promise<void>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [linkRole, setLinkRole] = useState<PersonLinkRole>("Contact");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PersonReadManagement[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<CreatePersonDraft | null>(
    null,
  );
  const [creating, setCreating] = useState(false);

  async function handleSearch(q: string) {
    setSearch(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const r = await listPersons({ search: q, limit: 10 });
      setResults(r);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleLink(personId: string) {
    setError(null);
    try {
      await addPersonToTopic(topicId, {
        person_id: personId,
        link_role: linkRole,
      });
      setPickerOpen(false);
      setSearch("");
      setResults([]);
      setCreateDraft(null);
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link person");
    }
  }

  async function handleCreateAndLink() {
    if (!createDraft) return;
    if (
      !createDraft.full_name.trim() ||
      !createDraft.company.trim() ||
      !createDraft.email.trim()
    ) {
      setError("Full name, company, and email are required.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await createPerson({
        full_name: createDraft.full_name.trim(),
        company: createDraft.company.trim(),
        email: createDraft.email.trim(),
        department: createDraft.department.trim() || null,
      });
      await addPersonToTopic(topicId, {
        person_id: created.id,
        link_role: linkRole,
      });
      setPickerOpen(false);
      setSearch("");
      setResults([]);
      setCreateDraft(null);
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create person");
    } finally {
      setCreating(false);
    }
  }

  async function handleUnlink(linkId: string) {
    setError(null);
    try {
      await removePersonFromTopic(topicId, linkId);
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove person");
    }
  }

  const chipStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "var(--color-page-background)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    padding: "4px 10px",
    fontSize: "12px",
    color: "var(--color-dark-text)",
  };

  return (
    <section style={{ marginBottom: "var(--space-5)" }}>
      <SectionHeading>People</SectionHeading>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-2)",
          alignItems: "center",
        }}
      >
        {persons.map((link) => (
          <span
            key={link.link_id ?? `${link.person.id}-${link.link_role}`}
            style={chipStyle}
          >
            <PersonChip person={link.person} linkRole={link.link_role} />
            {link.link_id && (
              <button
                type="button"
                onClick={() => void handleUnlink(link.link_id as string)}
                aria-label={`Remove ${link.person.full_name}`}
                title="Remove"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-muted-text)",
                  cursor: "pointer",
                  fontSize: "14px",
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {!pickerOpen ? (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            style={{
              ...chipStyle,
              cursor: "pointer",
              borderStyle: "dashed",
              color: "var(--color-brand-dark-blue)",
            }}
          >
            + Add person
          </button>
        ) : null}
      </div>

      {pickerOpen && (
        <div
          style={{
            marginTop: "var(--space-3)",
            padding: "var(--space-3)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            background: "var(--color-page-background)",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "var(--space-2)",
              marginBottom: "var(--space-2)",
              alignItems: "center",
            }}
          >
            <label
              style={{ fontSize: "12px", color: "var(--color-muted-text)" }}
            >
              Role
            </label>
            <select
              value={linkRole}
              onChange={(e) => setLinkRole(e.target.value as PersonLinkRole)}
              style={{
                padding: "4px 8px",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                fontSize: "12px",
              }}
            >
              {PERSON_LINK_ROLES.map((r) => (
                <option key={r} value={r}>
                  {PERSON_LINK_ROLE_DISPLAY[r]}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Search people by name…"
              value={search}
              onChange={(e) => void handleSearch(e.target.value)}
              style={{
                flex: 1,
                padding: "4px 8px",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                fontSize: "12px",
              }}
              aria-label="Search people"
            />
            <button
              type="button"
              onClick={() => {
                setPickerOpen(false);
                setSearch("");
                setResults([]);
                setError(null);
                setCreateDraft(null);
              }}
              style={{
                background: "none",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                padding: "4px 10px",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
          {searching && (
            <p
              style={{
                fontSize: "11px",
                color: "var(--color-muted-text)",
                margin: 0,
              }}
            >
              Searching…
            </p>
          )}
          {!searching &&
            search.trim() &&
            results.length === 0 &&
            !createDraft && (
              <p
                style={{
                  fontSize: "11px",
                  color: "var(--color-muted-text)",
                  margin: 0,
                }}
              >
                No matches.{" "}
                <button
                  type="button"
                  onClick={() =>
                    setCreateDraft({
                      full_name: search,
                      email: "",
                      company: "",
                      department: "",
                    })
                  }
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--color-brand-dark-blue)",
                    textDecoration: "underline",
                    cursor: "pointer",
                    fontSize: "11px",
                    padding: 0,
                  }}
                >
                  Create new person
                </button>
              </p>
            )}
          {createDraft && (
            <div
              style={{
                marginTop: "var(--space-2)",
                padding: "var(--space-2)",
                border: "1px dashed var(--color-border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--color-white)",
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                gap: "var(--space-2)",
                boxSizing: "border-box",
              }}
            >
              <label
                style={{
                  fontSize: 11,
                  color: "var(--color-muted-text)",
                  minWidth: 0,
                }}
              >
                Full name
                <input
                  type="text"
                  value={createDraft.full_name}
                  onChange={(e) =>
                    setCreateDraft((d) =>
                      d ? { ...d, full_name: e.target.value } : d,
                    )
                  }
                  style={{
                    width: "100%",
                    padding: "4px 8px",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "12px",
                    boxSizing: "border-box",
                  }}
                />
              </label>
              <label
                style={{
                  fontSize: 11,
                  color: "var(--color-muted-text)",
                  minWidth: 0,
                }}
              >
                Company
                <input
                  type="text"
                  value={createDraft.company}
                  onChange={(e) =>
                    setCreateDraft((d) =>
                      d ? { ...d, company: e.target.value } : d,
                    )
                  }
                  style={{
                    width: "100%",
                    padding: "4px 8px",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "12px",
                    boxSizing: "border-box",
                  }}
                />
              </label>
              <label
                style={{
                  fontSize: 11,
                  color: "var(--color-muted-text)",
                  minWidth: 0,
                }}
              >
                Email
                <input
                  type="email"
                  value={createDraft.email}
                  onChange={(e) =>
                    setCreateDraft((d) =>
                      d ? { ...d, email: e.target.value } : d,
                    )
                  }
                  style={{
                    width: "100%",
                    padding: "4px 8px",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "12px",
                    boxSizing: "border-box",
                  }}
                />
              </label>
              <label
                style={{
                  fontSize: 11,
                  color: "var(--color-muted-text)",
                  minWidth: 0,
                }}
              >
                Department
                <input
                  type="text"
                  value={createDraft.department}
                  onChange={(e) =>
                    setCreateDraft((d) =>
                      d ? { ...d, department: e.target.value } : d,
                    )
                  }
                  style={{
                    width: "100%",
                    padding: "4px 8px",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "12px",
                    boxSizing: "border-box",
                  }}
                />
              </label>
              <div
                style={{
                  gridColumn: "1 / -1",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  justifyContent: "flex-end",
                  minWidth: 0,
                }}
              >
                <button
                  type="button"
                  onClick={() => setCreateDraft(null)}
                  style={{
                    background: "none",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "4px 10px",
                    fontSize: "11px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateAndLink()}
                  disabled={creating}
                  style={{
                    background: "var(--color-brand-dark-blue)",
                    color: "var(--color-white)",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    padding: "4px 10px",
                    fontSize: "11px",
                    cursor: creating ? "wait" : "pointer",
                  }}
                >
                  {creating ? "Creating…" : "Create & link"}
                </button>
              </div>
            </div>
          )}
          {results.length > 0 && (
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {results.map((p) => (
                <li
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "4px 8px",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--color-white)",
                    fontSize: "12px",
                  }}
                >
                  <span>
                    {p.full_name}
                    <span style={{ color: "var(--color-muted-text)" }}>
                      {" "}
                      — {p.company}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleLink(p.id)}
                    style={{
                      background: "var(--color-brand-dark-blue)",
                      color: "var(--color-white)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      padding: "3px 10px",
                      fontSize: "11px",
                      cursor: "pointer",
                    }}
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p
          role="alert"
          style={{
            marginTop: "var(--space-2)",
            color: "var(--color-danger)",
            fontSize: "12px",
          }}
        >
          {error}
        </p>
      )}
    </section>
  );
}

function AssessmentSection({
  assessment,
}: {
  assessment: Record<string, unknown>;
}) {
  const trl = assessment["trl"] as number | null | undefined;
  const trlPhase = getTrlPhase(trl);

  const rows: [string, string][] = [
    [
      "TRL",
      trl
        ? `${String(trl)}${trlPhase !== "Invalid" ? ` — ${trlPhase}` : ""}`
        : "—",
    ],
    ["Time to Mainstream", String(assessment["time_to_mainstream"] ?? "—")],
    ["Strategic Relevance", String(assessment["strategic_relevance"] ?? "—")],
    ["Impact Potential", String(assessment["impact_potential"] ?? "—")],
    [
      "Implementation Feasibility",
      String(assessment["implementation_feasibility"] ?? "—"),
    ],
    [
      "Collaboration Potential",
      String(assessment["collaboration_potential"] ?? "—"),
    ],
  ];

  const hasData = rows.some(
    ([, v]) => v !== "—" && v !== "None" && v !== "null",
  );
  if (!hasData) return null;

  return (
    <section style={{ marginBottom: "var(--space-5)" }}>
      <SectionHeading>Assessment</SectionHeading>
      <table
        style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}
      >
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td
                style={{
                  padding: "4px 0",
                  color: "var(--color-muted-text)",
                  width: "55%",
                }}
              >
                {label}
              </td>
              <td
                style={{
                  padding: "4px 0",
                  color: "var(--color-dark-text)",
                  fontWeight: "var(--font-weight-medium)",
                }}
              >
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

type RelationGroupKey =
  | "Drives"
  | "Driven By"
  | "Relates To"
  | "Hinders"
  | "Hindered By";

const RELATION_GROUP_ORDER: RelationGroupKey[] = [
  "Drives",
  "Driven By",
  "Relates To",
  "Hinders",
  "Hindered By",
];

const RELATION_GROUP_COLORS: Record<RelationGroupKey, string> = {
  Drives: "var(--color-brand-dark-blue)",
  "Driven By": "var(--color-brand-dark-blue)",
  "Relates To": "var(--color-brand-orange)",
  Hinders: "#c0392b",
  "Hindered By": "#c0392b",
};

function relationGroupLabel(
  relationType: string,
  isOutgoing: boolean,
): RelationGroupKey | string {
  const t = relationType.toLowerCase().replace(/[_\s]/g, "");
  if (t === "drives") return isOutgoing ? "Drives" : "Driven By";
  if (t === "drivenby") return isOutgoing ? "Driven By" : "Drives";
  if (t === "hinders") return isOutgoing ? "Hinders" : "Hindered By";
  if (t === "hinderedby") return isOutgoing ? "Hindered By" : "Hinders";
  if (t === "relatesto") return "Relates To";
  return relationType;
}

function RelationsSection({
  entry,
  relations,
  data,
  onNavigate,
}: {
  entry: RadarEntry;
  relations: TechnologyRelation[];
  data: RadarData;
  onNavigate: (entry: RadarEntry) => void;
}) {
  const groups = useMemo(() => {
    const out = new Map<
      string,
      Array<{ rel: TechnologyRelation; other: RadarEntry }>
    >();
    relations.forEach((rel) => {
      const isOutgoing = rel.from_topic_id === entry.topic_id;
      const isIncoming = rel.to_topic_id === entry.topic_id;
      if (!isOutgoing && !isIncoming) return;
      const otherId = isOutgoing ? rel.to_topic_id : rel.from_topic_id;
      const other = data.entries.find((e) => e.topic_id === otherId);
      if (!other) return;
      const label = relationGroupLabel(rel.relation_type, isOutgoing);
      if (!out.has(label)) out.set(label, []);
      out.get(label)!.push({ rel, other });
    });
    out.forEach((items, key) => {
      const seen = new Set<string>();
      out.set(
        key,
        items.filter(({ other }) => {
          if (seen.has(other.topic_id)) return false;
          seen.add(other.topic_id);
          return true;
        }),
      );
    });
    return out;
  }, [entry, relations, data.entries]);

  const orderedKeys: string[] = [
    ...RELATION_GROUP_ORDER.filter((k) => (groups.get(k)?.length ?? 0) > 0),
    ...Array.from(groups.keys()).filter(
      (k) => !RELATION_GROUP_ORDER.includes(k as RelationGroupKey),
    ),
  ];

  if (orderedKeys.length === 0) return null;

  return (
    <section style={{ marginBottom: "var(--space-5)" }}>
      <SectionHeading>Relations</SectionHeading>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
        }}
      >
        {orderedKeys.map((key) => {
          const items = groups.get(key) ?? [];
          const color =
            RELATION_GROUP_COLORS[key as RelationGroupKey] ??
            "var(--color-muted-text)";
          return (
            <div
              key={key}
              style={{
                borderLeft: `2px solid ${color}`,
                paddingLeft: "var(--space-4)",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: "var(--font-weight-bold)",
                  color,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom: "var(--space-1)",
                }}
              >
                {key}
              </div>
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                }}
              >
                {items.map(({ rel, other }) => (
                  <li key={rel.id}>
                    <button
                      type="button"
                      onClick={() => onNavigate(other)}
                      style={{
                        background: "none",
                        border: "none",
                        padding: "2px 0",
                        cursor: "pointer",
                        fontFamily: "var(--font-family)",
                        fontSize: "var(--font-size-body)",
                        color: "var(--color-dark-blue)",
                        textAlign: "left",
                        textDecoration: "underline",
                        textUnderlineOffset: "2px",
                        textDecorationColor:
                          "color-mix(in srgb, var(--color-dark-blue) 30%, transparent)",
                      }}
                    >
                      {other.canonical_name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MovementTimeline({
  events,
}: {
  events: TopicDetailNested["recent_events"];
}) {
  if (events.length === 0) return null;
  return (
    <section style={{ marginBottom: "var(--space-5)" }}>
      <SectionHeading>Movement History</SectionHeading>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          borderLeft: "2px solid var(--color-ring-boundary)",
          paddingLeft: "var(--space-4)",
        }}
      >
        {events.map((ev) => (
          <li key={ev.id} style={{ marginBottom: "var(--space-3)" }}>
            <div
              style={{
                fontSize: "11px",
                color: "var(--color-muted-text)",
                marginBottom: 2,
              }}
            >
              {new Date(ev.timestamp).toLocaleDateString()} — {ev.event_type}
            </div>
            {(ev.from_value || ev.to_value) && (
              <div
                style={{ fontSize: "12px", color: "var(--color-dark-text)" }}
              >
                {ev.from_value ?? "—"} → {ev.to_value ?? "—"}
              </div>
            )}
            <div
              style={{
                fontSize: "12px",
                color: "var(--color-muted-text)",
                fontStyle: "italic",
              }}
            >
              {ev.rationale}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const editTextareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "120px",
  padding: "var(--space-3)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--color-border-strong)",
  fontFamily: "var(--font-family)",
  fontSize: "var(--font-size-body)",
  lineHeight: 1.5,
  color: "var(--color-dark-text)",
  resize: "vertical",
  background: "var(--color-white)",
};

const editSelectStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--color-border-strong)",
  fontFamily: "var(--font-family)",
  fontSize: "13px",
  background: "var(--color-white)",
};

function FactsheetEditFields({ edit }: { edit: InlineEditProps }) {
  const FIELDS: [string, keyof InlineEditForm][] = [
    ["Description", "description"],
    ["Key Players", "key_players"],
    ["Recommended Next Steps", "recommended_next_steps"],
    ["Current Challenges", "current_challenges"],
  ];
  const summaryLen = edit.values.summary.length;
  return (
    <>
      <section style={{ marginBottom: "var(--space-5)" }}>
        <SectionHeading>Summary</SectionHeading>
        <input
          type="text"
          maxLength={120}
          value={edit.values.summary}
          onChange={(e) => edit.onChange({ summary: e.target.value })}
          placeholder="One-line summary (max 120 chars)"
          aria-label="Summary"
          style={{
            ...editSelectStyle,
            width: "100%",
          }}
        />
        <div
          style={{
            fontSize: 11,
            color:
              summaryLen > 110
                ? "var(--color-danger)"
                : "var(--color-muted-text)",
            textAlign: "right",
            marginTop: 2,
          }}
        >
          {summaryLen}/120
        </div>
      </section>
      {FIELDS.map(([label, key]) => (
        <section key={key} style={{ marginBottom: "var(--space-5)" }}>
          <SectionHeading>{label}</SectionHeading>
          <AutoGrowTextarea
            value={edit.values[key]}
            onChange={(e) => edit.onChange({ [key]: e.target.value })}
            style={editTextareaStyle}
            aria-label={label}
          />
        </section>
      ))}
    </>
  );
}

function AssessmentEditFields({ edit }: { edit: InlineEditProps }) {
  const update =
    (
      key: keyof InlineEditForm,
    ): React.ChangeEventHandler<
      HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement
    > =>
    (e) =>
      edit.onChange({ [key]: e.target.value });

  const SCORE_OPTIONS = ["", "High", "Medium", "Low"];
  const IMPACT_OPTIONS = ["", "Transformational", "High", "Medium", "Low"];
  const TTM_OPTIONS = ["", "0-2 yr", "2-5 yr", "5-7 yr", "7-10 yr"];

  const Block = ({
    label,
    valueKey,
    notesKey,
    children,
  }: {
    label: string;
    valueKey: keyof InlineEditForm;
    notesKey: keyof InlineEditForm;
    children: React.ReactNode;
  }) => (
    <div style={{ marginBottom: "var(--space-2)" }}>
      <div
        style={{
          color: "var(--color-muted-text)",
          fontSize: "12px",
          fontWeight: "var(--font-weight-medium)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
      <AutoGrowTextarea
        value={edit.values[notesKey]}
        onChange={update(notesKey)}
        placeholder="Notes (optional)"
        style={{
          ...editTextareaStyle,
          minHeight: "44px",
          marginTop: 4,
          fontSize: "12px",
        }}
        aria-label={`${label} notes`}
      />
      {((_: keyof InlineEditForm) => null)(valueKey)}
    </div>
  );

  return (
    <section style={{ marginBottom: "var(--space-5)" }}>
      <SectionHeading>Assessment</SectionHeading>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <Block label="TRL (1–9)" valueKey="trl" notesKey="trl_notes">
          <input
            type="number"
            min={1}
            max={9}
            value={edit.values.trl}
            onChange={update("trl")}
            style={editSelectStyle}
            aria-label="TRL"
          />
        </Block>
        <Block
          label="Time to Mainstream"
          valueKey="time_to_mainstream"
          notesKey="time_to_mainstream_notes"
        >
          <select
            value={edit.values.time_to_mainstream}
            onChange={update("time_to_mainstream")}
            style={editSelectStyle}
            aria-label="Time to mainstream"
          >
            {TTM_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v || "N/A"}
              </option>
            ))}
          </select>
        </Block>
        <Block
          label="Strategic Relevance"
          valueKey="strategic_relevance"
          notesKey="strategic_relevance_notes"
        >
          <select
            value={edit.values.strategic_relevance}
            onChange={update("strategic_relevance")}
            style={editSelectStyle}
            aria-label="Strategic relevance"
          >
            {SCORE_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v || "N/A"}
              </option>
            ))}
          </select>
        </Block>
        <Block
          label="Impact Potential"
          valueKey="impact_potential"
          notesKey="impact_potential_notes"
        >
          <select
            value={edit.values.impact_potential}
            onChange={update("impact_potential")}
            style={editSelectStyle}
            aria-label="Impact potential"
          >
            {IMPACT_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v || "N/A"}
              </option>
            ))}
          </select>
        </Block>
        <Block
          label="Implementation Feasibility"
          valueKey="implementation_feasibility"
          notesKey="implementation_feasibility_notes"
        >
          <select
            value={edit.values.implementation_feasibility}
            onChange={update("implementation_feasibility")}
            style={editSelectStyle}
            aria-label="Implementation feasibility"
          >
            {SCORE_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v || "N/A"}
              </option>
            ))}
          </select>
        </Block>
        <Block
          label="Collaboration Potential"
          valueKey="collaboration_potential"
          notesKey="collaboration_potential_notes"
        >
          <select
            value={edit.values.collaboration_potential}
            onChange={update("collaboration_potential")}
            style={editSelectStyle}
            aria-label="Collaboration potential"
          >
            {SCORE_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v || "N/A"}
              </option>
            ))}
          </select>
        </Block>
        <div style={{ marginTop: "var(--space-3)" }}>
          <div
            style={{
              color: "var(--color-muted-text)",
              fontSize: "12px",
              fontWeight: "var(--font-weight-medium)",
              marginBottom: 4,
            }}
          >
            Tax-credit candidate
          </div>
          <select
            value={edit.values.tax_credit_candidate}
            onChange={(e) =>
              edit.onChange({ tax_credit_candidate: e.target.value })
            }
            style={editSelectStyle}
            aria-label="Tax-credit candidate"
          >
            <option value="No">No</option>
            <option value="Yes">Yes</option>
            <option value="Potential">Potential</option>
          </select>
        </div>
      </div>
    </section>
  );
}

function AdditionalDetailsEditFields({ edit }: { edit: InlineEditProps }) {
  const links = edit.publicationLinks;
  const setLinks = edit.onPublicationLinksChange;
  const updateLink = (idx: number, patch: Partial<PublicationLink>) =>
    setLinks(links.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const removeLink = (idx: number) =>
    setLinks(links.filter((_, i) => i !== idx));
  const addLink = () => setLinks([...links, { url: "", description: "" }]);

  return (
    <section style={{ marginBottom: "var(--space-5)" }}>
      <SectionHeading>Publication Links</SectionHeading>
      {links.length === 0 && (
        <div
          style={{
            fontSize: 12,
            color: "var(--color-muted-text)",
            fontStyle: "italic",
            marginBottom: 8,
          }}
        >
          No publication links yet
        </div>
      )}
      {links.map((l, idx) => (
        <div
          key={idx}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr) auto",
            gap: 6,
            marginBottom: 6,
            alignItems: "center",
          }}
        >
          <input
            type="text"
            placeholder="https://…"
            value={l.url}
            onChange={(e) => updateLink(idx, { url: e.target.value })}
            style={editSelectStyle}
            aria-label={`Link ${idx + 1} URL`}
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={l.description}
            onChange={(e) => updateLink(idx, { description: e.target.value })}
            style={editSelectStyle}
            aria-label={`Link ${idx + 1} description`}
          />
          <button
            type="button"
            onClick={() => removeLink(idx)}
            aria-label={`Remove link ${idx + 1}`}
            style={{
              background: "transparent",
              border: "none",
              color: "#c0392b",
              cursor: "pointer",
              fontSize: 16,
              padding: "0 6px",
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addLink}
        style={{
          background: "var(--color-page-background)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: "4px 12px",
          cursor: "pointer",
          fontFamily: "var(--font-family)",
          fontSize: 12,
          color: "var(--color-dark-blue)",
        }}
      >
        + Add link
      </button>
    </section>
  );
}
