import { useEffect, useRef, useState } from "react";
import jsPDF from "jspdf";
import { svg2pdf } from "svg2pdf.js";
import type { RadarData } from "./types";
import { exportPixelRatio, svgToPngDataUrl } from "./svgRaster";
import { CX, CY, R_INNER, R_OUTER } from "./geometry";
import { Button } from "../shared/Button";

export const NODUS_MARK_HREF = "/nodus_mark.svg";

// Breathing room, in viewBox units, kept around the content on export.
export const EXPORT_FRAME_PAD = 24;

/** Segment labels carry their direction as a glyph; the export redraws it. */
const ARROW_GLYPH = /[▲▼]/;

type Variant = "sidebar" | "header";

type Props = {
  svgRef: React.RefObject<SVGSVGElement | null>;
  data: RadarData;
  variant?: Variant;
  /**
   * Overrides for canvases that are not the radar. The menu itself only needs
   * a filename stem and something that turns the live SVG into a
   * self-contained one; everything downstream is shape-agnostic.
   */
  fileBase?: string;
  prepare?: (live: SVGSVGElement) => Promise<SVGSVGElement>;
};

/** Build a downloadable filename for the active radar cycle. */
export function radarFileBase(data: RadarData): string {
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

const SRGB_COLOR =
  /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\)$/;

/** Rewrite a computed `color(srgb r g b [/ a])` as `rgb()` / `rgba()`.
 *
 * Chrome resolves `color-mix()` — the tree's depth-tinted links — to the
 * `color()` form, which svg2pdf.js and older SVG renderers cannot parse, so
 * the links vanished from the PDF. Anything else passes through unchanged. */
