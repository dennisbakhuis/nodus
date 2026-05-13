import { useEffect, useRef, useState } from "react";
import jsPDF from "jspdf";
import { svg2pdf } from "svg2pdf.js";
import type { RadarData } from "./types";
import { svgToPngDataUrl } from "./svgRaster";
import { CX, CY, R_INNER, R_OUTER } from "./geometry";
import { Button } from "../shared/Button";

const NODUS_MARK_HREF = "/nodus_mark.svg";

// Viewport units added to the bottom of the cloned viewBox before export.
// The fit transform on the inner <g> is in CSS px, and the on-screen
// container's CSS-px-per-viewBox-unit ratio is rarely 1:1 — the export
// pins the SVG at viewBox dimensions (so 1 CSS px ≡ 1 vb unit), which
// replays the transform at a different effective scale and can push the
// ring-label baseline + watermark below the viewBox bottom. Adding a
// small bottom pad gives that content room to land on canvas without
// changing the radar's on-screen geometry.
export const EXPORT_VIEWBOX_BOTTOM_PAD = 40;

type Variant = "sidebar" | "header";

type Props = {
  svgRef: React.RefObject<SVGSVGElement | null>;
  data: RadarData;
  variant?: Variant;
};

/** Build a downloadable filename for the active radar cycle. */
function fileBase(data: RadarData): string {
  return `nodus-radar-${data.radar.cycle || "current"}`;
}

/** Trigger a browser download for `blob` under `name`. */
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

/** Inline-render the live SVG into a self-contained string (with XML decl).
 * Pure serializer — assumes the caller already prepared the SVG (resolved CSS
 * variables, inlined images, watermark applied) via `prepareExportSvg`. */
