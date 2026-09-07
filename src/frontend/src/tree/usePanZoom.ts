/**
 * Wheel-zoom, drag-pan and fit-to-content for the tree canvas.
 *
 * Mirrors the behaviour proven in `radar/RadarView.tsx` (roughly lines
 * 848-958), including the WebKit compositing workaround and the wheel
 * normalisation, but without the focus-mode animation state that makes the
 * radar's version hard to share. If a third surface ever needs this, extract
 * the common core then rather than bending either caller to fit now.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  WHEEL_ZOOM_FACTOR,
  WHEEL_ZOOM_NORMALIZE,
  ZOOM_MAX,
  ZOOM_MIN,
} from "../radar/geometry";

export type TreeViewControls = {
  setZoom: (absolute: number) => void;
  reset: () => void;
};

type Options = {
  /** Re-fits whenever this changes — pass something derived from the laid-out content. */
  fitKey: string;
  onZoomChange?: (zoom: number, fitZoom: number) => void;
};

export function usePanZoom({ fitKey, onZoomChange }: Options) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rootGRef = useRef<SVGGElement>(null);

  const [zoom, setZoomState] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [fitZoom, setFitZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);

  const zoomRef = useRef(zoom);
  const translateRef = useRef(translate);
  const draggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragStartTransRef = useRef({ x: 0, y: 0 });

  zoomRef.current = zoom;
  translateRef.current = translate;

  useEffect(() => {
    onZoomChange?.(zoom, fitZoom);
  }, [zoom, fitZoom, onZoomChange]);

  useLayoutEffect(() => {
    const g = rootGRef.current;
    if (!g) return;
    g.style.transformOrigin = "0 0";
    // Promotes the group to its own compositor layer. Without it WebKit leaves
    // paint trails during rapid pan/zoom of a CSS-transformed SVG subtree.
    g.style.willChange = "transform";
    g.style.transform = `translate(${translate.x}px, ${translate.y}px) scale(${zoom})`;
  }, [zoom, translate]);

  const applyFit = useCallback(() => {
    const g = rootGRef.current;
    const wrapper = wrapperRef.current;
    if (!g || !wrapper) return;
    let box: DOMRect;
    try {
      box = g.getBBox() as DOMRect;
    } catch {
      return;
    }
    if (!box.width || !box.height) return;
    const rect = wrapper.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const padding = 48;
    const next = Math.max(
      ZOOM_MIN,
      Math.min(
        ZOOM_MAX,
        Math.min(
          (rect.width - padding * 2) / box.width,
          (rect.height - padding * 2) / box.height,
        ),
      ),
    );
    setFitZoom(next);
    setZoomState(next);
    setTranslate({
      x: rect.width / 2 - next * (box.x + box.width / 2),
      y: rect.height / 2 - next * (box.y + box.height / 2),
    });
  }, []);

  useLayoutEffect(() => {
    applyFit();
    let cancelled = false;
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) applyFit();
      });
    }
    const el = wrapperRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return () => {
        cancelled = true;
      };
    }
    const ro = new ResizeObserver(() => applyFit());
    ro.observe(el);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [applyFit, fitKey]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = wrapper.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const current = zoomRef.current;
      const t = translateRef.current;
      // Normalised by delta magnitude so a trackpad's many small events and a
      // mouse wheel's few large ones zoom at the same rate per pixel scrolled.
      const factor = Math.pow(
        WHEEL_ZOOM_FACTOR,
        -e.deltaY / WHEEL_ZOOM_NORMALIZE,
      );
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, current * factor));
      const k = next / current;
      setZoomState(next);
      setTranslate({ x: cx - k * (cx - t.x), y: cy - k * (cy - t.y) });
    };
    wrapper.addEventListener("wheel", handler, { passive: false });
    return () => wrapper.removeEventListener("wheel", handler);
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as Element;
      if (target.closest("[data-topic-id], button, a")) return;
      draggingRef.current = true;
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      dragStartTransRef.current = translateRef.current;
      document.body.style.cursor = "grabbing";
    };

    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      setTranslate({
        x: dragStartTransRef.current.x + (e.clientX - dragStartRef.current.x),
        y: dragStartTransRef.current.y + (e.clientY - dragStartRef.current.y),
      });
    };

    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setIsDragging(false);
      document.body.style.cursor = "";
    };

    wrapper.addEventListener("mousedown", onDown);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      wrapper.removeEventListener("mousedown", onDown);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  const controls: TreeViewControls = {
    setZoom: (absolute) =>
      setZoomState(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, absolute))),
    reset: applyFit,
  };

  return {
    wrapperRef,
    rootGRef,
    zoom,
    translate,
    fitZoom,
    isDragging,
    controls,
  };
}