export function toLegacyColor(value: string): string {
  const match = value.match(SRGB_COLOR);
  if (!match) return value;
  const [r, g, b] = [match[1], match[2], match[3]].map((channel) =>
    Math.round(Number(channel) * 255),
  );
  const alpha = match[4];
  if (alpha === undefined) return `rgb(${r}, ${g}, ${b})`;
  const a = alpha.endsWith("%")
    ? Number(alpha.slice(0, -1)) / 100
    : Number(alpha);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Walk both trees in lockstep, copying resolved presentation styles from each
 * live element onto its clone. Stops when the trees diverge (defensive — the
 * caller passes a `cloneNode(true)` so structures should match). */
export function inlineComputedStyles(src: Element, dst: Element): void {
  const cs = window.getComputedStyle(src);
  for (const prop of PRESENTATION_PROPS) {
    const val = cs.getPropertyValue(prop);
    if (val) (dst as SVGElement).style.setProperty(prop, toLegacyColor(val));
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

/** Mount `svg` off-screen so layout-dependent APIs (getBBox, glyph metrics,
 * the canvas rasterizer, svg2pdf measurement) can run on it, then take it out
 * again and drop the positioning that put it there. */
export function withOffscreen<T>(
  svg: SVGSVGElement,
  work: () => Promise<T> | T,
): Promise<T> {
  svg.style.position = "absolute";
  svg.style.left = "-99999px";
  svg.style.top = "0";
  document.body.appendChild(svg);
  return Promise.resolve()
    .then(work)
    .finally(() => {
      svg.remove();
      for (const prop of ["position", "left", "top"]) {
        svg.style.removeProperty(prop);
      }
    });
}

/** Rewrite inline CSS transforms into `transform` attributes.
 *
 * The radar pans, zooms and focuses through `style.transform`, which browsers
 * honour in a standalone SVG but svg2pdf.js, Inkscape, Illustrator and Office
 * do not — the PDF drew the radar at its unfitted coordinates. Every element
 * the app transforms this way sets `transform-origin: 0 0`, so the function
 * list carries over verbatim once the px / deg units are dropped. An inline
 * transform overrides the presentation attribute, so it replaces one too. */
export function cssTransformsToAttributes(svg: SVGSVGElement): void {
  for (const el of svg.querySelectorAll<SVGElement>("*")) {
    const css = el.style.transform;
    if (css && css !== "none") {
      el.setAttribute(
        "transform",
        css.replace(/px|deg/g, "").replace(/,\s*/g, " "),
      );
    }
    for (const prop of [
      "transform",
      "transform-origin",
      "will-change",
      "transition",
    ]) {
      el.style.removeProperty(prop);
    }
  }
}

/** Mirror `dominant-baseline` into `alignment-baseline` on every text node.
 *
 * The radar's rotated labels sit on `dominant-baseline: middle`, which
 * svg2pdf.js never reads — it positions text from `alignment-baseline` only —
 * so PDF labels landed half a line off their SVG position. Browsers resolve
 * the two properties to the same baseline, leaving the SVG and PNG as they
 * were. */
export function mirrorDominantBaseline(svg: SVGSVGElement): void {
  for (const text of svg.querySelectorAll<SVGElement>("text, tspan")) {
    const value =
      text.style.getPropertyValue("dominant-baseline") ||
      text.getAttribute("dominant-baseline");
    if (!value || value === "auto") continue;
    text.setAttribute("alignment-baseline", value);
  }
}

/** Redraw the ▲ / ▼ of the segment labels as triangle paths.
 *
 * jsPDF's built-in fonts stop at WinAnsi, so the PDF printed the glyphs' raw
 * code units ("%²", "%¼") where the arrows should be. The triangle takes the
 * glyph's cell as measured on the live label — a detached clone has no glyph
 * metrics — and is drawn in the label's own coordinate system, so it follows
 * the label's rotation. The label keeps its anchor: the glyph sits at the
 * free end of the text, so dropping it leaves the name where it was. Walks
 * both trees' <text> lists in lockstep, so it has to run before the clone
 * gains or loses any. */
export function replaceArrowGlyphs(
  live: SVGSVGElement,
  clone: SVGSVGElement,
): void {
  const liveTexts = Array.from(live.querySelectorAll<SVGTextElement>("text"));
  const cloneTexts = Array.from(clone.querySelectorAll<SVGTextElement>("text"));
  if (liveTexts.length !== cloneTexts.length) return;
  liveTexts.forEach((liveText, i) => {
    if (typeof liveText.getExtentOfChar !== "function") return;
    const cloneText = cloneTexts[i]!;
    const textNode = Array.from(cloneText.childNodes).find(
      (node) =>
        node.nodeType === Node.TEXT_NODE &&
        ARROW_GLYPH.test(node.textContent ?? ""),
    );
    if (!textNode) return;
    const content = textNode.textContent ?? "";
    const index = content.search(ARROW_GLYPH);
    let cell: DOMRect;
    try {
      cell = liveText.getExtentOfChar(index);
    } catch {
      return;
    }
    if (!cell.width || !cell.height) return;

    const fontSize = parseFloat(getComputedStyle(liveText).fontSize) || 10;
    const cx = cell.x + cell.width / 2;
    const cy = cell.y + cell.height / 2;
    const halfW = fontSize * 0.36;
    const halfH = fontSize * 0.31;
    const pointsUp = content[index] === "▲";
    const baseY = pointsUp ? cy + halfH : cy - halfH;
    const apexY = pointsUp ? cy - halfH : cy + halfH;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("data-arrow-glyph", pointsUp ? "up" : "down");
    path.setAttribute(
      "d",
      `M ${cx - halfW} ${baseY} L ${cx + halfW} ${baseY} L ${cx} ${apexY} Z`,
    );
    path.setAttribute("fill", getComputedStyle(liveText).fill);
    const transform = cloneText.getAttribute("transform");
    if (transform) path.setAttribute("transform", transform);
    cloneText.parentNode?.insertBefore(path, cloneText.nextSibling);

    textNode.textContent = content.replace(/\s*[▲▼]\s*/, " ").trim();
  });
}

const TRANSPARENT = /^(none|transparent|rgba\(\d+, \d+, \d+, 0\))$/;

/** Drop the transparent rectangles the radar keeps as pointer targets around
 * its labels. They draw nothing, but they reach further out than the labels
 * they belong to and would otherwise set the export frame. */
export function dropHitAreas(svg: SVGSVGElement): void {
  for (const rect of svg.querySelectorAll<SVGRectElement>("rect")) {
    const fill = rect.style.fill || rect.getAttribute("fill") || "none";
    const stroke = rect.style.stroke || rect.getAttribute("stroke") || "none";
    if (TRANSPARENT.test(fill) && TRANSPARENT.test(stroke)) rect.remove();
  }
}

/** Snap numeric font weights onto `normal` / `bold`.
 *
 * jsPDF's built-in fonts come in those two weights only, and svg2pdf.js falls
 * back to Times for any weight it cannot match — the semibold cycle label
 * came out in a serif face. The computed styles the export inlines are
 * numeric, so the PDF pass maps them onto the two the PDF can show. */
export function snapFontWeights(svg: SVGSVGElement): void {
  for (const el of svg.querySelectorAll<SVGElement>("text, tspan")) {
    const weight = el.style.fontWeight || el.getAttribute("font-weight") || "";
    const numeric = Number(weight);
    if (!weight || !Number.isFinite(numeric)) continue;
    el.style.fontWeight = numeric >= 600 ? "bold" : "normal";
  }
}

/** Emulate `paint-order: stroke` for svg2pdf.js, which paints every text
 * fill-then-stroke: the tree's captions carry a white 3px halo that way, and
 * the PDF showed the halo on top of the letters. A stroke-only copy goes in
 * behind each such text and the text itself keeps only its fill. */
export function emulatePaintOrder(svg: SVGSVGElement): void {
  for (const text of svg.querySelectorAll<SVGElement>("text")) {
    const order =
      text.style.getPropertyValue("paint-order") ||
      text.getAttribute("paint-order") ||
      "";
    if (!order.includes("stroke")) continue;
    const stroke = text.style.stroke || text.getAttribute("stroke") || "none";
    if (stroke === "none") continue;
    const halo = text.cloneNode(true) as SVGElement;
    halo.removeAttribute("id");
    halo.setAttribute("data-text-halo", "");
    halo.style.fill = "none";
    text.parentNode?.insertBefore(halo, text);
    text.style.stroke = "none";
    text.removeAttribute("stroke");
    text.removeAttribute("stroke-width");
  }
}

/** Point every text at jsPDF's built-in Helvetica.
 *
 * The app's font stack starts with Helvetica Neue, which the PDF cannot
 * embed, and svg2pdf.js only matches a family whose style list carries the
 * weight it wants: jsPDF lists `Helvetica` with capitalised styles, so a bold
 * caption fell through to the regular face. The lowercase `helvetica` entry
 * carries `normal` and `bold` and is what the PDF was drawing with anyway. */
export function snapFontFamilies(svg: SVGSVGElement): void {
  for (const el of svg.querySelectorAll<SVGElement>("text, tspan")) {
    el.style.fontFamily = "helvetica";
  }
}

/** Last pass before svg2pdf.js sees the SVG: everything here works around a
 * gap in that renderer and would only degrade the SVG and PNG exports. */
export function prepareForPdf(svg: SVGSVGElement): void {
  snapFontFamilies(svg);
  snapFontWeights(svg);
  emulatePaintOrder(svg);
}

/** Frame `svg` on what it draws: viewBox, width and height follow the union
 * of its content plus `EXPORT_FRAME_PAD`. Needs the SVG mounted — a detached
 * one reports an empty box — and falls back to `fallback` when it is not. */
function frameToContent(
  svg: SVGSVGElement,
  fallback: { x: number; y: number; width: number; height: number },
): void {
  let box = fallback;
  try {
    const measured = svg.getBBox();
    if (measured.width > 0 && measured.height > 0) {
      box = {
        x: measured.x - EXPORT_FRAME_PAD,
        y: measured.y - EXPORT_FRAME_PAD,
        width: measured.width + EXPORT_FRAME_PAD * 2,
        height: measured.height + EXPORT_FRAME_PAD * 2,
      };
    }
  } catch {
    // jsdom and the like: keep the fallback frame.
  }
  if (!box.width || !box.height) return;
  svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);
  svg.setAttribute("width", String(Math.round(box.width)));
  svg.setAttribute("height", String(Math.round(box.height)));
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
 * live SVG, resolves CSS variables to inline styles, turns the pan / zoom /
 * focus CSS transforms into attributes, frames the result on its content,
 * inlines image hrefs, and stamps a Nodus watermark. */
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
  // Both passes walk live and clone in lockstep, so they run before anything
  // is added to the clone.
  inlineComputedStyles(live, clone);
  replaceArrowGlyphs(live, clone);
  cssTransformsToAttributes(clone);
  mirrorDominantBaseline(clone);
  dropHitAreas(clone);
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
  // The live SVG fills its container and lets the fitted content spill past
  // the viewBox, which clipped the labels along the top once the clone was
  // pinned to viewBox dimensions. Frame the clone on its content instead —
  // measured with the transforms now in attributes, so a zoomed or focused
  // radar exports exactly what the reader sees. The live SVG keeps its
  // width="100%" sizing; only the clone is pinned.
  const vb = live.viewBox.baseVal;
  await withOffscreen(clone, () =>
    frameToContent(clone, {
      x: vb.x,
      y: vb.y,
      width: vb.width || live.clientWidth,
      height: vb.height || live.clientHeight,
    }),
  );
  await inlineExternalImages(clone);
  return clone;
}

export function ExportMenu({
  svgRef,
  data,
  variant = "sidebar",
  fileBase: fileBaseProp,
  prepare = prepareExportSvg,
}: Props) {
  const base = fileBaseProp ?? radarFileBase(data);
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

  async function exportSvg() {
    const live = svgRef.current;
    if (!live) return;
    await withBusy(async () => {
      const exported = await prepare(live);
      const blob = new Blob([radarSvgString(exported)], {
        type: "image/svg+xml;charset=utf-8",
      });
      downloadBlob(blob, `${base}.svg`);
    });
  }

  async function exportPng() {
    const live = svgRef.current;
    if (!live) return;
    await withBusy(async () => {
      const exported = await prepare(live);
      const vb = exported.viewBox.baseVal;
      const dataUrl = await svgToPngDataUrl(
        exported,
        radarSvgString(exported),
        exportPixelRatio(vb.width, vb.height),
      );
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${base}.png`;
      a.click();
    });
  }

  /** Vector PDF: hand the prepared SVG (resolved styles + inlined images +
   * watermark) to svg2pdf.js so text stays selectable at any zoom. */
  async function exportPdf() {
    const live = svgRef.current;
    if (!live) return;
    await withBusy(async () => {
      const exported = await prepare(live);
      prepareForPdf(exported);
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
      pdf.save(`${base}.pdf`);
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
        title="Export view"
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
          <MenuItem onClick={exportPng} hint="Raster bitmap, 4k px wide">
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
