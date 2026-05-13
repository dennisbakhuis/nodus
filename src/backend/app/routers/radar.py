"""Public radar visualization endpoint — v2 Topic-grouped response."""

import logging
from typing import Any

from fastapi import APIRouter, Query
from sqlmodel import col, select

from app.auth import OptionalUserDep, is_public_only
from app.db import SessionDep
from app.models.assessment import Assessment
from app.models.cycle import Cycle
from app.models.factsheet import Factsheet
from app.models.party import Party
from app.models.peer_reference import PeerReference
from app.models.person import Person
from app.models.segment import Segment
from app.models.setting import Setting
from app.models.technology import RegistryStatus, Technology
from app.models.topic import Topic
from app.models.topic_person_link import TopicPersonLink
from app.schemas.peer_reference import PeerReferenceSummary
from app.schemas.person import PersonReadPublic
from app.schemas.radar import RadarSnapshotResponse
from app.services.ring_movement import RingMovement
from app.services.visibility import apply_field_visibility, load_visibility_config
from app.time_utils import now_utc

logger = logging.getLogger(__name__)

router = APIRouter(tags=["radar"])


def _resolve_current_cycle(session: SessionDep) -> Cycle | None:
    """Return the latest open cycle, or the most recently closed if none open."""
    open_cycle = session.exec(
        select(Cycle)
        .where(Cycle.end_date == None)  # noqa: E711
        .order_by(Cycle.start_date.desc())  # type: ignore[attr-defined]
    ).first()
    if open_cycle is not None:
        return open_cycle
    return session.exec(
        select(Cycle).order_by(Cycle.start_date.desc())  # type: ignore[attr-defined]
    ).first()


_RING_EVENT_TYPES: tuple[str, ...] = ("Added", "Promoted", "Demoted", "Removed")
_EVENT_TO_MOVEMENT: dict[str, RingMovement] = {
    "Added": RingMovement.Addition,
    "Promoted": RingMovement.Promotion,
    "Demoted": RingMovement.Demotion,
    "Removed": RingMovement.Removal,
}


def _bulk_derive_ring_movement(
    session: SessionDep, technology_ids: list[Any], cycle_id: Any
) -> dict[Any, RingMovement]:
    """Batched cycle-scoped movement derivation for many technologies in one query.

    Equivalent to calling :py:func:`derive_ring_movement` per technology, but
    issues a single SELECT and groups in Python. Order DESC by timestamp so the
    first row encountered for each technology is the most-recent ring event.
    """
    from app.models.movement_event import MovementEvent

    if not technology_ids or cycle_id is None:
        return {}
    rows = session.exec(
        select(MovementEvent)
        .where(col(MovementEvent.technology_id).in_(technology_ids))
        .where(MovementEvent.cycle_id == cycle_id)
        .where(col(MovementEvent.event_type).in_(_RING_EVENT_TYPES))
        .order_by(MovementEvent.timestamp.desc())  # type: ignore[attr-defined]
    ).all()
    out: dict[Any, RingMovement] = {}
    for row in rows:
        if row.technology_id not in out:
            out[row.technology_id] = _EVENT_TO_MOVEMENT[row.event_type]
    return out


def _is_admin(user: Any) -> bool:
    """Whether the visibility config can be skipped (admins see all fields)."""
    from app.models.user import UserRole

    return user is not None and getattr(user, "role", None) == UserRole.Admin.value


