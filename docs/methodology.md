# Technology Scouting Methodology

A general methodology for doing technology scouting inside an organisation. Adapt it to your domain, scale, and governance.

Technology scouting is the practice; a **technology radar** is one of the artifacts it produces. This webapp supports the practice — registry, factsheets, assessments, movement history, role-based access — and renders the radar as one of several outputs.

---

## 1. Introduction & Purpose

### What is Technology Scouting?

Technology scouting is the systematic identification, assessment, tracking, and communication of emerging technologies relevant to an organisation. It is a continuous practice, not a one-off study. Done well, it answers four questions on a recurring basis:

1. **What is out there?** — Which technologies are emerging in our space, and where are they on the maturity curve?
2. **What matters to us?** — Of those, which align with our strategy, capabilities, and constraints?
3. **What should we do?** — For each relevant technology: invest, pilot, explore, monitor, or ignore?
4. **What did we learn?** — How are the assessments holding up against reality, and what should change next cycle?

Scouting differs from related practices:

- **Market research** asks "what are people buying?" Scouting asks "what is becoming possible?"
- **Competitive intelligence** asks "what are competitors doing?" Scouting asks "what could change the basis of competition?"
- **R&D management** asks "how do we run the projects we already chose?" Scouting asks "which projects should we be choosing?"

Scouting feeds the others. It is the upstream practice that keeps strategy, R&D, and product decisions connected to a changing technology landscape.

### Why Do It Deliberately?

Most organisations do some scouting ad-hoc: a leader reads a report, a team sees a demo, a partner mentions a startup. Ad-hoc scouting has a recurring pattern of failure:

- **Signals get lost.** The right technology is seen by the wrong person and never reaches a decision.
- **Assessments are not preserved.** The same technology is re-evaluated from scratch every two years because the previous analysis was never written down.
- **Recommendations are not actionable.** "We should look into X" sits in slide decks without an owner, a next step, or a review date.
- **No shared vocabulary.** Engineering, business, and leadership use different words for "ready", "promising", and "speculative", and talk past each other.

A deliberate scouting practice fixes these. It pays for itself when it produces three outcomes:

1. **Strategic alignment** — Innovation investment targets technologies that matter for the organisation, not the loudest or most fashionable.
2. **Shared vocabulary** — Engineering, business, leadership, and external partners use the same words for maturity, relevance, and action.
3. **Actionable guidance** — Each tracked technology points to a concrete next step: deploy, pilot, research, or watch.

### Audiences

| Audience | Primary use |
|----------|-------------|
| Scouting / innovation team | Run the practice; curate the registry |
| Business units / product teams | Identify technologies relevant to their domain; nominate use cases |
| Leadership | Inform strategic planning and investment decisions |
| Partners and peer organisations | Align joint roadmaps; share assessments |
| External stakeholders (academia, vendors, conferences) | Communicate the organisation's technology focus |

### Relationship to Existing Initiatives

Scouting complements, rather than replaces, existing planning processes. It feeds into innovation programmes, R&D budget cycles, partner roadmaps, and strategic reviews. It is most useful when explicitly wired into one or two existing decision moments (e.g., annual planning, quarterly portfolio review). A scouting practice that exists in isolation tends to wither.

---

## 2. The Scouting Cycle

Technology scouting is a continuous loop with five activities. Different activities run on different cadences; the loop never stops.

```
        ┌─────────────────────────────────────────────────┐
        │                                                 │
        ▼                                                 │
  1. SENSE  ──▶  2. CAPTURE  ──▶  3. ASSESS  ──▶  4. RECOMMEND  ──▶  5. COMMUNICATE
   (sources)      (registry)      (criteria)      (action level)        (radar, briefs)
        ▲                                                 │
        │                                                 │
        └────────────────────  6. REVISIT  ───────────────┘
                          (movement, deltas)
```

1. **Sense** — Continuous monitoring of sources (§3).
2. **Capture** — Nominated or detected technologies enter the registry as backlog (§4).
3. **Assess** — Each technology is scored against a defined framework (§5).
4. **Recommend** — Assessments inform a single recommended action level (§6).
5. **Communicate** — Findings are distilled into the radar, briefs, and other formats (§7).
6. **Revisit** — Every cycle, prior recommendations are re-examined against new evidence (§8).

The radar is the *output* of steps 4–5. The bulk of the work — sourcing, capturing, assessing, revisiting — happens before any radar is rendered. A radar without the practice behind it is decoration; the practice without a radar is hard to communicate.

---

## 3. Sensing: Where Technologies Come From

