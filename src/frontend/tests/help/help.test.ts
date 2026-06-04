import { describe, it, expect } from "vitest";
import { routeToHelp } from "../../src/help/routeToHelp";
import { loadHelpContent } from "../../src/help/loadHelpContent";

describe("routeToHelp", () => {
  it("maps /manage/groups to its own help page (not the generic manage fallback)", () => {
    expect(routeToHelp("/manage/groups")).toEqual({
      slug: "manage-groups",
      title: "Groups",
    });
  });

  it("aligns sub-page titles with the nav labels", () => {
    expect(routeToHelp("/manage/persons").title).toBe("People");
    expect(routeToHelp("/manage/visibility").title).toBe("Data Visibility");
    expect(routeToHelp("/manage/api").title).toBe("API");
  });

  it("still resolves the generic /manage and top-level pages", () => {
    expect(routeToHelp("/manage").slug).toBe("manage");
    expect(routeToHelp("/radar/foo").slug).toBe("radar");
    expect(routeToHelp("/list").slug).toBe("list");
  });

  it("falls back to default for unknown routes", () => {
    expect(routeToHelp("/totally-unknown").slug).toBe("default");
  });
});

describe("loadHelpContent", () => {
  it("loads the new groups help content", () => {
    const md = loadHelpContent("manage-groups");
    expect(md).toContain("# Groups");
    expect(md).toContain("On-radar groups");
  });

  it("loads the edit-technology help (used by the in-modal drawer)", () => {
    const md = loadHelpContent("edit-technology");
    expect(md).toContain("Editing a technology");
    expect(md).toContain("Relations");
    expect(md).not.toContain("No help content available");
  });

  it("falls back to default.md for an unknown slug", () => {
    const md = loadHelpContent("does-not-exist");
    expect(md).toBe(loadHelpContent("default"));
  });
});