export function radarSvgString(svg: SVGSVGElement): string {
  if (!svg.getAttribute("xmlns")) {
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  if (!svg.getAttribute("xmlns:xlink")) {
    svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  }
  const serialized = new XMLSerializer().serializeToString(svg);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`;
}

// SVG presentation properties whose values are routinely set via CSS variables
// in the live DOM. We resolve each one against the live element's computed
// style and pin the result onto the cloned counterpart so the file renders
// correctly when detached from the page's CSS.
const PRESENTATION_PROPS = [
  "fill",
  "stroke",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "letter-spacing",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "text-anchor",
  "dominant-baseline",
] as const;

/** Walk both trees in lockstep, copying resolved presentation styles from each
 * live element onto its clone. Stops when the trees diverge (defensive — the
 * caller passes a `cloneNode(true)` so structures should match). */
export function inlineComputedStyles(src: Element, dst: Element): void {
  const cs = window.getComputedStyle(src);
  for (const prop of PRESENTATION_PROPS) {
    const val = cs.getPropertyValue(prop);
    if (!val || val === "normal" || (val === "none" && prop !== "fill")) {
      // 'fill: none' is meaningful (open shape); other "none"s usually aren't.
    }
    if (val) (dst as SVGElement).style.setProperty(prop, val);
  }
  const srcKids = src.children;
  const dstKids = dst.children;
  const n = Math.min(srcKids.length, dstKids.length);
  for (let i = 0; i < n; i++) {
    inlineComputedStyles(srcKids[i]!, dstKids[i]!);
  }
}

/** Convert every <image href="…"> in `svg` into an inline `data:` URL by
 * fetching the bytes through the page's auth context. Logos / hero images
 * stop disappearing in detached SVG and PDF exports. */
export async function inlineExternalImages(svg: SVGSVGElement): Promise<void> {
  const XLINK = "http://www.w3.org/1999/xlink";
  const imgs = Array.from(svg.querySelectorAll("image"));
  await Promise.all(
    imgs.map(async (img) => {
      const href =
        img.getAttribute("href") ?? img.getAttributeNS(XLINK, "href") ?? "";
      if (!href || href.startsWith("data:")) return;
      try {
        const url = new URL(href, window.location.href).toString();
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) return;
        const blob = await res.blob();
        // Wrap the blob in a Response so we can read bytes uniformly — jsdom's
        // Blob omits `arrayBuffer()` while Response.arrayBuffer() works there
        // and in real browsers, and FileReader.readAsDataURL serializes Blobs
        // as the literal string "[object Blob]" under jsdom.
        const buf = await new Response(blob).arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]!);
        }
        const mime = blob.type || "image/png";
        const dataUrl = `data:${mime};base64,${btoa(binary)}`;
        img.setAttribute("href", dataUrl);
        img.removeAttributeNS(XLINK, "href");
      } catch {
        // Leave the original href intact when fetching fails — the SVG will
        // still serialize, just with a broken image instead of crashing.
      }
    }),
  );
}

/** Append a compact Nodus watermark (mark + "Nodus" wordmark) to the SVG.
 *
 * Positioned as if it were a fifth ring-label slot, one band-step to the
 * right of the rightmost Monitor label and aligned to the same baseline
 * (y = CY + 13) used by every Invest / Pilot / Explore / Monitor label.
 * Sized at half the in-app header brand (logo 32 → 16, font 16 → 8), with
 * the same 4 px gap between mark and wordmark.
 *
 * The mark is added as an `<image href="/nodus_mark.svg">`; the
 * surrounding pipeline rewrites that href into a self-contained data: URL
 * so the asset renders in detached SVG / PDF / canvas contexts. */
export function addNodusWatermark(svg: SVGSVGElement): void {
  const NS = "http://www.w3.org/2000/svg";

  const group = document.createElementNS(NS, "g");
  group.setAttribute("data-watermark", "nodus");
  group.setAttribute("opacity", "0.85");
  group.setAttribute("pointer-events", "none");

  // Half the in-app brand sizing (header: 32/16/4).
  const markSize = 16;
  const fontSize = 8;
  const gap = 4;

  // The 4 standard rings (Invest / Pilot / Explore / Monitor) have their
  // labels at x = CX + (R_INNER + (i + 0.5) * bandStep), y = CY + 13. Place
  // the watermark in the next slot (i = 4) so it visually continues the
  // ring-label row, one band-step to the right of "Monitor", plus an
  // extra `markSize` of breathing room so the logo doesn't crowd Monitor.
  const N_RINGS = 4;
  const bandStep = (R_OUTER - R_INNER) / N_RINGS;
  const slotCenterX = CX + R_INNER + (N_RINGS + 0.5) * bandStep + markSize;
  const slotBaselineY = CY + 13;

  // Wordmark centered on the slot, sharing the ring-labels' baseline and
  // size so the row reads as one continuous strip.
  const approxTextWidth = fontSize * 0.55 * "Nodus".length;
  const textX = slotCenterX;
  const textY = slotBaselineY;

  // Logo to the left of the wordmark with the brand's 4 px gap, vertically
  // centered on the text's visual middle (cap-height midpoint sits ~0.35em
  // above the alphabetic baseline).
  const markX = slotCenterX - approxTextWidth / 2 - gap - markSize;
  const markY = slotBaselineY - fontSize * 0.35 - markSize / 2;

  const image = document.createElementNS(NS, "image");
  image.setAttribute("x", String(markX));
  image.setAttribute("y", String(markY));
  image.setAttribute("width", String(markSize));
  image.setAttribute("height", String(markSize));
  image.setAttribute("preserveAspectRatio", "xMidYMid meet");
  image.setAttribute("href", NODUS_MARK_HREF);
  // Mirror xlink:href for older renderers (svg2pdf reads either).
  image.setAttributeNS(
    "http://www.w3.org/1999/xlink",
    "xlink:href",
    NODUS_MARK_HREF,
  );

  const text = document.createElementNS(NS, "text");
  text.setAttribute("x", String(textX));
  text.setAttribute("y", String(textY));
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("font-family", "system-ui, -apple-system, sans-serif");
  text.setAttribute("font-size", String(fontSize));
  text.setAttribute("font-weight", "700");
  text.setAttribute("fill", "#161616");
  text.textContent = "Nodus";

  group.appendChild(image);
  group.appendChild(text);
  // The radar's content lives inside a top-level <g> that carries the
  // fit-to-viewport `transform: translate(...) scale(...)` applied by the
  // radar's layout code. Ring labels are inside that group, so the only
  // way for the watermark to share their on-screen baseline is to append
  // it inside the same group — appending to the <svg> root puts it in raw
  // viewBox coords, ~15 px below the transformed ring labels.
  const transformedRoot = svg.querySelector(":scope > g");
  (transformedRoot ?? svg).appendChild(group);
}

/** Build a self-contained SVG ready for download / PDF embedding. Clones the
 * live SVG, resolves CSS variables to inline styles, inlines image hrefs, and
 * stamps a Nodus watermark in the bottom-right corner. */
export async function prepareExportSvg(
  live: SVGSVGElement,
): Promise<SVGSVGElement> {
  const clone = live.cloneNode(true) as SVGSVGElement;
  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  if (!clone.getAttribute("xmlns:xlink")) {
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  }
  // Pin explicit width/height (so detached renderers like PDF / file-system
  // viewers don't fall back to a 300×150 default) and extend the viewBox a
  // touch at the bottom so the ring-label baseline + watermark survive the
  // px-vs-vb-unit replay of the fit transform on export. The live SVG keeps
  // its width="100%" sizing — we only override on the clone.
  const vb = live.viewBox.baseVal;
  if (vb.width && vb.height) {
    const exportH = vb.height + EXPORT_VIEWBOX_BOTTOM_PAD;
    clone.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.width} ${exportH}`);
    clone.setAttribute("width", String(vb.width));
    clone.setAttribute("height", String(exportH));
  }
  inlineComputedStyles(live, clone);
  // Watermark stamping happens before inlining so the mark's
  // <image href="/nodus_mark.svg"> is rewritten to a data: URL by the same
  // pass that handles the radar's other hero images. Three cases:
  //   1. Center logo is Nodus → skip entirely (would double-stamp the brand).
  //   2. A focus-mode Nodus group is present (rendered hidden in the live
  //      SVG when a segment is zoomed-in) → reveal it; that placement on the
  //      Pilot ring's bottom boundary replaces the default corner slot.
  //   3. Otherwise → add the default 5th-ring-label-slot watermark.
  if (!clone.querySelector('[data-center-logo="nodus"]')) {
    const focusWm = clone.querySelector<SVGGElement>(
      '[data-focus-watermark="nodus"]',
    );
    if (focusWm) {
      focusWm.setAttribute("opacity", "1");
      // inlineComputedStyles ran first and inlined the live opacity="0" as
      // style.opacity:0 on the clone — that inline rule would beat the new
      // attribute. Clear it so the reveal actually shows.
      focusWm.style.removeProperty("opacity");
    } else {
      addNodusWatermark(clone);
    }
  }
  await inlineExternalImages(clone);
  return clone;
}

