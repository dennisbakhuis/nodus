import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import {
  TopicView,
  type InlineEditForm,
  type PublicationLink,
} from "../../src/topic-detail/TopicView";
import type { TopicDetailNested } from "../../src/topic-detail/types";

vi.mock("../../src/manage/api", () => ({
  listPersons: vi.fn().mockResolvedValue([]),
  listMovements: vi.fn().mockResolvedValue([]),
}));

function makeDetail(
  overrides: Partial<Record<string, unknown>> = {},
): TopicDetailNested {
  return {
    topic: {
      id: "topic-1",
      canonical_name: "Autonomous Business",
      slug: "autonomous-business",
    },
    technology: { id: "tech-1", hero_image_id: null },
    factsheet: {
      summary: "A short summary",
      description: "Plain description",
      last_updated: "2026-01-01",
    },
    assessment: null,
    aliases: [],
    recent_events: [],
    peer_references: [],
    peer_reference_count: 0,
    persons: [],
    hero_image_url: null,
    ...overrides,
  } as unknown as TopicDetailNested;
}

const emptyForm: InlineEditForm = {
  summary: "",
  description: "",
  key_players: "",
  recommended_next_steps: "",
  current_challenges: "",
  trl: "",
  trl_notes: "",
  time_to_mainstream: "",
  time_to_mainstream_notes: "",
  strategic_relevance: "",
  strategic_relevance_notes: "",
  impact_potential: "",
  impact_potential_notes: "",
  implementation_feasibility: "",
  implementation_feasibility_notes: "",
  collaboration_potential: "",
  collaboration_potential_notes: "",
} as unknown as InlineEditForm;

/** Mirrors how TopicDetailModal owns and patches the inline-edit form state. */
function EditHarness() {
  const [values, setValues] = useState<InlineEditForm>(emptyForm);
  const [links, setLinks] = useState<PublicationLink[]>([]);
  return (
    <TopicView
      detail={makeDetail()}
      inlineEdit={{
        values,
        onChange: (patch) => setValues((f) => ({ ...f, ...patch })),
        publicationLinks: links,
        onPublicationLinksChange: setLinks,
      }}
    />
  );
}

describe("TopicView assessment notes", () => {
  it("keeps focus while typing so a whole note can be entered", () => {
    render(
      <MemoryRouter>
        <EditHarness />
      </MemoryRouter>,
    );

    const notes = screen.getByLabelText("TRL (1–9) notes") as HTMLTextAreaElement;
    notes.focus();
    expect(document.activeElement).toBe(notes);

    // The regression: AssessmentBlock used to be declared inside its parent, so
    // every keystroke remounted the textarea and focus was lost after one
    // character. Type several and assert both the value and the focus survive.
    for (const value of ["B", "Bo", "Bou", "Boun", "Bound"]) {
      fireEvent.change(screen.getByLabelText("TRL (1–9) notes"), {
        target: { value },
      });
    }

    const after = screen.getByLabelText("TRL (1–9) notes") as HTMLTextAreaElement;
    expect(after.value).toBe("Bound");
    expect(document.activeElement).toBe(after);
  });

  it("offers a notes field for every assessment criterion", () => {
    render(
      <MemoryRouter>
        <EditHarness />
      </MemoryRouter>,
    );

    for (const label of [
      "TRL (1–9) notes",
      "Time to Mainstream notes",
      "Strategic Relevance notes",
      "Impact Potential notes",
      "Implementation Feasibility notes",
      "Collaboration Potential notes",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("shows the notes in the read view, not just the scores", () => {
    render(
      <MemoryRouter>
        <TopicView
          detail={makeDetail({
            assessment: {
              trl: 4,
              trl_notes: "Lab validation by all three vendors.",
              strategic_relevance: "High",
              strategic_relevance_notes: null,
            },
          })}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Assessment")).toBeInTheDocument();
    expect(
      screen.getByText("Lab validation by all three vendors."),
    ).toBeInTheDocument();
  });
});

describe("TopicView factsheet text", () => {
  it("renders markdown bullets as a real list", () => {
    render(
      <MemoryRouter>
        <TopicView
          detail={makeDetail({
            factsheet: {
              summary: "s",
              description: "Leading points:\n\n- First point\n- Second point",
              last_updated: "2026-01-01",
            },
          })}
        />
      </MemoryRouter>,
    );

    const items = screen.getAllByRole("listitem");
    const texts = items.map((li) => li.textContent);
    expect(texts).toContain("First point");
    expect(texts).toContain("Second point");
  });

  it("keeps single newlines visible so existing plain-text factsheets still read correctly", () => {
    const { container } = render(
      <MemoryRouter>
        <TopicView
          detail={makeDetail({
            factsheet: {
              summary: "s",
              description: "First line\nSecond line",
              last_updated: "2026-01-01",
            },
          })}
        />
      </MemoryRouter>,
    );

    expect(container.querySelector("br")).toBeTruthy();
  });

  it("no longer truncates the text at a --- rule", () => {
    render(
      <MemoryRouter>
        <TopicView
          detail={makeDetail({
            factsheet: {
              summary: "s",
              description: "Before the rule\n\n---\n\nAfter the rule",
              last_updated: "2026-01-01",
            },
          })}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Before the rule")).toBeInTheDocument();
    expect(screen.getByText("After the rule")).toBeInTheDocument();
  });
});
