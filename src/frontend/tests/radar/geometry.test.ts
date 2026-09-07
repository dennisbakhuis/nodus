import { describe, expect, it } from "vitest";
import {
  CX,
  CY,
  R_OUTER,
  SVG_W,
  VB_H,
  VB_Y,
  cssPanToUserUnits,
  projectUserPoint,
  viewBoxMapping,
} from "../../src/radar/geometry";

/**
 * Rectangles for a container of a given size, with the SVG filling it exactly.
 * The container sits at an arbitrary page offset so the helpers are exercised
 * on their container-relative maths rather than page coordinates.
 */
function rects(width: number, height: number, left = 37, top = 91) {
  return {
    svgRect: { left, top, width, height },
    containerRect: { left, top },
  };
}

/** The point the radar fit centres on — the arc's symmetry axis. */
const SYMMETRY = { x: CX, y: CY - R_OUTER / 2 };

/**
 * Where a user point actually lands once the browser applies the transform.
 *
 * A CSS transform on SVG content operates in user units, so the applied
 * translate is scaled by the viewBox on the way to the screen. This mirrors
 * the browser, deliberately independent of `projectUserPoint`.
 */
function browserLanding(
  point: { x: number; y: number },
  appliedUserTranslate: { x: number; y: number },
  zoom: number,
  mapping: { scale: number; originX: number; originY: number },
) {
  return {
    x:
      mapping.originX +
      mapping.scale * (appliedUserTranslate.x + zoom * point.x),
    y:
      mapping.originY +
      mapping.scale * (appliedUserTranslate.y + zoom * point.y),
  };
}

describe("viewBoxMapping", () => {
  it("is the identity when the container matches the viewBox exactly", () => {
    const { svgRect, containerRect } = rects(SVG_W, VB_H, 0, 0);
    const m = viewBoxMapping(svgRect, containerRect)!;
    expect(m.scale).toBe(1);
    expect(m.originX).toBe(0);
    // The viewBox starts at VB_Y, so user y=0 sits that far above the top edge.
    expect(m.originY).toBeCloseTo(-VB_Y, 6);
  });

  it("scales by the tighter axis, matching preserveAspectRatio meet", () => {
    const { svgRect, containerRect } = rects(SVG_W * 2, VB_H * 3);
    expect(viewBoxMapping(svgRect, containerRect)!.scale).toBe(2);
  });

  it("places the viewBox centre on the element centre", () => {
    const { svgRect, containerRect } = rects(2200, 1350);
    const m = viewBoxMapping(svgRect, containerRect)!;
    const centre = {
      x: m.originX + m.scale * (SVG_W / 2),
      y: m.originY + m.scale * (VB_Y + VB_H / 2),
    };
    expect(centre.x).toBeCloseTo(svgRect.width / 2, 6);
    expect(centre.y).toBeCloseTo(svgRect.height / 2, 6);
  });

  it("returns null for an unlaid-out element", () => {
    expect(viewBoxMapping(rects(0, 0).svgRect, rects(0, 0).containerRect)).toBe(
      null,
    );
  });
});

