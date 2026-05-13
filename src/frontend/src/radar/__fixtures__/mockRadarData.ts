import type { RadarData, RadarEntry } from "../types";

const SEGMENTS = [
  {
    id: "seg-1",
    name: "Platforms & Infrastructure",
    slug: "platforms-infrastructure",
    order: 0,
    theme_key: "bright-blue",
    is_active: true,
  },
  {
    id: "seg-2",
    name: "Data & AI",
    slug: "data-ai",
    order: 1,
    theme_key: "rose",
    is_active: true,
  },
  {
    id: "seg-3",
    name: "Security & Identity",
    slug: "security-identity",
    order: 2,
    theme_key: "teal",
    is_active: true,
  },
];

const RINGS = [
  { id: 1, name: "Invest" as const, order: 0 },
  { id: 2, name: "Pilot" as const, order: 1 },
  { id: 3, name: "Explore" as const, order: 2 },
  { id: 4, name: "Monitor" as const, order: 3 },
];

const MOVEMENTS = ["new", "promoted", "demoted", "unchanged"] as const;

function generateEntry(i: number): RadarEntry {
  const segIdx = i % 3;
  const ringIdx = i % 4;
  const movIdx = i % 4;
  const segId = `seg-${segIdx + 1}`;
  const ringId = ringIdx + 1;
  const mov = MOVEMENTS[movIdx] ?? "unchanged";
  const names = [
    "Generative AI",
    "Edge Computing",
    "WebAssembly",
    "Service Mesh",
    "Vector Databases",
    "Retrieval-Augmented Generation",
    "Federated Learning",
    "Confidential Computing",
    "Zero-Trust Networking",
    "Passwordless Auth",
    "Post-Quantum Crypto",
    "eBPF Observability",
    "Distributed Tracing",
    "OpenTelemetry",
    "GitOps",
    "Platform Engineering",
    "Internal Developer Portals",
    "Policy-as-Code",
    "Infrastructure-as-Code",
    "Container Sandboxing",
    "Multi-Agent Systems",
    "Knowledge Graphs",
    "Stream Processing",
    "Event-Driven Architecture",
    "CQRS",
    "Microfrontends",
    "Server Components",
    "AR/VR Headsets",
    "Digital Twins",
    "IoT Mesh Networks",
    "5G Private Networks",
    "Spatial Computing",
    "On-Device LLMs",
    "Differential Privacy",
    "Synthetic Data",
    "Data Contracts",
    "Lakehouse Architecture",
    "Embeddings Search",
    "AI Code Assistants",
    "Quantum-Inspired Optimisation",
  ];
  const baseName = names[i % names.length] ?? `Technology ${i}`;
  const name =
    `${baseName} ${Math.floor(i / names.length) > 0 ? String(Math.floor(i / names.length) + 1) : ""}`.trim();
  const slug = name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  const ringName = RINGS[ringIdx]?.name ?? "Monitor";
  return {
    topic_id: `topic-${i}`,
    id: `entry-${i}`,
    canonical_name: name,
    slug,
    technology_id: `tech-${i}`,
    registry_status: "On Radar",
    segment_id: segId,
    segment_name: SEGMENTS[segIdx]?.name ?? null,
    segment_slug: SEGMENTS[segIdx]?.slug ?? null,
    ring: ringName,
    ring_id: ringId,
    movement: mov,
    movement_from: ringIdx > 0 ? (RINGS[ringIdx - 1]?.name ?? null) : null,
    summary: `Summary for ${name}. This technology relates to segment operations and grid integration.`,
    last_updated: "2026-01-15",
    hero_image_url: null,
    peer_reference_count: 0,
    peer_references: [],
    persons: [],
    trl: (i % 9) + 1,
    time_to_mainstream:
      ["0-2 yr", "2-5 yr", "5-7 yr", "7-10 yr"][i % 4] ?? "2-5 yr",
    strategic_relevance: ["High", "Medium", "Low"][i % 3] ?? "Medium",
    not_for_external_publication: false,
  };
}

const entries: RadarEntry[] = Array.from({ length: 200 }, (_, i) =>
  generateEntry(i),
);

export const mockRadarData: RadarData = {
  radar: {
    title: "Technology Radar",
    cycle: "2026-Q1",
    generated_at: "2026-04-28T10:00:00Z",
  },
  cycle: {
    id: "00000000-0000-0000-0000-000000000001",
    name: "2026-Q1",
    start_date: "2026-01-01",
    end_date: null,
  },
  segments: SEGMENTS,
  rings: RINGS,
  entries,
};

export const mockSmallRadarData: RadarData = {
  ...mockRadarData,
  entries: entries.slice(0, 10),
};
