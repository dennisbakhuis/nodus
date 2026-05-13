/**
 * Radar filter predicates.
 *
 * Pure visibility checks for cells (segment×ring) and individual entries.
 * Unit-testable and reusable by any future radar surface (mini-radars,
 * embeds) without dragging in the full RadarView module.
 */

import type {
  FilterState,
  MovementStatus,
  RadarData,
  RadarEntry,
  RingName,
} from "./types";

export function cellMatchesFilter(
  segName: string,
  ringName: string,
  filters: FilterState,
): boolean {
  if (filters.segments.length > 0 && !filters.segments.includes(segName))
    return false;
  if (filters.rings.length > 0 && !filters.rings.includes(ringName as RingName))
    return false;
  return true;
}

export function isVisible(
  entry: RadarEntry,
  data: RadarData,
  filters: FilterState,
): boolean {
  const seg = data.segments.find((s) => s.id === entry.segment_id);
  const ring = data.rings.find((r) => r.name === entry.ring);
  if (!seg || !ring) return false;
  if (filters.segments.length > 0 && !filters.segments.includes(seg.name))
    return false;
  if (
    filters.rings.length > 0 &&
    !filters.rings.includes(ring.name as RingName)
  )
    return false;
  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    const matchesName = entry.canonical_name.toLowerCase().includes(q);
    const matchesPeer = entry.peer_references.some((pr) =>
      pr.peer_title.toLowerCase().includes(q),
    );
    if (!matchesName && !matchesPeer) return false;
  }
  if ((filters.personIds?.length ?? 0) > 0) {
    const ids = filters.personIds ?? [];
    if (!(entry.persons ?? []).some((link) => ids.includes(link.person.id))) {
      return false;
    }
  }
  return true;
}

export function isVisibleInList(
  entry: RadarEntry,
  data: RadarData,
  filters: FilterState,
): boolean {
  const isCandidate = entry.technology_id == null;
  if (filters.candidatesOnly && !isCandidate) return false;
  if (filters.visibility !== "all") {
    const isPrivate = entry.not_for_external_publication === true;
    if (filters.visibility === "private" && !isPrivate) return false;
    if (filters.visibility === "public" && isPrivate) return false;
  }
  if (
    filters.registryStatuses.length > 0 &&
    entry.registry_status != null &&
    !filters.registryStatuses.includes(
      entry.registry_status as (typeof filters.registryStatuses)[number],
    )
  ) {
    return false;
  }
  if (
    filters.registryStatuses.length > 0 &&
    entry.registry_status == null &&
    !filters.candidatesOnly
  ) {
    return false;
  }
  const seg = data.segments.find((s) => s.id === entry.segment_id);
  const ring = data.rings.find((r) => r.name === entry.ring);
  if (filters.segments.length > 0) {
    if (!seg || !filters.segments.includes(seg.name)) return false;
  }
  if (filters.rings.length > 0) {
    if (!ring || !filters.rings.includes(ring.name as RingName)) return false;
  }
  if (
    filters.movements.length > 0 &&
    !filters.movements.includes(entry.movement as MovementStatus)
  ) {
    return false;
  }
  if (filters.search.trim()) {
    const q = filters.search.toLowerCase();
    const matchesName = entry.canonical_name.toLowerCase().includes(q);
    const matchesPeer = entry.peer_references.some((pr) =>
      pr.peer_title.toLowerCase().includes(q),
    );
    if (!matchesName && !matchesPeer) return false;
  }
  if (filters.strategicRelevance.length > 0) {
    const sr = entry.strategic_relevance;
    if (!sr || !filters.strategicRelevance.includes(sr)) return false;
  }
  if (filters.minTrl != null) {
    if (entry.trl == null || entry.trl < filters.minTrl) return false;
  }
  if (filters.hasFactsheet !== null) {
    const has = !!(entry.summary && entry.summary.trim().length > 0);
    if (filters.hasFactsheet !== has) return false;
  }
  if (filters.hasPeerRefs !== null) {
    const has = (entry.peer_reference_count ?? 0) > 0;
    if (filters.hasPeerRefs !== has) return false;
  }
  if (filters.timeToMainstream.length > 0) {
    if (
      !entry.time_to_mainstream ||
      !filters.timeToMainstream.includes(entry.time_to_mainstream)
    ) {
      return false;
    }
  }
  if ((filters.personIds?.length ?? 0) > 0) {
    const personIds = filters.personIds ?? [];
    const hasMatch = (entry.persons ?? []).some((link) =>
      personIds.includes(link.person.id),
    );
    if (!hasMatch) return false;
  }
  return true;
}

export function applyListFilters(
  entries: RadarEntry[],
  filters: FilterState,
  data: RadarData,
): RadarEntry[] {
  return entries.filter((entry) => isVisibleInList(entry, data, filters));
}
