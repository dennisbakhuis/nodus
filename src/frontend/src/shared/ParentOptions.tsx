/**
 * Shared helpers for the "parent group" <select> used when linking a topic to
 * a parent. Options are split into three native <optgroup> sections so it's
 * obvious what each parent is:
 *   - Groups            — pure labels (a Topic with no Technology)
 *   - Technology groups — technologies that are also a parent of something
 *   - Technologies      — technologies that aren't a parent yet
 */

import type { TopicRead } from "../manage/types";

export type ParentOptionKind = "group" | "techGroup" | "tech";

export type ParentOption = { id: string; label: string; kind: ParentOptionKind };

/**
 * Build sorted parent options. A topic with no ``technology_id`` is a label
 * ("group"); a technology that some other topic points at (``parent_topic_id``)
 * is a "techGroup"; the rest are plain technologies.
 */
export function topicsToParentOptions(
  topics: TopicRead[],
  excludeId?: string,
): ParentOption[] {
  const parentIds = new Set(
    topics
      .map((t) => t.parent_topic_id)
      .filter((id): id is string => id != null),
  );
  return topics
    .filter((t) => t.id !== excludeId)
    .map((t) => {
      const isTech = t.technology_id != null;
      const kind: ParentOptionKind = !isTech
        ? "group"
        : parentIds.has(t.id)
          ? "techGroup"
          : "tech";
      return { id: t.id, label: t.canonical_name, kind };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Renders the <option>/<optgroup> children to place inside a parent <select>. */
export function ParentOptionGroups({
  options,
  noneLabel = "— None —",
}: {
  options: ParentOption[];
  noneLabel?: string;
}) {
  const sections: { label: string; kind: ParentOptionKind }[] = [
    { label: "Groups", kind: "group" },
    { label: "Technology groups", kind: "techGroup" },
    { label: "Technologies", kind: "tech" },
  ];
  return (
    <>
      <option value="">{noneLabel}</option>
      {sections.map(({ label, kind }) => {
        const items = options.filter((o) => o.kind === kind);
        if (items.length === 0) return null;
        return (
          <optgroup key={kind} label={label}>
            {items.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}