Sensing is the activity of staying aware of the technology landscape. It is continuous and distributed: no individual or team sees everything, so the question is how to combine many partial views into a coherent picture.

### 3.1 Source Channels

Make the channels explicit so they actually get monitored:

| Source | Description | Typical frequency |
|--------|-------------|-------------------|
| **Internal projects & operations** | Technologies surfaced by completed pilots, operational incidents, or internal experiments | Continuous |
| **Partner ecosystems** | Joint roadmaps with sister organisations, consortia, or alliances | Per partner cycle |
| **Industry bodies & standards** | Working group outputs, technical brochures, position papers | Per publication |
| **Conferences & events** | Sessions, posters, hallway conversations, exhibitor halls | After major events |
| **Vendor & startup landscape** | Demos, RFI responses, dedicated startup scouting, accelerator demo days | Continuous |
| **Academic research** | University partnerships, research institute studies, preprint servers | Per publication |
| **Analyst reports** | Hype cycles, peer radars, sector reports | Annually or per release |
| **Open employee nominations** | Any employee can flag a technology they think deserves attention | Continuous |

The single highest-leverage channel for most organisations is the last one: open nomination. The people closest to the work see signals first. Lowering the barrier to nominate — a short form, a Slack channel, a quarterly "what should we be looking at?" prompt — typically surfaces more useful signal than any single external feed.

### 3.2 Avoiding Source Capture

Every source has a bias. Analyst reports overweight what is fundable; conferences overweight what is presentable; vendor scouting overweights what is for sale. Healthy scouting **deliberately diversifies sources** rather than relying on one or two. A practice that draws only from Gartner, or only from a single accelerator, will have a systematically distorted view of what matters.

A useful diagnostic: at the end of each cycle, ask "where did our new entries come from?" If 80% trace to one channel, broaden the inputs before the next cycle.

### 3.3 Signal vs. Noise

Sensing produces far more candidates than the registry can absorb. Triage is part of the practice, not a bug. A simple two-question filter handles most cases:

1. **Plausible relevance?** Could this technology, if it matured, materially affect what our organisation does or how we do it?
2. **Not already covered?** Is this distinct from technologies already in the registry?

A "no" to either ends the conversation. A "yes" to both moves the technology into the registry as backlog (§4), where it gets a proper assessment.

---

## 4. The Technology Registry

The registry is the single source of truth for the scouting practice. Every technology the organisation has ever assessed lives here, with its full history. The radar is one *view* of the registry; the registry itself is broader and longer-lived.

Each technology in the registry has a factsheet (§9) and one of three statuses:

| Status | Meaning | Visible on radar? |
|--------|---------|-------------------|
| **On Radar** | Actively positioned with a current recommendation | Yes |
| **Backlog** | Nominated and recorded, but not yet assessed or not yet meeting the threshold for the radar | No |
| **Archive** | Previously on the radar but removed, or assessed and declined. Retains full history. | No |

### Why a Registry Matters

- **Technologies resurface.** A technology declined at TRL 2 may warrant reassessment three years later at TRL 5. The archive lets curators evaluate *what changed* rather than starting over.
- **Audit trail.** When leadership or partners ask "have you looked at X?", the registry answers — even if the answer is "yes, and here is why we are not pursuing it."
- **Institutional memory.** New team members and rotating contributors do not re-investigate ground already covered.
- **Pattern detection.** Looking across the registry over time reveals clusters, repeated false starts, and trends that no single assessment surfaces.

### Lifecycle

A technology enters the registry as **Backlog** on nomination. After assessment it moves to **On Radar** (with a recommendation level) or **Archive** (declined with documented reasoning). Entries removed from the radar move to Archive, retaining their factsheet and history. Archived entries can be reactivated to Backlog or directly to On Radar when new evidence warrants.

This webapp implements the registry as a database: factsheets, assessments, movement history, and status changes are all queryable and version-tracked. Exports (radar visualisation, PDF, JSON, CSV) are generated from this single store.

---

## 5. Assessment Framework

Assessment is how a nominated technology becomes a structured entry the organisation can reason about. The framework should be rigorous enough to produce comparable judgements across technologies but light enough that a small team can sustain it.

### 5.1 Criteria

For a small scouting team (2–5 people), six criteria with qualitative scales hit the sweet spot:

