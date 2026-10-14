import { describe, expect, it } from "vitest";
import {
  PNG_TARGET_LONG_EDGE,
  exportPixelRatio,
} from "../../src/radar/svgRaster";

describe("exportPixelRatio", () => {
  it("scales a radar-sized canvas to the long-edge target", () => {
    const ratio = exportPixelRatio(1100, 600);
    expect(ratio * 1100).toBeCloseTo(PNG_TARGET_LONG_EDGE, 5);
  });

  it("caps a tiny canvas at 4x", () => {
    expect(exportPixelRatio(100, 50)).toBe(4);
  });

  it("never drops a sprawling tree below 2x", () => {
    expect(exportPixelRatio(6000, 3000)).toBe(2);
  });

  it("falls back to 2x without a measurable size", () => {
    expect(exportPixelRatio(0, 0)).toBe(2);
  });
});
