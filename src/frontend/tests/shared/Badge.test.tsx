import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Badge } from "../../src/shared/Badge";

describe("Badge", () => {
  it("renders children", () => {
    render(<Badge>Hello</Badge>);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("renders all variants without error", () => {
    const variants = ["default", "primary", "success", "warning", "danger", "info", "neutral"] as const;
    variants.forEach((variant) => {
      const { unmount } = render(<Badge variant={variant}>{variant}</Badge>);
      expect(screen.getByText(variant)).toBeInTheDocument();
      unmount();
    });
  });
});