export function ExportMenu({ svgRef, data, variant = "sidebar" }: Props) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click / Escape — same pattern as AuthMenu.
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

  async function withBusy<T>(
    work: () => Promise<T> | T,
  ): Promise<T | undefined> {
    setExporting(true);
    try {
      return await work();
    } finally {
      setExporting(false);
      setOpen(false);
    }
  }

  /** Mount a prepared SVG off-screen so layout-dependent APIs (getBBox, the
   * canvas rasterizer, svg2pdf measurement) can run on it. Returns a cleanup. */
  function withOffscreen<T>(
    svg: SVGSVGElement,
    work: () => Promise<T> | T,
  ): Promise<T> {
    svg.style.position = "absolute";
    svg.style.left = "-99999px";
    svg.style.top = "0";
    document.body.appendChild(svg);
    return Promise.resolve(work()).finally(() => {
      svg.remove();
    });
  }

  async function exportSvg() {
    const live = svgRef.current;
    if (!live) return;
    await withBusy(async () => {
      const exported = await prepareExportSvg(live);
      const blob = new Blob([radarSvgString(exported)], {
        type: "image/svg+xml;charset=utf-8",
      });
      downloadBlob(blob, `${fileBase(data)}.svg`);
    });
  }

  async function exportPng() {
    const live = svgRef.current;
    if (!live) return;
    await withBusy(async () => {
      const exported = await prepareExportSvg(live);
      const dataUrl = await svgToPngDataUrl(
        exported,
        radarSvgString(exported),
        2,
      );
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${fileBase(data)}.png`;
      a.click();
    });
  }

  /** Vector PDF: hand the prepared SVG (resolved styles + inlined images +
   * watermark) to svg2pdf.js so text stays selectable at any zoom. */
  async function exportPdf() {
    const live = svgRef.current;
    if (!live) return;
    await withBusy(async () => {
      const exported = await prepareExportSvg(live);
      const w =
        exported.viewBox.baseVal.width ||
        Number(exported.getAttribute("width")) ||
        live.clientWidth ||
        1100;
      const h =
        exported.viewBox.baseVal.height ||
        Number(exported.getAttribute("height")) ||
        live.clientHeight ||
        580;
      const pdf = new jsPDF({
        orientation: w > h ? "landscape" : "portrait",
        unit: "pt",
        format: [w, h],
      });
      await withOffscreen(exported, () =>
        svg2pdf(exported, pdf, { x: 0, y: 0, width: w, height: h }),
      );
      pdf.save(`${fileBase(data)}.pdf`);
    });
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
        disabled={exporting}
        title="Export radar"
        variant={variant}
      >
        {exporting ? "…" : "↓ Export"}
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
            minWidth: 180,
          }}
        >
          <MenuItem onClick={exportSvg} hint="Vector source — best for editing">
            SVG (vector)
          </MenuItem>
          <MenuItem onClick={exportPng} hint="Raster bitmap @2× pixel ratio">
            PNG
          </MenuItem>
          <MenuItem onClick={exportPdf} hint="Vector PDF — selectable text">
            PDF (vector)
          </MenuItem>
        </ul>
      )}
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
