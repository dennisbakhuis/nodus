"""Dummy seed dataset for playing around with Nodus.

Creates three generic segments, ten fictional organisations, and twenty
generic technologies distributed across rings and registry statuses. Hero
images for each technology are loaded from ``assets/technologies/<slug>.avif``
(Unsplash; see ``assets/technologies/sources.md`` for attribution).

Usage
-----
    cd src/backend
    uv run python -m app.seed.dummy

The script is idempotent: re-running it updates existing rows rather than
duplicating them.
"""

from __future__ import annotations

import json
import logging
import os
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from sqlmodel import Session, col, select

from app.models import (
    Alias,
    Assessment,
    Factsheet,
    Party,
    PeerReference,
    Segment,
    Source,
    Technology,
    Topic,
)
from app.models.cycle import Cycle
from app.models.initiative import Initiative
from app.models.relation import Relation, RelationType
from app.services.media import upload_media_asset
from app.services.normalize import normalize_alias

logger = logging.getLogger(__name__)


_TECHNOLOGY_IMAGES_DIR = Path(__file__).resolve().parents[4] / "assets" / "technologies"


@dataclass(frozen=True)
class _SegmentSpec:
    name: str
    slug: str
    display_order: int
    theme_key: str


@dataclass(frozen=True)
class _PartySpec:
    name: str
    slug: str
    url: str


@dataclass(frozen=True)
class _PeerRefSpec:
    party_name: str
    peer_title: str
    peer_ring_label: str | None
    peer_segment_label: str | None
    summary: str


@dataclass(frozen=True)
class _InitiativeSpec:
    title: str
    description: str
    status: str  # Idea | Scoping | Pilot | InProduction | Paused | Dropped


@dataclass(frozen=True)
class _TechSpec:
    canonical_name: str
    slug: str
    segment_slug: str | None
    ring: str | None
    registry_status: str
    summary: str
    description: str
    key_players: str
    use_cases: str
    challenges: str
    next_steps: str
    strategic_relevance: str | None
    impact_potential: str | None
    implementation_feasibility: str | None
    time_to_mainstream: str | None
    collaboration_potential: str | None
    trl: int | None
    aliases: tuple[str, ...] = field(default_factory=tuple)
    peer_refs: tuple[_PeerRefSpec, ...] = field(default_factory=tuple)
    initiatives: tuple[_InitiativeSpec, ...] = field(default_factory=tuple)


SEGMENTS: tuple[_SegmentSpec, ...] = (
    _SegmentSpec("Engineering", "engineering", 1, "bright-blue"),
    _SegmentSpec("Data & AI", "data-ai", 2, "rose"),
    _SegmentSpec("Platforms", "platforms", 3, "teal"),
)


PARTIES: tuple[_PartySpec, ...] = (
    _PartySpec("Acme Corp", "acme-corp", "https://acme.example.com/"),
    _PartySpec("Hooli", "hooli", "https://hooli.example.com/"),
    _PartySpec("Initech", "initech", "https://initech.example.com/"),
    _PartySpec("Stark Industries", "stark-industries", "https://stark.example.com/"),
    _PartySpec("Wayne Enterprises", "wayne-enterprises", "https://wayne.example.com/"),
    _PartySpec("Wonka Industries", "wonka-industries", "https://wonka.example.com/"),
    _PartySpec("Dunder Mifflin", "dunder-mifflin", "https://dundermifflin.example.com/"),
    _PartySpec("Tyrell Corporation", "tyrell-corporation", "https://tyrell.example.com/"),
    _PartySpec("Vandelay Industries", "vandelay-industries", "https://vandelay.example.com/"),
    _PartySpec("Soylent Corp", "soylent-corp", "https://soylent.example.com/"),
)


# Directional edges between technology topics — (from_slug, to_slug, type).
# Mirrors a plausible domain story without pretending to be authoritative.
RELATIONS: tuple[tuple[str, str, RelationType], ...] = (
    ("generative-ai", "ai-agents", RelationType.Drives),
    ("generative-ai", "rag", RelationType.Drives),
    ("generative-ai", "ai-augmented-software-engineering", RelationType.Drives),
    ("ai-agents", "multi-agent-systems", RelationType.Drives),
    ("knowledge-graph-platforms", "rag", RelationType.Drives),
    ("cloud-computing", "edge-computing", RelationType.Drives),
    ("platform-engineering", "cloud-computing", RelationType.DrivenBy),
    ("event-stream-processing", "architecture-backend", RelationType.Drives),
    ("cybersecurity", "ai-governance", RelationType.RelatesTo),
    ("federated-learning", "ai-governance", RelationType.RelatesTo),
    ("ai-agents", "ai-governance", RelationType.RelatesTo),
    ("quantum-computing", "cybersecurity", RelationType.Hinders),
    ("low-code-platforms", "platform-engineering", RelationType.Hinders),
    ("digital-twins", "edge-computing", RelationType.RelatesTo),
    ("digital-twins", "immersive-reality", RelationType.RelatesTo),
    ("blockchain", "cybersecurity", RelationType.RelatesTo),
    ("open-source-open-platforms", "platform-engineering", RelationType.Drives),
    ("multi-agent-systems", "knowledge-graph-platforms", RelationType.RelatesTo),
)


def _ref(
    party: str,
    title: str,
    ring: str | None,
    segment: str | None,
    summary: str,
) -> _PeerRefSpec:
    return _PeerRefSpec(party, title, ring, segment, summary)


def _ini(title: str, status: str, description: str = "") -> _InitiativeSpec:
    return _InitiativeSpec(title=title, description=description, status=status)


