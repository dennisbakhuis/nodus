import { useEffect, useRef, useState } from "react";
import { Button } from "../shared/Button";
import type { RadarData, RadarEntry } from "./types";
import { csvFilename, entriesToCsv } from "./dataExport/csv";
import {
  entriesToWorkbook,
  workbookToBlob,
  xlsxFilename,
} from "./dataExport/xlsx";
import { fullExportFilename, fullExportJson } from "./dataExport/jsonFull";
import {
  buildPeerRefExport,
  peerRefExportFilename,
  peerRefExportJson,
  type PeerRefExportSource,
} from "./dataExport/jsonPeerRef";
import { PeerRefShareModal } from "./PeerRefShareModal";
import { getSetting } from "../api/settings";

type Variant = "sidebar" | "header";

type Props = {
  data: RadarData;
  filteredEntries: RadarEntry[];
  /** Optional hand-picked rows. When non-empty, takes priority over
   * ``filteredEntries`` so the user can cherry-pick across filter changes. */
  selectedEntries?: RadarEntry[];
  variant?: Variant;
};

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function downloadText(text: string, name: string, mime: string): void {
  downloadBlob(new Blob([text], { type: mime }), name);
}

export function DataExportMenu({
  data,
  filteredEntries,
  selectedEntries,
  variant = "sidebar",
}: Props) {
  const exportRows =
    selectedEntries && selectedEntries.length > 0
      ? selectedEntries
      : filteredEntries;
  const isUsingSelection = !!selectedEntries && selectedEntries.length > 0;
  const buttonLabel = isUsingSelection
    ? `↓ Export (${exportRows.length} selected)`
    : `↓ Export (${exportRows.length})`;

  const [open, setOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [privateDropPreview, setPrivateDropPreview] = useState<number | null>(
    null,
  );
  const [orgDefaults, setOrgDefaults] = useState<{
    name: string;
    slug: string;
    url: string;
  }>({ name: "", slug: "", url: "" });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getSetting("org.name").catch(() => ({ key: "org.name", value: "" })),
      getSetting("org.slug").catch(() => ({ key: "org.slug", value: "" })),
      getSetting("org.url").catch(() => ({ key: "org.url", value: "" })),
    ]).then(([name, slug, url]) => {
      if (cancelled) return;
      setOrgDefaults({ name: name.value, slug: slug.value, url: url.value });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function exportCsv() {
    downloadText(
      entriesToCsv(exportRows),
      csvFilename(data),
      "text/csv;charset=utf-8",
    );
    setOpen(false);
  }

  function exportXlsx() {
    const wb = entriesToWorkbook(
      exportRows,
      data.radar.title,
      data.radar.cycle,
    );
    downloadBlob(workbookToBlob(wb), xlsxFilename(data));
    setOpen(false);
  }

  function exportFullJson() {
    downloadText(
      fullExportJson(data, exportRows),
      fullExportFilename(data),
      "application/json;charset=utf-8",
    );
    setOpen(false);
  }

  function openShareDialog() {
    const privateCount = exportRows.filter(
      (e) => e.not_for_external_publication === true,
    ).length;
    setPrivateDropPreview(privateCount);
    setShareOpen(true);
    setOpen(false);
  }

  function confirmPeerRefExport(source: PeerRefExportSource) {
    const { envelope } = buildPeerRefExport(data, exportRows, source);
    downloadText(
      peerRefExportJson(envelope),
      peerRefExportFilename(data),
      "application/json;charset=utf-8",
    );
    setShareOpen(false);
  }

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", fontFamily: "var(--font-family)" }}
    >
      <ToolbarButton
        onClick={() => setOpen((o) => !o)}
        active={open}
        aria-haspopup="menu"
        aria-expanded={open}
        title={
          isUsingSelection
            ? `Export ${exportRows.length} selected row${exportRows.length === 1 ? "" : "s"}`
            : `Export ${exportRows.length} filtered row${exportRows.length === 1 ? "" : "s"}`
        }
        variant={variant}
      >
        {buttonLabel}
      </ToolbarButton>

      {open && (
        <ul
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            background: "var(--color-white)",
            color: "var(--color-dark-text)",
            border: "1px solid var(--color-ring-boundary)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-md)",
            margin: 0,
            padding: "var(--space-1) 0",
            listStyle: "none",
            zIndex: 200,
            minWidth: 240,
          }}
        >
          <MenuItem
            onClick={exportCsv}
            hint="Flat spreadsheet, opens in Excel/Numbers"
          >
            Spreadsheet (CSV)
          </MenuItem>
          <MenuItem
            onClick={exportXlsx}
            hint="Excel workbook with peer-references sheet"
          >
            Spreadsheet (Excel)
          </MenuItem>
          <MenuItem
            onClick={exportFullJson}
            hint="Complete structure including nested data"
          >
            Full data (JSON)
          </MenuItem>
          <MenuItem
            onClick={openShareDialog}
            hint="Import on another Nodus instance as peer references"
          >
            Peer reference share (JSON)…
          </MenuItem>
        </ul>
      )}
      <PeerRefShareModal
        open={shareOpen}
        droppedPrivateCount={privateDropPreview}
        onCancel={() => setShareOpen(false)}
        onConfirm={confirmPeerRefExport}
        initial={{
          party_name: orgDefaults.name || data.radar.title || "",
          party_slug: orgDefaults.slug || null,
          party_url: orgDefaults.url || null,
          source_name: `${(
            orgDefaults.slug ||
            orgDefaults.name ||
            data.radar.title ||
            "nodus"
          )
            .toLowerCase()
            .replace(/\s+/g, "-")}-${data.radar.cycle || "current"}`,
        }}
      />
    </div>
  );
}

function MenuItem({
  onClick,
  children,
  hint,
}: {
  onClick: () => void;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <li role="none">
      <button
        role="menuitem"
        onClick={onClick}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 2,
          width: "100%",
          textAlign: "left",
          background: "none",
          border: "none",
          padding: "var(--space-2) var(--space-3)",
          cursor: "pointer",
          fontSize: "13px",
          fontFamily: "var(--font-family)",
          color: "var(--color-dark-text)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            "var(--color-page-background)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "none";
        }}
      >
        <span>{children}</span>
        {hint && (
          <span style={{ fontSize: "10px", color: "var(--color-muted-text)" }}>
            {hint}
          </span>
        )}
      </button>
    </li>
  );
}

function ToolbarButton({
  onClick,
  active,
  children,
  title,
  disabled,
  variant = "sidebar",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  variant?: Variant;
}) {
  if (variant === "header") {
    return (
      <Button
        variant="header"
        size="xs"
        active={active}
        onClick={onClick}
        title={title}
        disabled={disabled}
        {...rest}
      >
        {children}
      </Button>
    );
  }
  const sidebarStyle: React.CSSProperties = {
    background: active ? "var(--color-active-filter)" : "var(--color-white)",
    color: active ? "var(--color-white)" : "var(--color-dark-text)",
    border: "1px solid var(--color-ring-boundary)",
    borderRadius: "4px",
    padding: "5px 10px",
    cursor: disabled ? "default" : "pointer",
    fontSize: "12px",
    fontFamily: "var(--font-family)",
  };
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      aria-pressed={active}
      style={sidebarStyle}
      {...rest}
    >
      {children}
    </button>
  );
}