| # | Criterion | Description | Scale |
|---|-----------|-------------|-------|
| 1 | **Technology Readiness (TRL)** | Maturity per the standard TRL framework | TRL 1–9 (Discovery 1–3, Development 4–6, Demonstration 7–8, Deployment 9) |
| 2 | **Strategic Relevance** | Alignment with the organisation's strategy and known challenges | High / Medium / Low |
| 3 | **Impact Potential** | Magnitude of impact on operations, costs, safety, or market position if successfully deployed | Transformational / High / Medium / Low |
| 4 | **Implementation Feasibility** | Organisational readiness, integration complexity, required competences, supply chain | High / Medium / Low |
| 5 | **Time to Mainstream** | Expected years until commercial maturity for the organisation's application | 0–2 / 2–5 / 5–7 / 7–10 yr |
| 6 | **Collaboration Potential** | Opportunity for joint development with partners, peer organisations, or funded programmes | High / Medium / Low |

Rationale:

- **TRL** is the universal language of R&D maturity (EU programmes, NASA, national labs, most industry frameworks). Even if everything else is qualitative, TRL gives one objective anchor.
- **Strategic Relevance** forces assessors to articulate concrete use cases for *this organisation*. Generic "market disruption potential" is too abstract to act on.
- **Impact Potential** captures the upside if the technology lands. The four-level scale (with "Transformational" at the top) matches widely used impact frameworks.
- **Implementation Feasibility** is the realism check. It bundles organisational readiness, integration complexity, and external constraints (regulation, supply chain, standards) into one practical rating.
- **Time to Mainstream** preserves the temporal dimension without complicating the visualisation.
- **Collaboration Potential** is the lever for getting more done than the organisation could alone. If joint R&D programmes, partner ecosystems, or funded research are options, surface them in the assessment.

Adjust the set to your context. A consumer software organisation might replace "Collaboration Potential" with "Developer Experience"; a regulated industry might add "Regulatory Pathway". Keep the total at five to seven criteria — fewer loses signal, more overwhelms the assessors.

### 5.2 Scoring Process

Keep scoring lightweight or it will not be sustained:

1. **Initial scoring** by the scouting curator from desk research and existing knowledge.
2. **Validation** in a short (≈30-minute) consultation with one or two domain experts.
3. **Calibration** during the periodic review session (§8).

Scores are recorded on the factsheet. They inform the recommendation but **do not mechanistically determine it.** Resist the temptation to build weighted scoring formulas — they produce false precision and obscure the judgement call. The scouting practice should be *opinionated*, not algorithmic. A formula that outputs "Pilot" when every expert thinks "Explore" should make you distrust the formula, not the experts.

### 5.3 Larger-Scale Scoring Models

For reference, some sector consortia publish multi-parameter 1–5 scoring frameworks — among the most rigorous approaches — but they rely on crowd-sourced input from dozens of experts. Those models are excellent when the team scale supports them. For most in-house scouting practices (2–5 people), they are overengineered and unsustainable. Start with six qualitative criteria; add structure only when the team grows and the data justifies it.

---

## 6. Recommendation Levels

After assessment, each technology on the radar gets a single recommendation: what should the organisation do about it? This is the recommendation level, and it is what the radar visualisation communicates.

### 6.1 Choosing a Recommendation Model

Four common models from peer practices:

| Model | Example users | Strengths | Weaknesses |
|-------|---------------|-----------|------------|
| **Action-based** (Adopt / Trial / Assess / Hold) | Used by the canonical software-radar reference and many enterprise adopters | Directly actionable; widely understood in software | Less natural outside software contexts |
| **Investment-based** (Invest / Innovate / Research) | Used by some infrastructure operators | Maps to budget allocation | May oversimplify mixed decisions |
| **Experience-based** (Expert / Explorer / Observer) | Used by some research-driven organisations | Reflects organisational knowledge | Describes state, not action — readers ask "so what do I do?" |
| **Action-verb** (ACT / PREPARE / WATCH) | Used by some manufacturers | Intuitive; punchy | Only three levels; less granularity |

**Recommendation: four action-oriented levels.** Action-oriented names ("Invest", "Pilot", "Explore", "Monitor" or the canonical "Adopt / Trial / Assess / Hold") consistently outperform descriptive names. The reader wants to know *what to do*, not *what the curators currently know*.

A reasonable default set:

| Level | Definition | Typical signal |
|-------|-----------|----------------|
| **Invest** | Proven technology ready for operational deployment. Actively fund implementation. | Budget allocated; deployment plan exists; clear owner. |
| **Pilot** | Demonstrated value in a relevant context. Run structured pilots to validate for our organisation. | Dedicated pilot scope and success criteria; partner or vendor engaged. |
| **Explore** | Promising technology warranting active investigation. Build knowledge through research or PoCs. | Assigned to a researcher or working group; PoC scope defined. |
| **Monitor** | Relevant technology not yet requiring active effort. Track through desk research and events. | Included in scanning cadence; revisited each cycle; no dedicated resources. |