TECHNOLOGIES: tuple[_TechSpec, ...] = (
    _TechSpec(
        canonical_name="AI-Augmented Software Engineering",
        slug="ai-augmented-software-engineering",
        segment_slug="engineering",
        ring="Invest",
        registry_status="On Radar",
        summary="LLM-powered assistants embedded across the engineering workflow: IDE, CI, review.",
        description=(
            "AI assistants have moved from autocomplete novelties to core engineering "
            "tooling: in-IDE chat, autonomous task agents, repository-wide refactoring, "
            "and automated PR review. Productivity gains depend on review discipline and "
            "prompt engineering practices."
        ),
        key_players="GitHub Copilot, Cursor, JetBrains AI, Sourcegraph, Anthropic Claude",
        use_cases="- Boilerplate generation\n- Test scaffolding\n- Code review assistance\n- Documentation drafting",
        challenges="- License-tainted training data\n- Over-reliance erodes review rigour\n- Cost scales with seat count",
        next_steps="- Pilot two assistants side-by-side\n- Publish an internal usage policy",
        strategic_relevance="High",
        impact_potential="High",
        implementation_feasibility="High",
        time_to_mainstream="0-2 yr",
        collaboration_potential="Medium",
        trl=9,
        aliases=("AI Coding Assistants", "Pair-programming AI"),
        peer_refs=(
            _ref(
                "Hooli",
                "Middle-Out Coder",
                "Adopt",
                "Developer Productivity",
                "Hooli's internal coder is described as 'middle-out' — claims to dramatically improve velocity once teams stop reviewing the diffs.",
            ),
            _ref(
                "Initech",
                "TPS-Bot",
                "Trial",
                "Engineering Tools",
                "Initech rolled TPS-Bot out alongside a new cover-sheet policy. Adoption is mandatory; outcomes are unmeasured.",
            ),
        ),
        initiatives=(
            _ini(
                "IDE assistant rollout",
                "Pilot",
                "Two-vendor bake-off on a 50-seat cohort; success criteria are diff-acceptance rate and 4-week retention.",
            ),
            _ini(
                "Internal review-bot",
                "Scoping",
                "Automated first-pass PR review for style and test coverage; no merge authority.",
            ),
        ),
    ),
    _TechSpec(
        canonical_name="Platform Engineering",
        slug="platform-engineering",
        segment_slug="engineering",
        ring="Invest",
        registry_status="On Radar",
        summary="Treat the internal developer experience as a product: golden paths, IDPs, paved roads.",
        description=(
            "Platform engineering teams build and operate internal platforms that abstract "
            "away infrastructure complexity for application developers. The discipline "
            "borrows product-thinking: developer personas, roadmaps, KPIs around lead time "
            "and change-failure rate."
        ),
        key_players="Backstage, Port, Humanitec, Cortex",
        use_cases="- Internal Developer Portals\n- Golden-path templates\n- Self-service environments",
        challenges="- Platform team becomes a bottleneck if undersized\n- 'Platform' becomes a euphemism for a wiki",
        next_steps="- Pick three golden paths\n- Measure DORA metrics before/after",
        strategic_relevance="High",
        impact_potential="High",
        implementation_feasibility="Medium",
        time_to_mainstream="2-5 yr",
        collaboration_potential="Medium",
        trl=8,
        peer_refs=(
            _ref(
                "Stark Industries",
                "JARVIS Developer Platform",
                "Adopt",
                "Engineering",
                "JARVIS handles environment provisioning by voice. Reportedly works flawlessly except during arc-reactor outages.",
            ),
            _ref(
                "Wayne Enterprises",
                "Applied Sciences IDP",
                "Trial",
                "Developer Tools",
                "Internal portal whose 'production' environment is air-gapped to a cave. Onboarding latency is non-trivial.",
            ),
        ),
        initiatives=(
            _ini(
                "Internal Developer Portal v1",
                "InProduction",
                "Backstage-based catalog with three golden-path templates; tracked against lead-time and change-failure DORA metrics.",
            ),
            _ini(
                "Self-service environment provisioning",
                "Pilot",
                "Ephemeral preview environments per PR; behind a 10-team pilot before opening up.",
            ),
        ),
    ),
    _TechSpec(
        canonical_name="Architecture & Backend",
        slug="architecture-backend",
        segment_slug="engineering",
        ring="Pilot",
        registry_status="On Radar",
        summary="Choosing the right shape: modular monolith, microservices, serverless, or a mix.",
        description=(
            "The microservices pendulum has swung back. Modern guidance favours modular "
            "monoliths and service islands, splitting only at clear seams of ownership or "
            "scaling pressure. Backend choices are increasingly about reducing operational "
            "surface area rather than maximising flexibility."
        ),
        key_players="Spring, FastAPI, .NET, Go, Rails",
        use_cases="- Greenfield product backends\n- Migration off accidental microservices",
        challenges="- Architecture-by-resume\n- Distributed-system tax for small teams",
        next_steps="- Score each service against 'do we actually need a separate process?'",
        strategic_relevance="Medium",
        impact_potential="High",
        implementation_feasibility="Medium",
        time_to_mainstream="0-2 yr",
        collaboration_potential="Low",
        trl=9,
        peer_refs=(
            _ref(
                "Dunder Mifflin",
                "Paper-First Backend",
                "Hold",
                "Operations",
                "Backend topology mirrors the office floor plan. Sales pod has its own database, refuses to migrate.",
            ),
        ),
    ),
    _TechSpec(
        canonical_name="Event Stream Processing",
        slug="event-stream-processing",
        segment_slug="engineering",
        ring="Pilot",
        registry_status="On Radar",
        summary="Continuous, low-latency processing of high-volume event streams.",
        description=(
            "Stream processing is mainstream where freshness matters: fraud, observability, "
            "real-time personalisation. Operational maturity (schema registry, exactly-once "
            "semantics, replay tooling) is the bar, not the engine choice."
        ),
        key_players="Apache Kafka, Apache Flink, Pulsar, Confluent, Redpanda",
        use_cases="- Fraud detection\n- Real-time analytics\n- Service-to-service event buses",
        challenges="- Schema drift\n- Backpressure and replay\n- 'Just use a queue' anti-patterns",
        next_steps="- Pick one freshness-bound use case and prototype end-to-end",
        strategic_relevance="Medium",
        impact_potential="High",
        implementation_feasibility="Medium",
        time_to_mainstream="0-2 yr",
        collaboration_potential="Medium",
        trl=9,
        peer_refs=(
            _ref(
                "Acme Corp",
                "Roadrunner Bus",
                "Trial",
                "Data Platforms",
                "High-throughput event bus. Performance is excellent right up to the cliff edge.",
            ),
        ),
        initiatives=(
            _ini(
                "Fraud-signal streaming pipeline",
                "Pilot",
                "Kafka → Flink job replacing the nightly batch job; gating on end-to-end p99 < 5s.",
            ),
        ),
    ),
    _TechSpec(
        canonical_name="Low-Code Platforms",
        slug="low-code-platforms",
        segment_slug="engineering",
        ring="Explore",
        registry_status="On Radar",
        summary="Visual app builders that compress workflow-app delivery from months to days.",
        description=(
            "Low-code tooling has matured for internal workflows, dashboards, and "
            "approval-style apps. The traps are well-known (vendor lock-in, governance, "
            "performance ceilings); the wins are also well-known when scoped to the right "
            "use cases."
        ),
        key_players="Microsoft Power Platform, Retool, OutSystems, Mendix, Appian",
        use_cases="- Internal admin tooling\n- Approval workflows\n- Departmental dashboards",
        challenges="- Lock-in to vendor runtime\n- Shadow IT proliferation\n- Upgrade pain",
        next_steps="- Define a 'when to reach for low-code' decision tree",
        strategic_relevance="Medium",
        impact_potential="Medium",
        implementation_feasibility="High",
        time_to_mainstream="0-2 yr",
        collaboration_potential="Low",
        trl=8,
        peer_refs=(
            _ref(
                "Initech",
                "TPS Builder",
                "Adopt",
                "Developer Tools",
                "Cover-sheet generation is a drag-and-drop affair. Form is rebuilt every quarter.",
            ),
        ),
    ),
    _TechSpec(
        canonical_name="Open Source & Open Platforms",
        slug="open-source-open-platforms",
        segment_slug="engineering",
        ring="Monitor",
        registry_status="On Radar",
        summary="Strategic posture toward upstream contribution, foundations, and open standards.",
        description=(
            "Beyond just 'using open source', the strategic question is how much an "
            "organisation contributes upstream, joins foundations, and bets on open "
            "standards versus proprietary stacks. Licence-shift events (Elastic, MongoDB, "
            "Hashicorp) keep the topic relevant."
        ),
        key_players="CNCF, Apache, Linux Foundation, Hugging Face",
        use_cases="- Strategic contributor programs\n- Foundation memberships\n- Open standards advocacy",
        challenges="- Maintainer burnout\n- Licence shifts\n- Supply-chain trust",
        next_steps="- Inventory critical upstream dependencies\n- Establish a contribution policy",
        strategic_relevance="Medium",
        impact_potential="Medium",
        implementation_feasibility="Medium",
        time_to_mainstream="2-5 yr",
        collaboration_potential="High",
        trl=9,
        peer_refs=(
            _ref(
                "Vandelay Industries",
                "Vandelay OSS Office",
                "Trial",
                "Strategy",
                "Active foundation member. Contributions are reportedly 'import/export only'.",
            ),
        ),
    ),
    _TechSpec(
        canonical_name="Generative AI",
        slug="generative-ai",
        segment_slug="data-ai",
        ring="Invest",
        registry_status="On Radar",
        summary="Foundation models producing text, code, image, audio, and video from prompts.",
        description=(
            "Generative AI is now mainstream across knowledge-work tooling. Differentiation "
            "is shifting from raw model capability to evaluation, grounding, governance, and "
            "cost discipline."
        ),
        key_players="OpenAI, Anthropic, Google DeepMind, Meta AI, Mistral",
        use_cases="- Drafting and summarisation\n- Customer support copilots\n- Code generation",
        challenges="- Hallucination & grounding\n- Egress cost spikes\n- IP and data-residency",
        next_steps="- Establish an eval harness\n- Centralise gateways and per-team budgets",
        strategic_relevance="High",
        impact_potential="Transformational",
        implementation_feasibility="High",
        time_to_mainstream="0-2 yr",
        collaboration_potential="High",
        trl=9,
        aliases=("GenAI", "Foundation-model applications"),
        peer_refs=(
            _ref(
                "Stark Industries",
                "F.R.I.D.A.Y.",
                "Adopt",
                "AI",
                "Internal generative assistant with surprising sass and access to the suit's flight systems.",
            ),
            _ref(
                "Wayne Enterprises",
                "WayneGPT",
                "Trial",
                "Data Science",
                "Conservative deployment with very strict guardrails. Refuses to comment on bats.",
            ),
            _ref(
                "Hooli",
                "Box AI",
                "Adopt",
                "Cloud",
                "Bundled into 'Hooli Box'. Distinguishing it from Box-the-product remains an open problem.",
            ),
        ),
        initiatives=(
            _ini(
                "Central LLM gateway",
                "InProduction",
                "Single egress point with per-team budgets, eval logging, and PII redaction.",
            ),
            _ini(
                "Support-copilot pilot",
                "Pilot",
                "Tier-1 customer support summarisation and reply-drafting with human-in-the-loop.",
            ),
            _ini(
                "Eval harness",
                "Scoping",
                "Internal benchmark suite for grounding, refusal, and cost per task across model vendors.",
            ),
        ),
    ),
    _TechSpec(
        canonical_name="AI Agents",
        slug="ai-agents",
        segment_slug="data-ai",
        ring="Invest",
        registry_status="On Radar",
        summary="LLM-driven systems that plan, call tools, and act with minimal human-in-the-loop.",
        description=(
            "AI agents combine a planning loop, a memory store, and a tool-use interface. "
            "The hard parts are evaluation, error recovery, and bounded autonomy — not the "
            "agent loop itself."
        ),
        key_players="LangChain, LlamaIndex, AutoGen, CrewAI",
        use_cases="- Inbox triage\n- Research and summarisation\n- Multi-step ops runbooks",
        challenges="- Compounding errors over long horizons\n- Auditing tool-call decisions",
        next_steps="- Define a 'safe blast radius' policy\n- Build a regression suite of agent transcripts",
        strategic_relevance="High",
        impact_potential="High",
        implementation_feasibility="Medium",
        time_to_mainstream="2-5 yr",
        collaboration_potential="High",
        trl=6,
        aliases=("Agentic AI", "Autonomous agents"),
        peer_refs=(
            _ref(
                "Initech",
                "Office Space Agent",
                "Assess",
                "Automation",
                "Cancels meetings on its own initiative. Has filed a complaint to HR about itself.",
            ),
            _ref(
                "Acme Corp",
                "Coyote Planner",
                "Trial",
                "AI",
                "Agent plans elaborate, multi-step strategies. Outcomes are reliably catastrophic and only mildly funny.",
            ),
        ),
        initiatives=(
            _ini(
                "Inbox triage agent",
                "Pilot",
                "Read-only agent that drafts replies and proposes labels; ships nothing without human approval.",
            ),
            _ini(
                "Ops runbook agent",
                "Idea",
                "Scoped agent to execute one runbook (cert rotation) end-to-end; blast radius bounded by IAM.",
            ),
        ),
    ),
    _TechSpec(
        canonical_name="Retrieval-Augmented Generation",
        slug="rag",
        segment_slug="data-ai",
        ring="Invest",
        registry_status="On Radar",
        summary="Ground LLM answers in your own documents via a retrieval step before generation.",
        description=(
            "RAG remains the default pattern for putting private context in front of a "
            "model. The bottleneck is the retrieval quality, not the LLM — invest in "
            "evaluation, hybrid search, and chunking strategy."
        ),
        key_players="LlamaIndex, LangChain, Weaviate, Pinecone, Elastic",
        use_cases="- Internal knowledge assistants\n- Domain-specific Q&A\n- Policy lookup",
        challenges="- Retrieval recall, not LLM, is the lid\n- Eval data scarcity",
        next_steps="- Build an offline retrieval-quality harness\n- Compare hybrid vs. dense-only",
        strategic_relevance="High",
        impact_potential="High",
        implementation_feasibility="High",
        time_to_mainstream="0-2 yr",
        collaboration_potential="Medium",
        trl=8,
        aliases=("RAG",),
        peer_refs=(
            _ref(
                "Vandelay Industries",
                "Importer/Exporter RAG",
                "Adopt",
                "Data",
                "Indexes a corpus of imports and exports. Latex catalog support reportedly excellent.",
            ),
        ),
        initiatives=(
            _ini(
                "Policy assistant",
                "InProduction",
                "RAG over the internal HR and security policy corpus; tracked weekly for retrieval recall.",
            ),
            _ini(
                "Hybrid-search benchmark",
                "Scoping",
                "Offline harness comparing dense, BM25, and hybrid retrieval on the support-ticket corpus.",
            ),
        ),
    ),
    _TechSpec(
        canonical_name="Multi-Agent Systems",
        slug="multi-agent-systems",
        segment_slug="data-ai",
        ring="Monitor",
        registry_status="On Radar",
        summary="Coordinated ensembles of specialised agents collaborating on a task.",
        description=(
            "Multi-agent architectures promise specialised roles (planner, critic, "
            "executor) with explicit communication. Empirically, single-agent loops with "
            "strong tool use still beat naive multi-agent setups for most enterprise "
            "tasks — but the gap is closing for complex, long-horizon work."
        ),
        key_players="AutoGen, CrewAI, LangGraph",
        use_cases="- Complex research workflows\n- Simulation studies",
        challenges="- Coordination overhead\n- Failure modes hard to debug",
        next_steps="- Benchmark a multi-agent setup against single-agent with the same tools",
        strategic_relevance="Low",
        impact_potential="Medium",
        implementation_feasibility="Low",
        time_to_mainstream="5-7 yr",
        collaboration_potential="Medium",
        trl=4,
        peer_refs=(
            _ref(
                "Stark Industries",
                "Avengers Initiative Architecture",
                "Trial",
                "AI",
                "Heterogeneous agents with strong domain specialisation. Coordination overhead remains 'considerable'.",
            ),
        ),
    ),
    _TechSpec(
        canonical_name="Federated Learning",
        slug="federated-learning",
        segment_slug="data-ai",
        ring="Explore",
        registry_status="On Radar",
        summary="Train models across decentralised data without moving raw data to a central server.",
        description=(
            "Federated learning is interesting where data residency or trust prevents "
            "centralisation but a shared model is desirable. Honest threat models and "
            "differential-privacy choices matter as much as the algorithm."
        ),
        key_players="Flower, NVIDIA FLARE, OpenMined, Google",
        use_cases="- Cross-tenant model training\n- Privacy-preserving health analytics",
        challenges="- Non-IID data\n- Adversarial clients\n- Communication overhead",
        next_steps="- Map data-residency constraints to candidate use cases",
        strategic_relevance="Medium",
        impact_potential="Medium",
        implementation_feasibility="Low",
        time_to_mainstream="5-7 yr",
        collaboration_potential="High",
        trl=5,
        peer_refs=(
            _ref(
                "Dunder Mifflin",
                "Branch-Federated Forecasting",
                "Assess",
                "Data",
                "Each branch trains locally. Scranton refuses to converge.",
            ),
        ),
    ),
    _TechSpec(
        canonical_name="AI Governance",
        slug="ai-governance",
        segment_slug="data-ai",
        ring="Pilot",
        registry_status="On Radar",
        summary="Policies, controls, and tooling for safe and compliant use of AI systems.",
        description=(
            "AI governance covers model inventory, risk classification, evaluation, and "
            "audit trails. Regulators (EU AI Act, sector-specific guidance) are forcing "
            "the question; tooling is still consolidating."
        ),
        key_players="Credo AI, Holistic AI, Fairly AI, IBM watsonx.governance",
        use_cases="- Model registry\n- Risk classification\n- Audit-ready eval logs",
        challenges="- Cross-functional ownership unclear\n- Eval evidence is expensive",
        next_steps="- Inventory shadow AI usage\n- Adopt a risk-tier framework",
        strategic_relevance="High",
        impact_potential="Medium",
        implementation_feasibility="Medium",
        time_to_mainstream="2-5 yr",
        collaboration_potential="High",
        trl=6,
        peer_refs=(
            _ref(
                "Stark Industries",
                "Ultron Containment Council",
                "Trial",
                "Risk",
                "Strong governance framework, weak follow-through. Track record is mixed.",
            ),
        ),
        initiatives=(
            _ini(
                "Model inventory & risk tiering",
                "Pilot",
                "Discovery of every model in production (and shadow), tagged with an EU-AI-Act-aligned risk tier.",
            ),
            _ini(
                "Eval-evidence archive",
                "Idea",
                "Long-term storage of eval runs so audit requests can be served without reruns.",
            ),
        ),
    ),
    _TechSpec(
        canonical_name="Knowledge Graph Platforms",
        slug="knowledge-graph-platforms",
        segment_slug="data-ai",
        ring="Pilot",
        registry_status="On Radar",
        summary="Schema-flexible graph stores for entity relationships, lineage, and reasoning.",
        description=(
            "Knowledge graphs underpin entity-resolution, lineage, and grounded LLM "
            "applications. Recent interest in 'GraphRAG' has revived attention; the hard "
            "part is the ontology, not the database."
        ),
        key_players="Neo4j, TigerGraph, Stardog, AWS Neptune, Ontotext",
        use_cases="- Entity resolution\n- Master-data lineage\n- GraphRAG grounding",
        challenges="- Ontology stewardship\n- Modelling-by-committee paralysis",
        next_steps="- Pick one domain (customers, products) and prototype an ontology",
        strategic_relevance="Medium",
        impact_potential="Medium",
        implementation_feasibility="Medium",
        time_to_mainstream="2-5 yr",
        collaboration_potential="High",
        trl=7,
        peer_refs=(
            _ref(
                "Wonka Industries",
                "Everlasting Gobstopper Graph",
                "Trial",
                "Data",
                "Entities are connected by 'pure imagination' edges. Cypher queries are reportedly delicious.",
            ),
        ),
        initiatives=(
            _ini(
                "Customer entity-resolution graph",
                "Pilot",
                "Single customer view across CRM, billing, and support; ground-truth for downstream RAG.",
            ),
        ),
    ),
    _TechSpec(
        canonical_name="Cloud Computing",
        slug="cloud-computing",
        segment_slug="platforms",
        ring="Invest",
        registry_status="On Radar",
        summary="Public/hybrid cloud as the default substrate, with FinOps and cost discipline catching up.",
        description=(
            "Cloud is no longer the question; the question is how to use it without "
            "runaway costs and lock-in. Modern programmes pair cloud-native engineering "
            "with FinOps practices and a clear repatriation calculus for steady-state "
            "workloads."
        ),
        key_players="AWS, GCP, Azure, Oracle Cloud",
        use_cases="- Greenfield product platforms\n- Disaster recovery\n- Multi-region resilience",
        challenges="- FinOps maturity\n- Egress lock-in\n- Skills gap",
        next_steps="- Build a cost-anomaly alerting baseline\n- Pilot a workload repatriation calculator",
        strategic_relevance="High",
        impact_potential="High",
        implementation_feasibility="Medium",
        time_to_mainstream="0-2 yr",
        collaboration_potential="Medium",
        trl=9,
        peer_refs=(
            _ref(
                "Hooli",
                "Hooli Cloud",
                "Adopt",
                "Cloud",
                "Their entire 'innovation' division runs on it. The 'sustainability' section of the marketing site is impressive.",
            ),
        ),
        initiatives=(
            _ini(
                "FinOps anomaly alerting",
                "InProduction",
                "Per-team cost-anomaly Slackbot, threshold and forecast-based; reduced surprise spend by ~22%.",
            ),
            _ini(
                "Workload-repatriation calculator",
                "Scoping",
                "Decision aid for steady-state workloads; payback period vs. operational cost of self-hosting.",
            ),
        ),
    ),
    _TechSpec(
        canonical_name="Edge Computing",
        slug="edge-computing",
        segment_slug="platforms",
        ring="Explore",
        registry_status="On Radar",
        summary="Compute placed close to data sources or users to reduce latency and egress.",
        description=(
            "Edge has split into two camps: hyperscale CDN-style edges (Cloudflare Workers, "
            "Fastly Compute) and on-prem device-side edge. They have very different "
            "operational profiles."
        ),
        key_players="Cloudflare, Fastly, AWS Wavelength, NVIDIA Jetson",
        use_cases="- Latency-sensitive personalisation\n- Local inference\n- Bandwidth reduction",
        challenges="- Fleet management at scale\n- Observability over flaky links",
        next_steps="- Identify two use cases where p95 latency dominates",
        strategic_relevance="Medium",
        impact_potential="Medium",
        implementation_feasibility="Medium",
        time_to_mainstream="2-5 yr",
        collaboration_potential="Medium",
        trl=8,
        peer_refs=(
            _ref(
                "Wayne Enterprises",
                "Batcave Edge Node",
                "Adopt",
                "Infrastructure",
                "Single-tenant edge facility. Strong physical security. Cooling concerns.",
            ),
        ),
    ),
    _TechSpec(
        canonical_name="Cybersecurity",
        slug="cybersecurity",
        segment_slug="platforms",
        ring="Invest",
        registry_status="On Radar",
        summary="Zero-trust, identity-perimeter, supply-chain hardening: the moving floor of must-haves.",
        description=(
            "The cybersecurity surface widens every year: identity-perimeter, supply-chain "
            "attacks, SaaS-to-SaaS sprawl, AI-enabled phishing. The 'mesh' framing is "
            "mostly marketing for zero-trust composed at the application layer, with strong "
            "device posture and identity at the centre."
        ),
        key_players="CrowdStrike, Okta, Cloudflare, Zscaler, Wiz",
        use_cases="- Identity-first access controls\n- Posture-aware sessions\n- Supply-chain SBOMs",
        challenges="- Identity sprawl\n- Alert fatigue\n- Talent scarcity",
        next_steps="- Map current trust boundaries\n- Quantify lateral-movement blast radius",
        strategic_relevance="High",
        impact_potential="High",
        implementation_feasibility="Medium",
        time_to_mainstream="0-2 yr",
        collaboration_potential="Medium",
        trl=8,
        aliases=("Cybersecurity Mesh", "Zero Trust"),
        peer_refs=(
            _ref(
                "Tyrell Corporation",
                "Off-World Trust Mesh",
                "Trial",
                "Security",
                "Strong identity model. Replicants are still required to take the Voight-Kampff test.",
            ),
        ),
        initiatives=(
            _ini(
                "Device-posture-aware access",
                "InProduction",
                "Sessions downgraded when posture (OS patch level, MDM compliance) degrades mid-session.",
            ),
            _ini(
                "SBOM ingestion pipeline",
                "Pilot",
                "Continuous SBOM intake for first-party builds and critical third-party images; alerts on new CVEs.",
            ),
        ),
    ),
    _TechSpec(
        canonical_name="Digital Twins",
        slug="digital-twins",
        segment_slug="platforms",
        ring="Pilot",
        registry_status="On Radar",
        summary="Live simulation models of physical systems, fed by streaming sensor data.",
        description=(
            "Digital twins are valuable where the underlying physical asset is expensive, "
            "instrumented, and slow to iterate on. Most 'digital twin' projects are "
            "actually dashboards; the bar is bidirectional control or predictive "
            "what-if simulation."
        ),
        key_players="Siemens, Microsoft Azure Digital Twins, NVIDIA Omniverse, Ansys",
        use_cases="- Asset performance management\n- Scenario simulation\n- Predictive maintenance",
        challenges="- Sensor-data quality\n- Model lifecycle ownership",
        next_steps="- Pick one high-value asset and build a minimal bidirectional twin",
        strategic_relevance="Medium",
        impact_potential="High",
        implementation_feasibility="Medium",
        time_to_mainstream="2-5 yr",
        collaboration_potential="High",
        trl=7,
        peer_refs=(
            _ref(
                "Wonka Industries",
                "Chocolate River Twin",
                "Trial",
                "Operations",
                "Continuously simulates flow rate and viscosity. Augustus-Gloop edge cases remain unmodelled.",
            ),
        ),
        initiatives=(
            _ini(
                "Substation health twin",
                "Pilot",
                "Bidirectional digital twin of one substation; predictive maintenance and scenario what-ifs.",
            ),
        ),
    ),
    _TechSpec(
        canonical_name="Quantum Computing",
        slug="quantum-computing",
        segment_slug="platforms",
        ring="Monitor",
        registry_status="On Radar",
        summary="NISQ-era quantum hardware accessible via cloud APIs; useful applications still narrow.",
        description=(
            "Quantum computing remains in the noisy intermediate-scale (NISQ) regime. "
            "Real-world advantage is still narrow (optimisation hybrids, certain chemistry "
            "problems). Worth tracking; not worth retooling for."
        ),
        key_players="IBM Quantum, Google Quantum AI, IonQ, Rigetti, PsiQuantum",
        use_cases="- Optimisation hybrids\n- Materials & chemistry simulation\n- PQC migration prep",
        challenges="- Error correction overhead\n- Talent scarcity",
        next_steps="- Track post-quantum cryptography migration deadlines",
        strategic_relevance="Low",
        impact_potential="High",
        implementation_feasibility="Low",
        time_to_mainstream="7-10 yr",
        collaboration_potential="High",
        trl=4,
        peer_refs=(
            _ref(
                "Soylent Corp",
                "Quantum Soylent Optimiser",
                "Hold",
                "Research",
                "Optimises ingredient ratios across timelines. Ethics committee asks no further questions.",
            ),
        ),
    ),
    _TechSpec(
        canonical_name="Immersive Reality",
        slug="immersive-reality",
        segment_slug=None,
        ring=None,
        registry_status="Backlog",
        summary="VR / AR / MR headsets and platforms for spatial computing and remote collaboration.",
        description=(
            "Immersive reality has been 'the next big thing' for three decades. Hardware "
            "(Apple Vision Pro, Meta Quest, Magic Leap) has improved markedly, but the "
            "killer enterprise use case beyond training and design review remains "
            "elusive. Parked in backlog pending a credible business case."
        ),
        key_players="Meta, Apple, Microsoft, Magic Leap, Varjo",
        use_cases="- Training simulators\n- Design review\n- Remote collaboration",
        challenges="- Hardware cost vs. session time\n- Motion-sickness ceiling\n- Content authoring tooling",
        next_steps="- Revisit when a credible enterprise use case lands on the desk",
        strategic_relevance="Low",
        impact_potential="Medium",
        implementation_feasibility="Medium",
        time_to_mainstream="5-7 yr",
        collaboration_potential="Medium",
        trl=7,
        aliases=("Metaverse", "Spatial Computing"),
        peer_refs=(
            _ref(
                "Hooli",
                "HooliVerse",
                "Hold",
                "Innovation",
                "Heavy marketing, light adoption. CEO appears as a legless avatar in town halls.",
            ),
        ),
    ),
    _TechSpec(
        canonical_name="Blockchain",
        slug="blockchain",
        segment_slug=None,
        ring=None,
        registry_status="Archive",
        summary="Permissioned distributed ledgers for multi-party workflows.",
        description=(
            "After a decade of pilots, enterprise blockchain has not produced sustained, "
            "non-niche commercial value outside of a few cross-border-payment and "
            "tokenisation use cases. Archived; reopen only on a specific multi-party "
            "trust problem that a database cannot solve."
        ),
        key_players="Hyperledger, R3 Corda, Ethereum Enterprise",
        use_cases="- Cross-org provenance ledgers\n- Tokenisation experiments",
        challenges="- A database is almost always simpler\n- Governance among consortium members",
        next_steps="- Revisit only with a specific multi-party trust requirement",
        strategic_relevance="Low",
        impact_potential="Low",
        implementation_feasibility="Low",
        time_to_mainstream="7-10 yr",
        collaboration_potential="High",
        trl=6,
        aliases=("Distributed Ledger Technology", "Blockchain for Enterprise"),
        peer_refs=(
            _ref(
                "Vandelay Industries",
                "Vandelay Ledger",
                "Hold",
                "Distributed Systems",
                "Allegedly handles latex shipment provenance. Endpoint repeatedly disconnects.",
            ),
        ),
    ),
)


