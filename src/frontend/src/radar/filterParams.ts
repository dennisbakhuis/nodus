/**
 * Filter state <-> URL search-param serialisation.
 *
 * The URL is the canonical store for filter state, so every surface that shows
 * the whole registry shares one encoding: a link copied out of the list opens
 * the same selection in the tree. Extracted from ListPage, which was its only
 * caller until the tree view arrived.
 */

import type {
  FilterState,
  MovementStatus,
  RegistryStatusName,
  RingName,
} from "./types";

/** Every registry status, for callers that must see the whole population. */
export const ALL_REGISTRY_STATUSES: RegistryStatusName[] = [
  "On Radar",
  "Backlog",
  "Archive",
];

const DEFAULT_LIST_REGISTRY_STATUSES: RegistryStatusName[] = ["On Radar"];
const REGISTRY_STATUS_VALUES = ALL_REGISTRY_STATUSES;

export function filtersFromParams(
  params: URLSearchParams,
  isWriter: boolean,
): FilterState {
  const segments = params.getAll("segment");
  const rings = params.getAll("ring") as RingName[];
  const movements = params.getAll("movement") as MovementStatus[];
  const search = params.get("search") ?? "";
  const strategicRelevance = params.getAll("sr");
  const minTrlRaw = params.get("min_trl");
  const minTrl = minTrlRaw ? Number(minTrlRaw) : null;
  const maxTrlRaw = params.get("max_trl");
  const maxTrl = maxTrlRaw ? Number(maxTrlRaw) : null;
  const rawStatuses = params.getAll("status") as RegistryStatusName[];
  const registryStatuses = rawStatuses.filter((s) =>
    REGISTRY_STATUS_VALUES.includes(s),
  );
  const hasFactsheetParam = params.get("has_factsheet");
  const hasPeerParam = params.get("has_peer_refs");
  const ttmParam = params.getAll("ttm");
  const personIds = params.getAll("person");
  const visParam = params.get("vis");
  return {
    segments,
    rings,
    movements,
    search,
    strategicRelevance,
    minTrl: minTrl != null && Number.isFinite(minTrl) ? minTrl : null,
    maxTrl: maxTrl != null && Number.isFinite(maxTrl) ? maxTrl : null,
    registryStatuses:
      registryStatuses.length > 0
        ? registryStatuses
        : DEFAULT_LIST_REGISTRY_STATUSES,
    hasFactsheet:
      hasFactsheetParam === "1"
        ? true
        : hasFactsheetParam === "0"
          ? false
          : null,
    hasPeerRefs:
      hasPeerParam === "1" ? true : hasPeerParam === "0" ? false : null,
    timeToMainstream: ttmParam,
    personIds,
    visibility:
      visParam === "private"
        ? "private"
        : visParam === "all"
          ? "all"
          : isWriter
            ? "public"
            : "all",
    groupId: params.get("group"),
  };
}

export function filtersToParams(filters: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  filters.segments.forEach((s) => p.append("segment", s));
  filters.rings.forEach((r) => p.append("ring", r));
  filters.movements.forEach((m) => p.append("movement", m));
  if (filters.search) p.set("search", filters.search);
  filters.strategicRelevance.forEach((s) => p.append("sr", s));
  if (filters.minTrl != null) p.set("min_trl", String(filters.minTrl));
  if (filters.maxTrl != null) p.set("max_trl", String(filters.maxTrl));
  filters.registryStatuses.forEach((s) => p.append("status", s));
  if (filters.hasFactsheet === true) p.set("has_factsheet", "1");
  if (filters.hasFactsheet === false) p.set("has_factsheet", "0");
  if (filters.hasPeerRefs === true) p.set("has_peer_refs", "1");
  if (filters.hasPeerRefs === false) p.set("has_peer_refs", "0");
  filters.timeToMainstream.forEach((t) => p.append("ttm", t));
  filters.personIds.forEach((id) => p.append("person", id));
  if (filters.visibility === "private") p.set("vis", "private");
  else if (filters.visibility === "all") p.set("vis", "all");
  if (filters.groupId) p.set("group", filters.groupId);
  return p;
}
