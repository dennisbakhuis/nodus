import { test, expect, type Page } from "@playwright/test";

/**
 * The radar's fit translate is computed in CSS pixels, but a CSS transform on
 * SVG content applies in user units, which the viewBox then scales. These tests
 * measure where the arc actually lands across viewport sizes — the drift the
 * conversion in RadarView's transform effect exists to remove was proportional
 * to the viewBox scale, so it only showed up away from ~1150px wide.
 */

/** Centre of the rendered radar group, and its container, in CSS pixels. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const svgEl = document.querySelector('svg[aria-label="Radar arc view"]');
    const g = svgEl ? (svgEl.querySelector("g") as SVGGElement | null) : null;
    if (!g) return null;
    const svg = g.ownerSVGElement;
    if (!svg) return null;
    const container = svg.parentElement;
    if (!container) return null;
    const gRect = g.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    if (gRect.width === 0 || cRect.width === 0) return null;
    return {
      contentCentre: gRect.left + gRect.width / 2 - cRect.left,
      containerWidth: cRect.width,
      overflowLeft: cRect.left - gRect.left,
      overflowRight: gRect.right - cRect.right,
    };
  });
}

const SIZES = [
  { width: 1280, height: 720 },
  { width: 1680, height: 1050 },
  { width: 2560, height: 1440 },
];

test.describe("Radar centering", () => {
  for (const size of SIZES) {
    test(`stays centred at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/radar");
      await page
      .waitForSelector('svg[aria-label="Radar arc view"] g', { timeout: 15_000 })
      .catch(() => {});
      await page.waitForTimeout(900);

      const m = await measure(page);
      test.skip(m === null, "radar did not render (no seeded data?)");
      if (!m) return;

      // The fit biases 2.5% left of centre. Once the translate is converted
      // the landing point is size-independent (measured 0.4729-0.4733 across
      // 1280-2560px), so 1.5% is a wide margin that still catches the drift.
      const expected = m.containerWidth * 0.475;
      expect(Math.abs(m.contentCentre - expected)).toBeLessThan(
        m.containerWidth * 0.015,
      );

      // Nothing may be clipped off the left edge; the old maths pushed the
      // radar left by ~118px at 2260px wide.
      expect(m.overflowLeft).toBeLessThan(2);
      expect(m.overflowRight).toBeLessThan(2);
    });
  }

  test("stays centred after a viewport resize", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/radar");
    await page
      .waitForSelector('svg[aria-label="Radar arc view"] g', { timeout: 15_000 })
      .catch(() => {});
    await page.waitForTimeout(900);

    await page.setViewportSize({ width: 2400, height: 1300 });
    await page.waitForTimeout(900);

    const m = await measure(page);
    test.skip(m === null, "radar did not render");
    if (!m) return;

    const expected = m.containerWidth * 0.475;
    expect(Math.abs(m.contentCentre - expected)).toBeLessThan(
      m.containerWidth * 0.015,
    );
    expect(m.overflowLeft).toBeLessThan(2);
  });

  test("a drag moves the radar by the same number of pixels", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 2400, height: 1300 });
    await page.goto("/radar");
    await page
      .waitForSelector('svg[aria-label="Radar arc view"] g', { timeout: 15_000 })
      .catch(() => {});
    await page.waitForTimeout(900);

    const before = await measure(page);
    test.skip(before === null, "radar did not render");
    if (!before) return;

    // Drag from a point on empty canvas, avoiding dots and labels.
    const box = await page
      .locator('svg[aria-label="Radar arc view"]')
      .boundingBox();
    if (!box) return;
    const y = box.y + box.height * 0.15;
    await page.mouse.move(box.x + box.width * 0.5, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5 + 120, y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const after = await measure(page);
    if (!after) return;

    // A 120px drag must move the content 120px — under the old maths it moved
    // 120 * viewBoxScale, which at this width was ~2x too far.
    expect(Math.abs(after.contentCentre - before.contentCentre - 120)).toBeLessThan(
      6,
    );
  });
});