These map cleanly to a funnel: **Monitor → Explore → Pilot → Invest**. Entries move "inward" as evidence accumulates and "outward" when pilots fail or relevance fades.

A **Hold / Avoid** level is optional. Some published practices use "Hold" as an active deprecation signal ("stop starting new work with this") or "Avoid" similarly. If your organisation needs an explicit retirement signal for legacy technologies, add a fifth level. Most new practices do not need it on day one.

### 6.2 Placement Heuristics

Placement is ultimately a judgement, but these heuristics keep it consistent:

| Level | Typical profile |
|-------|-----------------|
| **Invest** | TRL ≥ 7; High strategic relevance; proven feasibility; clear use case with business owner |
| **Pilot** | TRL 5–7; High strategic relevance; feasibility demonstrated elsewhere; specific pilot opportunity |
| **Explore** | TRL 3–6; Medium-to-High strategic relevance; promising but unvalidated for this context |
| **Monitor** | TRL 1–4, or Medium-to-Low strategic relevance, or feasibility concerns; worth tracking, no active effort |

Technologies that score Low on both Strategic Relevance and Impact Potential should not appear on the radar at all. The radar is a curated view of the registry, not a comprehensive inventory.

### 6.3 Time Horizon as Metadata, not a Second Axis

Some radars double-encode the recommendation level with a time-to-mainstream radial axis (e.g., 0–2 yr / 3–6 yr / 7–10 yr). This creates ambiguity: an entry can be "deeply known" yet still seven years from mainstream — where does it sit? Capture time horizon as a metadata field on the factsheet and let the radar position communicate one thing: the recommended action. This matches the practice of most mature scouting teams.

---

## 7. Communicating Findings

Scouting produces value only when its findings reach the people who can act on them. The radar visualisation is one channel among several.

### 7.1 The Technology Radar

The radar is the most recognisable artifact of a scouting practice. It is a circular diagram with angular segments (technology categories) and concentric rings (recommendation levels). Each technology appears as a dot. Dot colour or icon indicates movement status (new, promoted, demoted, unchanged).

#### Segments

Segments group technologies by domain. They should:

- **Reflect the organisation's value chain or capability map.** Generic categories ("Software", "Hardware", "Process") rarely produce useful conversations. Domain-aligned segments do.
- **Be roughly balanced.** A segment with twenty entries and one with two suggests the segmentation is wrong, not that one segment is more important.
- **Stay stable across editions.** Renaming segments breaks comparability over time. Treat them as a long-lived taxonomy.
- **Be few.** Four to six segments is the practical range.

Common patterns across peer radars:

- **Value-chain segments** — One per stage of the organisation's primary process.
- **Capability segments** — One per capability area (e.g., for a software org: techniques, tools, platforms, languages & frameworks — the canonical software-radar model).
- **Trend-field segments** — One per macro-trend the organisation is responding to (a common pattern in published enterprise radars).

Pick one pattern and commit. Mixing them produces overlapping segments and constant boundary disputes.

#### Design Principles

- **Keep it simple.** The radar should be readable at a glance. Resist encoding additional dimensions (size, shape, colour overlays) — they make the visual dense without making it more useful. Position communicates the single most important signal: what to do.
- **Interactive web view.** Clicking a dot opens the factsheet. This is the primary day-to-day interface — the factsheet should always be one click away. This webapp provides this out of the box.
- **Static export.** A PDF or image version for presentations and leadership briefings. Always include a legend and a date.

### 7.2 Other Communication Formats

The radar alone is rarely enough. Each scouting cycle typically produces several deliverables:

1. **The radar itself** — Updated visualisation with all entries positioned.
2. **Summary brief** — One-page overview of key changes for leadership.
3. **Detailed report** — Full factsheets for new and changed technologies.
4. **Delta document** — Changelog of what moved, was added, was removed, and why.

### 7.3 Tailoring to Audiences

One artifact rarely fits all audiences:

| Audience | Format | Content | Frequency |
|----------|--------|---------|-----------|
| Scouting / innovation team | Interactive radar + full factsheets | Complete detail | Continuous access |
| Business units | Summary brief + segment-filtered view | Technologies relevant to their domain | Per cycle |
| Leadership | One-page summary + short briefing | Key movements, strategic implications, investment recommendations | Per cycle |
| Partners | Shared export + joint discussion | Common technologies, alignment opportunities | Per cycle or quarterly |
| External (conferences, publications) | Anonymised or selective version | Organisation's perspective without sensitive detail | As appropriate |

