import { useEffect, useRef, useState } from "react";
import type { Ring, Segment } from "./types";
import { RING_VALUES } from "./types";
import styles from "./RingPlacementDialog.module.css";

type Props = {
  onConfirm: (ring: Ring, segmentId: string | null, rationale: string) => void;
  onCancel: () => void;
  segments?: Segment[];
  requireSegment?: boolean;
  currentSegmentId?: string | null;
};

export function RingPlacementDialog({
  onConfirm,
  onCancel,
  segments = [],
  requireSegment = false,
  currentSegmentId = null,
}: Props) {
  const [ring, setRing] = useState<Ring | "">("");
  const [rationale, setRationale] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  const activeSegments = segments.filter((s) => s.is_active);
  const currentSegment = currentSegmentId
    ? segments.find((s) => s.id === currentSegmentId)
    : null;
  const showInactiveCurrent = currentSegment && !currentSegment.is_active;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      prev?.focus();
    };
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  const canConfirm =
    ring !== "" &&
    rationale.trim().length > 0 &&
    (!requireSegment || segmentId !== "");

  function handleConfirm() {
    if (!canConfirm || ring === ("" as string)) return;
    onConfirm(ring as Ring, segmentId || null, rationale.trim());
  }

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ring-dialog-title"
    >
      <div className={styles.dialog} ref={dialogRef} tabIndex={-1}>
        <h2 className={styles.title} id="ring-dialog-title">
          Assign Ring
        </h2>
        <p className={styles.subtitle}>
          Select the target ring and provide a rationale for this placement.
        </p>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="ring-select">
            Ring<span className={styles.required}>*</span>
          </label>
          <select
            id="ring-select"
            className={styles.select}
            value={ring}
            onChange={(e) => setRing(e.target.value as Ring | "")}
          >
            <option value="">Select a ring...</option>
            {RING_VALUES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {activeSegments.length > 0 && (
          <div className={styles.segmentField}>
            <label className={styles.label} htmlFor="segment-select">
              Segment
              {requireSegment && <span className={styles.required}>*</span>}
            </label>
            <select
              id="segment-select"
              className={styles.select}
              value={segmentId}
              onChange={(e) => setSegmentId(e.target.value)}
            >
              <option value="">Select a segment...</option>
              {activeSegments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              {showInactiveCurrent && currentSegment && (
                <option
                  key={currentSegment.id}
                  value={currentSegment.id}
                  disabled
                >
                  {currentSegment.name} (inactive)
                </option>
              )}
            </select>
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="ring-rationale">
            Rationale<span className={styles.required}>*</span>
          </label>
          <textarea
            id="ring-rationale"
            className={styles.textarea}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Explain why this technology belongs in the selected ring..."
          />
        </div>

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className={styles.confirmBtn}
            onClick={handleConfirm}
            type="button"
            disabled={!canConfirm}
          >
            Confirm Placement
          </button>
        </div>
      </div>
    </div>
  );
}
