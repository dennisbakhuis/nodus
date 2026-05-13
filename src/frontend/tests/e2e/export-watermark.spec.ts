import { test, expect } from "@playwright/test";
import * as path from "node:path";
import * as fs from "node:fs";

test.describe("Export watermark", () => {
  test("SVG export places the Nodus watermark as a 5th ring-label slot right of Monitor", async ({
    page,
  }) => {
    await page.goto("/radar");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("svg[aria-label='Radar arc view']", {
      timeout: 10_000,
    });

    const exportToggle = page.getByRole("button", { name: /export/i }).first();
    await exportToggle.click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: /svg/i }).click();
    const download = await downloadPromise;

    const tmpPath = path.join(test.info().outputDir, "radar-export.svg");
    await download.saveAs(tmpPath);
    const svgText = fs.readFileSync(tmpPath, "utf8");

    expect(svgText).toContain('data-watermark="nodus"');
    expect(svgText).toContain(">Nodus<");

    // Extract the watermark group, then its <image> and <text> attributes.
    // Geometry derives from src/radar/geometry.ts: CX=550, CY=550, R_INNER=55,
    // R_OUTER=360, N_RINGS=4. bandStep=76.25, slot centerX = CX + R_INNER +
    // 4.5*bandStep + markSize = 964.125 (one band-step + one logo-size past
    // Monitor), slot baseline y=CY+13=563. Wordmark "Nodus" is middle-anchored
    // at the slot; logo sits 4 px to its left at (933.125, ~552.2), size 16×16.
    const groupMatch = svgText.match(
      /<g[^>]*data-watermark="nodus"[^>]*>([\s\S]*?)<\/g>/,
    );
    expect(groupMatch).not.toBeNull();
    const group = groupMatch![1]!;

    const imgX = Number(/<image[^>]*\sx="([^"]+)"/.exec(group)?.[1]);
    const imgY = Number(/<image[^>]*\sy="([^"]+)"/.exec(group)?.[1]);
    const imgW = Number(/<image[^>]*\swidth="([^"]+)"/.exec(group)?.[1]);
    const imgH = Number(/<image[^>]*\sheight="([^"]+)"/.exec(group)?.[1]);
    expect(imgX).toBe(933.125);
    expect(imgY).toBeCloseTo(552.2, 5);
    expect(imgW).toBe(16);
    expect(imgH).toBe(16);

    const textBlock = /<text[^>]*>[\s\S]*?<\/text>/.exec(group)![0];
    const textX = Number(/\sx="([^"]+)"/.exec(textBlock)?.[1]);
    const textY = Number(/\sy="([^"]+)"/.exec(textBlock)?.[1]);
    const textAnchor = /text-anchor="([^"]+)"/.exec(textBlock)?.[1];
    const fontSize = Number(/font-size="([^"]+)"/.exec(textBlock)?.[1]);
    expect(textX).toBe(964.125);
    expect(textY).toBe(563);
    expect(textAnchor).toBe("middle");
    expect(fontSize).toBe(8);

    // The watermark must share the y-baseline of the ring labels (Invest /
    // Pilot / Explore / Monitor). Pull a ring label out of the exported SVG
    // and confirm the y values agree.
    const ringLabelMatch = svgText.match(
      /<text[^>]*data-relview-ring[^>]*\sy="([^"]+)"[^>]*>[^<]*Monitor/,
    );
    expect(ringLabelMatch).not.toBeNull();
    const ringLabelY = Number(ringLabelMatch![1]);
    expect(textY).toBe(ringLabelY);

    // SVG y equality is not enough — the radar content sits inside a
    // top-level <g> that carries a fit-to-viewport translate/scale, and
    // the ring labels render through that transform. The watermark must
    // sit inside the same group, otherwise it renders at raw viewBox
    // coords and ends up 15 px below the ring labels on screen.
    const watermarkIdx = svgText.indexOf('<g data-watermark="nodus"');
    const transformedRootMatch = /<g\s+style="[^"]*transform:\s*translate/.exec(
      svgText,
    );
    expect(transformedRootMatch).not.toBeNull();
    const transformedRootIdx = transformedRootMatch!.index;
    const between = svgText.slice(transformedRootIdx, watermarkIdx);
    const opens = (between.match(/<g\b/g) ?? []).length;
    const closes = (between.match(/<\/g>/g) ?? []).length;
    expect(opens).toBeGreaterThan(closes); // watermark is a descendant of the transformed root

    // The watermark's mark image must have been inlined as a data: URL —
    // otherwise viewers that open the SVG outside the app would render a
    // broken-image icon for the logo.
    const hrefMatch = /<image[^>]*\shref="([^"]+)"/.exec(group);
    expect(hrefMatch?.[1]).toMatch(/^data:image\/svg\+xml/);
  });
});
