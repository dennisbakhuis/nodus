# Assessment API Reference

Technical reference for the assessment endpoints. For criterion meanings see [assessment-criteria.md](assessment-criteria.md); for the operator workflow see [assessment-workflow.md](assessment-workflow.md).

The interactive Swagger UI is mounted at `/api/docs` and ReDoc at `/api/redoc` (configuration in [api-docs-deployment.md](api-docs-deployment.md)). Use them to try requests against a running instance.

---

## Design: assessments are immutable

There is intentionally no `PATCH /assessments/{id}` and no `PUT /assessments/{id}`. Once an Assessment row is written, it is never modified. To revise a score, create a new Factsheet version — which carries a new Assessment with it.

Why:

- **Audit trail.** Past assessments are evidence of past judgement. Editing them in place would silently rewrite history and break the delta document at cycle close.
- **Versioning is already there.** Factsheets are versioned per Technology (`UNIQUE(technology_id, version)`). Attaching the assessment to the factsheet version reuses that versioning for free.
- **Atomic creation.** Each `POST /technologies/{tech_id}/factsheet` creates the new Factsheet and its Assessment in the same transaction, so a factsheet never exists without (the possibility of) an assessment.

Database constraints reflect this: `assessment.factsheet_id` is `UNIQUE`, so each Factsheet version has at most one Assessment. See [src/backend/app/models/assessment.py](../src/backend/app/models/assessment.py).

---

## Write: create a new factsheet version (and assessment)

```
POST /technologies/{tech_id}/factsheet
Auth: Writer or higher
```

**Path parameter.**

- `tech_id` — Technology UUID.

**Request body.** `FactsheetCreate` (see [src/backend/app/schemas/factsheet.py](../src/backend/app/schemas/factsheet.py)):

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `summary` | string | `""` | One-line summary, surfaced on cards. |
| `description` | string | `""` | Long-form description (Markdown). |
| `key_players` | string | `""` | Vendors, consortia, peer organisations. |
| `tax_credit_candidate` | enum | `"No"` | `"Yes"`, `"No"`, or `"Potential"`. R&D tax-credit candidacy. |
| `recommended_next_steps` | string | `""` | What the organisation should do next. |
| `current_challenges` | string | `""` | Known blockers, open questions. |
| `publication_links` | array | `[]` | List of `{url, description}` objects. Legacy list of bare URL strings is coerced. |
| `strategic_innovation_field_id` | UUID | `null` | Optional FK to a strategic field. |
| `last_updated` | date | today | ISO date, defaults to today. |
| `assessment` | `AssessmentCreate` | `null` | Nested assessment. May be omitted entirely. |

**Nested `AssessmentCreate`** (all fields nullable — partial scoring supported):

| Field | Type | Allowed values |
|-------|------|----------------|
| `trl` | integer or null | `1`–`12` (DB CHECK) |
| `trl_notes` | string or null | Free text |
| `strategic_relevance` | enum or null | `"High"`, `"Medium"`, `"Low"` |
| `strategic_relevance_notes` | string or null | Free text |
| `impact_potential` | enum or null | `"Transformational"`, `"High"`, `"Medium"`, `"Low"` |
| `impact_potential_notes` | string or null | Free text |
| `implementation_feasibility` | enum or null | `"High"`, `"Medium"`, `"Low"` |
| `implementation_feasibility_notes` | string or null | Free text |
| `time_to_mainstream` | enum or null | `"0-2 yr"`, `"2-5 yr"`, `"5-7 yr"`, `"7-10 yr"` (hyphens; space before `yr`) |
| `time_to_mainstream_notes` | string or null | Free text |
| `collaboration_potential` | enum or null | `"High"`, `"Medium"`, `"Low"` |
| `collaboration_potential_notes` | string or null | Free text |

**Side effects of a successful POST:**

- A new `factsheet` row is inserted with `version = max(existing) + 1`.
- If `assessment` is provided, a new `assessment` row is inserted with `factsheet_id` pointing at the new factsheet.
- If `assessment.trl` is non-null, `technology.last_assessed_at` is stamped to now (UTC).
- `technology.current_factsheet_id` is updated to point at the new factsheet.
- A `MovementEvent` of type `FactsheetEdited` is recorded with `to_value = "<version>"` and rationale `"Factsheet version <version> created."`.