The webapp supports public and internal views through its RBAC layer (`PublicReader` sees only the public-facing radar). Use this to publish a sanitised external version without maintaining two separate datasets.

---

## 8. Governance & Cadence

A scouting practice needs an owner, a cadence, and a way to revisit prior judgements. Diffuse ownership leads to drift.

### 8.1 Roles

| Role | Responsibility | Webapp role | Effort |
|------|---------------|-------------|--------|
| **Scouting Curator** (2–3 people) | Maintain the registry, scan sources, run assessments, prepare each update | `Admin` | Ongoing |
| **Advisory Group** (5–8 people, cross-functional) | Validate assessments, contribute domain expertise, approve level changes | `Writer` | A few hours per cycle |
| **Sponsor** (1 leader) | Strategic oversight; ensures findings inform decisions; resolves escalations | `Reader` | Per-cycle briefing |
| **Public / external viewer** | Views the public-facing radar; no internal PII visible | `PublicReader` | n/a |

The "Webapp role" column maps each operational role to the four RBAC roles enforced by this webapp (`PublicReader` / `Reader` / `Writer` / `Admin`).

A two-to-three-person curator team is the recurring pattern across published peer practices: typically two FTEs or a small standing committee. Below two curators, the practice tends to stall when one person is unavailable; above five, coordination overhead grows faster than throughput.

### 8.2 Cadence

**Recommended: twice per year**, with a lighter mid-cycle review.

| Activity | Timing | Participants |
|----------|--------|--------------|
| Sensing / scanning | Continuous | Curators |
| Full update | Twice per year | Curators + Advisory Group |
| Mid-cycle review | Between full updates | Curators only |
| Leadership briefing | After each full update | Curators + Sponsor + leadership |

Published peer practices range from three times per year (which tends to strain a small team) to semi-annually (often reported as the sweet spot). For most organisations starting out, twice per year is enough to stay current without burning out the team.

### 8.3 Revisiting Prior Judgements

Every cycle, technologies already on the radar are reviewed for movement:

| Movement | Trigger | Example |
|----------|---------|---------|
| **Promotion** (outward → inward) | Higher TRL, successful pilot, stronger business case | Explore → Pilot after a successful external PoC |
| **Demotion** (inward → outward) | Failed pilot, stalled technology, weakened relevance | Pilot → Monitor after cost projections proved unviable |
| **Removal** | Fully mainstream (no longer "emerging") or deemed irrelevant | Removed entirely after broad operational deployment |
| **Addition** | New nomination passes triage | New entry at Explore |

Each movement is documented with a brief rationale. Over time, the movement history of a technology tells a useful story about the organisation's evolving understanding — and prevents the same debates being re-run from scratch every cycle.

---

## 9. Technology Factsheet Template

Every entry in the registry — regardless of status — has a standardised factsheet. The factsheet is the unit of work in the scouting practice: nominating, assessing, recommending, and revisiting all happen against this structure.

---

**Technology Name:** [e.g., a specific named technology]

**Registry Status:** [On Radar | Backlog | Archive]

**Segment:** [your segment list]

**Recommendation Level:** [Invest | Pilot | Explore | Monitor | N/A (if Backlog or Archive)]

**Last Movement:** [New | Promoted | Demoted | No Change | Removed | N/A] (with date)

### Description
Two to three paragraphs explaining the technology: what it is, how it works, why it matters. Written for a knowledgeable but non-specialist reader.

### Assessment

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Technology Readiness (TRL) | [1–9] | Brief justification |
| Strategic Relevance | [High / Medium / Low] | Link to a known strategic priority or challenge |
| Impact Potential | [Transformational / High / Medium / Low] | Operational, financial, or safety impact |
| Implementation Feasibility | [High / Medium / Low] | Key barriers or enablers |
| Time to Mainstream | [0–2 / 2–5 / 5–7 / 7–10 yr] | For this organisation's application |
| Collaboration Potential | [High / Medium / Low] | Partners, programmes, academic links |

### Use Cases
Two to four concrete use cases for the organisation.

### Key Players
Notable vendors, startups, research institutes, and standards bodies active in this space.

### Current Activities
Ongoing internal projects, pilots, PoCs, partnerships. If none, state "No current activities."

### Links & References
- Internal project references (if applicable)
- External funding / programme candidacy (if applicable)
- Peer references (if applicable)
- One to three key publications or standards

### Recommended Next Steps
One to three concrete actions, aligned with the current recommendation level.

### Last Updated
Date of most recent revision.
