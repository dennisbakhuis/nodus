import { type CSSProperties } from "react";

export type PersonLinkRole =
  | "Author"
  | "Owner"
  | "SubjectMatterExpert"
  | "Contact"
  | "ProjectLead";

type Props = {
  role: PersonLinkRole;
  style?: CSSProperties;
};

const LABELS: Record<PersonLinkRole, string> = {
  Author: "Author",
  Owner: "Owner",
  SubjectMatterExpert: "SME",
  Contact: "Contact",
  ProjectLead: "Project Lead",
};

const ICON_SIZE = 12;
const ICON_STROKE = "currentColor";
const ICON_STROKE_WIDTH = 1.6;

function Icon({ role }: { role: PersonLinkRole }) {
  const common = {
    width: ICON_SIZE,
    height: ICON_SIZE,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: ICON_STROKE,
    strokeWidth: ICON_STROKE_WIDTH,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (role) {
    case "Author":
      return (
        <svg {...common}>
          <path d="M2 14 L11 5 L13 7 L4 16 Z" />
          <path d="M11 5 L13 3 L15 5 L13 7" />
        </svg>
      );
    case "Owner":
      return (
        <svg {...common}>
          <path d="M3 6 L8 2 L13 6 L13 13 L9 13 L9 9 L7 9 L7 13 L3 13 Z" />
        </svg>
      );
    case "SubjectMatterExpert":
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="4" />
          <path d="M10 10 L14 14" />
        </svg>
      );
    case "Contact":
      return (
        <svg {...common}>
          <circle cx="8" cy="5" r="3" />
          <path d="M2 14 C 2 10 14 10 14 14" />
        </svg>
      );
    case "ProjectLead":
      return (
        <svg {...common}>
          <path d="M3 14 L3 2 L11 5 L3 8" />
        </svg>
      );
  }
}

export function RoleChip({ role, style }: Props) {
  return (
    <span
      data-role={role}
      aria-label={`Role: ${LABELS[role]}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        padding: "2px var(--space-2)",
        borderRadius: "var(--radius-full)",
        fontSize: "var(--font-size-xs)",
        fontWeight: "var(--font-weight-medium)",
        lineHeight: 1.4,
        backgroundColor: "var(--color-hover-bg)",
        color: "var(--color-dark-text)",
        border: "1px solid var(--color-border)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <Icon role={role} />
      {LABELS[role]}
    </span>
  );
}
