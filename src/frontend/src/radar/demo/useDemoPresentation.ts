import { useCallback, useEffect, useRef, useState } from "react";
import { isVisible } from "../filtering";
import type { FilterState, RadarData, RadarEntry } from "../types";

type Params = {
  enabled: boolean;
  secondsPerStep: number;
  data: RadarData | null;
  filters: FilterState;
  focusedSegmentIdx: number | null;
  selectedEntry: RadarEntry | null;
  modalOpen: boolean;
  setSelectedEntry: (entry: RadarEntry | null) => void;
  setModalOpen: (open: boolean) => void;
};

export type DemoCursorState = {
  x: number;
  y: number;
  visible: boolean;
  pulsing: boolean;
};

export type DemoDwell = {
  /** Total dwell duration in ms. */
  duration: number;
  /** Monotonic id that changes on every new dwell — consumers can use this
   * as a React `key` to re-mount the progress bar and restart its CSS
   * animation cleanly. */
  key: number;
};

type Result = {
  running: boolean;
  toggle: () => void;
  cursor: DemoCursorState;
  dwell: DemoDwell | null;
};

const MODAL_PROBABILITY = 0.2;
const CURSOR_MOVE_MS = 800;
const HOVER_REGISTER_MS = 250;
const PULSE_MS = 350;
const RECENT_LIMIT = 5;

function pickWeighted<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function focusedSegmentId(
  data: RadarData | null,
  focusedSegmentIdx: number | null,
): string | null {
  if (!data || focusedSegmentIdx == null) return null;
  const sorted = [...data.segments].sort((a, b) => a.order - b.order);
  return sorted[focusedSegmentIdx]?.id ?? null;
}

/** Sample the next entry to visit, respecting current filters, focus mode,
 * and a small recent-set so the same dot isn't picked twice in a row.
 *
 * Exported for unit testing. */
export function pickNextEntry(
  data: RadarData | null,
  filters: FilterState,
  focusedSegmentIdx: number | null,
  recent: string[],
  current: RadarEntry | null,
): RadarEntry | null {
  if (!data) return null;
  const focusedSegId = focusedSegmentId(data, focusedSegmentIdx);
  const candidates = data.entries.filter((e) => {
    if (focusedSegId && e.segment_id !== focusedSegId) return false;
    return isVisible(e, data, filters);
  });
  if (candidates.length === 0) return null;
  const currentId = current?.id;
  const fresh = candidates.filter(
    (e) => e.id !== currentId && !recent.includes(e.id),
  );
  if (fresh.length > 0) return pickWeighted(fresh);
  // Recent set is saturating — fall back to the full visible set excluding
  // only the entry currently on screen so we still rotate.
  const withoutCurrent = candidates.filter((e) => e.id !== currentId);
  return pickWeighted(withoutCurrent.length > 0 ? withoutCurrent : candidates);
}

function queryEntryEl(entryId: string): SVGGElement | null {
  return document.querySelector<SVGGElement>(
    `g[data-entry-id="${CSS.escape(entryId)}"][data-demo-kind="${
      Math.random() < 0.5 ? "dot" : "label"
    }"]`,
  );
}

