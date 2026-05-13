import type { CSSProperties } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  source: string;
};

const styles: Record<string, CSSProperties> = {
  h1: {
    fontSize: "var(--font-size-lg)",
    fontWeight: "var(--font-weight-bold)",
    color: "var(--color-brand-dark-blue)",
    margin: "0 0 var(--space-3) 0",
    lineHeight: 1.25,
  },
  h2: {
    fontSize: "var(--font-size-md)",
    fontWeight: "var(--font-weight-bold)",
    color: "var(--color-brand-dark-blue)",
    margin: "var(--space-5) 0 var(--space-2) 0",
    lineHeight: 1.3,
  },
  h3: {
    fontSize: "var(--font-size-body)",
    fontWeight: "var(--font-weight-bold)",
    color: "var(--color-text-primary, #1a1a1a)",
    margin: "var(--space-4) 0 var(--space-2) 0",
  },
  p: {
    fontSize: "var(--font-size-body)",
    lineHeight: 1.55,
    margin: "0 0 var(--space-3) 0",
    color: "var(--color-text-primary, #1a1a1a)",
  },
  ul: {
    margin: "0 0 var(--space-3) 0",
    paddingLeft: "var(--space-5)",
  },
  ol: {
    margin: "0 0 var(--space-3) 0",
    paddingLeft: "var(--space-5)",
  },
  li: {
    fontSize: "var(--font-size-body)",
    lineHeight: 1.55,
    marginBottom: "var(--space-1)",
  },
  a: {
    color: "var(--color-brand-dark-blue)",
    textDecoration: "underline",
  },
  code: {
    backgroundColor: "rgba(0,0,0,0.06)",
    borderRadius: "var(--radius-sm, 4px)",
    padding: "1px 6px",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: "0.92em",
  },
  pre: {
    backgroundColor: "rgba(0,0,0,0.04)",
    border: "1px solid var(--color-border, #e5e5e5)",
    borderRadius: "var(--radius-md)",
    padding: "var(--space-3)",
    overflowX: "auto",
    margin: "0 0 var(--space-3) 0",
    fontSize: "0.9em",
    lineHeight: 1.5,
  },
  blockquote: {
    margin: "0 0 var(--space-3) 0",
    padding: "var(--space-2) var(--space-4)",
    borderLeft: "4px solid var(--color-brand-orange)",
    backgroundColor: "rgba(0,0,0,0.03)",
    color: "var(--color-text-secondary, #555)",
  },
  img: {
    maxWidth: "100%",
    height: "auto",
    display: "block",
    margin: "var(--space-3) 0",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border, #e5e5e5)",
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
    margin: "var(--space-5) 0",
  },
};

const components: Components = {
  h1: ({ children }) => <h1 style={styles.h1}>{children}</h1>,
  h2: ({ children }) => <h2 style={styles.h2}>{children}</h2>,
  h3: ({ children }) => <h3 style={styles.h3}>{children}</h3>,
  p: ({ children }) => <p style={styles.p}>{children}</p>,
  ul: ({ children }) => <ul style={styles.ul}>{children}</ul>,
  ol: ({ children }) => <ol style={styles.ol}>{children}</ol>,
  li: ({ children }) => <li style={styles.li}>{children}</li>,
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
  pre: ({ children }) => <pre style={styles.pre}>{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote style={styles.blockquote}>{children}</blockquote>
  ),
  img: ({ src, alt }) => (
    <img src={src} alt={alt ?? ""} loading="lazy" style={styles.img} />
  ),
  table: ({ children }) => <table style={styles.table}>{children}</table>,
  th: ({ children }) => <th style={styles.th}>{children}</th>,
  td: ({ children }) => <td style={styles.td}>{children}</td>,
  hr: () => <hr style={styles.hr} />,
};

export function HelpMarkdown({ source }: Props) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {source}
    </ReactMarkdown>
  );
}