def _load_hero_bytes(slug: str) -> bytes:
    """Read the bundled hero image AVIF for *slug*.

    Resolves to ``<repo_root>/assets/technologies/<slug>.avif``.
    """
    path = _TECHNOLOGY_IMAGES_DIR / f"{slug}.avif"
    return path.read_bytes()


def _upsert_hero_image(session: Session, tech: Technology, spec: _TechSpec) -> None:
    if tech.hero_image_id is not None:
        return
    raw = _load_hero_bytes(spec.slug)
    asset = upload_media_asset(
        session,
        raw_bytes=raw,
        content_type="image/avif",
        original_filename=f"{spec.slug}.avif",
        alt_text=f"Hero image for {spec.canonical_name}",
    )
    tech.hero_image_id = asset.id


def _seed_segments(session: Session) -> dict[str, Segment]:
    """Upsert generic segments and return slug → Segment."""
    result: dict[str, Segment] = {}
    for spec in SEGMENTS:
        row = session.exec(select(Segment).where(Segment.slug == spec.slug)).first()
        if row is None:
            row = Segment(
                name=spec.name,
                slug=spec.slug,
                display_order=spec.display_order,
                theme_key=spec.theme_key,
                is_active=True,
            )
            session.add(row)
            session.flush()
        else:
            row.name = spec.name
            row.display_order = spec.display_order
            row.theme_key = spec.theme_key
            row.is_active = True
        result[spec.slug] = row
    return result


