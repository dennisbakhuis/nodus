# Assessment Workflow

Operator walkthrough for assessing a technology in Nodus, end-to-end. The conceptual framework (Sense → Capture → Assess → Recommend → Communicate → Revisit) is described in [methodology.md §2](methodology.md#2-the-scouting-cycle); this document maps each stage to the concrete UI and API actions.

For criterion definitions and scale values, see [assessment-criteria.md](assessment-criteria.md). For ring decision logic, see [ring-placement.md](ring-placement.md). For the technical API surface, see [assessment-api.md](assessment-api.md).

---

## Cadence

| Activity | Frequency | Who |
|----------|-----------|-----|
| Full assessment + radar publication | Twice yearly | Curator team (Writer role) + advisory group (Reader role) |
| Mid-cycle lightweight review | Once between full cycles | Curator team |
| Leadership briefing | After each full update | Admin / curator lead presents to leadership |
| Calibration session | Once per cycle, before publication | Curator team + advisory group |
| Open nominations | Continuous | Any role; Writer commits to registry |

The full cycle is the unit of practice. The mid-cycle review keeps the registry fresh without producing new deliverables.

---

## Roles in the workflow

Detailed permissions are in [auth.md](auth.md). The short version for assessments:

- **Writer** — curator team. Creates topics, scores assessments, writes factsheets, sets rings, closes cycles.
- **Reader** — advisory group and internal stakeholders. Reads all detail, including unpublished factsheets. Provides expert validation during scoring.
- **Admin** — DB lifecycle, user management, cycle closure. Operates the practice but does not normally score.
- **PublicReader** — external viewers. Sees only the published radar with `not_for_external_publication` topics filtered out.

A typical assessment is driven by one Writer (the curator) with input from one or two Readers (domain experts).

---

## Step-by-step: assessing a single technology

The walkthrough below assumes the technology is already in the system as a Backlog entry (i.e. Capture has happened). For the steps before that, see [Capture](#capture-nominating-a-new-technology) below.

### 1. Curator desk research

The curator gathers evidence: vendor docs, academic papers, peer radars, deployment case studies, partner conversations. The goal is enough material to **propose** a score on each of the six criteria — not enough to defend every one of them. Defence happens at validation.

Output of this step: a draft factsheet (summary, description, key players, current challenges) and a draft assessment, both held locally or in a working doc.

### 2. Domain-expert validation

A 30-minute consultation with one or two internal experts. Walk through the six criteria, surface disagreements, capture the reasoning that wins each call. The expert is checking the scores, not setting them — the curator remains accountable.

If a criterion cannot be agreed on in 30 minutes, leave it null. Partial assessments are explicitly supported (every criterion field is nullable). Better to score five well than six poorly.

### 3. Enter the assessment in Nodus

1. Open the Topic Detail view for the technology.
2. Switch to edit mode (Writer role required).
3. Fill the factsheet fields (summary, description, key players, recommended next steps, current challenges, publication links).
4. Fill the assessment block:
   - **TRL** — integer 1–12.
   - **Strategic Relevance** — High / Medium / Low.
   - **Impact Potential** — Transformational / High / Medium / Low.
   - **Implementation Feasibility** — High / Medium / Low.
   - **Time to Mainstream** — `0-2 yr` / `2-5 yr` / `5-7 yr` / `7-10 yr`.
   - **Collaboration Potential** — High / Medium / Low.
   - Each criterion has a notes textarea — use it for any boundary call or top-of-scale rating (see the notes-field guidance in [assessment-criteria.md](assessment-criteria.md#notes-field-guidance)).
5. Submit.

Submitting creates a **new Factsheet version** with an embedded Assessment attached. Previous versions are preserved; nothing is overwritten. The submit also stamps `last_assessed_at` on the Technology if a TRL was provided.

### 4. Decide the ring

Map the scored assessment to a ring (Invest / Pilot / Explore / Monitor) using the heuristics in [ring-placement.md](ring-placement.md). This is an opinionated call: the scores inform it, they don't compute it.

In the UI, set `current_ring` and `current_segment_id` on the Technology, and set `registry_status` to `On Radar`. The On-Radar status requires both ring and segment to be set (and any non-On-Radar status requires both to be null) — the database enforces this. Provide a short rationale; it is recorded on the resulting MovementEvent and surfaces in the cycle delta document.

### 5. Capture initiatives (optional but recommended)

If concrete pilots, PoCs, use cases, or programmes already exist for this technology, record them as Initiatives on the Technology. Initiative statuses are `Idea`, `Scoping`, `Pilot`, `InProduction`, `Paused`, `Dropped`. These show up alongside the assessment on the Topic Detail view and feed the detailed report at cycle close.

### 6. Publish

Publication is a cycle-level action, not a per-technology one. The curator decides which technologies are "ready for this cycle" and the cycle is closed by an Admin. Closing the cycle freezes a `snapshot_json` of radar state and generates the deliverables (radar JSON, summary brief, detailed report, delta document).

---

## Capture: nominating a new technology

Pre-cursor to the workflow above for technologies that aren't yet in the registry.

1. **Nominate.** Use the UI's "Add topic" flow, or `POST /topics`. Provide canonical name and (optionally) the initial Technology. The system runs an **alias dedup check** (exact + fuzzy) to catch duplicates of existing topics under different names.
2. **Resolve duplicates.** If the dedup check matches an existing topic, add the nominated name as an Alias on that topic rather than creating a new one. Aliases are case- and punctuation-insensitive (see [methodology.md §5.5](methodology.md#5-assessment-framework) for normalization details).
3. **Default state.** Newly created technologies land in `Backlog` status with no ring and no segment — they are recorded but not on the radar yet.

Backlog is the right place for technologies that have been nominated but not assessed, or for technologies that have been assessed and judged below the radar threshold (low strategic relevance, low impact). They stay queryable and can be revived without rescoring from scratch.

---

## Revisit: re-examining a prior assessment

At each cycle, every On-Radar technology should be revisited. The revisit usually produces one of:

- **No change.** The factsheet is still accurate; no new version is needed. Note the review in the cycle log.
- **New evidence, same ring.** Create a new factsheet version with the updated assessment and description. Ring unchanged.
- **Promotion / demotion.** New evidence justifies moving the technology inward (Monitor → Explore → Pilot → Invest) or outward. Update `current_ring` on the Technology — this emits a `RingChanged` MovementEvent with the rationale.
- **Removal.** Move `registry_status` to `Archive`. The ring and segment are automatically cleared. The technology and its full history remain queryable but stop appearing on the radar.

Every status or ring change emits an append-only MovementEvent. Movement events drive the delta document at cycle close and the institutional memory across cycles. **Never edit a prior factsheet or assessment in place** — the immutable versioning is what makes the audit trail trustworthy.

---

## Calibration

Once per cycle, the curator team and advisory group meet to recalibrate scoring across the portfolio. Typical agenda:

- Walk the radar ring by ring. For each entry: is the ring still right given the assessment?
- Sample three or four assessments at random. Reread them cold. Do the scores still make sense?
- Surface any criterion where the team's interpretation has drifted (e.g. has `High` strategic relevance become too easy to award?).
- Decide on adjustments before publication, not after.

Calibration is what keeps scores comparable across cycles. Skip it once and a year later the ratings will have quietly drifted.

---

## See also

- [assessment-criteria.md](assessment-criteria.md) — what each criterion means and how to choose a value.
- [ring-placement.md](ring-placement.md) — translating scores into ring placement.
- [assessment-api.md](assessment-api.md) — the request payload for `POST /technologies/{tech_id}/factsheet`.
- [auth.md](auth.md) — role definitions and permission boundaries.
- [methodology.md §2](methodology.md#2-the-scouting-cycle) — conceptual scouting cycle.
