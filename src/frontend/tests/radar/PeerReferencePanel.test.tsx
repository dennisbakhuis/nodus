import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PeerReferencePanel } from "../../src/radar/PeerReferencePanel";

const sampleRef = {
  id: "pr-1",
  topic_id: "topic-1",
  party_id: "party-peer-co",
  party_name: "Peer Co",
  party_slug: "peer-co",
  peer_title: "Grid Forming Technologies",
  peer_ring_label: "Explore",
  peer_segment_label: "Flexibility",
  summary: "The peer org frames this as a key enabler for system stability.",
  peer_hero_image_url: null,
  urls: [
    {
      id: "url-1",
      url: "https://peer.example.com/radar/grid-forming",
      label: null,
      display_order: 1,
    },
    {
      id: "url-2",
      url: "https://peer.example.com/project/gfi",
      label: "Project page",
      display_order: 2,
    },
  ],
};

describe("PeerReferencePanel", () => {
  it("renders nothing when references array is empty", () => {
    const { container } = render(<PeerReferencePanel references={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a single reference correctly", () => {
    render(<PeerReferencePanel references={[sampleRef]} />);
    expect(screen.getByTestId("peer-reference-panel")).toBeInTheDocument();
    expect(screen.getByTestId("peer-party-name")).toHaveTextContent("Peer Co");
    expect(screen.getByTestId("peer-title")).toHaveTextContent("Grid Forming Technologies");
    expect(screen.getByTestId("peer-ring-label")).toHaveTextContent("Explore");
    expect(screen.getByTestId("peer-segment-label")).toHaveTextContent("Flexibility");
    expect(screen.getByTestId("peer-summary")).toHaveTextContent("The peer org frames this");
  });

  it("renders primary URL as View on button and secondary as inline link", () => {
    render(<PeerReferencePanel references={[sampleRef]} />);
    const primaryBtn = screen.getByTestId("peer-primary-url");
    expect(primaryBtn).toHaveAttribute("href", "https://peer.example.com/radar/grid-forming");
    const secondaryLinks = screen.getAllByTestId("peer-secondary-url");
    expect(secondaryLinks).toHaveLength(1);
    expect(secondaryLinks[0]).toHaveAttribute("href", "https://peer.example.com/project/gfi");
    expect(secondaryLinks[0]).toHaveTextContent("Project page");
  });

  it("renders many references correctly", () => {
    const refs = [
      sampleRef,
      {
        ...sampleRef,
        id: "pr-2",
        party_id: "party-peer-research",
        party_name: "Peer Research",
        party_slug: "peer-research",
        peer_title: "Peer Research Title",
        urls: [],
      },
      {
        ...sampleRef,
        id: "pr-3",
        party_id: "party-peer-three",
        party_name: "Peer Consortium",
        party_slug: "peer-consortium",
        peer_title: "Consortium Title",
        urls: [],
      },
    ];
    render(<PeerReferencePanel references={refs} />);
    const cards = screen.getAllByTestId("peer-reference-card");
    expect(cards).toHaveLength(3);
    const titles = screen.getAllByTestId("peer-title");
    expect(titles).toHaveLength(3);
  });

  it("shows fallback party name when party_name is missing", () => {
    render(
      <PeerReferencePanel
        references={[{ ...sampleRef, party_name: "" }]}
      />,
    );
    expect(screen.getByTestId("peer-party-name")).toHaveTextContent("Unknown peer");
  });

  it("opens all links in new tabs", () => {
    render(<PeerReferencePanel references={[sampleRef]} />);
    const primaryBtn = screen.getByTestId("peer-primary-url");
    expect(primaryBtn).toHaveAttribute("target", "_blank");
  });
});
