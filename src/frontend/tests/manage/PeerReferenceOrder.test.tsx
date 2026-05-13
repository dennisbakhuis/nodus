import { describe, it, expect } from "vitest";
import type { PeerReferenceUrlRead } from "../../src/manage/types";

function sortByDisplayOrder(
  urls: PeerReferenceUrlRead[],
): PeerReferenceUrlRead[] {
  return [...urls].sort((a, b) => a.display_order - b.display_order);
}

describe("PeerReference URL ordering", () => {
  const baseUrl: Omit<PeerReferenceUrlRead, "display_order" | "id" | "label"> = {
    peer_reference_id: "ref-1",
    url: "https://example.com",
    created_at: "2026-01-01T00:00:00Z",
  };

  it("sorts URLs by display_order ascending", () => {
    const urls: PeerReferenceUrlRead[] = [
      { ...baseUrl, id: "u3", label: "Third", display_order: 3 },
      { ...baseUrl, id: "u1", label: "First", display_order: 1 },
      { ...baseUrl, id: "u2", label: "Second", display_order: 2 },
    ];
    const sorted = sortByDisplayOrder(urls);
    expect(sorted[0]!.id).toBe("u1");
    expect(sorted[1]!.id).toBe("u2");
    expect(sorted[2]!.id).toBe("u3");
  });

  it("handles equal display_order (stable relative order)", () => {
    const urls: PeerReferenceUrlRead[] = [
      { ...baseUrl, id: "u1", label: "A", display_order: 1 },
      { ...baseUrl, id: "u2", label: "B", display_order: 1 },
    ];
    const sorted = sortByDisplayOrder(urls);
    expect(sorted).toHaveLength(2);
    expect(sorted[0]!.display_order).toBe(1);
    expect(sorted[1]!.display_order).toBe(1);
  });

  it("handles single URL", () => {
    const urls: PeerReferenceUrlRead[] = [
      { ...baseUrl, id: "u1", label: null, display_order: 1 },
    ];
    const sorted = sortByDisplayOrder(urls);
    expect(sorted).toHaveLength(1);
    expect(sorted[0]!.id).toBe("u1");
  });

  it("handles empty array", () => {
    expect(sortByDisplayOrder([])).toEqual([]);
  });
});
