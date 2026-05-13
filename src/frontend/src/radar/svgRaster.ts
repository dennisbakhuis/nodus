/** Rasterize a self-contained SVG to a PNG data URL.
 *
 * Uses the canonical SVG→canvas path (serialize → blob URL → Image →
 * drawImage → toDataURL). The previous implementation routed through
 * `html-to-image`'s `toPng`, which wraps the source node inside a
 * `<foreignObject>` (XHTML rendering context); SVG fed through that path
 * with `<image>` / gradient / filter children rendered blank or threw.
 * The direct approach works because the caller prepares the SVG to be
 * self-contained (inlined styles, inlined image data: URLs). */
export async function svgToPngDataUrl(
  svg: SVGSVGElement,
  svgString: string,
  pixelRatio = 2,
): Promise<string> {
  const vb = svg.viewBox.baseVal;
  const w = vb.width || Number(svg.getAttribute("width")) || 0;
  const h = vb.height || Number(svg.getAttribute("height")) || 0;
  if (!w || !h) {
    throw new Error("Cannot rasterize SVG without width/height");
  }
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () =>
        reject(new Error("Failed to load SVG for PNG rasterization"));
      i.src = url;
    });
    const canvasW = Math.round(w * pixelRatio);
    const canvasH = Math.round(h * pixelRatio);
    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    ctx.drawImage(img, 0, 0, canvasW, canvasH);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