describe("cssPanToUserUnits", () => {
  // Container widths spanning a small laptop pane through a 4K monitor. The
  // radar constants were tuned at roughly 1150px, where the viewBox scale is
  // ~1 and the conversion is very nearly a no-op.
  const SIZES: Array<[number, number]> = [
    [900, 500],
    [1150, 760],
    [1600, 900],
    [2260, 1330],
    [3100, 1300],
  ];

  it.each(SIZES)(
    "lands the symmetry point exactly where the CSS-pixel maths intended (%ix%i)",
    (w, h) => {
      const { svgRect, containerRect } = rects(w, h);
      const mapping = viewBoxMapping(svgRect, containerRect)!;
      const zoom = 0.8;
      // A plausible fit translate: put the symmetry axis at 47.5% of the width.
      const intended = {
        x: w * 0.475,
        y: h * 0.55,
      };
      const cssTranslate = {
        x: intended.x - zoom * (mapping.originX + mapping.scale * SYMMETRY.x),
        y: intended.y - zoom * (mapping.originY + mapping.scale * SYMMETRY.y),
      };

      const applied = cssPanToUserUnits(cssTranslate, zoom, mapping);
      const landed = browserLanding(SYMMETRY, applied, zoom, mapping);

      expect(landed.x).toBeCloseTo(intended.x, 6);
      expect(landed.y).toBeCloseTo(intended.y, 6);
    },
  );

  // The regression this fix exists for: passing the CSS-pixel translate straight
  // through drifts by (zoom - 1) * origin + translate * (scale - 1), which is
  // zero only when the viewBox scale is 1.
  it.each(SIZES)(
    "differs from the unconverted value except at scale 1 (%ix%i)",
    (w, h) => {
      const { svgRect, containerRect } = rects(w, h);
      const mapping = viewBoxMapping(svgRect, containerRect)!;
      const zoom = 0.8;
      const cssTranslate = { x: -120, y: -60 };

      const applied = cssPanToUserUnits(cssTranslate, zoom, mapping);
      const naive = browserLanding(SYMMETRY, cssTranslate, zoom, mapping);
      const fixed = browserLanding(SYMMETRY, applied, zoom, mapping);
      const intended = projectUserPoint(SYMMETRY, cssTranslate, zoom, mapping);

      expect(fixed.x).toBeCloseTo(intended.x, 6);
      if (Math.abs(mapping.scale - 1) > 0.01) {
        expect(Math.abs(naive.x - intended.x)).toBeGreaterThan(1);
      }
    },
  );

  it("is a no-op at zoom 1 when the viewBox scale is 1 and the origin is 0", () => {
    const mapping = { scale: 1, originX: 0, originY: 0 };
    expect(cssPanToUserUnits({ x: 42, y: -17 }, 1, mapping)).toEqual({
      x: 42,
      y: -17,
    });
  });

  it("keeps a drag of N css pixels moving the content N css pixels", () => {
    const { svgRect, containerRect } = rects(2260, 1330);
    const mapping = viewBoxMapping(svgRect, containerRect)!;
    const zoom = 1.4;
    const before = { x: -300, y: -80 };
    const after = { x: before.x + 100, y: before.y };

    const landedBefore = browserLanding(
      SYMMETRY,
      cssPanToUserUnits(before, zoom, mapping),
      zoom,
      mapping,
    );
    const landedAfter = browserLanding(
      SYMMETRY,
      cssPanToUserUnits(after, zoom, mapping),
      zoom,
      mapping,
    );

    expect(landedAfter.x - landedBefore.x).toBeCloseTo(100, 6);
  });

  it("anchors the cursor point when zooming, as the wheel handler assumes", () => {
    const { svgRect, containerRect } = rects(1600, 900);
    const mapping = viewBoxMapping(svgRect, containerRect)!;
    const cursor = { x: 640, y: 320 };
    const zoom = 0.9;
    const translate = { x: -150, y: -70 };

    // The wheel handler's CSS-pixel maths for a zoom about the cursor.
    const next = 1.35;
    const k = next / zoom;
    const nextTranslate = {
      x: cursor.x - k * (cursor.x - translate.x),
      y: cursor.y - k * (cursor.y - translate.y),
    };

    // Whatever user point sat under the cursor must still sit under it.
    const before = projectUserPoint(SYMMETRY, translate, zoom, mapping);
    const after = projectUserPoint(SYMMETRY, nextTranslate, next, mapping);
    expect(after.x - cursor.x).toBeCloseTo(k * (before.x - cursor.x), 6);
    expect(after.y - cursor.y).toBeCloseTo(k * (before.y - cursor.y), 6);
  });
});

describe("projectUserPoint", () => {
  it("agrees with the browser once the translate is converted", () => {
    const { svgRect, containerRect } = rects(1920, 1080);
    const mapping = viewBoxMapping(svgRect, containerRect)!;
    const zoom = 1.15;
    const translate = { x: -210, y: -95 };
    const landed = browserLanding(
      SYMMETRY,
      cssPanToUserUnits(translate, zoom, mapping),
      zoom,
      mapping,
    );
    const projected = projectUserPoint(SYMMETRY, translate, zoom, mapping);
    expect(landed.x).toBeCloseTo(projected.x, 6);
    expect(landed.y).toBeCloseTo(projected.y, 6);
  });
});
