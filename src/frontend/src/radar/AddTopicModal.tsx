import { useEffect, useState } from "react";
import { Modal } from "../shared/Modal";
import { Field } from "../shared/Field";
import { ApiError, createTopic } from "../api/client";
import type { RadarRing, RadarSegment } from "./types";
import type {
  Ring,
  TopicCandidate,
  TopicCreate,
  TopicCreateResponse,
} from "../manage/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (resp: TopicCreateResponse) => void;
  onPickExisting: (slug: string) => void;
  segments: RadarSegment[];
  rings: RadarRing[];
};

export function AddTopicModal({
  open,
  onClose,
  onCreated,
  onPickExisting,
  segments,
  rings,
}: Props) {
  const [canonicalName, setCanonicalName] = useState("");
  const [notForExternal, setNotForExternal] = useState(false);
  const [placeOnRadar, setPlaceOnRadar] = useState(false);
  const [ring, setRing] = useState<Ring | "">("");
  const [segmentId, setSegmentId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [candidates, setCandidates] = useState<TopicCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCanonicalName("");
      setNotForExternal(false);
      setPlaceOnRadar(false);
      setRing("");
      setSegmentId("");
      setSubmitting(false);
      setCandidates(null);
      setError(null);
    }
  }, [open]);

  const sortedSegments = [...segments].sort((a, b) => a.order - b.order);
  const sortedRings = [...rings].sort((a, b) => a.order - b.order);

  async function submit(forceCreate: boolean) {
    setError(null);
    const trimmed = canonicalName.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    if (placeOnRadar && (!ring || !segmentId)) {
      setError("Pick a ring and a segment to place on the radar.");
      return;
    }
    const payload: TopicCreate = {
      canonical_name: trimmed,
      not_for_external_publication: notForExternal,
      force_create: forceCreate,
      create_technology: placeOnRadar,
      registry_status: placeOnRadar ? "On Radar" : "Backlog",
      current_ring: placeOnRadar ? (ring as Ring) : null,
      current_segment_id: placeOnRadar ? segmentId : null,
    };
    setSubmitting(true);
    try {
      const resp = await createTopic(payload);
      if (resp.topic) {
        onCreated(resp);
        return;
      }
      if (resp.match_candidates && resp.match_candidates.length > 0) {
        setCandidates(resp.match_candidates);
        return;
      }
      setError("Unexpected empty response from the server.");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError(
          "A technology with this name (or an alias) already exists. Search for it on the list, or rename and try again.",
        );
      } else {
        setError(
          e instanceof Error ? e.message : "Failed to create the technology.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submit(false);
  }

  function showFormAgain() {
    setCandidates(null);
    setError(null);
  }

  return (
    <Modal open={open} onClose={onClose} title="Add technology">
      {candidates === null ? (
        <form
          onSubmit={handleFormSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-4)",
          }}
        >
          <Field label="Name" required>
            {({ id, describedBy, invalid, required }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                aria-required={required}
                autoFocus
                type="text"
                value={canonicalName}
                onChange={(e) => setCanonicalName(e.target.value)}
                placeholder="e.g. Solid State Batteries"
                style={inputStyle}
                disabled={submitting}
              />
            )}
          </Field>

          <label style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={notForExternal}
              onChange={(e) => setNotForExternal(e.target.checked)}
              disabled={submitting}
            />
            <span>Not for external publication</span>
          </label>

          <label style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={placeOnRadar}
              onChange={(e) => setPlaceOnRadar(e.target.checked)}
              disabled={submitting}
            />
            <span>Place on radar now (otherwise stays in Backlog)</span>
          </label>

          {placeOnRadar && (
            <>
              <Field label="Ring" required>
                {({ id, describedBy, invalid, required }) => (
                  <select
                    id={id}
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    aria-required={required}
                    value={ring}
                    onChange={(e) => setRing(e.target.value as Ring | "")}
                    style={inputStyle}
                    disabled={submitting}
                  >
                    <option value="">— Pick a ring —</option>
                    {sortedRings.map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>

              <Field label="Segment" required>
                {({ id, describedBy, invalid, required }) => (
                  <select
                    id={id}
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    aria-required={required}
                    value={segmentId}
                    onChange={(e) => setSegmentId(e.target.value)}
                    style={inputStyle}
                    disabled={submitting}
                  >
                    <option value="">— Pick a segment —</option>
                    {sortedSegments.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </>
          )}

          {error && (
            <div role="alert" style={errorBoxStyle}>
              {error}
            </div>
          )}

          <div style={footerStyle}>
            <button
              type="button"
              onClick={onClose}
              style={secondaryButtonStyle}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={primaryButtonStyle}
              disabled={submitting || !canonicalName.trim()}
            >
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-4)",
          }}
        >
          <p style={{ margin: 0, color: "var(--color-dark-text)" }}>
            A few existing entries look similar to{" "}
            <strong>{canonicalName}</strong>. Pick one to open, or create
            anyway.
          </p>
          <ul style={candidateListStyle}>
            {candidates.map((c) => (
              <li key={c.topic.id} style={candidateItemStyle}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <span style={{ fontWeight: "var(--font-weight-medium)" }}>
                    {c.topic.canonical_name}
                  </span>
                  <span
                    style={{
                      fontSize: "var(--font-size-sm)",
                      color: "var(--color-muted-text)",
                    }}
                  >
                    similarity {Math.round(c.score * 100)}%
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onPickExisting(c.topic.slug)}
                  style={secondaryButtonStyle}
                >
                  Use this one
                </button>
              </li>
            ))}
          </ul>

          {error && (
            <div role="alert" style={errorBoxStyle}>
              {error}
            </div>
          )}

          <div style={footerStyle}>
            <button
              type="button"
              onClick={showFormAgain}
              style={secondaryButtonStyle}
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void submit(true)}
              style={primaryButtonStyle}
              disabled={submitting}
            >
              {submitting ? "Creating…" : "Create anyway"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "var(--space-2) var(--space-3)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  fontSize: "var(--font-size-body)",
  fontFamily: "var(--font-family)",
  backgroundColor: "var(--color-white)",
  color: "var(--color-dark-text)",
};

const checkboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  fontSize: "var(--font-size-body)",
  color: "var(--color-dark-text)",
  cursor: "pointer",
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "var(--space-2)",
  marginTop: "var(--space-2)",
};

const primaryButtonStyle: React.CSSProperties = {
  background: "var(--color-brand-dark-blue)",
  color: "var(--color-white)",
  border: "none",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-2) var(--space-4)",
  fontSize: "var(--font-size-body)",
  fontFamily: "var(--font-family)",
  fontWeight: "var(--font-weight-medium)",
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  background: "var(--color-white)",
  color: "var(--color-dark-text)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-2) var(--space-4)",
  fontSize: "var(--font-size-body)",
  fontFamily: "var(--font-family)",
  cursor: "pointer",
};

const errorBoxStyle: React.CSSProperties = {
  padding: "var(--space-2) var(--space-3)",
  border: "1px solid var(--color-danger)",
  borderRadius: "var(--radius-md)",
  background: "rgba(220, 53, 69, 0.08)",
  color: "var(--color-danger)",
  fontSize: "var(--font-size-sm)",
};

const candidateListStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
  maxHeight: 320,
  overflowY: "auto",
};

const candidateItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-3)",
  padding: "var(--space-2) var(--space-3)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  background: "var(--color-white)",
};
