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
