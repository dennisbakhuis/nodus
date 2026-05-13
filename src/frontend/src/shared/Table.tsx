import { type CSSProperties, type ReactNode, useState } from "react";

type SortDirection = "asc" | "desc";

type Column<T> = {
  key: string;
  header: string;
  sortable?: boolean;
  render: (row: T) => ReactNode;
  width?: string;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  caption?: string;
  style?: CSSProperties;
};

export function Table<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  emptyMessage = "No data",
  caption,
  style,
}: Props<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div
      style={{
        overflowX: "auto",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--color-border)",
        boxShadow: "var(--shadow-sm)",
        ...style,
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "var(--font-size-body)",
        }}
        role="grid"
      >
        {caption != null && (
          <caption
            style={{
              textAlign: "left",
              padding: "var(--space-3) var(--space-4)",
              fontSize: "var(--font-size-md)",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-brand-dark-blue)",
            }}
          >
            {caption}
          </caption>
        )}
        <thead>
          <tr
            style={{
              backgroundColor: "var(--color-brand-dark-blue)",
              color: "var(--color-white)",
            }}
          >
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                aria-sort={
                  col.sortable
                    ? sortKey === col.key
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                    : undefined
                }
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
                style={{
                  padding: "var(--space-3) var(--space-4)",
                  textAlign: "left",
                  fontWeight: "var(--font-weight-bold)",
                  fontSize: "var(--font-size-sm)",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  cursor: col.sortable ? "pointer" : "default",
                  userSelect: "none",
                  whiteSpace: "nowrap",
                  width: col.width,
                  borderBottom: "2px solid rgba(255,255,255,0.2)",
                }}
                tabIndex={col.sortable ? 0 : undefined}
                onKeyDown={
                  col.sortable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSort(col.key);
                        }
                      }
                    : undefined
                }
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--space-1)",
                  }}
                >
                  {col.header}
                  {col.sortable && (
                    <span
                      aria-hidden="true"
                      style={{ opacity: sortKey === col.key ? 1 : 0.4 }}
                    >
                      {sortKey === col.key && sortDir === "desc" ? "↓" : "↑"}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  padding: "var(--space-8)",
                  textAlign: "center",
                  color: "var(--color-muted-text)",
                  fontSize: "var(--font-size-body)",
                }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr
                key={getRowKey(row)}
                onClick={onRowClick != null ? () => onRowClick(row) : undefined}
                role={onRowClick != null ? "button" : undefined}
                tabIndex={onRowClick != null ? 0 : undefined}
                onKeyDown={
                  onRowClick != null
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                style={{
                  backgroundColor:
                    idx % 2 === 0
                      ? "var(--color-white)"
                      : "var(--color-page-background)",
                  cursor: onRowClick != null ? "pointer" : "default",
                  transition: "background-color var(--transition-fast)",
                }}
                onMouseEnter={
                  onRowClick != null
                    ? (e) => {
                        (
                          e.currentTarget as HTMLTableRowElement
                        ).style.backgroundColor = "var(--color-hover-bg)";
                      }
                    : undefined
                }
                onMouseLeave={
                  onRowClick != null
                    ? (e) => {
                        (
                          e.currentTarget as HTMLTableRowElement
                        ).style.backgroundColor =
                          idx % 2 === 0
                            ? "var(--color-white)"
                            : "var(--color-page-background)";
                      }
                    : undefined
                }
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: "var(--space-3) var(--space-4)",
                      borderBottom: "1px solid var(--color-border)",
                      fontSize: "var(--font-size-body)",
                      color: "var(--color-dark-text)",
                      verticalAlign: "middle",
                    }}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
