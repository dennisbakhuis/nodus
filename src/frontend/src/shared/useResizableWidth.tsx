import { useCallback, useEffect, useState } from "react";

type Options = {
  min: number;
  max: number;
  initial: number;
};

function readSavedWidth(key: string, opts: Options): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return opts.initial;
    const n = Number(raw);
    if (!Number.isFinite(n)) return opts.initial;
    return Math.max(opts.min, Math.min(opts.max, n));
  } catch {
    return opts.initial;
  }
}

/**
 * Drag-to-resize width state persisted to localStorage and clamped to
 * `[min, max]`. Returns the current `width`, a `dragging` flag, an
 * `onPointerDown` handler to wire to a drag handle, and `reset`.
 *
 * Extracted from the manage sidebar so the radar/list sidebars reuse the exact
 * same behavior (pointer capture, body cursor lock, persistence).
 */
export function useResizableWidth(storageKey: string, opts: Options) {
  const { min, max, initial } = opts;
  const [width, setWidth] = useState<number>(() =>
    readSavedWidth(storageKey, opts),
  );
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(width));
    } catch {
      /* ignore */
    }
  }, [storageKey, width]);

  // Body cursor/userSelect ride the drag lifecycle: applied on drag start,
  // reverted in cleanup — so a mid-drag unmount still restores page state.
  useEffect(() => {
    if (!dragging) return;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [dragging]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const handle = e.currentTarget;
      const pointerId = e.pointerId;
      handle.setPointerCapture(pointerId);
      setDragging(true);
      const startX = e.clientX;
      const startWidth = width;
      const onMove = (ev: PointerEvent) => {
        const next = Math.max(
          min,
          Math.min(max, startWidth + (ev.clientX - startX)),
        );
        setWidth(next);
      };
      const stop = () => {
        setDragging(false);
        try {
          handle.releasePointerCapture(pointerId);
        } catch {
          /* already released */
        }
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", stop);
        handle.removeEventListener("pointercancel", stop);
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", stop);
      handle.addEventListener("pointercancel", stop);
    },
    [width, min, max],
  );

  const reset = useCallback(() => setWidth(initial), [initial]);

  return { width, dragging, onPointerDown, reset };
}

/** The draggable separator at a sidebar's right edge. Parent must be positioned. */
export function ResizeHandle({
  onPointerDown,
  onDoubleClick,
}: {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDoubleClick?: () => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      style={{
        position: "absolute",
        top: 0,
        right: -3,
        bottom: 0,
        width: 6,
        cursor: "col-resize",
        zIndex: 1,
      }}
    />
  );
}
