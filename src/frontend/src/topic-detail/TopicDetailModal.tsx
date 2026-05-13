import { useEffect, useMemo, useState } from "react";
import { Modal } from "../shared/Modal";
import { HeroImage } from "../radar/HeroImage";
import { MediaUploader } from "../manage/MediaUploader";
import {
  PeerReferenceEditPanel,
  type EditablePeerRef,
  type PartyOption,
} from "../radar/PeerReferencePanel";
import type { RadarData, RadarEntry, TechnologyRelation } from "../radar/types";
import {
  TopicView,
  parsePublicationLinks,
  type InlineEditForm,
  type PublicationLink,
} from "./TopicView";
import { useTopicDetail } from "./useTopicDetail";
import { useAuth } from "../shared/AuthContext";
import { useReadOnlyRadar } from "../radar/ReadOnlyRadarContext";
import { MovementIndicator } from "../shared/MovementIndicator";
import { themeByKey } from "../radar/segmentThemes";
import {
  addAlias,
  addUrlToPeerReference,
  createFactsheet,
  createParty,
  createPeerReference,
  deletePeerReference,
  getFactsheetVersion,
  listParties,
  listSegments,
  removeAlias,
  removeUrlFromPeerReference,
  updatePeerReference,
  updateTechnology,
  updateTopic,
} from "../manage/api";
import type {
  AssessmentCreate,
  ImpactPotential,
  PeerReferenceRead,
  Ring,
  RegistryStatus,
  ScoreHML,
  SegmentAdmin,
  TimeToMainstream,
  TaxCreditCandidate,
} from "../manage/types";
import { getValidTransitions } from "../manage/types";
import { RingPlacementDialog } from "../manage/RingPlacementDialog";

type Mode = "view" | "edit";

type Props = {
  slug: string | null;
  open: boolean;
  onClose: () => void;
  onAfterSave?: () => void;
  radarContext?: {
    entry: RadarEntry;
    data: RadarData;
    relations: TechnologyRelation[];
    onNavigate: (entry: RadarEntry) => void;
  };
  initialMode?: "view" | "edit";
};

const RING_BADGE_COLORS: Record<string, string> = {
  Invest: "var(--color-ring-invest)",
  Pilot: "var(--color-ring-trial)",
  Explore: "var(--color-ring-assess)",
  Monitor: "var(--color-ring-watch)",
};

const RING_OPTIONS: Ring[] = ["Invest", "Pilot", "Explore", "Monitor"];
const REGISTRY_OPTIONS: RegistryStatus[] = ["On Radar", "Backlog", "Archive"];