def _seed_parties(session: Session) -> dict[str, Party]:
    """Upsert fictional parties and return name → Party."""
    result: dict[str, Party] = {}
    for spec in PARTIES:
        row = session.exec(select(Party).where(Party.slug == spec.slug)).first()
        if row is None:
            row = Party(name=spec.name, slug=spec.slug, url=spec.url)
            session.add(row)
            session.flush()
        else:
            row.name = spec.name
            row.url = spec.url
        result[spec.name] = row
    return result


def _get_or_create_topic(session: Session, spec: _TechSpec) -> tuple[Topic, bool]:
    existing = session.exec(select(Topic).where(Topic.slug == spec.slug)).first()
    if existing is not None:
        existing.canonical_name = spec.canonical_name
        return existing, False
    topic = Topic(
        canonical_name=spec.canonical_name,
        slug=spec.slug,
        not_for_external_publication=False,
    )
    session.add(topic)
    session.flush()
    return topic, True


def _upsert_technology(
    session: Session,
    topic: Topic,
    spec: _TechSpec,
    segments: dict[str, Segment],
) -> Technology:
    on_radar = spec.registry_status == "On Radar"
    segment_id = segments[spec.segment_slug].id if (on_radar and spec.segment_slug) else None
    ring = spec.ring if on_radar else None

    tech = session.exec(select(Technology).where(Technology.topic_id == topic.id)).first()
    if tech is None:
        tech = Technology(
            topic_id=topic.id,
            registry_status=spec.registry_status,
            current_segment_id=segment_id,
            current_ring=ring,
            last_assessed_at=datetime.now(UTC),
        )
        session.add(tech)
        session.flush()
    else:
        tech.registry_status = spec.registry_status
        tech.current_segment_id = segment_id
        tech.current_ring = ring
        tech.last_assessed_at = datetime.now(UTC)
    return tech


