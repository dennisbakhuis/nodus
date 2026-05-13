type PersonPublic = {
  id: string;
  full_name: string;
  company: string;
  department: string | null;
  role: string | null;
};

type Props = {
  person: PersonPublic;
  linkRole: string;
};

const ROLE_LABELS: Record<string, string> = {
  Author: "Author",
  Owner: "Owner",
  SubjectMatterExpert: "SME",
  Contact: "Contact",
  ProjectLead: "Project Lead",
};

const ROLE_COLORS: Record<string, string> = {
  Author: "var(--color-brand-dark-blue)",
  Owner: "var(--color-brand-orange)",
  SubjectMatterExpert: "var(--color-brand-green)",
  Contact: "var(--color-brand-bright-blue)",
  ProjectLead: "var(--color-segment-4)",
};

export function PersonChip({ person, linkRole }: Props) {
  const roleLabel = ROLE_LABELS[linkRole] ?? linkRole;
  const roleColor = ROLE_COLORS[linkRole] ?? "var(--color-muted-text)";

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: "2px",
        background: "var(--color-page-background)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-2) var(--space-3)",
        minWidth: 0,
        maxWidth: "100%",
      }}
      data-testid="person-chip"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: "var(--font-size-xs)",
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-dark-text)",
            lineHeight: 1.3,
          }}
          data-testid="person-chip-name"
        >
          {person.full_name}
        </span>
        <span
          style={{
            fontSize: "var(--font-size-xs)",
            color: "var(--color-white)",
            background: roleColor,
            borderRadius: "var(--radius-full)",
            padding: "1px 6px",
            fontWeight: "var(--font-weight-medium)",
            whiteSpace: "nowrap",
          }}
          data-testid="person-chip-role"
        >
          {roleLabel}
        </span>
      </div>
      <div
        style={{
          fontSize: "var(--font-size-xs)",
          color: "var(--color-muted-text)",
          lineHeight: 1.3,
        }}
        data-testid="person-chip-company"
      >
        {person.company}
        {person.department ? ` · ${person.department}` : ""}
      </div>
    </div>
  );
}