@router.get("/radar/current", response_model=RadarSnapshotResponse)
def radar_current(
    session: SessionDep,
    user: OptionalUserDep,
    segment: str | None = None,
    ring: str | None = None,
    include_status: list[str] = Query(default=None),  # noqa: B008
    include_candidates: bool = False,
) -> dict[str, Any]:
    """Return current radar shape for visualization (Topic-grouped, v2).

    By default a Topic appears IFF its Technology has registry_status = On Radar.
    Pass `include_status=Backlog` (and/or `Archive`) to widen the result set —
    useful for the inventory/list view where Backlog and Archive are valid filters.
    Pass `include_candidates=true` to also include topics that have no
    Technology row yet (peer-radar references that haven't been triaged).
    Candidate entries carry null ``technology_id`` / ``registry_status`` /
    ``ring`` / ``movement`` etc.; the list view renders them with placeholder
    cells. Anonymous and PublicReader callers never see candidates — those
    topics are private by definition.

    Public endpoint: PersonReadPublic used — email never returned.

    Parameters
    ----------
    session : SessionDep
        Database session.
    segment : str | None
        Optional segment slug to filter entries.
    ring : str | None
        Optional ring name to filter entries.
    include_status : list[str] | None
        Registry statuses to include. Defaults to ["On Radar"]. Unknown values
        are silently dropped; if all values are dropped the default is used.
    include_candidates : bool
        When True, append topic-only "candidate" entries (topics without a
        Technology row). Ignored for anonymous / PublicReader callers.

    Returns
    -------
    dict
        Full radar shape with Topics, Technologies, Persons (public), PeerReference summaries.

    Raises
    ------
    HTTPException
        404 if no cycle exists.
    """
    cycle = _resolve_current_cycle(session)
    if cycle is None:
        # Fresh / empty database — return an empty radar shape so the UI can
        # render an empty state instead of an API error.
        title_row = session.exec(select(Setting).where(Setting.key == "radar.title")).first()
        radar_title = (
            title_row.value if title_row and title_row.value else ""
        ) or "Technology Radar"
        empty_segments = [
            {
                "id": str(s.id),
                "name": s.name,
                "slug": s.slug,
                "order": s.display_order,
                "theme_key": s.theme_key,
                "is_active": s.is_active,
            }
            for s in sorted(
                (s for s in session.exec(select(Segment)).all() if s.is_active),
                key=lambda x: x.display_order,
            )
        ]
        return {
            "radar": {
                "title": radar_title,
                "cycle": None,
                "generated_at": now_utc().isoformat(),
            },
            "cycle": None,
            "segments": empty_segments,
            "rings": [
                {"id": 1, "name": "Invest", "order": 0},
                {"id": 2, "name": "Pilot", "order": 1},
                {"id": 3, "name": "Explore", "order": 2},
                {"id": 4, "name": "Monitor", "order": 3},
            ],
            "entries": [],
        }

    valid_statuses = {s.value for s in RegistryStatus}
    requested = [s for s in (include_status or []) if s in valid_statuses]
    statuses = requested or [str(RegistryStatus.OnRadar)]

    all_segments = session.exec(select(Segment)).all()
    segment_map = {s.id: s for s in all_segments}
    active_segments = [s for s in all_segments if s.is_active]
    active_segment_ids = {s.id for s in active_segments}
    inactive_count = len(all_segments) - len(active_segments)
    if inactive_count:
        logger.info(
            "radar_current: filtered out %d inactive segment(s)",
            inactive_count,
        )

    party_map = {p.id: p for p in session.exec(select(Party)).all()}

    technologies = session.exec(
        select(Technology).where(col(Technology.registry_status).in_(statuses))
    ).all()

    ring_order = {"Invest": 0, "Pilot": 1, "Explore": 2, "Monitor": 3}

    # ------------------------------------------------------------------
    # Pre-fetch every related row this loop body needs in one batched
    # query per table, instead of issuing per-technology SELECTs. The loop
    # body becomes pure dict lookups; query count is constant in the
    # number of technologies.
    # ------------------------------------------------------------------
    tech_ids = [t.id for t in technologies]
    topic_ids = [t.topic_id for t in technologies]
    factsheet_ids = [
        t.current_factsheet_id for t in technologies if t.current_factsheet_id is not None
    ]

    topics_by_id: dict[Any, Topic] = (
        {t.id: t for t in session.exec(select(Topic).where(col(Topic.id).in_(topic_ids))).all()}
        if topic_ids
        else {}
    )
    factsheets_by_id: dict[Any, Factsheet] = (
        {
            f.id: f
            for f in session.exec(
                select(Factsheet).where(col(Factsheet.id).in_(factsheet_ids))
            ).all()
        }
        if factsheet_ids
        else {}
    )
    assessments_by_factsheet: dict[Any, Assessment] = (
        {
            a.factsheet_id: a
            for a in session.exec(
                select(Assessment).where(col(Assessment.factsheet_id).in_(factsheet_ids))
            ).all()
        }
        if factsheet_ids
        else {}
    )
    peer_refs_by_topic: dict[Any, list[PeerReference]] = {}
    if topic_ids:
        for pr in session.exec(
            select(PeerReference).where(col(PeerReference.topic_id).in_(topic_ids))
        ).all():
            peer_refs_by_topic.setdefault(pr.topic_id, []).append(pr)
    links_by_topic: dict[Any, list[TopicPersonLink]] = {}
    person_ids: set[Any] = set()
    if topic_ids:
        for link in session.exec(
            select(TopicPersonLink).where(col(TopicPersonLink.topic_id).in_(topic_ids))
        ).all():
            links_by_topic.setdefault(link.topic_id, []).append(link)
            person_ids.add(link.person_id)
    persons_by_id: dict[Any, Person] = (
        {p.id: p for p in session.exec(select(Person).where(col(Person.id).in_(person_ids))).all()}
        if person_ids
        else {}
    )
    movement_by_tech = _bulk_derive_ring_movement(session, tech_ids, cycle.id)
    visibility_config = load_visibility_config(session) if not _is_admin(user) else None

    entries: list[dict[str, Any]] = []
    for tech in technologies:
        topic = topics_by_id.get(tech.topic_id)
        if topic is None:
            continue

        if topic.not_for_external_publication and is_public_only(user):
            continue

        tech_segment = segment_map.get(tech.current_segment_id) if tech.current_segment_id else None

        if (
            tech.current_segment_id is not None
            and tech.current_segment_id not in active_segment_ids
        ):
            continue

        if ring is not None and tech.current_ring != ring:
            continue
        if segment is not None and (tech_segment is None or tech_segment.slug != segment):
            continue

        factsheet = (
            factsheets_by_id.get(tech.current_factsheet_id)
            if tech.current_factsheet_id is not None
            else None
        )
        assessment = (
            assessments_by_factsheet.get(tech.current_factsheet_id)
            if tech.current_factsheet_id is not None
            else None
        )

        peer_refs = peer_refs_by_topic.get(topic.id, [])
        peer_summaries = [
            PeerReferenceSummary(
                id=pr.id,
                topic_id=pr.topic_id,
                party_id=pr.party_id,
                party_name=party_map[pr.party_id].name if pr.party_id in party_map else "",
                party_slug=party_map[pr.party_id].slug if pr.party_id in party_map else "",
                peer_title=pr.peer_title,
                peer_ring_label=pr.peer_ring_label,
                peer_segment_label=pr.peer_segment_label,
                summary=pr.summary,
            ).model_dump()
            for pr in peer_refs
        ]

        persons_public: list[dict[str, Any]] = []
        for link in links_by_topic.get(topic.id, []):
            person = persons_by_id.get(link.person_id)
            if person is not None:
                persons_public.append(
                    {
                        "link_role": link.link_role,
                        "person": PersonReadPublic.model_validate(person).model_dump(),
                    }
                )

        hero_image_url: str | None = None
        if tech.hero_image_id is not None:
            hero_image_url = f"/api/media/{tech.hero_image_id}"

        entry = {
            "id": str(topic.id),
            "topic_id": str(topic.id),
            "canonical_name": topic.canonical_name,
            "slug": topic.slug,
            "technology_id": str(tech.id),
            "registry_status": tech.registry_status,
            "segment_id": str(tech.current_segment_id) if tech.current_segment_id else None,
            "segment_name": tech_segment.name if tech_segment else None,
            "segment_slug": tech_segment.slug if tech_segment else None,
            "ring": tech.current_ring,
            "ring_id": ring_order.get(tech.current_ring or "", -1) + 1,
            "summary": factsheet.summary if factsheet else None,
            "last_updated": factsheet.last_updated.isoformat() if factsheet else None,
            "hero_image_url": hero_image_url,
            "peer_reference_count": len(peer_refs),
            "peer_references": peer_summaries,
            "persons": persons_public,
            "trl": assessment.trl if assessment else None,
            "strategic_relevance": assessment.strategic_relevance if assessment else None,
            "time_to_mainstream": assessment.time_to_mainstream if assessment else None,
            "movement": movement_by_tech.get(tech.id, RingMovement.NoChange).value,
            "not_for_external_publication": topic.not_for_external_publication,
        }
        entries.append(apply_field_visibility(entry, session, user, config=visibility_config))

    # Candidate topics: topics that exist in the registry but have no
    # Technology row yet. Skipped entirely for anonymous / PublicReader since
    # private topics are stripped above and candidates carry no public-facing
    # data anyway. Writers/admins use this to surface the intake pool in the
    # list view next to real radar entries.
    if include_candidates and not is_public_only(user):
        # Exclude topics that have any Technology row (regardless of status)
        # so a Backlog topic doesn't also appear as a candidate.
        all_tech_topic_ids = {t.topic_id for t in session.exec(select(Technology)).all()}
        candidate_topics = session.exec(
            select(Topic).where(col(Topic.id).not_in(all_tech_topic_ids))
            if all_tech_topic_ids
            else select(Topic)
        ).all()
        for topic in candidate_topics:
            entry = {
                "id": str(topic.id),
                "topic_id": str(topic.id),
                "canonical_name": topic.canonical_name,
                "slug": topic.slug,
                "technology_id": None,
                "registry_status": None,
                "segment_id": None,
                "segment_name": None,
                "segment_slug": None,
                "ring": None,
                "ring_id": None,
                "summary": None,
                "last_updated": None,
                "hero_image_url": None,
                "peer_reference_count": 0,
                "peer_references": [],
                "persons": [],
                "trl": None,
                "strategic_relevance": None,
                "time_to_mainstream": None,
                "movement": None,
                "not_for_external_publication": topic.not_for_external_publication,
            }
            entries.append(apply_field_visibility(entry, session, user, config=visibility_config))

    segments_list = [
        {
            "id": str(s.id),
            "name": s.name,
            "slug": s.slug,
            "order": s.display_order,
            "theme_key": s.theme_key,
            "is_active": s.is_active,
        }
        for s in sorted(active_segments, key=lambda x: x.display_order)
    ]

    rings_list = [
        {"id": 1, "name": "Invest", "order": 0},
        {"id": 2, "name": "Pilot", "order": 1},
        {"id": 3, "name": "Explore", "order": 2},
        {"id": 4, "name": "Monitor", "order": 3},
    ]

    title_row = session.exec(select(Setting).where(Setting.key == "radar.title")).first()
    radar_title = (title_row.value if title_row and title_row.value else "") or "Technology Radar"

    return {
        "radar": {
            "title": radar_title,
            "cycle": cycle.name,
            "generated_at": now_utc().isoformat(),
        },
        "cycle": {
            "id": str(cycle.id),
            "name": cycle.name,
            "start_date": cycle.start_date.isoformat(),
            "end_date": cycle.end_date.isoformat() if cycle.end_date else None,
            "color": cycle.color,
        },
        "segments": segments_list,
        "rings": rings_list,
        "entries": entries,
    }