def _upsert_factsheet(session: Session, tech: Technology, spec: _TechSpec) -> Factsheet:
    factsheet = session.exec(
        select(Factsheet).where(Factsheet.technology_id == tech.id).where(Factsheet.version == 1)
    ).first()
    payload: dict[str, Any] = dict(
        summary=spec.summary[:120],
        description=spec.description,
        key_players=spec.key_players,
        recommended_next_steps=spec.next_steps,
        current_challenges=spec.challenges,
        publication_links=json.dumps([]),
        last_updated=date.today(),
    )
    if factsheet is None:
        factsheet = Factsheet(technology_id=tech.id, version=1, **payload)
        session.add(factsheet)
        session.flush()
    else:
        for key, value in payload.items():
            setattr(factsheet, key, value)
    if tech.current_factsheet_id is None:
        tech.current_factsheet_id = factsheet.id
    return factsheet


def _upsert_assessment(session: Session, factsheet: Factsheet, spec: _TechSpec) -> None:
    row = session.exec(select(Assessment).where(Assessment.factsheet_id == factsheet.id)).first()
    payload: dict[str, Any] = dict(
        strategic_relevance=spec.strategic_relevance,
        impact_potential=spec.impact_potential,
        implementation_feasibility=spec.implementation_feasibility,
        time_to_mainstream=spec.time_to_mainstream,
        collaboration_potential=spec.collaboration_potential,
        trl=spec.trl,
    )
    if row is None:
        session.add(Assessment(factsheet_id=factsheet.id, **payload))
    else:
        for key, value in payload.items():
            setattr(row, key, value)


