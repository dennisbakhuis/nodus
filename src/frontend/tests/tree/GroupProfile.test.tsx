import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getTopic = vi.fn();
vi.mock("../../src/api/client", () => ({
  getTopic: (slug: string) => getTopic(slug),
}));

const { GroupPanel, GroupProfileSection } = await import(
  "../../src/tree/GroupProfile"
);

function withPeople(
  people: Array<{ link_role: string; full_name: string; company: string }>,
) {
  getTopic.mockResolvedValue({
    persons: people.map((p) => ({
      link_role: p.link_role,
      person: {
        id: p.full_name,
        full_name: p.full_name,
        company: p.company,
        department: null,
        role: null,
      },
    })),
  });
}

describe("GroupProfileSection", () => {
  it("shows the remit, the boundary and the people", async () => {
    withPeople([
      { link_role: "Owner", full_name: "Dennis Bakhuis", company: "Nodus" },
    ]);
    render(
      <GroupProfileSection
        slug="artificial-intelligence"
        description="Learned from data."
        scope="Model families, not the apps on top."
        memberCount={5}
      />,
    );

    expect(screen.getByText("5 technologies")).toBeInTheDocument();
    expect(screen.getByText("Learned from data.")).toBeInTheDocument();
    expect(
      screen.getByText("Model families, not the apps on top."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Dennis Bakhuis")).toBeInTheDocument(),
    );
    expect(screen.getByText(/Owner · Nodus/)).toBeInTheDocument();
  });

  it("counts one member without pluralising", async () => {
    withPeople([]);
    render(
      <GroupProfileSection
        slug="g"
        description={null}
        scope={null}
        memberCount={1}
      />,
    );
    expect(screen.getByText("1 technology")).toBeInTheDocument();
  });

  it("says where to write a profile when there is none", async () => {
    withPeople([]);
    render(
      <GroupProfileSection
        slug="g"
        description={null}
        scope={null}
        memberCount={0}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(/No profile yet/)).toBeInTheDocument(),
    );
  });

  it("drops roles the group profile does not offer", async () => {
    // Author and Project Lead belong to a piece of work, not to a family.
    withPeople([
      { link_role: "Author", full_name: "Someone Else", company: "Nodus" },
      { link_role: "Contact", full_name: "Kept Person", company: "Nodus" },
    ]);
    render(
      <GroupProfileSection
        slug="g"
        description="x"
        scope={null}
        memberCount={2}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Kept Person")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Someone Else")).toBeNull();
  });

  it("keeps the profile readable when the people lookup fails", async () => {
    getTopic.mockRejectedValue(new Error("offline"));
    render(
      <GroupProfileSection
        slug="g"
        description="Still readable."
        scope={null}
        memberCount={3}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Still readable.")).toBeInTheDocument(),
    );
  });
});

describe("GroupPanel", () => {
  const base = {
    name: "Artificial Intelligence",
    slug: "artificial-intelligence",
    description: "Learned from data.",
    scope: null,
    memberCount: 5,
  };

  it("names the branch action after what the click will do", async () => {
    withPeople([]);
    const onToggleBranch = vi.fn();
    const { rerender } = render(
      <GroupPanel
        {...base}
        collapsed={false}
        onToggleBranch={onToggleBranch}
        onFocus={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Fold branch" }));
    expect(onToggleBranch).toHaveBeenCalled();

    rerender(
      <GroupPanel
        {...base}
        collapsed
        onToggleBranch={onToggleBranch}
        onFocus={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Unfold branch" }),
    ).toBeInTheDocument();
  });

  it("offers focus and close", async () => {
    withPeople([]);
    const onFocus = vi.fn();
    const onClose = vi.fn();
    render(
      <GroupPanel
        {...base}
        collapsed={false}
        onToggleBranch={vi.fn()}
        onFocus={onFocus}
        onClose={onClose}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Focus on this" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Close group profile" }),
    );
    expect(onFocus).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
