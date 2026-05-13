# Ring Placement Guide

After a technology has been scored against the six criteria, it needs a **ring**: a single recommendation about what the organisation should do. This document explains the four rings, when to choose each one, and how movement between rings is recorded.

For the assessment criteria themselves, see [assessment-criteria.md](assessment-criteria.md). For the end-to-end workflow, see [assessment-workflow.md](assessment-workflow.md). The conceptual rationale lives in [methodology.md §6](methodology.md#6-recommendation-levels).

Ring values are defined in code as the `Ring` enum in [src/backend/app/models/technology.py](../src/backend/app/models/technology.py). The values quoted here match the enum byte-for-byte.

---

## The four rings

Nodus uses an **action-oriented** ring model: each ring is a verb telling the reader what to do, not a description of the technology's state.

| Ring | Action | Definition |
|------|--------|-----------|
| `Invest` | Actively fund operational deployment | Proven technology ready for deployment. Budget allocated, deployment plan exists, clear owner. |
| `Pilot` | Run structured pilots to validate | Demonstrated value in a relevant context. Dedicated pilot scope and success criteria; partner or vendor engaged. |
| `Explore` | Build knowledge through research or PoCs | Promising and warrants active investigation. Assigned to a researcher or working group; PoC scope defined. |
| `Monitor` | Track through desk research and events | Relevant but no active effort required yet. Included in scanning cadence; revisited each cycle; no dedicated resources. |

The funnel reads inward: **Monitor → Explore → Pilot → Invest**. Entries move inward as evidence accumulates and outward when pilots fail or relevance fades.

---

## Typical profile per ring

Use this table as the starting point for the call. It is not a formula — the curator's opinionated judgement overrides it whenever the evidence warrants.

| Ring | TRL | Strategic Relevance | Implementation Feasibility | Other signals |
|------|-----|---------------------|----------------------------|---------------|
| `Invest` | ≥ 7 | High | High (proven) | Clear use case with named business owner; budget identified |
| `Pilot` | 5–7 | High | Medium–High (demonstrated elsewhere) | Specific pilot opportunity; partner/vendor engaged |
| `Explore` | 3–6 | Medium–High | Any | Promising but unvalidated for this context; researcher or working group assigned |
| `Monitor` | 1–4 (or higher with low relevance) | Medium–Low | Any | Worth tracking but no resources committed |

Technologies that score `Low` on both Strategic Relevance and Impact Potential should not be on the radar at all. Park them in `Backlog` or `Archive`. The radar is a curated view; not every assessed technology earns a ring.

---

## Decision heuristics

A few rules of thumb that the typical-profile table doesn't capture:

- **TRL alone doesn't promote.** A TRL-9 technology with `Low` strategic relevance is `Monitor` or `Archive`, not `Invest`. Ring placement is fit-weighted, not maturity-weighted.
- **High strategic relevance alone doesn't promote either.** Without at least demonstrated feasibility somewhere, even a critical-fit technology stays in `Explore`.
- **Collaboration Potential is a multiplier, not a primary driver.** `High` collaboration on a `Low` relevance technology does not earn a ring; `High` collaboration on a `Medium`-relevance technology can pull it into `Explore` rather than `Monitor`.
- **Time to Mainstream tunes the action, not the ring.** A `7-10 yr` technology with `High` relevance still belongs in `Monitor` or `Explore`; the long horizon is captured on the factsheet, not on the radar position. See [methodology.md §6.3](methodology.md#63-time-horizon-as-metadata-not-a-second-axis).
- **`Transformational` impact lowers the evidence bar one notch.** A technology where the upside is genuinely game-changing can earn `Explore` on weaker feasibility evidence than the typical profile suggests. Always record the rationale.

---

## Edge cases

**High TRL, low strategic relevance.**
A mature technology the organisation has no current use for. Default to `Monitor` if there is a plausible future use case, `Archive` otherwise. Do not put it in `Invest` just because it is mature.

**High strategic relevance, very low TRL.**
A critical-fit technology that is still in research. `Explore` with a clear PoC scope, or `Monitor` if no team can be assigned yet. Do not promote to `Pilot` until at least demonstrated externally.

**Demonstrated externally, but not in our context.**
A technology that peer organisations have piloted successfully but that has integration or regulatory blockers specific to us. Stays in `Explore` (knowledge building, scoping the blocker) until the blocker is addressable, then moves to `Pilot`.

**High Collaboration Potential, modest assessment otherwise.**
A funded programme or active partner pull can pull a technology one ring inward — but only because the programme effectively raises feasibility and provides a pilot vehicle. Score it that way: update Feasibility and revisit the ring.

**Late-stage technology that has become mainstream.**
When a technology reaches `TRL 10+` and is the standard choice in its category, it should move off the radar (Archive). The radar is for technologies that warrant deliberate scouting attention; mainstream tech doesn't.

---

## Registry status and ring placement

The Technology has a `registry_status` field with three values:

| Status | Ring required? | Visible on radar? | Use |
|--------|----------------|-------------------|-----|
| `On Radar` | Yes (ring + segment) | Yes | Active radar entries |
| `Backlog` | No | No | Nominated, not yet assessed; or assessed but below radar threshold |
| `Archive` | No | No | Removed from radar; history preserved |

The database enforces the relationship: `On Radar` requires both `current_ring` and `current_segment_id`; non-`On Radar` statuses require both to be null. Moving to `Archive` automatically clears the ring and segment.

Three common transitions:

- **Backlog → On Radar.** First placement after the technology has been assessed. Requires choosing a ring and a segment.
- **On Radar → On Radar (different ring).** Promotion or demotion. Emits a `RingChanged` MovementEvent.
- **On Radar → Archive.** Retirement. The technology disappears from the radar but remains queryable, and may later be reactivated.

---

## Recording the movement

Every change of `registry_status` or `current_ring` emits an append-only **MovementEvent** with:

- `from_value` / `to_value` (the old and new ring or status)
- `rationale` (a short text justification — provided by the curator at the time of the change)
- `cycle_id` (which cycle the change belongs to)
- `author_id` (who made the change)
- `event_type` — one of `Added`, `Promoted`, `Demoted`, `Removed`, `StatusChanged`, `Reactivated`, `RingChanged`, `SegmentChanged`, `FactsheetEdited`

MovementEvents are **never updated or deleted**. They are the audit trail that makes "why did this move?" answerable a year later. They also drive the delta document at cycle close, which summarises movements for leadership.

**Always provide a rationale on a ring change.** Without one, the system fills in a generic "Ring changed from X to Y" — useful for the timeline but not for the next curator trying to understand the call. The rationale field is one or two sentences of evidence: which assessment criterion changed, what new evidence arrived.

---

## See also

- [assessment-criteria.md](assessment-criteria.md) — the six criteria that feed the ring decision.
- [assessment-workflow.md](assessment-workflow.md) — where ring placement fits in the full cycle.
- [assessment-api.md](assessment-api.md) — how to set the ring via API.
- [methodology.md §6](methodology.md#6-recommendation-levels) — why this four-ring action-oriented model.