function normaliseAlias(s: string): string {
  // Strip everything non-alphanumeric for matching, so "OpenAI.", "Open AI",
  // and "open-ai" all dedup against canonical "OpenAI". The full alias
  // string is still shown to the user — this is purely for comparison.
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function emptyForm(): InlineEditForm {
  return {
    summary: "",
    description: "",
    key_players: "",
    recommended_next_steps: "",
    current_challenges: "",
    trl: "",
    strategic_relevance: "",
    impact_potential: "",
    implementation_feasibility: "",
    time_to_mainstream: "",
    collaboration_potential: "",
    trl_notes: "",
    strategic_relevance_notes: "",
    impact_potential_notes: "",
    implementation_feasibility_notes: "",
    time_to_mainstream_notes: "",
    collaboration_potential_notes: "",
    tax_credit_candidate: "No",
  };
}

function formFromDetail(
  factsheet: Record<string, unknown> | null,
  assessment: Record<string, unknown> | null,
): InlineEditForm {
  const fs = factsheet ?? {};
  const as = assessment ?? {};
  const str = (v: unknown) => (v == null ? "" : String(v));
  return {
    summary: str(fs["summary"]),
    description: str(fs["description"]),
    key_players: str(fs["key_players"]),
    recommended_next_steps: str(fs["recommended_next_steps"]),
    current_challenges: str(fs["current_challenges"]),
    trl: str(as["trl"]),
    strategic_relevance: str(as["strategic_relevance"]),
    impact_potential: str(as["impact_potential"]),
    implementation_feasibility: str(as["implementation_feasibility"]),
    time_to_mainstream: str(as["time_to_mainstream"]),
    collaboration_potential: str(as["collaboration_potential"]),
    trl_notes: str(as["trl_notes"]),
    strategic_relevance_notes: str(as["strategic_relevance_notes"]),
    impact_potential_notes: str(as["impact_potential_notes"]),
    implementation_feasibility_notes: str(
      as["implementation_feasibility_notes"],
    ),
    time_to_mainstream_notes: str(as["time_to_mainstream_notes"]),
    collaboration_potential_notes: str(as["collaboration_potential_notes"]),
    tax_credit_candidate: str(fs["tax_credit_candidate"]) || "No",
  };
}

function peerRefToEditable(p: PeerReferenceRead): EditablePeerRef {
  return {
    id: p.id,
    party_id: p.party_id,
    party_name: "",
    peer_title: p.peer_title,
    peer_ring_label: p.peer_ring_label,
    peer_segment_label: p.peer_segment_label,
    peer_time_to_mainstream_label: p.peer_time_to_mainstream_label,
    summary: p.summary,

    urls: (p.urls ?? []).map((u) => ({
      id: u.id,
      url: u.url,
      label: u.label,
      display_order: u.display_order,
    })),
    _newUrl: { url: "", label: "" },
  };
}

export function TopicDetailModal({
  slug,
  open,
  onClose,
  onAfterSave,
  radarContext,
  initialMode = "view",
}: Props) {
  const { isWriter: rawIsWriter } = useAuth();
  const readOnlyRadar = useReadOnlyRadar();
  const isWriter = rawIsWriter && !readOnlyRadar;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [editForm, setEditForm] = useState<InlineEditForm>(emptyForm());
  const [titleEdit, setTitleEdit] = useState("");
  const [editPublicationLinks, setEditPublicationLinks] = useState<
    PublicationLink[]
  >([]);
  // tier 1 metadata
  const [editRing, setEditRing] = useState<Ring | "">("");
  const [editSegmentId, setEditSegmentId] = useState<string>("");
  const [editRegistry, setEditRegistry] = useState<RegistryStatus>("On Radar");
  const [editIsPublic, setEditIsPublic] = useState<boolean>(true);
  const [allSegments, setAllSegments] = useState<SegmentAdmin[]>([]);
  // alias edits
  const [editAliases, setEditAliases] = useState<
    { id?: string; name: string; source?: string | null }[]
  >([]);
  const [removedAliasIds, setRemovedAliasIds] = useState<string[]>([]);
  const [newAliasInput, setNewAliasInput] = useState("");
  // peer refs
  const [editPeerRefs, setEditPeerRefs] = useState<EditablePeerRef[]>([]);
  const [partyOptions, setPartyOptions] = useState<PartyOption[]>([]);
  // hero image — cropper modal + asset id staged for save
  const [cropperOpen, setCropperOpen] = useState<boolean>(false);
  const [pendingHeroImageId, setPendingHeroImageId] = useState<string | null>(
    null,
  );
  // save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // historical factsheet version being viewed (null = current)
  const [viewingVersion, setViewingVersion] = useState<number | null>(null);
  const [versionLoadError, setVersionLoadError] = useState<string | null>(null);
  // pending registry transition awaiting confirmation in RingPlacementDialog
  const [pendingTransition, setPendingTransition] = useState<{
    to: RegistryStatus;
    requiresRing: boolean;
  } | null>(null);
  // rationale captured for a registry transition during this edit session
  const [transitionRationale, setTransitionRationale] = useState<string | null>(
    null,
  );
  const {
    topic,
    nested,
    factsheets,
    movements,
    peerRefs,
    loading,
    error,
    refetch,
  } = useTopicDetail(open ? slug : null);

  useEffect(() => {
    if (open) setMode(initialMode);
  }, [open, slug, initialMode]);

  // Kick the user back to view-mode if their permissions disappear (logout).
  useEffect(() => {
    if (!isWriter && mode === "edit") {
      setMode("view");
    }
  }, [isWriter, mode]);

  useEffect(() => {
    if (!open) return;
    listSegments({})
      .then(setAllSegments)
      .catch(() => setAllSegments([]));
    listParties()
      .then((parties) =>
        setPartyOptions(parties.map((p) => ({ id: p.id, name: p.name }))),
      )
      .catch(() => setPartyOptions([]));
  }, [open]);

  useEffect(() => {
    if (nested && topic) {
      setEditForm(formFromDetail(nested.factsheet, nested.assessment));
      setTitleEdit(
        (nested.topic?.["canonical_name"] as string | undefined) ??
          topic.canonical_name,
      );
      setEditRing((topic.current_ring as Ring) ?? "");
      setEditSegmentId(topic.current_segment_id ?? "");
      setEditRegistry(topic.registry_status as RegistryStatus);
      setEditIsPublic(!topic.not_for_external_publication);
      setEditAliases(
        nested.aliases.map((a) => ({
          id: (a.id as string | undefined) ?? undefined,
          name: a.alias_name,
          source: (a as { source?: string | null }).source ?? null,
        })),
      );
      setRemovedAliasIds([]);
      setNewAliasInput("");
      setPendingHeroImageId(null);
      setCropperOpen(false);
      setEditPublicationLinks(
        parsePublicationLinks(nested.factsheet?.publication_links),
      );
    }
  }, [nested, topic, mode]);

  useEffect(() => {
    if (mode === "edit") {
      const partyById = new Map(partyOptions.map((p) => [p.id, p.name]));
      setEditPeerRefs(
        peerRefs.map((p) => ({
          ...peerRefToEditable(p),
          party_name: partyById.get(p.party_id) ?? "",
        })),
      );
    }
  }, [mode, peerRefs, partyOptions]);

  useEffect(() => {
    if (mode !== "edit") {
      setViewingVersion(null);
      setVersionLoadError(null);
      setPendingTransition(null);
      setTransitionRationale(null);
    }
  }, [mode]);

  async function handleVersionChange(version: number) {
    if (!topic?.technology_id || !nested) return;
    setVersionLoadError(null);
    if (version === 0) {
      setEditForm(formFromDetail(nested.factsheet, nested.assessment));
      setEditPublicationLinks(
        parsePublicationLinks(nested.factsheet?.publication_links),
      );
      setViewingVersion(null);
      return;
    }
    try {
      const fs = await getFactsheetVersion(topic.technology_id, version);
      setEditForm(
        formFromDetail(
          fs as unknown as Record<string, unknown>,
          nested.assessment,
        ),
      );
      setEditPublicationLinks(parsePublicationLinks(fs.publication_links));
      setViewingVersion(version);
    } catch (e) {
      setVersionLoadError(
        e instanceof Error ? e.message : "Failed to load version",
      );
    }
  }

  const editing = mode === "edit";

  async function handleInlineSave() {
    if (!topic || !nested) return;
    setSaving(true);
    setSaveError(null);
    try {
      const original = formFromDetail(nested.factsheet, nested.assessment);
      const originalTitle =
        (nested.topic?.["canonical_name"] as string | undefined) ??
        topic.canonical_name;

      // 1) Title + visibility
      const titleChanged =
        !!titleEdit.trim() && titleEdit.trim() !== originalTitle;
      const visibilityChanged =
        editIsPublic === topic.not_for_external_publication;
      if (titleChanged || visibilityChanged) {
        const patch: Parameters<typeof updateTopic>[1] = {};
        if (titleChanged) patch.canonical_name = titleEdit.trim();
        if (visibilityChanged)
          patch.not_for_external_publication = !editIsPublic;
        await updateTopic(topic.id, patch);
      }

      // 2) Hero image — already uploaded via the cropper, just pick up the id
      const heroImageId: string | undefined = pendingHeroImageId ?? undefined;

      // 3) Technology metadata changes
      const techChanged =
        editRing !== ((topic.current_ring as Ring) ?? "") ||
        editSegmentId !== (topic.current_segment_id ?? "") ||
        editRegistry !== topic.registry_status ||
        heroImageId !== undefined;
      if (techChanged && topic.technology_id) {
        const techPayload: Record<string, unknown> = {};
        if (editRegistry !== topic.registry_status) {
          techPayload.registry_status = editRegistry;
          if (transitionRationale) {
            techPayload.rationale = transitionRationale;
          }
        }
        if (editRegistry === "On Radar") {
          if (editRing !== ((topic.current_ring as Ring) ?? "")) {
            techPayload.current_ring = editRing || null;
          }
          if (editSegmentId !== (topic.current_segment_id ?? "")) {
            techPayload.current_segment_id = editSegmentId || null;
          }
        }
        if (heroImageId !== undefined) techPayload.hero_image_id = heroImageId;
        await updateTechnology(
          topic.technology_id,
          techPayload as Parameters<typeof updateTechnology>[1],
        );
      }

      // 4) Factsheet (text + assessment + additional)
      const originalPublicationLinks = parsePublicationLinks(
        nested.factsheet?.publication_links,
      );
      const linksChanged =
        editPublicationLinks.length !== originalPublicationLinks.length ||
        editPublicationLinks.some(
          (l, i) =>
            l.url !== (originalPublicationLinks[i]?.url ?? "") ||
            l.description !== (originalPublicationLinks[i]?.description ?? ""),
        );

      const factsheetChanged =
        (
          [
            "summary",
            "description",
            "key_players",
            "recommended_next_steps",
            "current_challenges",
            "tax_credit_candidate",
          ] as const
        ).some((k) => editForm[k] !== original[k]) || linksChanged;
      const assessmentChanged = (
        [
          "trl",
          "strategic_relevance",
          "impact_potential",
          "implementation_feasibility",
          "time_to_mainstream",
          "collaboration_potential",
          "trl_notes",
          "strategic_relevance_notes",
          "impact_potential_notes",
          "implementation_feasibility_notes",
          "time_to_mainstream_notes",
          "collaboration_potential_notes",
        ] as const
      ).some((k) => editForm[k] !== original[k]);

      if ((factsheetChanged || assessmentChanged) && topic.technology_id) {
        const assessment: AssessmentCreate = {};
        if (editForm.trl) assessment.trl = parseInt(editForm.trl, 10);
        if (editForm.trl_notes) assessment.trl_notes = editForm.trl_notes;
        if (editForm.strategic_relevance)
          assessment.strategic_relevance =
            editForm.strategic_relevance as ScoreHML;
        if (editForm.strategic_relevance_notes)
          assessment.strategic_relevance_notes =
            editForm.strategic_relevance_notes;
        if (editForm.impact_potential)
          assessment.impact_potential =
            editForm.impact_potential as ImpactPotential;
        if (editForm.impact_potential_notes)
          assessment.impact_potential_notes = editForm.impact_potential_notes;
        if (editForm.implementation_feasibility)
          assessment.implementation_feasibility =
            editForm.implementation_feasibility as ScoreHML;
        if (editForm.implementation_feasibility_notes)
          assessment.implementation_feasibility_notes =
            editForm.implementation_feasibility_notes;
        if (editForm.time_to_mainstream)
          assessment.time_to_mainstream =
            editForm.time_to_mainstream as TimeToMainstream;
        if (editForm.time_to_mainstream_notes)
          assessment.time_to_mainstream_notes =
            editForm.time_to_mainstream_notes;
        if (editForm.collaboration_potential)
          assessment.collaboration_potential =
            editForm.collaboration_potential as ScoreHML;
        if (editForm.collaboration_potential_notes)
          assessment.collaboration_potential_notes =
            editForm.collaboration_potential_notes;

        const pubLinks = editPublicationLinks
          .filter((l) => l.url.trim())
          .map((l) => ({
            url: l.url.trim(),
            description: l.description.trim() || null,
          }));

        await createFactsheet(topic.technology_id, {
          summary:
            editForm.summary.trim() || editForm.description.slice(0, 120),
          description: editForm.description,
          key_players: editForm.key_players,
          tax_credit_candidate: (editForm.tax_credit_candidate ||
            "No") as TaxCreditCandidate,
          current_challenges: editForm.current_challenges,
          publication_links: pubLinks,
          recommended_next_steps: editForm.recommended_next_steps,
          last_updated: new Date().toISOString().slice(0, 10),
          assessment: Object.keys(assessment).length > 0 ? assessment : null,
        });
      }

      // 5) Aliases — diff against original
      const originalAliases = nested.aliases.map((a) => ({
        id: (a.id as string | undefined) ?? undefined,
        name: a.alias_name,
      }));
      const finalAliases = editAliases;
      const finalNamesNorm = new Set(
        finalAliases.map((a) => normaliseAlias(a.name)),
      );
      // Removed: original ids no longer in finalAliases AND not already deleted
      for (const orig of originalAliases) {
        if (
          orig.id &&
          !finalAliases.some(
            (f) =>
              f.id === orig.id ||
              normaliseAlias(f.name) === normaliseAlias(orig.name),
          ) &&
          !removedAliasIds.includes(orig.id)
        ) {
          await removeAlias(topic.id, orig.id);
        }
      }
      for (const id of removedAliasIds) {
        await removeAlias(topic.id, id).catch(() => undefined);
      }
      // Added: in final without an id and not already in original
      const originalNamesNorm = new Set(
        originalAliases.map((a) => normaliseAlias(a.name)),
      );
      for (const a of finalAliases) {
        if (
          !a.id &&
          !originalNamesNorm.has(normaliseAlias(a.name)) &&
          finalNamesNorm.has(normaliseAlias(a.name))
        ) {
          await addAlias(topic.id, { alias_name: a.name }).catch(
            () => undefined,
          );
        }
      }

      // 6) Peer references
      const originalPeerById = new Map(peerRefs.map((p) => [p.id, p]));
      const partyByName = new Map(
        partyOptions.map((p) => [p.name.toLowerCase(), p.id] as const),
      );
      for (const r of editPeerRefs) {
        // New card: resolve/create party, then create peer reference + URLs.
        if (r._isNew && !r._deleted) {
          const name = r.party_name.trim();
          if (!name || !r.peer_title.trim()) continue;
          let partyId = r.party_id;
          if (!partyId) {
            const lookup = partyByName.get(name.toLowerCase());
            if (lookup) {
              partyId = lookup;
            } else {
              const created = await createParty({ name });
              partyId = created.id;
              partyByName.set(created.name.toLowerCase(), created.id);
            }
          }
          const newPr = await createPeerReference(topic.id, {
            party_id: partyId,
            peer_title: r.peer_title,
            peer_ring_label: r.peer_ring_label ?? null,
            peer_segment_label: r.peer_segment_label ?? null,
            peer_time_to_mainstream_label:
              r.peer_time_to_mainstream_label ?? null,
            summary: r.summary ?? null,

            urls: r.urls.map((u) => ({
              url: u.url,
              label: u.label,
              display_order: u.display_order,
            })),
          });
          // URLs already created with the peer reference; nothing more to do.
          void newPr;
          continue;
        }
        const orig = originalPeerById.get(r.id);
        if (!orig) continue;
        if (r._deleted) {
          await deletePeerReference(topic.id, r.id);
          continue;
        }
        const fieldsChanged =
          r.peer_title !== orig.peer_title ||
          r.peer_ring_label !== orig.peer_ring_label ||
          r.peer_segment_label !== orig.peer_segment_label ||
          r.peer_time_to_mainstream_label !==
            orig.peer_time_to_mainstream_label ||
          r.summary !== orig.summary ||
          false;
        if (fieldsChanged) {
          await updatePeerReference(topic.id, r.id, {
            peer_title: r.peer_title,
            peer_ring_label: r.peer_ring_label,
            peer_segment_label: r.peer_segment_label,
            peer_time_to_mainstream_label: r.peer_time_to_mainstream_label,
            summary: r.summary,
          });
        }
        // URL diffs
        const origUrls = orig.urls ?? [];
        const finalUrls = r.urls ?? [];
        const origUrlIds = new Set(origUrls.map((u) => u.id));
        const finalUrlIds = new Set(
          finalUrls.filter((u) => !u.id.startsWith("__new_")).map((u) => u.id),
        );
        for (const u of origUrls) {
          if (!finalUrlIds.has(u.id)) {
            await removeUrlFromPeerReference(topic.id, r.id, u.id).catch(
              () => undefined,
            );
          }
        }
        for (const u of finalUrls) {
          if (u.id.startsWith("__new_") || !origUrlIds.has(u.id)) {
            await addUrlToPeerReference(topic.id, r.id, {
              url: u.url,
              label: u.label,
              display_order: u.display_order,
            }).catch(() => undefined);
          }
        }
      }

      await refetch();
      setMode("view");
      onAfterSave?.();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const title = editing
    ? titleEdit
    : ((nested?.topic?.["canonical_name"] as string | undefined) ??
      topic?.canonical_name ??
      "Topic detail");
  const persistedHeroImageId =
    (nested?.technology?.["hero_image_id"] as string | null | undefined) ??
    null;
  const heroImageId = pendingHeroImageId ?? persistedHeroImageId;
  const entry = radarContext?.entry;
  const ring = entry
    ? radarContext?.data.rings.find((r) => r.name === entry.ring)
    : null;
  const segment = entry
    ? radarContext?.data.segments.find((s) => s.id === entry.segment_id)
    : null;

  const overlayButtonStyle: React.CSSProperties = {
    background: "rgba(0,0,0,0.5)",
    border: "1px solid rgba(255,255,255,0.25)",
    color: "var(--color-white)",
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1,
    padding: "6px 10px",
    borderRadius: "6px",
    fontWeight: "var(--font-weight-medium)",
    fontFamily: "var(--font-family)",
    backdropFilter: "blur(4px)",
    transition: "background 150ms",
  };
  const overlayHover = (
    e: React.MouseEvent<HTMLButtonElement>,
    enter: boolean,
  ) => {
    (e.currentTarget as HTMLButtonElement).style.background = enter
      ? "rgba(0,0,0,0.7)"
      : "rgba(0,0,0,0.5)";
  };

  const headerSelectStyle: React.CSSProperties = {
    background: "rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.3)",
    borderRadius: "var(--radius-md)",
    padding: "4px 8px",
    color: "white",
    fontFamily: "var(--font-family)",
    fontSize: "12px",
  };

  const peerRefsContent = useMemo(
    () =>
      editing ? (
        <PeerReferenceEditPanel
          refs={editPeerRefs}
          onChange={setEditPeerRefs}
          partyOptions={partyOptions}
        />
      ) : null,
    [editing, editPeerRefs, partyOptions],
  );

  const inlineEditProps = useMemo(
    () =>
      editing
        ? {
            values: editForm,
            onChange: (patch: Partial<InlineEditForm>) =>
              setEditForm((f) => ({ ...f, ...patch })),
            publicationLinks: editPublicationLinks,
            onPublicationLinksChange: setEditPublicationLinks,
            peerRefsContent,
            peopleEditor: topic
              ? {
                  topicId: topic.id,
                  persons: nested?.persons ?? [],
                  onChange: refetch,
                }
              : undefined,
          }
        : undefined,
    [
      editing,
      editForm,
      editPublicationLinks,
      peerRefsContent,
      topic,
      nested,
      refetch,
    ],
  );

  return (
    <Modal open={open} onClose={onClose} title={title} size="full" hideHeader>
      {loading && (
        <div
          style={{
            padding: "var(--space-8)",
            textAlign: "center",
            color: "var(--color-muted-text)",
            fontFamily: "var(--font-family)",
          }}
        >
          Loading…
        </div>
      )}
      {error && !loading && (
        <div
          style={{
            padding: "var(--space-8)",
            textAlign: "center",
            color: "var(--color-error, #c0392b)",
            fontFamily: "var(--font-family)",
          }}
        >
          {error}
        </div>
      )}
      {!loading && !error && topic && nested && (
        <>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <HeroImage heroImageId={heroImageId} altText={title} height={260} />
            {ring && (
              <div
                style={{ position: "absolute", top: 14, left: 14, zIndex: 1 }}
              >
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
                    boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
                  }}
                >
                  {ring.name}
                </span>
              </div>
            )}
            {editing && (
              <div
                style={{
                  position: "absolute",
                  bottom: 14,
                  left: 14,
                  zIndex: 1,
                }}
              >
                <button
                  type="button"
                  onClick={() => setCropperOpen(true)}
                  style={overlayButtonStyle}
                  onMouseEnter={(e) => overlayHover(e, true)}
                  onMouseLeave={(e) => overlayHover(e, false)}
                >
                  📷 Replace image
                </button>
                {pendingHeroImageId && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 12,
                      color: "white",
                      background: "rgba(20,140,80,0.8)",
                      padding: "4px 8px",
                      borderRadius: 6,
                      backdropFilter: "blur(4px)",
                    }}
                  >
                    New image ready — save to apply
                  </span>
                )}
              </div>
            )}
            <div
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                display: "flex",
                gap: "6px",
                zIndex: 1,
              }}
            >
              {!editing ? (
                isWriter ? (
                  <button
                    type="button"
                    onClick={() => setMode("edit")}
                    style={overlayButtonStyle}
                    onMouseEnter={(e) => overlayHover(e, true)}
                    onMouseLeave={(e) => overlayHover(e, false)}
                  >
                    ✎ Edit
                  </button>
                ) : null
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleInlineSave}
                    disabled={saving}
                    style={{
                      ...overlayButtonStyle,
                      background: saving
                        ? "rgba(0,0,0,0.5)"
                        : "rgba(20,140,80,0.85)",
                      cursor: saving ? "wait" : "pointer",
                    }}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditForm(
                        formFromDetail(nested.factsheet, nested.assessment),
                      );
                      setTitleEdit(
                        (nested.topic?.["canonical_name"] as
                          | string
                          | undefined) ?? topic.canonical_name,
                      );
                      setEditRing((topic.current_ring as Ring) ?? "");
                      setEditSegmentId(topic.current_segment_id ?? "");
                      setEditRegistry(topic.registry_status as RegistryStatus);
                      setEditIsPublic(!topic.not_for_external_publication);
                      setEditAliases(
                        nested.aliases.map((a) => ({
                          id: (a.id as string | undefined) ?? undefined,
                          name: a.alias_name,
                          source:
                            (a as { source?: string | null }).source ?? null,
                        })),
                      );
                      setRemovedAliasIds([]);
                      setEditPeerRefs(peerRefs.map(peerRefToEditable));
                      setPendingHeroImageId(null);
                      setCropperOpen(false);
                      setEditPublicationLinks(
                        parsePublicationLinks(
                          nested.factsheet?.publication_links,
                        ),
                      );
                      setSaveError(null);
                      setMode("view");
                    }}
                    style={overlayButtonStyle}
                    onMouseEnter={(e) => overlayHover(e, true)}
                    onMouseLeave={(e) => overlayHover(e, false)}
                  >
                    Cancel
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                aria-label="Close modal"
                style={{
                  ...overlayButtonStyle,
                  fontSize: 18,
                  padding: "4px 9px",
                }}
                onMouseEnter={(e) => overlayHover(e, true)}
                onMouseLeave={(e) => overlayHover(e, false)}
              >
                ×
              </button>
            </div>
          </div>

          <div
            style={{
              background:
                "linear-gradient(135deg, var(--color-brand-dark-blue) 0%, color-mix(in srgb, var(--color-brand-dark-blue) 65%, var(--color-brand-bright-blue)) 100%)",
              color: "var(--color-white)",
              padding: "var(--space-4) var(--space-6)",
              flexShrink: 0,
              borderBottom: "3px solid rgba(255,255,255,0.15)",
            }}
          >
            {editing ? (
              <input
                type="text"
                value={titleEdit}
                onChange={(e) => setTitleEdit(e.target.value)}
                aria-label="Topic title"
                style={{
                  margin: 0,
                  marginBottom: "var(--space-2)",
                  fontSize: "1.4rem",
                  fontWeight: "var(--font-weight-bold)",
                  lineHeight: 1.25,
                  letterSpacing: "-0.01em",
                  color: "#ffffff",
                  background: "rgba(0,0,0,0.25)",
                  border: "1px solid rgba(255,255,255,0.3)",
                  borderRadius: "var(--radius-md)",
                  padding: "6px 12px",
                  width: "100%",
                  fontFamily: "var(--font-family)",
                }}
              />
            ) : (
              <h2
                style={{
                  margin: 0,
                  marginBottom: "var(--space-2)",
                  fontSize: "1.4rem",
                  fontWeight: "var(--font-weight-bold)",
                  lineHeight: 1.25,
                  letterSpacing: "-0.01em",
                  color: "#ffffff",
                }}
              >
                {title}
              </h2>
            )}

            {editing ? (
              <>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    marginTop: 6,
                    marginBottom: 8,
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                    }}
                  >
                    Ring
                    <select
                      value={editRing}
                      onChange={(e) => {
                        const next = e.target.value as Ring | "";
                        setEditRing(next);
                        // Picking a ring implies On Radar.
                        if (next && editRegistry !== "On Radar") {
                          setEditRegistry("On Radar");
                        }
                      }}
                      style={headerSelectStyle}
                      aria-label="Ring"
                    >
                      <option value="">—</option>
                      {RING_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                    }}
                  >
                    Segment
                    <select
                      value={editSegmentId}
                      onChange={(e) => setEditSegmentId(e.target.value)}
                      style={headerSelectStyle}
                      aria-label="Segment"
                    >
                      <option value="">—</option>
                      {allSegments.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                    }}
                  >
                    Registry
                    <select
                      value={editRegistry}
                      onChange={(e) => {
                        const next = e.target.value as RegistryStatus;
                        if (next === editRegistry) return;
                        const currentStatus =
                          topic.registry_status as RegistryStatus;
                        const transition = getValidTransitions(
                          currentStatus,
                        ).find((t) => t.to === next);
                        if (transition?.requiresRing) {
                          setPendingTransition({
                            to: next,
                            requiresRing: true,
                          });
                          return;
                        }
                        setEditRegistry(next);
                        if (next !== "On Radar" && editRing) {
                          setEditRing("");
                        }
                      }}
                      style={headerSelectStyle}
                      aria-label="Registry status"
                    >
                      {REGISTRY_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                    title="Public topics appear on the public radar AND in cycle deliverables (radar.json, summary, detailed report, delta document). Private topics are hidden from anonymous readers in every surface — sign in to see them."
                  >
                    Visibility
                    <button
                      type="button"
                      role="switch"
                      aria-checked={editIsPublic}
                      onClick={() => setEditIsPublic((v) => !v)}
                      style={{
                        ...headerSelectStyle,
                        cursor: "pointer",
                        background: editIsPublic
                          ? "rgba(20,140,80,0.55)"
                          : "rgba(0,0,0,0.35)",
                        border: editIsPublic
                          ? "1px solid rgba(120,220,160,0.55)"
                          : "1px solid rgba(255,255,255,0.3)",
                      }}
                    >
                      {editIsPublic ? "🌐 Public" : "🔒 Private"}
                    </button>
                  </label>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 6,
                    fontSize: 11,
                    color: "rgba(255,255,255,0.7)",
                  }}
                >
                  <span>Slug:</span>
                  <code
                    style={{
                      background: "rgba(0,0,0,0.25)",
                      padding: "2px 8px",
                      borderRadius: 6,
                      fontSize: 11,
                      color: "rgba(255,255,255,0.95)",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, monospace",
                    }}
                  >
                    {topic.slug}
                  </code>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}
                  >
                    Aliases:
                  </span>
                  {editAliases.map((a, idx) => (
                    <span
                      key={`${a.id ?? "new"}-${idx}`}
                      style={{
                        background: "rgba(255,255,255,0.18)",
                        color: "rgba(255,255,255,0.95)",
                        fontSize: "11px",
                        padding: "3px 6px 3px 10px",
                        borderRadius: "10px",
                        border: "1px solid rgba(255,255,255,0.2)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {a.name}
                      {a.source && (
                        <span
                          style={{
                            fontSize: 10,
                            color: "rgba(255,255,255,0.7)",
                            fontStyle: "italic",
                            marginLeft: 2,
                          }}
                          title={`Source: ${a.source}`}
                        >
                          ({a.source})
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditAliases((cur) =>
                            cur.filter((_, i) => i !== idx),
                          );
                          if (a.id)
                            setRemovedAliasIds((cur) => [...cur, a.id!]);
                        }}
                        aria-label={`Remove alias ${a.name}`}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "rgba(255,255,255,0.8)",
                          cursor: "pointer",
                          fontSize: 14,
                          lineHeight: 1,
                          padding: 0,
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={newAliasInput}
                    onChange={(e) => setNewAliasInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newAliasInput.trim()) {
                        e.preventDefault();
                        setEditAliases((cur) => [
                          ...cur,
                          { name: newAliasInput.trim() },
                        ]);
                        setNewAliasInput("");
                      }
                    }}
                    placeholder="+ add alias"
                    style={{
                      ...headerSelectStyle,
                      width: 140,
                      padding: "3px 8px",
                    }}
                  />
                </div>
              </>
            ) : (
              <div
                style={{
                  display: "flex",
                  gap: "6px",
                  flexWrap: "wrap",
                  marginTop: "var(--space-1)",
                }}
              >
                {topic.not_for_external_publication && (
                  <span
                    title="Hidden from anonymous readers"
                    style={{
                      background: "rgba(0,0,0,0.35)",
                      color: "rgba(255,255,255,0.95)",
                      fontSize: "11px",
                      padding: "3px 10px",
                      borderRadius: "10px",
                      border: "1px solid rgba(255,255,255,0.25)",
                      fontWeight: "var(--font-weight-bold)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    🔒 Private
                  </span>
                )}
                {segment &&
                  (() => {
                    const theme = themeByKey(segment.theme_key);
                    return (
                      <span
                        style={{
                          background: theme.chipBg,
                          color: theme.chipText,
                          fontSize: "11px",
                          padding: "3px 10px",
                          borderRadius: "10px",
                          border: `1px solid ${theme.sliceStroke}`,
                          fontWeight: "var(--font-weight-medium)",
                        }}
                      >
                        {segment.name}
                      </span>
                    );
                  })()}
                {entry?.movement && entry.movement !== "unchanged" && (
                  <span
                    style={{
                      background: "rgba(255,255,255,0.85)",
                      fontSize: "11px",
                      padding: "3px 10px",
                      borderRadius: "10px",
                      border: "1px solid rgba(255,255,255,0.4)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <MovementIndicator
                      movement={entry.movement}
                      showLabel
                      style={{ fontSize: "11px", gap: 4 }}
                    />
                  </span>
                )}
                {(() => {
                  // Compare against whatever title is currently rendered in
                  // the header — when editing, that's `titleEdit`, not the
                  // original canonical_name.
                  const titleForExclude = editing
                    ? titleEdit
                    : ((nested.topic?.["canonical_name"] as
                        | string
                        | undefined) ?? topic.canonical_name);
                  const excluded = normaliseAlias(titleForExclude);
                  const seen = new Set<string>();
                  return nested.aliases
                    .filter((a) => {
                      const n = normaliseAlias(a.alias_name);
                      if (!n || n === excluded || seen.has(n)) return false;
                      seen.add(n);
                      return true;
                    })
                    .map((a) => (
                      <span
                        key={a.alias_name}
                        style={{
                          fontSize: "11px",
                          padding: "3px 10px",
                          borderRadius: "10px",
                          background: "rgba(255,255,255,0.12)",
                          color: "rgba(255,255,255,0.8)",
                          border: "1px solid rgba(255,255,255,0.18)",
                        }}
                      >
                        {a.alias_name}
                      </span>
                    ));
                })()}
              </div>
            )}
            {saveError && (
              <div
                style={{
                  marginTop: "var(--space-2)",
                  padding: "var(--space-2) var(--space-3)",
                  background: "rgba(255,80,80,0.2)",
                  border: "1px solid rgba(255,200,200,0.4)",
                  borderRadius: "var(--radius-md)",
                  color: "#fff",
                  fontSize: "12px",
                }}
              >
                {saveError}
              </div>
            )}
          </div>

          <div
            style={{
              padding: "var(--space-6) var(--space-8)",
              maxWidth: "1400px",
              margin: "0 auto",
              fontFamily: "var(--font-family)",
            }}
          >
            {editing && factsheets.length > 1 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: "var(--space-4)",
                  padding: "8px 12px",
                  background: "var(--color-page-background)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  fontSize: 12,
                }}
              >
                <label
                  htmlFor="factsheet-version"
                  style={{ color: "var(--color-muted-text)" }}
                >
                  Factsheet version:
                </label>
                <select
                  id="factsheet-version"
                  value={viewingVersion ?? 0}
                  onChange={(e) =>
                    void handleVersionChange(Number(e.target.value))
                  }
                  style={{
                    padding: "3px 6px",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    fontFamily: "var(--font-family)",
                    fontSize: 12,
                  }}
                >
                  <option value={0}>
                    Current (v{factsheets[factsheets.length - 1]?.version ?? 1})
                  </option>
                  {[...factsheets]
                    .reverse()
                    .slice(1)
                    .map((fs) => (
                      <option key={fs.id} value={fs.version}>
                        v{fs.version} — {fs.last_updated}
                      </option>
                    ))}
                </select>
                {viewingVersion !== null && (
                  <span style={{ color: "var(--color-muted-text)" }}>
                    Viewing historical version — saving creates a new current
                    version.
                  </span>
                )}
                {versionLoadError && (
                  <span style={{ color: "var(--color-danger)" }}>
                    {versionLoadError}
                  </span>
                )}
              </div>
            )}
            <TopicView
              detail={nested}
              radarContext={radarContext}
              showHeaderBadges={false}
              showHeroImage={false}
              layout="two-column"
              inlineEdit={inlineEditProps}
              movements={
                movements.length > 0
                  ? (movements as unknown as typeof nested.recent_events)
                  : nested.recent_events
              }
            />
          </div>
        </>
      )}
      {pendingTransition && (
        <RingPlacementDialog
          segments={allSegments}
          requireSegment={false}
          currentSegmentId={topic?.current_segment_id ?? null}
          onConfirm={(ring, segmentId, rationale) => {
            setEditRegistry(pendingTransition.to);
            if (pendingTransition.requiresRing) {
              setEditRing(ring);
              if (segmentId) setEditSegmentId(segmentId);
            } else if (pendingTransition.to !== "On Radar") {
              setEditRing("");
            }
            setTransitionRationale(rationale || null);
            setPendingTransition(null);
          }}
          onCancel={() => setPendingTransition(null)}
        />
      )}
      <Modal
        open={cropperOpen}
        onClose={() => setCropperOpen(false)}
        title="Crop hero image"
      >
        <div style={{ padding: "var(--space-4)" }}>
          <MediaUploader
            onUploaded={(asset) => {
              setPendingHeroImageId(asset.id);
              setCropperOpen(false);
            }}
            onCancel={() => setCropperOpen(false)}
          />
        </div>
      </Modal>
    </Modal>
  );
}
