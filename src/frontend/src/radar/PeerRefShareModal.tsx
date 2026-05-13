import { useEffect, useState } from "react";
import { Modal } from "../shared/Modal";
import type { PeerRefExportSource } from "./dataExport/jsonPeerRef";

type Props = {
  open: boolean;
  initial?: Partial<PeerRefExportSource>;
  onCancel: () => void;
  onConfirm: (source: PeerRefExportSource) => void;
  droppedPrivateCount: number | null;
};

export function PeerRefShareModal({
  open,
  initial,
  onCancel,
  onConfirm,
  droppedPrivateCount,
}: Props) {
  const [partyName, setPartyName] = useState(initial?.party_name ?? "");
  const [partySlug, setPartySlug] = useState(initial?.party_slug ?? "");
  const [partyUrl, setPartyUrl] = useState(initial?.party_url ?? "");
  const [sourceName, setSourceName] = useState(initial?.source_name ?? "");
  const [sourceUrl, setSourceUrl] = useState(initial?.source_url ?? "");

  useEffect(() => {
    if (open) {
      setPartyName(initial?.party_name ?? "");
      setPartySlug(initial?.party_slug ?? "");
      setPartyUrl(initial?.party_url ?? "");
      setSourceName(initial?.source_name ?? "");
      setSourceUrl(initial?.source_url ?? "");
    }
  }, [open, initial]);

  function submit() {
    onConfirm({
      party_name: partyName.trim(),
      party_slug: partySlug.trim() || null,
      party_url: partyUrl.trim() || null,
      source_name: sourceName.trim(),
      source_url: sourceUrl.trim() || null,
    });
  }

  const canSubmit = partyName.trim().length > 0 && sourceName.trim().length > 0;

  return (
    <Modal open={open} onClose={onCancel} title="Share peer reference export">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: 12,
        }}
      >
        <p
          style={{ margin: 0, fontSize: 13, color: "var(--color-muted-text)" }}
        >
          Identify the organization this export will appear as on another Nodus
          radar. Private topics are excluded automatically.
        </p>
        {droppedPrivateCount != null && droppedPrivateCount > 0 && (
          <p
            style={{
              margin: 0,
              padding: "6px 10px",
              fontSize: 12,
              background: "var(--color-page-background)",
              borderLeft: "3px solid var(--color-brand-orange)",
              borderRadius: 4,
            }}
          >
            {droppedPrivateCount} topic
            {droppedPrivateCount === 1 ? "" : "s"} flagged
            not_for_external_publication will be omitted.
          </p>
        )}
        <Field label="Organization name *">
          <input
            type="text"
            value={partyName}
            onChange={(e) => setPartyName(e.target.value)}
            placeholder="Acme Co"
            style={inputStyle}
          />
        </Field>
        <Field label="Slug">
          <input
            type="text"
            value={partySlug}
            onChange={(e) => setPartySlug(e.target.value)}
            placeholder="acme-co"
            style={inputStyle}
          />
        </Field>
        <Field label="Organization website">
          <input
            type="url"
            value={partyUrl}
            onChange={(e) => setPartyUrl(e.target.value)}
            placeholder="https://example.com/"
            style={inputStyle}
          />
        </Field>
        <Field label="Source identifier *">
          <input
            type="text"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            placeholder="peer-radar-2026"
            style={inputStyle}
          />
        </Field>
        <Field label="Public radar URL">
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://radar.example.com/"
            style={inputStyle}
          />
        </Field>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            paddingTop: 8,
            borderTop: "1px solid var(--color-border)",
          }}
        >
          <button type="button" onClick={onCancel} style={btnSecondary}>
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            style={btnPrimary}
          >
            Download
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, color: "var(--color-muted-text)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 13,
  border: "1px solid var(--color-border)",
  borderRadius: 4,
  fontFamily: "var(--font-family)",
};

const btnPrimary: React.CSSProperties = {
  padding: "6px 14px",
  background: "var(--color-brand-dark-blue)",
  color: "var(--color-white)",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
};

const btnSecondary: React.CSSProperties = {
  padding: "6px 14px",
  background: "var(--color-white)",
  color: "var(--color-dark-text)",
  border: "1px solid var(--color-border)",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
};
