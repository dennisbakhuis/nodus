import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PersonChip } from "../../src/radar/PersonChip";

const samplePerson = {
  id: "person-1",
  full_name: "Alice van Dam",
  company: "Acme",
  department: "Innovation",
  role: "Senior Innovation Engineer",
};

describe("PersonChip", () => {
  it("renders name and company", () => {
    render(<PersonChip person={samplePerson} linkRole="Owner" />);
    expect(screen.getByTestId("person-chip-name")).toHaveTextContent("Alice van Dam");
    expect(screen.getByTestId("person-chip-company")).toHaveTextContent("Acme");
  });

  it("renders role label", () => {
    render(<PersonChip person={samplePerson} linkRole="SubjectMatterExpert" />);
    expect(screen.getByTestId("person-chip-role")).toHaveTextContent("SME");
  });

  it("renders department when present", () => {
    render(<PersonChip person={samplePerson} linkRole="Author" />);
    expect(screen.getByTestId("person-chip-company")).toHaveTextContent("Innovation");
  });

  it("does not render email anywhere in the DOM", () => {
    const personWithEmail = { ...samplePerson };
    render(<PersonChip person={personWithEmail} linkRole="Contact" />);
    const chip = screen.getByTestId("person-chip");
    expect(chip.innerHTML).not.toMatch(/@\S+\.\S+/);
    expect(chip.innerHTML).not.toContain("email");
  });

  it("renders ProjectLead role correctly", () => {
    render(<PersonChip person={samplePerson} linkRole="ProjectLead" />);
    expect(screen.getByTestId("person-chip-role")).toHaveTextContent("Project Lead");
  });

  it("renders without department when null", () => {
    const personNoDept = { ...samplePerson, department: null };
    render(<PersonChip person={personNoDept} linkRole="Owner" />);
    expect(screen.getByTestId("person-chip-company")).toHaveTextContent("Acme");
    expect(screen.getByTestId("person-chip-company").textContent).not.toContain("·");
  });
});
