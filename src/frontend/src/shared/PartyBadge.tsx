import { type CSSProperties } from "react";

type Props = {
  name: string;
  slug: string;
  size?: "sm" | "md";
  style?: CSSProperties;
};

const TINTS: ReadonlyArray<{ bg: string; fg: string }> = [
  { bg: "var(--color-brand-dark-blue)", fg: "var(--color-white)" },
  { bg: "var(--color-brand-bright-blue)", fg: "var(--color-white)" },
  { bg: "var(--color-ring-adopt)", fg: "var(--color-white)" },
  { bg: "var(--color-ring-watch)", fg: "var(--color-white)" },
  { bg: "var(--color-ring-assess)", fg: "var(--color-dark-text)" },
  { bg: "var(--color-hover-bg)", fg: "var(--color-dark-text)" },
];

function tintFor(slug: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) {
    hash = (hash * 31 + slug.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % TINTS.length;
  return TINTS[index]!;
}

export function PartyBadge({ name, slug, size = "md", style }: Props) {
  const { bg, fg } = tintFor(slug);
  const padding = size === "sm" ? "1px var(--space-2)" : "2px var(--space-3)";
  const fontSize =
    size === "sm" ? "var(--font-size-xs)" : "var(--font-size-sm)";
  return (
    <span
      data-slug={slug}
      aria-label={`Party: ${name}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding,
        borderRadius: "var(--radius-full)",
        fontSize,
        fontWeight: "var(--font-weight-medium)",
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        backgroundColor: bg,
        color: fg,
        ...style,
      }}
    >
      {name}
    </span>
  );
}
