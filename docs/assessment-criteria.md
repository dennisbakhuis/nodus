# Assessment Criteria Reference

The Nodus assessment framework scores each technology against **six criteria**. This document is the reference for what each criterion means, what the allowed values are, and how to choose between them. The conceptual rationale for the framework lives in [methodology.md §5](methodology.md#5-assessment-framework); the operator walkthrough is in [assessment-workflow.md](assessment-workflow.md).

The criteria, their enum values, and the TRL range are defined in code at [src/backend/app/models/assessment.py](../src/backend/app/models/assessment.py) and [src/backend/app/schemas/assessment.py](../src/backend/app/schemas/assessment.py). The values quoted in this document match those files byte-for-byte. If they ever drift, the schema is the source of truth.

---

## Scoring philosophy

Three principles shape how scores are used:

- **Opinionated, not algorithmic.** Scores inform the ring recommendation, they do not compute it. A formula that outputs "Pilot" when the room thinks "Explore" should make you distrust the formula, not the experts.
- **Partial scoring is allowed.** Every criterion field is nullable. A newly captured technology may have only TRL and Strategic Relevance set; the assessment is still valid and useful. Leave a field blank rather than guess.
- **Notes carry the judgement.** Every criterion has a paired `*_notes` text field. The score is the headline; the note is the reasoning the next curator (or your future self) will need to validate it. Always note any rating at the top of its scale — `Transformational` impact, `Invest` ring, `TRL 9+` — and any unusual call.

Scores are immutable once written. To revise, create a new factsheet version (which carries a new assessment). See [assessment-api.md](assessment-api.md) for the mechanics.

---

## 1. Technology Readiness (TRL)

**Field:** `trl` (integer) and `trl_notes` (text).
**Scale:** 1–12 (NASA 1–9, IEA-extended 10–12). Database CHECK enforces `1 ≤ trl ≤ 12`.

Maturity along the standard Technology Readiness Level scale. The single objective anchor in the framework — even when every other criterion is qualitative, TRL gives one number that can be compared across technologies.

**Phase derivation** (computed at render time, not stored):

| TRL | Phase |
|-----|-------|
| 1–3 | Discovery |
| 4–6 | Development |
| 7–8 | Demonstration |
| 9   | Deployment |
| 10–12 | Scale |

**Choosing a level:**

| TRL | Description | Typical evidence |
|-----|-------------|------------------|
| 1 | Basic principles observed | Academic paper; conceptual claim |
| 2 | Technology concept formulated | Concept paper; first design sketch |
| 3 | Experimental proof-of-concept | Lab prototype showing one mechanism |
| 4 | Component validation in lab | Working prototype in controlled environment |
| 5 | Component validation in relevant environment | Tested with realistic inputs and constraints |
| 6 | System demonstrated in relevant environment | End-to-end demo on representative load |
| 7 | System prototype in operational environment | Pilot deployment with real users / real data |
| 8 | System complete and qualified | Final form, certifications obtained |
| 9 | System proven in operational environment | First commercial deployment |
| 10 | Integrated commercial deployment | Multiple deployments; supply chain maturing |
| 11 | Mature commercial product | Standard offering; competitive market |
| 12 | Mass-market mature technology | Default choice in its category |

**Common pitfalls:**

- **Self-reporting drift.** Vendors routinely overstate TRL. Anchor against deployment evidence, not marketing claims.
- **Lab demo ≠ relevant environment.** TRL 4 (lab) and TRL 6 (relevant environment) are commonly conflated. Ask: does the demo run on the system's actual inputs, scale, and constraints?
- **Skipping a level.** If you cannot point to evidence for the level below, you are overscoring.

---

## 2. Strategic Relevance

**Field:** `strategic_relevance` and `strategic_relevance_notes`.
**Enum:** `"High"`, `"Medium"`, `"Low"`.

Alignment with the organisation's strategy and known challenges. Forces assessors to articulate a concrete use case for *this organisation*, not generic disruption potential.

| Value | Meaning |
|-------|---------|
| `High` | Maps directly to a named strategic objective or top-three operational challenge. A senior stakeholder can name what it would enable. |
| `Medium` | Plausibly useful; touches the strategy at one or two points but no urgent objective depends on it. |
| `Low` | Interesting in the field but no current strategic objective depends on it. May still warrant tracking. |

**Worked example.** A new fleet-anomaly-detection technique for an asset-heavy operator: `High` if operational reliability is a strategic objective and equipment failures are a top-three incident driver; `Medium` if monitoring already exists and this is incremental; `Low` if the operator has no relevant assets in scope.

**Common pitfalls:**

- **Generic strategic narratives.** "Important for the industry" is not a use case. Name a specific operational decision or strategic objective.
- **Confusing relevance with impact.** Relevance is *fit*; impact (§3) is *magnitude*. A technology can be highly relevant and modestly impactful (a small but unblocking fix), or vice versa.

---

## 3. Impact Potential

**Field:** `impact_potential` and `impact_potential_notes`.
**Enum:** `"Transformational"`, `"High"`, `"Medium"`, `"Low"`.

Magnitude of impact on operations, costs, safety, or market position if successfully deployed. Independent of feasibility — answers "what is the upside if it lands?"

| Value | Meaning |
|-------|---------|
| `Transformational` | Reshapes the business case or operating model. Pre-existing constraints disappear. Always write a note. |
| `High` | Material change in cost, capacity, safety, or speed for a core process. |
| `Medium` | Useful incremental improvement to a known process. |
| `Low` | Limited improvement, or relevant only to a narrow process. |

**Worked example.** Post-quantum cryptography for safety-critical control communications: `Transformational` is hard to justify on cost/operations alone but defensible on safety (a credible threat scenario it averts); `High` if it replaces an aging stack with a clear timeline; `Medium` if the existing stack has a long runway.

**Common pitfalls:**

- **Hype-driven `Transformational`.** Reserve the top rating for technologies whose absence would *currently* be a problem if deployed. If the impact requires the rest of the industry to shift first, that goes in Time to Mainstream (§5), not Impact.
- **Mixing impact with feasibility.** Impact is upside potential. Implementation Feasibility (§4) captures whether you can realise it.

---

## 4. Implementation Feasibility

**Field:** `implementation_feasibility` and `implementation_feasibility_notes`.
**Enum:** `"High"`, `"Medium"`, `"Low"`.

Organisational readiness, integration complexity, required competences, supply chain constraints, regulatory pathway. The realism check on the upside captured in Impact (§3).

| Value | Meaning |
|-------|---------|
| `High` | Plausible deployment within the next planning cycle. Skills exist or can be hired; vendors/partners available; no blocking regulatory dependency. |
| `Medium` | Doable but with significant lift: new competences, integration work, or external dependencies (standards, certifications, supply chain). |
| `Low` | Major barriers to deployment in the foreseeable horizon: missing skills/standards/supply chain, or a hard regulatory dependency. |

**Worked example.** A federated-learning platform for cross-unit analytics: `High` if the data infrastructure and ML team exist; `Medium` if data sharing across business units needs new governance; `Low` if both privacy regulation and data infrastructure would have to change first.

**Common pitfalls:**

- **Vendor optimism.** A vendor's "easy integration" usually elides identity, monitoring, change management, and the long tail of edge cases. Score against your own integration history.
- **Feasibility ≠ time.** A doable-but-slow project is `Medium` feasibility with a longer Time to Mainstream (§5), not `Low` feasibility.

---

## 5. Time to Mainstream

**Field:** `time_to_mainstream` and `time_to_mainstream_notes`.
**Enum:** `"0-2 yr"`, `"2-5 yr"`, `"5-7 yr"`, `"7-10 yr"`. (Literal strings — note the hyphens and the space before `yr`.)

Expected years until commercial maturity for *the organisation's application*. Captures the temporal dimension without complicating the radar visualisation.

| Value | Meaning |
|-------|---------|
| `0-2 yr` | Already deployed at peers or close to it; off-the-shelf for our context. |
| `2-5 yr` | Mainstream in our context within the next planning horizon. |
| `5-7 yr` | Beyond the current planning horizon but within the strategic horizon. |
| `7-10 yr` | Long-horizon; relevant for scenario planning but not for near-term action. |

**Worked example.** On-device LLM inference for end-user apps: `0-2 yr` for small-model summarisation features (already shipping in mainstream OSes); `2-5 yr` for general-purpose multi-modal copilots at consumer-grade quality; `7-10 yr` for fully offline agentic workflows at parity with hosted models.

**Common pitfalls:**

- **Global vs. local mainstream.** Mainstream where? "Mainstream in tier-one cloud" and "mainstream in your regulated context" can differ by half a decade. Score for your context.
- **Using time horizon as a second ring axis.** Don't. The recommendation (Invest/Pilot/Explore/Monitor) communicates action; time horizon is metadata. See [methodology.md §6.3](methodology.md#63-time-horizon-as-metadata-not-a-second-axis).

---

## 6. Collaboration Potential

**Field:** `collaboration_potential` and `collaboration_potential_notes`.
**Enum:** `"High"`, `"Medium"`, `"Low"`.

Opportunity for joint development with partners, peer organisations, or funded research programmes. The lever for getting more done than the organisation could alone.

| Value | Meaning |
|-------|---------|
| `High` | Active partner interest, funded programme available, or peer organisations explicitly seeking joint work. |
| `Medium` | Plausible partner ecosystem but no specific opportunity identified. |
| `Low` | Few collaborators; would have to go alone. |

**Worked example.** A shared monitoring platform for a class of high-value assets: `High` when peer operators face the same problem and a funded programme (e.g. an EU or national R&D call) is open; `Medium` when peers face the problem but no programme is funded; `Low` when the asset configuration is idiosyncratic.

**Common pitfalls:**

- **Collaboration as a tiebreaker.** High collaboration potential is a force multiplier on an already-relevant technology. It should not promote a low-relevance technology onto the radar on its own.
- **Ignoring funded programmes.** A funded call (EU, national, sectoral) is the strongest collaboration signal there is. Surface it in the note.

---

## Notes-field guidance

Every criterion has a paired `*_notes` text field. Recommended discipline:

- Always note **at the top of a scale** (`Transformational`, `Invest`, `TRL ≥ 9`). Top ratings are scarce by design — record what justifies one.
- Always note **at a scoring boundary** (e.g. `High` chosen over `Medium`). The note is what makes the boundary defensible at the next calibration session.
- Note the **specific evidence** — a paper, a deployment, a partner call — not a paraphrase. Curators six months from now need to verify it.
- Keep notes short. One to three sentences is usually enough; long notes belong in the factsheet description.

---

## See also

- [assessment-workflow.md](assessment-workflow.md) — how to use these criteria end-to-end in a scoring cycle.
- [ring-placement.md](ring-placement.md) — translating scored criteria into a ring recommendation (Invest / Pilot / Explore / Monitor).
- [assessment-api.md](assessment-api.md) — the API payload and immutability model.
- [methodology.md §5](methodology.md#5-assessment-framework) — rationale for the six-criterion design.