def _upsert_aliases(session: Session, topic: Topic, aliases: Iterable[str]) -> None:
    for raw in aliases:
        normalised = normalize_alias(raw)
        if not normalised:
            continue
        existing = session.exec(
            select(Alias).where(Alias.alias_name_normalised == normalised)
        ).first()
        if existing is not None:
            continue
        session.add(
            Alias(
                topic_id=topic.id,
                alias_name=raw,
                alias_name_normalised=normalised,
                source="dummy",
            )
        )


def _upsert_initiatives(
    session: Session,
    tech: Technology,
    initiatives: Iterable[_InitiativeSpec],
) -> int:
    """Insert any initiative whose title is not yet present for *tech*.

    Returns the number of rows inserted. Existing rows are left untouched so
    operators can edit them in the UI without the seed clobbering changes.
    """
    existing_titles = {
        row.title
        for row in session.exec(select(Initiative).where(Initiative.technology_id == tech.id)).all()
    }
    created = 0
    for order, spec in enumerate(initiatives):
        if spec.title in existing_titles:
            continue
        session.add(
            Initiative(
                technology_id=tech.id,
                title=spec.title,
                description=spec.description,
                status=spec.status,
                display_order=order,
            )
        )
        created += 1
    return created


def _upsert_peer_refs(
    session: Session,
    topic: Topic,
    parties: dict[str, Party],
    peer_refs: Iterable[_PeerRefSpec],
) -> None:
    for ref in peer_refs:
        party = parties.get(ref.party_name)
        if party is None:
            logger.warning("dummy: peer-ref party not found: %s", ref.party_name)
            continue
        source = session.exec(
            select(Source)
            .where(Source.party_id == party.id)
            .where(Source.source_name == f"{party.name} Tech Radar")
        ).first()
        if source is None:
            source = Source(
                party_id=party.id,
                source_name=f"{party.name} Tech Radar",
                source_url=party.url,
                scraped_at=datetime.now(UTC),
            )
            session.add(source)
            session.flush()

        existing = session.exec(
            select(PeerReference)
            .where(PeerReference.topic_id == topic.id)
            .where(PeerReference.party_id == party.id)
        ).first()
        payload: dict[str, Any] = dict(
            source_id=source.id,
            peer_title=ref.peer_title,
            peer_ring_label=ref.peer_ring_label,
            peer_segment_label=ref.peer_segment_label,
            summary=ref.summary,
            last_imported_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        if existing is None:
            session.add(PeerReference(topic_id=topic.id, party_id=party.id, **payload))
        else:
            for key, value in payload.items():
                setattr(existing, key, value)


def _seed_cycle(session: Session) -> bool:
    """Ensure at least one open cycle exists. Returns True if created."""
    existing = session.exec(select(Cycle)).first()
    if existing is not None:
        return False
    today = date.today()
    session.add(
        Cycle(
            name=f"Cycle {today.year}",
            start_date=today,
            end_date=None,
            color="#3c8cfa",
        )
    )
    return True


def _seed_relations(session: Session) -> int:
    """Upsert RELATIONS by (from_topic, to_topic, type). Returns the count created."""
    slug_to_topic = {
        t.slug: t
        for t in session.exec(select(Topic).where(col(Topic.slug).in_(_RELATION_SLUGS))).all()
    }
    created = 0
    for from_slug, to_slug, rel_type in RELATIONS:
        src = slug_to_topic.get(from_slug)
        dst = slug_to_topic.get(to_slug)
        if src is None or dst is None:
            logger.warning("dummy: relation skipped — missing topic (%s -> %s)", from_slug, to_slug)
            continue
        existing = session.exec(
            select(Relation)
            .where(Relation.from_topic_id == src.id)
            .where(Relation.to_topic_id == dst.id)
            .where(Relation.relation_type == rel_type.value)
        ).first()
        if existing is None:
            session.add(
                Relation(
                    from_topic_id=src.id,
                    to_topic_id=dst.id,
                    relation_type=rel_type.value,
                )
            )
            created += 1
    return created


_RELATION_SLUGS = sorted({s for triple in RELATIONS for s in (triple[0], triple[1])})


def seed_dummy(session: Session) -> dict[str, int]:
    """Run the full dummy seed against an existing Session.

    Returns
    -------
    dict[str, int]
        Counters for created/updated topics, peer references, hero images,
        and relations.
    """
    counts = {
        "cycles": 0,
        "segments": 0,
        "parties": 0,
        "topics_created": 0,
        "topics_updated": 0,
        "peer_refs": 0,
        "initiatives": 0,
        "hero_images": 0,
        "relations": 0,
    }

    if _seed_cycle(session):
        counts["cycles"] = 1

    segments = _seed_segments(session)
    counts["segments"] = len(segments)

    parties = _seed_parties(session)
    counts["parties"] = len(parties)

    for spec in TECHNOLOGIES:
        topic, created = _get_or_create_topic(session, spec)
        if created:
            counts["topics_created"] += 1
        else:
            counts["topics_updated"] += 1
        tech = _upsert_technology(session, topic, spec, segments)
        factsheet = _upsert_factsheet(session, tech, spec)
        _upsert_assessment(session, factsheet, spec)
        _upsert_aliases(session, topic, spec.aliases)
        _upsert_peer_refs(session, topic, parties, spec.peer_refs)
        counts["peer_refs"] += len(spec.peer_refs)
        counts["initiatives"] += _upsert_initiatives(session, tech, spec.initiatives)
        before_hero = tech.hero_image_id
        _upsert_hero_image(session, tech, spec)
        if before_hero is None and tech.hero_image_id is not None:
            counts["hero_images"] += 1

    session.flush()
    counts["relations"] = _seed_relations(session)
    session.commit()
    return counts


def main() -> None:
    """Entry point for ``uv run python -m app.seed.dummy``."""
    logging.basicConfig(
        level=os.environ.get("NODUS_LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    from app.db import create_db_and_tables, engine

    create_db_and_tables()
    with Session(engine) as session:
        counts = seed_dummy(session)
    logger.info("Dummy seed complete.")
    for key, value in counts.items():
        logger.info("  %-18s %s", key, value)


if __name__ == "__main__":
    main()
