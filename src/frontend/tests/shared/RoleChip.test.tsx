import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RoleChip } from "../../src/shared/RoleChip";

describe("RoleChip", () => {
  it("renders Author with label and icon", () => {
    render(<RoleChip role="Author" />);
    const chip = screen.getByLabelText("Role: Author");
    expect(chip).toHaveTextContent("Author");
    expect(chip.querySelector("svg")).not.toBeNull();
  });

  it("renders SubjectMatterExpert as SME", () => {
    render(<RoleChip role="SubjectMatterExpert" />);
    expect(screen.getByLabelText("Role: SME")).toHaveTextContent("SME");
  });

  it("renders ProjectLead as Project Lead", () => {
    render(<RoleChip role="ProjectLead" />);
    expect(screen.getByLabelText("Role: Project Lead")).toHaveTextContent(
      "Project Lead",
    );
  });

  it("uses a different icon path for each role", () => {
    const roles = [
      "Author",
      "Owner",
      "SubjectMatterExpert",
      "Contact",
      "ProjectLead",
    ] as const;
    const paths = roles.map((role) => {
      const { container, unmount } = render(<RoleChip role={role} />);
      const svg = container.querySelector("svg");
      const html = svg?.innerHTML ?? "";
      unmount();
      return html;
    });
    const uniquePaths = new Set(paths);
    expect(uniquePaths.size).toBe(roles.length);
  });

  it("exposes role as data-role for styling/queries", () => {
    render(<RoleChip role="Owner" />);
    expect(screen.getByLabelText("Role: Owner").getAttribute("data-role")).toBe(
      "Owner",
    );
  });
});
