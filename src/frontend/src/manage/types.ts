import type {
  TechnologyRead,
  TechnologyUpdate,
  AliasRead,
  AliasCreate,
  FactsheetRead,
  FactsheetCreate,
  AssessmentCreate,
  MovementEventRead,
  CycleRead,
  CycleCreate,
  CycleUpdate,
  CycleCloseRequest,
  RegistryStatus,
  Ring,
  ScoreHml as ScoreHML,
  ImpactPotential,
  TimeToMainstream,
  TaxCreditCandidate,
  PersonLinkRole,
  TopicRead,
  TopicCreate,
  TopicUpdate,
  TopicCreateResponse,
  TopicCandidate,
  PersonReadManagement,
  PersonCreate,
  PersonUpdate,
  TopicPersonLinkCreate,
  TopicPersonLinkManagementRead,
  PeerReferenceRead,
  PeerReferenceCreate,
  PeerReferenceUpdate,
  PeerReferenceUrlRead,
  PeerReferenceUrlCreate,
  MediaAssetRead,
  InitiativeRead,
  InitiativeCreate,
  InitiativeUpdate,
  InitiativeStatus,
} from "../api/generated/types.gen";

export type {
  TechnologyRead,
  TechnologyUpdate,
  AliasRead,
  AliasCreate,
  FactsheetRead,
  FactsheetCreate,
  AssessmentCreate,
  MovementEventRead,
  CycleRead,
  CycleCreate,
  CycleUpdate,
  CycleCloseRequest,
  RegistryStatus,
  Ring,
  ScoreHML,
  ImpactPotential,
  TimeToMainstream,
  TaxCreditCandidate,
  PersonLinkRole,
  TopicRead,
  TopicCreate,
  TopicUpdate,
  TopicCreateResponse,
  TopicCandidate,
  PersonReadManagement,
  PersonCreate,
  PersonUpdate,
  TopicPersonLinkCreate,
  TopicPersonLinkManagementRead,
  PeerReferenceRead,
  PeerReferenceCreate,
  PeerReferenceUpdate,
  PeerReferenceUrlRead,
  PeerReferenceUrlCreate,
  MediaAssetRead,
  InitiativeRead,
  InitiativeCreate,
  InitiativeUpdate,
  InitiativeStatus,
};

export const INITIATIVE_STATUSES: InitiativeStatus[] = [
  "Idea",
  "Scoping",
  "Pilot",
  "InProduction",
  "Paused",
  "Dropped",
];

export const INITIATIVE_STATUS_DISPLAY: Record<InitiativeStatus, string> = {
  Idea: "Idea",
  Scoping: "Scoping",
  Pilot: "Pilot",
  InProduction: "In Production",
  Paused: "Paused",
  Dropped: "Dropped",
};

export type Segment = {
  id: string;
  name: string;
  slug: string;
  display_order: number;
  is_active: boolean;
  theme_key: string;
};

export type SegmentAdmin = Segment & {
  usage_count: number;
};

export type SegmentCreatePayload = {
  name: string;
  slug: string;
  theme_key: string;
  display_order?: number;
  is_active?: boolean;
};

export type SegmentUpdatePayload = {
  name?: string;
  slug?: string;
  display_order?: number;
  is_active?: boolean;
  theme_key?: string;
};

export type TopicDetail = {
  id: string;
  canonical_name: string;
  slug: string;
  not_for_external_publication: boolean;
  created_at: string;
  technology_id?: string | null;
  registry_status?: string | null;
  current_ring?: string | null;
  current_segment_id?: string | null;
  aliases: AliasRead[];
  technology?: TechnologyRead | null;
  factsheet?: FactsheetRead | null;
  recent_events?: MovementEventRead[];
  peer_references?: PeerReferenceRead[];
  persons?: TopicPersonLinkManagementRead[];
  hero_image_id?: string | null;
};

export type DeliverableType =
  | "radar.json"
  | "summary.md"
  | "detailed.md"
  | "delta.md";

export const REGISTRY_STATUS_DISPLAY: Record<RegistryStatus, string> = {
  "On Radar": "On Radar",
  Backlog: "Backlog",
  Archive: "Archive",
};

export const RING_VALUES: Ring[] = ["Invest", "Pilot", "Explore", "Monitor"];

export const REGISTRY_STATUSES: RegistryStatus[] = [
  "On Radar",
  "Backlog",
  "Archive",
];

export const PERSON_LINK_ROLE_DISPLAY: Record<PersonLinkRole, string> = {
  Author: "Author",
  Owner: "Owner",
  SubjectMatterExpert: "Subject Matter Expert",
  Contact: "Contact",
  ProjectLead: "Project Lead",
};

export const PERSON_LINK_ROLES: PersonLinkRole[] = [
  "Author",
  "Owner",
  "SubjectMatterExpert",
  "Contact",
  "ProjectLead",
];

export type StatusTransition = {
  from: RegistryStatus;
  to: RegistryStatus;
  label: string;
  requiresRing: boolean;
  requiresRationale: boolean;
};

export const VALID_TRANSITIONS: StatusTransition[] = [
  {
    from: "Backlog",
    to: "On Radar",
    label: "Place on Radar",
    requiresRing: true,
    requiresRationale: true,
  },
  {
    from: "Backlog",
    to: "Archive",
    label: "Archive",
    requiresRing: false,
    requiresRationale: true,
  },
  {
    from: "On Radar",
    to: "Archive",
    label: "Archive",
    requiresRing: false,
    requiresRationale: true,
  },
  {
    from: "Archive",
    to: "Backlog",
    label: "Reactivate to Backlog",
    requiresRing: false,
    requiresRationale: true,
  },
  {
    from: "Archive",
    to: "On Radar",
    label: "Reactivate to Radar",
    requiresRing: true,
    requiresRationale: true,
  },
];

export function getValidTransitions(
  currentStatus: RegistryStatus,
): StatusTransition[] {
  return VALID_TRANSITIONS.filter((t) => t.from === currentStatus);
}
