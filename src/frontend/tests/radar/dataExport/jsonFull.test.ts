import { describe, expect, it } from "vitest";
import {
  buildFullExport,
  fullExportFilename,
  fullExportJson,
} from "../../../src/radar/dataExport/jsonFull";
import { mockSmallRadarData } from "../../../src/radar/__fixtures__/mockRadarData";

describe("Full JSON export", () => {
  it("wraps the snapshot in a metadata envelope", () => {
    const env = buildFullExport(mockSmallRadarData, mockSmallRadarData.entries.slice(0, 3));
    expect(env.format).toBe("nodus-full");
    expect(env.version).toBe("1.0");
    expect(env.radar).toBe(mockSmallRadarData.radar);
    expect(env.segments).toBe(mockSmallRadarData.segments);
    expect(env.entries).toHaveLength(3);
    expect(typeof env.exported_at).toBe("string");
  });

  it("serializes to valid JSON", () => {
    const json = fullExportJson(mockSmallRadarData, mockSmallRadarData.entries.slice(0, 2));
    const parsed = JSON.parse(json);
    expect(parsed.format).toBe("nodus-full");
    expect(parsed.entries).toHaveLength(2);
  });

  it("filename includes the cycle", () => {
    expect(fullExportFilename(mockSmallRadarData)).toBe(
      "nodus-radar-2026-Q1-full.json",
    );
  });
});