function queryByAriaLabel(label: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[aria-label="${CSS.escape(label)}"]`,
  );
}

function centerOf(rect: DOMRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function makeMouseEvent(
  type: "mouseover" | "mouseout",
  relatedTarget: EventTarget | null,
): MouseEvent {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    relatedTarget: relatedTarget as Element | null,
  });
}

class CancelError extends Error {
  constructor() {
    super("cancelled");
    this.name = "CancelError";
  }
}

export function useDemoPresentation(params: Params): Result {
  const [running, setRunning] = useState(false);
  const [cursor, setCursor] = useState<DemoCursorState>({
    x: -100,
    y: -100,
    visible: false,
    pulsing: false,
  });
  const [dwell, setDwell] = useState<DemoDwell | null>(null);
  const dwellKeyRef = useRef(0);

  // Stash latest props in refs so the running loop reads fresh values
  // without restarting on every prop change.
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const runIdRef = useRef(0);
  const abortRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const pausedRef = useRef(false);

  const stop = useCallback(() => {
    abortRef.current.cancelled = true;
    setRunning(false);
  }, []);

  const toggle = useCallback(() => {
    setRunning((r) => !r);
  }, []);

  // When the feature is disabled mid-run, stop immediately.
  useEffect(() => {
    if (!params.enabled && running) {
      stop();
    }
  }, [params.enabled, running, stop]);

  // Cancel on real user input. We filter out events whose target is the demo
  // button itself so clicking the toggle to *start* doesn't immediately stop.
  useEffect(() => {
    if (!running) return;
    const onInput = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.closest("[data-demo-toggle]") ||
          target.getAttribute("aria-label")?.startsWith("Start presentation") ||
          target.getAttribute("aria-label")?.startsWith("Stop presentation"))
      ) {
        return;
      }
      stop();
    };
    window.addEventListener("pointerdown", onInput);
    window.addEventListener("keydown", onInput);
    return () => {
      window.removeEventListener("pointerdown", onInput);
      window.removeEventListener("keydown", onInput);
    };
  }, [running, stop]);

  // Pause on tab-hidden / window blur; resume when focused again.
  useEffect(() => {
    if (!running) return;
    const onVisibility = () => {
      pausedRef.current = document.visibilityState === "hidden";
    };
    const onBlur = () => {
      pausedRef.current = true;
    };
    const onFocus = () => {
      pausedRef.current = false;
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [running]);

  // The state machine. Runs while `running` is true; bumps a runId so a
  // restart cleanly supersedes any in-flight loop.
  useEffect(() => {
    if (!running) return;
    runIdRef.current += 1;
    const myRun = runIdRef.current;
    const abort = { cancelled: false };
    abortRef.current = abort;

    const isCancelled = () => abort.cancelled || runIdRef.current !== myRun;

    const wait = (ms: number): Promise<void> =>
      new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (isCancelled()) {
            reject(new CancelError());
            return;
          }
          if (pausedRef.current) {
            setTimeout(tick, 200);
            return;
          }
          const elapsed = Date.now() - start;
          if (elapsed >= ms) {
            resolve();
            return;
          }
          setTimeout(tick, Math.min(100, ms - elapsed));
        };
        tick();
      });

    const moveTo = async (x: number, y: number, pulse: boolean) => {
      setCursor((c) => ({ ...c, x, y, visible: true, pulsing: false }));
      await wait(CURSOR_MOVE_MS);
      if (pulse) {
        setCursor((c) => ({ ...c, pulsing: true }));
        await wait(PULSE_MS);
        setCursor((c) => ({ ...c, pulsing: false }));
      }
    };

    const waitWithTimer = async (ms: number) => {
      dwellKeyRef.current += 1;
      setDwell({ duration: ms, key: dwellKeyRef.current });
      try {
        await wait(ms);
      } finally {
        setDwell(null);
      }
    };

    const recent: string[] = [];
    let prevEl: Element | null = null;
    let lastEntry: RadarEntry | null = null;

    const dispatchHover = (el: Element | null) => {
      if (!el) return;
      if (prevEl && prevEl !== el) {
        prevEl.dispatchEvent(makeMouseEvent("mouseout", el));
      }
      el.dispatchEvent(makeMouseEvent("mouseover", prevEl));
      prevEl = el;
    };

    const clearHover = () => {
      if (prevEl) {
        prevEl.dispatchEvent(makeMouseEvent("mouseout", null));
        prevEl = null;
      }
    };

    const loop = async () => {
      // Step 1 — Init: clear any open panel, park cursor off-screen.
      paramsRef.current.setSelectedEntry(null);
      paramsRef.current.setModalOpen(false);
      setCursor({
        x: window.innerWidth - 80,
        y: 80,
        visible: true,
        pulsing: false,
      });
      await wait(400);

      while (!isCancelled()) {
        const p = paramsRef.current;
        const next = pickNextEntry(
          p.data,
          p.filters,
          p.focusedSegmentIdx,
          recent,
          lastEntry,
        );
        if (!next) {
          // Nothing visible to point at — wait and try again.
          await wait(1000);
          continue;
        }
        recent.push(next.id);
        if (recent.length > RECENT_LIMIT) recent.shift();
        lastEntry = next;

        const targetEl = queryEntryEl(next.id);
        if (!targetEl) {
          await wait(400);
          continue;
        }
        const rect = targetEl.getBoundingClientRect();
        const { x, y } = centerOf(rect);
        await moveTo(x, y, false);

        dispatchHover(targetEl);
        await wait(HOVER_REGISTER_MS);

        setCursor((c) => ({ ...c, pulsing: true }));
        p.setSelectedEntry(next);
        await wait(PULSE_MS);
        setCursor((c) => ({ ...c, pulsing: false }));

        await waitWithTimer(p.secondsPerStep * 1000);

        // Optional modal sub-flow.
        if (Math.random() < MODAL_PROBABILITY) {
          const openBtn = queryByAriaLabel("Open full detail view");
          if (openBtn) {
            const obr = openBtn.getBoundingClientRect();
            const { x: ox, y: oy } = centerOf(obr);
            await moveTo(ox, oy, true);
            paramsRef.current.setModalOpen(true);
            await waitWithTimer(paramsRef.current.secondsPerStep * 1000);
            // Close modal — call setter directly (modal close button location
            // varies by content; the direct call is reliable).
            setCursor((c) => ({ ...c, pulsing: true }));
            paramsRef.current.setModalOpen(false);
            await wait(PULSE_MS);
            setCursor((c) => ({ ...c, pulsing: false }));
            await wait(600);
          }
        }

        // Move to the panel close affordance, then close.
        const closeBtn = queryByAriaLabel("Close detail panel");
        if (closeBtn) {
          const cbr = closeBtn.getBoundingClientRect();
          const { x: cx, y: cy } = centerOf(cbr);
          await moveTo(cx, cy, true);
        }
        clearHover();
        paramsRef.current.setSelectedEntry(null);
        await wait(400);
      }
    };

    loop().catch((err) => {
      if (!(err instanceof CancelError)) {
        console.error("Demo presentation loop crashed", err);
      }
    });

    return () => {
      abort.cancelled = true;
      clearHover();
      // Fade the cursor out and clean up open state.
      setCursor((c) => ({ ...c, visible: false, pulsing: false }));
      setDwell(null);
      paramsRef.current.setModalOpen(false);
      paramsRef.current.setSelectedEntry(null);
    };
  }, [running]);

  return { running, toggle, cursor, dwell };
}
