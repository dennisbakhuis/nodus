import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { HeroImage } from "../../src/radar/HeroImage";

describe("HeroImage", () => {
  it("shows placeholder when hero_image_id is null", () => {
    render(<HeroImage heroImageId={null} />);
    expect(screen.getByTestId("hero-image-placeholder")).toBeInTheDocument();
  });

  it("shows placeholder when hero_image_id is undefined", () => {
    render(<HeroImage heroImageId={undefined} />);
    expect(screen.getByTestId("hero-image-placeholder")).toBeInTheDocument();
  });

  it("renders img element with correct src when hero_image_id is set", () => {
    render(<HeroImage heroImageId="abc-123" altText="My technology" />);
    const img = screen.getByTestId("hero-image") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain("/api/media/abc-123");
    expect(img.alt).toBe("My technology");
  });

  it("does not render placeholder when hero_image_id is provided", () => {
    render(<HeroImage heroImageId="abc-123" />);
    expect(screen.queryByTestId("hero-image-placeholder")).not.toBeInTheDocument();
  });
});