**Response.** `FactsheetRead` (201 Created). The Assessment is not in this response body; fetch it via [`GET /topics/{slug}`](#read-the-current-assessment) if needed.

**Minimal example — partial scoring only.**

```json
{
  "summary": "Anomaly detection on long-life asset telemetry",
  "assessment": {
    "trl": 4,
    "strategic_relevance": "Medium",
    "strategic_relevance_notes": "Plausible value for predictive maintenance; no specific objective yet."
  }
}
```

**Full example — all six criteria scored.**

```json
{
  "summary": "Anomaly detection on long-life asset telemetry",
  "description": "Distributed sensing across high-value field assets, with ML-based anomaly detection. Vendor demonstrations show repeatable detection of incipient faults in lab conditions; one peer organisation has run a short pilot.",
  "key_players": "Three established vendors; peer pilots at two comparable operators.",
  "recommended_next_steps": "Scope a 6-month pilot on one production asset.",
  "current_challenges": "Fault signatures vary by manufacturer; ML model needs site-specific training data.",
  "publication_links": [
    {"url": "https://example.org/anomaly-detection-paper", "description": "Pilot results paper"}
  ],
  "last_updated": "2026-05-01",
  "assessment": {
    "trl": 5,
    "trl_notes": "Lab validation by all three vendors; one peer pilot underway.",
    "strategic_relevance": "High",
    "strategic_relevance_notes": "Asset failures are a top-three incident driver; aligned with operational reliability objective.",
    "impact_potential": "High",
    "impact_potential_notes": "Potential to predict faults before outage; significant reliability and OPEX upside.",
    "implementation_feasibility": "Medium",
    "implementation_feasibility_notes": "Sensor hardware exists; ML pipeline and asset-management integration are new work.",
    "time_to_mainstream": "2-5 yr",
    "time_to_mainstream_notes": "Vendor pilots in 2026-2027; mainstream deployment 2029+.",
    "collaboration_potential": "High",
    "collaboration_potential_notes": "Peer operators share the problem; a funded R&D programme call is open."
  }
}
```

---

## Set the ring (separate call)

Ring placement is on the Technology, not the Factsheet, so it is a separate request:

```
PATCH /technologies/{tech_id}
Auth: Writer or higher
```

**Body (TechnologyHeaderUpdate, all fields optional):**

| Field | Type | Allowed values |
|-------|------|----------------|
| `registry_status` | enum | `"On Radar"`, `"Backlog"`, `"Archive"` |
| `current_ring` | enum | `"Invest"`, `"Pilot"`, `"Explore"`, `"Monitor"` |
| `current_segment_id` | UUID | Existing segment id |
| `hero_image_id` | UUID | Existing media asset id |
| `rationale` | string | Recorded on the resulting MovementEvent |

**Behavior:**

- The `On Radar` status requires both `current_ring` and `current_segment_id`. Non-`On Radar` statuses require both to be null. The database enforces this via a CHECK constraint.
- Moving to `Archive` automatically clears `current_ring` and `current_segment_id`.
- A status transition emits a MovementEvent of type `Added` (Backlog → On Radar), `Reactivated` (Archive → On Radar), or `StatusChanged` (other transitions).
- A ring change on an `On Radar` technology emits a `RingChanged` MovementEvent.
- The `rationale` field is included on the emitted event(s). Provide one — without it, the system generates a generic message that is less useful for the audit trail.

---

## Read the current assessment

The current assessment is returned as part of the full topic detail:

```
GET /topics/{slug}
Auth: any role (subject to PublicReader filtering)
```

The response embeds the current Factsheet and its Assessment under `factsheet` and `assessment` keys. This is what the Topic Detail view in the frontend renders. Visibility filtering applies for the PublicReader role (see [auth.md](auth.md)).

---

## Read historical assessments

To list every factsheet version (and by extension every assessment) for a technology:

```
GET /technologies/{tech_id}/factsheets
Auth: any authenticated role
```

Returns `list[FactsheetRead]` ordered by version ascending.

To fetch a specific historical version:

```
GET /technologies/{tech_id}/factsheets/{version}
Auth: any authenticated role
```

Both endpoints return only the Factsheet; the Assessment for that version is currently not exposed via a dedicated endpoint. The Assessment can be reconstructed from the Topic Detail at the time the factsheet was current; for full historical assessment data, query the database directly or extend the API.

---

## Movement history

```
GET /technologies/{tech_id}/movements
Auth: any authenticated role
```

Returns the append-only MovementEvent log for the technology, ordered by timestamp descending. Events include `FactsheetEdited`, `RingChanged`, `StatusChanged`, `Added`, `Reactivated`, `Promoted`, `Demoted`, `Removed`, `SegmentChanged`. Each event carries `from_value`, `to_value`, `rationale`, `cycle_id`, and `author_id`.

---

## Validation errors to expect

- **422** — Invalid enum value (e.g. `time_to_mainstream` not one of `"0-2 yr"`, `"2-5 yr"`, `"5-7 yr"`, `"7-10 yr"`). Watch the literal spelling, especially the space before `yr`.
- **422** — `trl` outside 1–12 is rejected by the database CHECK constraint as a 500 from the API if not caught at validation; supply a value in range.
- **404** — `tech_id` does not exist.
- **401 / 403** — Caller is not a Writer (for `POST /technologies/{tech_id}/factsheet` and `PATCH /technologies/{tech_id}`).
- **409 / DB integrity** — Setting `registry_status = "On Radar"` without both `current_ring` and `current_segment_id` violates the check constraint.

---

## See also

- [assessment-criteria.md](assessment-criteria.md) — what each enum value means.
- [assessment-workflow.md](assessment-workflow.md) — when to call which endpoint.
- [ring-placement.md](ring-placement.md) — choosing the ring before the `PATCH /technologies/{tech_id}` call.
- [api-docs-deployment.md](api-docs-deployment.md) — Swagger UI / ReDoc configuration for live exploration.
