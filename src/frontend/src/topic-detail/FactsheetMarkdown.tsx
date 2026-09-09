import type { CSSProperties } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

type Props = {
  source: string;
};

/** Body copy styled to match the plain-text rendering this replaced. */
const body: CSSProperties = {
  fontSize: "var(--font-size-body)",
  lineHeight: 1.6,
  color: "var(--color-dark-text)",
  margin: "0 0 var(--space-3) 0",
};

const styles: Record<string, CSSProperties> = {
  p: body,
  ul: { margin: "0 0 var(--space-3) 0", paddingLeft: "var(--space-5)" },
  ol: { margin: "0 0 var(--space-3) 0", paddingLeft: "var(--space-5)" },
  li: { ...body, margin: "0 0 var(--space-1) 0" },
  strong: { fontWeight: "var(--font-weight-bold)" },
  a: { color: "var(--color-brand-dark-blue)", textDecoration: "underline" },
  code: {
    backgroundColor: "rgba(0,0,0,0.06)",
    borderRadius: "var(--radius-sm, 4px)",
    padding: "1px 6px",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: "0.92em",
  },
  blockquote: {
    margin: "0 0 var(--space-3) 0",
    padding: "var(--space-2) var(--space-4)",
    borderLeft: "3px solid var(--color-brand-orange)",
    color: "var(--color-muted-text)",
  },
  heading: {
    fontSize: "var(--font-size-body)",
    fontWeight: "var(--font-weight-bold)",
    color: "var(--color-dark-text)",
    margin: "var(--space-3) 0 var(--space-1) 0",
  },
  table: {
    borderCollapse: "collapse",
    width: "100%",
    margin: "0 0 var(--space-3) 0",
    fontSize: "var(--font-size-sm)",
  },
  th: {
    textAlign: "left",
    padding: "var(--space-2)",
    borderBottom: "2px solid var(--color-border, #e5e5e5)",
    fontWeight: "var(--font-weight-bold)",
  },
  td: {
    padding: "var(--space-2)",
    borderBottom: "1px solid var(--color-border, #e5e5e5)",
    verticalAlign: "top",
  },
  hr: {
    border: "none",
    borderTop: "1px solid var(--color-border, #e5e5e5)",
    margin: "var(--space-4) 0",
  },
};

const components: Components = {
  p: ({ children }) => <p style={styles.p}>{children}</p>,
  ul: ({ children }) => <ul style={styles.ul}>{children}</ul>,
  ol: ({ children }) => <ol style={styles.ol}>{children}</ol>,
  li: ({ children }) => <li style={styles.li}>{children}</li>,
  strong: ({ children }) => <strong style={styles.strong}>{children}</strong>,
  a: ({ href, children }) => (
    <a
      href={href}
      style={styles.a}
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
    >
      {children}
    </a>
  ),
  code: ({ children }) => <code style={styles.code}>{children}</code>,
  blockquote: ({ children }) => (
    <blockquote style={styles.blockquote}>{children}</blockquote>
  ),
  // Curators write field-level prose, not documents, so every heading level
  // renders at body weight rather than growing the page's heading hierarchy.
  h1: ({ children }) => <p style={styles.heading}>{children}</p>,
  h2: ({ children }) => <p style={styles.heading}>{children}</p>,
  h3: ({ children }) => <p style={styles.heading}>{children}</p>,
  h4: ({ children }) => <p style={styles.heading}>{children}</p>,
  h5: ({ children }) => <p style={styles.heading}>{children}</p>,
  h6: ({ children }) => <p style={styles.heading}>{children}</p>,
  table: ({ children }) => <table style={styles.table}>{children}</table>,
  th: ({ children }) => <th style={styles.th}>{children}</th>,
  td: ({ children }) => <td style={styles.td}>{children}</td>,
  hr: () => <hr style={styles.hr} />,
  // Factsheet prose is typed by curators, not authored as a document; an
  // embedded remote image would be an unreviewed external request, so the
  // alt text is shown instead.
  img: ({ alt }) => <span style={styles.p}>{alt ?? ""}</span>,
};

/**
 * Render a factsheet text field as Markdown.
 *
 * `remarkBreaks` is deliberate: these fields were plain text rendered with
 * `white-space: pre-wrap`, so existing content relies on single newlines being
 * visible line breaks. Standard Markdown would reflow those into one paragraph
 * and silently reformat every factsheet written so far.
 */
export function FactsheetMarkdown({ source }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={components}
    >
      {source}
    </ReactMarkdown>
  );
}
