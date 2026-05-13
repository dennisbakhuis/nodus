import { describe, it, expect } from "vitest";
import { getTrlPhase } from "../../src/radar/getTrlPhase";

describe("getTrlPhase", () => {
  it("returns Invalid for 0", () => {
    expect(getTrlPhase(0)).toBe("Invalid");
  });

  it("returns Discovery for 1", () => {
    expect(getTrlPhase(1)).toBe("Discovery");
  });

  it("returns Discovery for 2", () => {
    expect(getTrlPhase(2)).toBe("Discovery");
  });

  it("returns Discovery for 3", () => {
    expect(getTrlPhase(3)).toBe("Discovery");
  });

  it("returns Development for 4", () => {
    expect(getTrlPhase(4)).toBe("Development");
  });

  it("returns Development for 6", () => {
    expect(getTrlPhase(6)).toBe("Development");
  });

  it("returns Demonstration for 7", () => {
    expect(getTrlPhase(7)).toBe("Demonstration");
  });

  it("returns Demonstration for 8", () => {
    expect(getTrlPhase(8)).toBe("Demonstration");
  });

  it("returns Deployment for 9", () => {
    expect(getTrlPhase(9)).toBe("Deployment");
  });

  it("returns Scale for 10", () => {
    expect(getTrlPhase(10)).toBe("Scale");
  });

  it("returns Scale for 12", () => {
    expect(getTrlPhase(12)).toBe("Scale");
  });

  it("returns Invalid for 13", () => {
    expect(getTrlPhase(13)).toBe("Invalid");
  });

  it("returns Invalid for null", () => {
    expect(getTrlPhase(null)).toBe("Invalid");
  });

  it("returns Invalid for undefined", () => {
    expect(getTrlPhase(undefined)).toBe("Invalid");
  });
});
