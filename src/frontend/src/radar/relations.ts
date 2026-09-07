/**
 * Radar relation styling helpers.
 *
 * The API emits relation_type as snake_case ("drives", "driven_by",
 * "relates_to", "hindered_by"). Inverse forms (driven_by / hindered_by)
 * describe the same connection from the other side, so they share a
 * category for styling. The normaliser below tolerates either form.
 */

import { RELATION_STROKES, type RelationCategory } from "./encodings";

export function relationCategory(type: string): RelationCategory | null {
  const t = type.toLowerCase().replace(/[_\s]/g, "");
  if (t === "drives" || t === "drivenby") return "drives";
  if (t === "relatesto") return "relates_to";
  if (t === "hinders" || t === "hinderedby") return "hinders";
  return null;
}

export function relationStroke(type: string) {
  const cat = relationCategory(type);
  return cat
    ? RELATION_STROKES[cat]
    : { color: "var(--color-muted-text)", dash: "4,3", label: type };
}

/**
 * Direction-aware relation labelling.
 *
 * The five stored relation types collapse into five display buckets once the
 * edge direction relative to the current topic is known: an incoming `drives`
 * edge reads as "Driven By" from the other side. Extracted from TopicView so
 * the tree view labels edges identically to the detail panel.
 */

export type RelationGroupKey =
  | "Drives"
  | "Driven By"
  | "Relates To"
  | "Hinders"
  | "Hindered By";

export const RELATION_GROUP_ORDER: RelationGroupKey[] = [
  "Drives",
  "Driven By",
  "Relates To",
  "Hinders",
  "Hindered By",
];

export const RELATION_GROUP_COLORS: Record<RelationGroupKey, string> = {
  Drives: "var(--color-brand-dark-blue)",
  "Driven By": "var(--color-brand-dark-blue)",
  "Relates To": "var(--color-brand-orange)",
  Hinders: "#c0392b",
  "Hindered By": "#c0392b",
};

export function relationGroupLabel(
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
