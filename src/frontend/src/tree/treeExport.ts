/**
 * Turns the live tree canvas into a self-contained SVG.
 *
 * The radar's `prepareExportSvg` cannot be reused as-is because the two
 * canvases are built differently:
 *
 *   - The radar has a `viewBox` and draws at fixed coordinates. The tree sizes
 *     itself to the viewport (`width="100%"`) and frames its content with a
 *     pan/zoom transform, so an export has to derive a viewBox from where the
 *     content actually is and drop the transform.
 *   - The tree's column captions are HTML pinned outside the SVG, so they are
 *     absent from a plain serialisation. `TreeView` renders a hidden in-SVG
 *     copy for exactly this reason; the export reveals it.
 *
 * Everything after that — resolving CSS variables to inline styles, inlining
 * image hrefs — is shared with the radar pipeline.
 */

import {
  NODUS_MARK_HREF,
  inlineComputedStyles,
  inlineExternalImages,
} from "../radar/ExportMenu";

const NS = "http://www.w3.org/2000/svg";

/** Space left around the content, in content units. */
const PAD = { top: 64, right: 48, bottom: 56, left: 48 };

type Box = { x: number; y: number; width: number; height: number };

/**
 * Nodus mark and wordmark, bottom-right of the exported frame.
 *
 * Placed in content coordinates, which is only meaningful once the pan/zoom
 * transform has been cleared — call after `neutralisePanZoom`.
 */
function addWatermark(svg: SVGSVGElement, box: Box): void {
  const markSize = 16;
  const fontSize = 8;
  const gap = 4;

  const group = document.createElementNS(NS, "g");
  group.setAttribute("data-watermark", "nodus");
  group.setAttribute("opacity", "0.85");
  group.setAttribute("pointer-events", "none");

  const baselineY = box.y + box.height - 12;
  const textWidth = fontSize * 0.55 * "Nodus".length;
  const textX = box.x + box.width - 16 - textWidth / 2;

  const image = document.createElementNS(NS, "image");
  image.setAttribute("x", String(textX - textWidth / 2 - gap - markSize));
  image.setAttribute("y", String(baselineY - fontSize * 0.35 - markSize / 2));
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
  text.setAttribute("y", String(baselineY));
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("font-family", "system-ui, -apple-system, sans-serif");
  text.setAttribute("font-size", String(fontSize));
  text.setAttribute("font-weight", "700");
  text.setAttribute("fill", "#161616");
  text.textContent = "Nodus";

  group.appendChild(image);
  group.appendChild(text);
  svg.appendChild(group);
}

/**
 * Content extent of the *live* canvas.
 *
 * Measured on the live tree rather than the clone: `getBBox` needs a laid-out
 * element, and a detached clone reports zeros.
 */
function contentBox(live: SVGSVGElement): Box | null {
  const content = live.querySelector<SVGGElement>("[data-tree-content]");
  if (!content) return null;
  try {
    const box = content.getBBox();
    if (!box.width || !box.height) return null;
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  } catch {
    return null;
  }
}

/**
 * Drop the pan/zoom transform so content coordinates and viewBox coordinates
 * agree. Without this the export reproduces whatever the reader happened to
 * have scrolled to.
 */
function neutralisePanZoom(clone: SVGSVGElement): void {
  const root = clone.querySelector<SVGGElement>("[data-tree-root]");
  if (!root) return;
  root.style.removeProperty("transform");
  root.style.removeProperty("will-change");
  root.removeAttribute("transform");
}

/**
 * Resolve a `var(--token)` value against the live document.
 *
 * A detached SVG has no custom properties to resolve against, so anything the
 * export writes by hand has to be pinned to a literal first.
 */
function resolveToken(live: Element, value: string): string {
  const match = value.match(/^var\((--[^),\s]+)/);
  if (!match) return value;
  const resolved = getComputedStyle(live).getPropertyValue(match[1]!).trim();
  return resolved || value;
}

/**
 * Rebuild the column caption rail inside the exported SVG.
 *
 * On screen the rail is HTML pinned above the canvas so it survives panning,
 * which puts it outside anything a serialiser can see. Each lane carries its
 * own caption and accent, so the row can be reconstructed from the clone
 * without keeping a hidden copy in the live DOM.
 */
function addColumnHeaders(
  live: SVGSVGElement,
  clone: SVGSVGElement,
  box: Box,
): void {
  const lanes = clone.querySelectorAll<SVGRectElement>("[data-column-label]");
  if (lanes.length === 0) return;

  const muted = resolveToken(live, "var(--color-muted-text)");
  const group = document.createElementNS(NS, "g");
  group.setAttribute("data-column-rail", "");
  const baselineY = box.y - 34;

  for (const lane of lanes) {
    const x = Number(lane.getAttribute("x")) || 0;
    const width = Number(lane.getAttribute("width")) || 0;
    const centre = x + width / 2;

    const text = document.createElementNS(NS, "text");
    text.setAttribute("x", String(centre));
    text.setAttribute("y", String(baselineY));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-family", "system-ui, -apple-system, sans-serif");
    text.setAttribute("font-size", "11");
    text.setAttribute("font-weight", "700");
    text.setAttribute("letter-spacing", "0.08em");
    text.setAttribute("fill", muted);
    text.textContent = lane.getAttribute("data-column-label") ?? "";

    const rule = document.createElementNS(NS, "line");
    rule.setAttribute("x1", String(x + 10));
    rule.setAttribute("x2", String(x + width - 10));
    rule.setAttribute("y1", String(baselineY + 10));
    rule.setAttribute("y2", String(baselineY + 10));
    rule.setAttribute(
      "stroke",
      resolveToken(live, lane.getAttribute("data-column-accent") ?? ""),
    );
    rule.setAttribute("stroke-width", "2");

    group.appendChild(text);
    group.appendChild(rule);
  }

  const root = clone.querySelector<SVGGElement>("[data-tree-root]");
  (root ?? clone).appendChild(group);
}

export async function prepareTreeExportSvg(
  live: SVGSVGElement,
): Promise<SVGSVGElement> {
  const box = contentBox(live);
  const clone = live.cloneNode(true) as SVGSVGElement;
  if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", NS);
  if (!clone.getAttribute("xmlns:xlink")) {
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  }

  // Runs first, while clone and live are still structurally identical — it
  // walks both trees in lockstep and stops as soon as they diverge.
  inlineComputedStyles(live, clone);

  neutralisePanZoom(clone);

  // An export is of the tree, not of a moment in someone's reading of it: a
  // selection would otherwise bake the 0.18 dimming into the file, and a
  // zoomed-out reader would get a file with no leaf captions.
  clone.setAttribute("data-zoom-band", "near");
  for (const el of clone.querySelectorAll("[data-emphasis]")) {
    el.removeAttribute("data-emphasis");
  }

  if (box) addColumnHeaders(live, clone, box);

  const framed: Box = box
    ? {
        x: box.x - PAD.left,
        y: box.y - PAD.top,
        width: box.width + PAD.left + PAD.right,
        height: box.height + PAD.top + PAD.bottom,
      }
    : {
        x: 0,
        y: 0,
        width: live.clientWidth || 1200,
        height: live.clientHeight || 800,
      };

  clone.setAttribute(
    "viewBox",
    `${framed.x} ${framed.y} ${framed.width} ${framed.height}`,
  );
  clone.setAttribute("width", String(Math.round(framed.width)));
  clone.setAttribute("height", String(Math.round(framed.height)));

  addWatermark(clone, framed);
  await inlineExternalImages(clone);
  return clone;
}
