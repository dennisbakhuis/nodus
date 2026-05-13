"""Topic Registry endpoints — v2 API."""

import json
import re
import uuid

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import asc, exists
from sqlmodel import col, select

from app.auth import OptionalUserDep, WriterDep, is_public_only
from app.db import SessionDep
from app.models.alias import Alias
from app.models.assessment import Assessment
from app.models.factsheet import Factsheet
from app.models.initiative import Initiative
from app.models.movement_event import EventType, MovementEvent
from app.models.party import Party
from app.models.peer_reference import PeerReference
from app.models.person import Person
from app.models.technology import RegistryStatus, Technology
from app.models.topic import Topic
from app.models.topic_person_link import TopicPersonLink
from app.models.user import User
from app.schemas.assessment import AssessmentRead
from app.schemas.factsheet import FactsheetCreate, FactsheetRead
from app.schemas.initiative import InitiativeRead
from app.schemas.movement_event import MovementEventRead
from app.schemas.peer_reference import PeerReferenceSummary
from app.schemas.person import PersonReadPublic
from app.schemas.technology import (
    AliasCreate,
    AliasRead,
    TechnologyHeaderUpdate,
    TechnologyRead,
    TopicCandidate,
    TopicCreate,
    TopicCreateResponse,
    TopicRead,
    TopicUpdate,
)
from app.services.dedup import find_exact_alias_match, find_fuzzy_alias_matches
from app.services.movements import record_event
from app.services.normalize import normalize_alias
from app.services.visibility import apply_field_visibility
from app.time_utils import now_utc

router = APIRouter(tags=["registry"])

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(name: str) -> str:
    lowered = name.lower()
    slug = _SLUG_RE.sub("-", lowered).strip("-")
    return slug


def _ensure_unique_slug(session: SessionDep, base: str, exclude_id: uuid.UUID | None = None) -> str:
    candidate = base
    counter = 1
    while True:
        stmt = select(Topic).where(Topic.slug == candidate)
        if exclude_id is not None:
            stmt = stmt.where(Topic.id != exclude_id)
        existing = session.exec(stmt).first()
        if existing is None:
            return candidate
        candidate = f"{base}-{counter}"
        counter += 1


def _topic_to_read(topic: Topic, session: SessionDep) -> TopicRead:
    tech = session.exec(select(Technology).where(Technology.topic_id == topic.id)).first()
    return TopicRead(
        id=topic.id,
        canonical_name=topic.canonical_name,
        slug=topic.slug,
        not_for_external_publication=topic.not_for_external_publication,
        created_at=topic.created_at,
        technology_id=tech.id if tech else None,
        registry_status=tech.registry_status if tech else None,
        current_ring=tech.current_ring if tech else None,
        current_segment_id=tech.current_segment_id if tech else None,
    )


@router.get("/topics", response_model=list[TopicRead])
def list_topics(
    session: SessionDep,
    user: OptionalUserDep,
    segment_id: uuid.UUID | None = Query(default=None),  # noqa: B008
    ring: str | None = Query(default=None),
    registry_status: str | None = Query(default=None),
    has_party: uuid.UUID | None = Query(default=None),  # noqa: B008
    person_id: uuid.UUID | None = Query(default=None),  # noqa: B008
    search: str | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[TopicRead]:
    """List Topics with optional filters.

    Parameters
    ----------
    session : SessionDep
        Database session.
    segment_id : uuid.UUID | None
        Filter by Technology segment.
    ring : str | None
        Filter by Technology ring.
    registry_status : str | None
        Filter by Technology registry status.
    has_party : uuid.UUID | None
        Filter to Topics that have a PeerReference for this party.
    search : str | None
        Substring search on canonical_name.
    offset : int
        Pagination offset.
    limit : int
        Page size (max 200).

    Returns
    -------
    list[TopicRead]
        Matching topics with Technology summary.
    """
    # Filters that constrain the Technology row (segment, ring, status) require
    # an INNER JOIN — a Topic without a Technology cannot match. Non-tech
    # filters (search, visibility, peer-party, person) are evaluated against
    # Topic / EXISTS subqueries and do not require the join. If no tech filter
    # is supplied we use LEFT OUTER JOIN so topics without a Technology still
    # appear, matching the legacy behaviour.
    tech_filter_active = registry_status is not None or ring is not None or segment_id is not None

    stmt = select(Topic, Technology)
    if tech_filter_active:
        stmt = stmt.join(Technology, Topic.id == Technology.topic_id)  # type: ignore[arg-type]
        if registry_status is not None:
            stmt = stmt.where(Technology.registry_status == registry_status)
        if ring is not None:
            stmt = stmt.where(Technology.current_ring == ring)
        if segment_id is not None:
            stmt = stmt.where(Technology.current_segment_id == segment_id)
    else:
        stmt = stmt.outerjoin(Technology, Topic.id == Technology.topic_id)  # type: ignore[arg-type]

    if search is not None:
        # Escape SQL-LIKE wildcards in user input (% and _) before wrapping in
        # %…% so a literal `%` in the query doesn't match everything.
        escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        stmt = stmt.where(col(Topic.canonical_name).like(f"%{escaped}%", escape="\\"))
    if is_public_only(user):
        stmt = stmt.where(Topic.not_for_external_publication == False)  # noqa: E712

    if has_party is not None:
        stmt = stmt.where(
            exists().where(
                PeerReference.topic_id == Topic.id,  # type: ignore[arg-type]
                PeerReference.party_id == has_party,  # type: ignore[arg-type]
            )
        )
    if person_id is not None:
        stmt = stmt.where(
            exists().where(
                TopicPersonLink.topic_id == Topic.id,  # type: ignore[arg-type]
                TopicPersonLink.person_id == person_id,  # type: ignore[arg-type]
            )
        )

    stmt = stmt.order_by(Topic.canonical_name).offset(offset).limit(limit)

    rows = session.exec(stmt).all()

    return [
        TopicRead(
            id=topic.id,
            canonical_name=topic.canonical_name,
            slug=topic.slug,
            not_for_external_publication=topic.not_for_external_publication,
            created_at=topic.created_at,
            technology_id=tech.id if tech else None,
            registry_status=tech.registry_status if tech else None,
            current_ring=tech.current_ring if tech else None,
            current_segment_id=tech.current_segment_id if tech else None,
        )
        for topic, tech in rows
    ]


@router.get("/topics/{slug}")
def get_topic(slug: str, session: SessionDep, user: OptionalUserDep) -> dict[str, object]:
    """Full Topic with Technology, PeerReferences, Persons (PUBLIC schema), MediaAsset URL.

    Parameters
    ----------
    slug : str
        URL slug of the topic.
    session : SessionDep
        Database session.

    Returns
    -------
    dict
        Full topic detail response.
    """
    topic = session.exec(select(Topic).where(Topic.slug == slug)).first()
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")
    if topic.not_for_external_publication and is_public_only(user):
        raise HTTPException(status_code=404, detail="Topic not found")

    tech = session.exec(select(Technology).where(Technology.topic_id == topic.id)).first()

    aliases = session.exec(select(Alias).where(Alias.topic_id == topic.id)).all()

    factsheet_read: FactsheetRead | None = None
    assessment_read: AssessmentRead | None = None
    if tech is not None and tech.current_factsheet_id is not None:
        fs = session.get(Factsheet, tech.current_factsheet_id)
        if fs is not None:
            factsheet_read = FactsheetRead.model_validate(fs)
            asmt = session.exec(select(Assessment).where(Assessment.factsheet_id == fs.id)).first()
            if asmt is not None:
                assessment_read = AssessmentRead.model_validate(asmt)

    events: list[MovementEvent] = []
    if tech is not None:
        events = list(
            session.exec(
                select(MovementEvent)
                .where(MovementEvent.technology_id == tech.id)
                .order_by(MovementEvent.timestamp.desc())  # type: ignore[attr-defined]
                .limit(20)
            ).all()
        )

    initiatives: list[dict[str, object]] = []
    if tech is not None:
        initiative_rows = session.exec(
            select(Initiative)
            .where(Initiative.technology_id == tech.id)
            .order_by(Initiative.display_order, Initiative.created_at)  # type: ignore[arg-type]
        ).all()
        initiatives = [InitiativeRead.model_validate(r).model_dump() for r in initiative_rows]

    peer_refs = session.exec(select(PeerReference).where(PeerReference.topic_id == topic.id)).all()
    party_ids = {pr.party_id for pr in peer_refs}
    party_map = (
        {
            p.id: p
            for p in session.exec(select(Party).where(Party.id.in_(party_ids))).all()  # type: ignore[attr-defined]
        }
        if party_ids
        else {}
    )
    peer_ref_summaries = [
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
        )
        for pr in peer_refs
    ]

    links = session.exec(select(TopicPersonLink).where(TopicPersonLink.topic_id == topic.id)).all()
    persons_public: list[dict[str, object]] = []
    for link in links:
        person = session.get(Person, link.person_id)
        if person is not None:
            persons_public.append(
                {
                    "link_id": str(link.id),
                    "link_role": link.link_role,
                    "person": PersonReadPublic.model_validate(person).model_dump(),
                }
            )

    hero_image_url: str | None = None
    if tech is not None and tech.hero_image_id is not None:
        hero_image_url = f"/api/media/{tech.hero_image_id}"

    created_by: dict[str, str] | None = None
    if tech is not None and tech.created_by_id is not None:
        creator = session.get(User, tech.created_by_id)
        if creator is not None:
            created_by = {
                "id": str(creator.id),
                "username": creator.username,
                "full_name": f"{creator.first_name} {creator.last_name}".strip(),
            }

    payload: dict[str, object] = {
        "topic": _topic_to_read(topic, session).model_dump(),
        "technology": TechnologyRead.model_validate(tech).model_dump() if tech else None,
        "factsheet": factsheet_read.model_dump() if factsheet_read else None,
        "assessment": assessment_read.model_dump() if assessment_read else None,
        "aliases": [AliasRead.model_validate(a).model_dump() for a in aliases],
        "recent_events": [MovementEventRead.model_validate(e).model_dump() for e in events],
        "peer_references": [pr.model_dump() for pr in peer_ref_summaries],
        "peer_reference_count": len(peer_ref_summaries),
        "initiatives": initiatives,
        "persons": persons_public,
        "hero_image_url": hero_image_url,
        "created_by": created_by,
    }

    return apply_field_visibility(payload, session, user)


@router.post("/topics", response_model=TopicCreateResponse, status_code=201)
def create_topic(
    payload: TopicCreate,
    session: SessionDep,
    user: WriterDep,
) -> TopicCreateResponse:
    """Create a new Topic with alias dedup. Optionally creates a Technology.

    Parameters
    ----------
    payload : TopicCreate
        Topic creation fields.
    session : SessionDep
        Database session.

    Returns
    -------
    TopicCreateResponse
        Created topic (and optional technology), or candidate matches.
    """
    exact = find_exact_alias_match(session, payload.canonical_name)
    if exact is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "An alias matching this name already exists.",
                "existing": _topic_to_read(exact, session).model_dump(mode="json"),
            },
        )

    if not payload.force_create:
        fuzzy_matches = find_fuzzy_alias_matches(session, payload.canonical_name)
        if fuzzy_matches:
            candidates = [
                TopicCandidate(topic=_topic_to_read(t, session), score=score)
                for t, score in fuzzy_matches
            ]
            return TopicCreateResponse(match_candidates=candidates)

    slug = _ensure_unique_slug(session, _slugify(payload.canonical_name))
    topic = Topic(
        canonical_name=payload.canonical_name,
        slug=slug,
        not_for_external_publication=payload.not_for_external_publication,
    )
    session.add(topic)
    session.flush()

    canonical_alias = Alias(
        topic_id=topic.id,
        alias_name=payload.canonical_name,
        alias_name_normalised=normalize_alias(payload.canonical_name),
    )
    session.add(canonical_alias)

    tech: Technology | None = None
    if payload.create_technology:
        tech = Technology(
            topic_id=topic.id,
            registry_status=payload.registry_status,
            current_segment_id=payload.current_segment_id,
            current_ring=payload.current_ring,
            created_by_id=user.id,
        )
        session.add(tech)
        session.flush()

        record_event(
            session=session,
            technology_id=tech.id,
            event_type=EventType.Added,
            from_value=None,
            to_value=str(payload.registry_status),
            rationale="Technology created via topic creation.",
        )

    session.commit()
    session.refresh(topic)
    if tech is not None:
        session.refresh(tech)

    return TopicCreateResponse(
        topic=_topic_to_read(topic, session),
        technology=TechnologyRead.model_validate(tech) if tech else None,
    )


@router.patch("/topics/{topic_id}", response_model=TopicRead)
def update_topic(
    topic_id: uuid.UUID,
    payload: TopicUpdate,
    session: SessionDep,
    _user: WriterDep,
) -> TopicRead:
    """Update mutable fields on a Topic (canonical_name, slug, not_for_external_publication).

    Parameters
    ----------
    topic_id : uuid.UUID
        Topic identifier.
    payload : TopicUpdate
        Fields to update.
    session : SessionDep
        Database session.

    Returns
    -------
    TopicRead
        Updated topic.
    """
    topic = session.get(Topic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")

    if payload.canonical_name is not None:
        topic.canonical_name = payload.canonical_name
        topic.slug = _ensure_unique_slug(
            session, _slugify(payload.canonical_name), exclude_id=topic_id
        )
    if payload.not_for_external_publication is not None:
        topic.not_for_external_publication = payload.not_for_external_publication

    session.add(topic)
    session.commit()
    session.refresh(topic)
    return _topic_to_read(topic, session)


@router.patch("/technologies/{tech_id}", response_model=TechnologyRead)
def update_technology_header(
    tech_id: uuid.UUID,
    payload: TechnologyHeaderUpdate,
    session: SessionDep,
    _user: WriterDep,
) -> TechnologyRead:
    """Update Technology header fields; status transitions emit a MovementEvent.

    Parameters
    ----------
    tech_id : uuid.UUID
        Technology identifier.
    payload : TechnologyHeaderUpdate
        Fields to update (status, ring, segment, hero_image_id).
    session : SessionDep
        Database session.

    Returns
    -------
    TechnologyRead
        Updated technology.
    """
    tech = session.get(Technology, tech_id)
    if tech is None:
        raise HTTPException(status_code=404, detail="Technology not found")

    old_status = tech.registry_status
    old_ring = tech.current_ring

    if payload.registry_status is not None:
        tech.registry_status = str(payload.registry_status)
    if payload.current_segment_id is not None:
        tech.current_segment_id = payload.current_segment_id
    if payload.current_ring is not None:
        tech.current_ring = str(payload.current_ring)
    if payload.hero_image_id is not None:
        tech.hero_image_id = payload.hero_image_id

    if (
        payload.registry_status is not None
        and str(payload.registry_status) != old_status
        and str(payload.registry_status) == str(RegistryStatus.Archive)
    ):
        tech.current_ring = None
        tech.current_segment_id = None

    session.add(tech)

    if payload.registry_status is not None and str(payload.registry_status) != old_status:
        rationale = payload.rationale or (
            f"Status changed from {old_status} to {tech.registry_status}."
        )
        new_status = str(payload.registry_status)
        if new_status == str(RegistryStatus.OnRadar):
            event_type = (
                EventType.Reactivated
                if old_status == str(RegistryStatus.Archive)
                else EventType.Added
            )
        else:
            event_type = EventType.StatusChanged
        record_event(
            session=session,
            technology_id=tech.id,
            event_type=event_type,
            from_value=old_status,
            to_value=tech.registry_status,
            rationale=rationale,
        )

    if payload.current_ring is not None and str(payload.current_ring) != old_ring:
        ring_rationale = payload.rationale or (
            f"Ring changed from {old_ring} to {tech.current_ring}."
        )
        record_event(
            session=session,
            technology_id=tech.id,
            event_type=EventType.RingChanged,
            from_value=old_ring,
            to_value=tech.current_ring,
            rationale=ring_rationale,
        )

    session.commit()
    session.refresh(tech)
    return TechnologyRead.model_validate(tech)


@router.post("/topics/{topic_id}/aliases", response_model=AliasRead, status_code=201)
def add_alias(
    topic_id: uuid.UUID,
    payload: AliasCreate,
    session: SessionDep,
    _user: WriterDep,
) -> AliasRead:
    """Add an alias to a Topic.

    Parameters
    ----------
    topic_id : uuid.UUID
        Topic identifier.
    payload : AliasCreate
        Alias name and optional source.
    session : SessionDep
        Database session.

    Returns
    -------
    AliasRead
        Created alias.
    """
    topic = session.get(Topic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")

    normalised = normalize_alias(payload.alias_name)
    existing = session.exec(select(Alias).where(Alias.alias_name_normalised == normalised)).first()
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="An alias with this normalised form already exists in the registry.",
        )

    alias = Alias(
        topic_id=topic_id,
        party_id=payload.party_id,
        alias_name=payload.alias_name,
        alias_name_normalised=normalised,
        source=payload.source,
    )
    session.add(alias)
    session.commit()
    session.refresh(alias)
    return AliasRead.model_validate(alias)


@router.delete("/topics/{topic_id}/aliases/{alias_id}", status_code=204)
def remove_alias(
    topic_id: uuid.UUID,
    alias_id: uuid.UUID,
    session: SessionDep,
    _user: WriterDep,
) -> None:
    """Remove an alias from a Topic.

    Parameters
    ----------
    topic_id : uuid.UUID
        Topic identifier.
    alias_id : uuid.UUID
        Alias identifier.
    session : SessionDep
        Database session.
    """
    alias = session.get(Alias, alias_id)
    if alias is None or alias.topic_id != topic_id:
        raise HTTPException(status_code=404, detail="Alias not found")
    session.delete(alias)
    session.commit()


@router.post("/technologies/{tech_id}/factsheet", response_model=FactsheetRead, status_code=201)
def create_factsheet(
    tech_id: uuid.UUID,
    payload: FactsheetCreate,
    session: SessionDep,
    _user: WriterDep,
) -> FactsheetRead:
    """Create a new versioned Factsheet for a Technology.

    Parameters
    ----------
    tech_id : uuid.UUID
        Technology identifier.
    payload : FactsheetCreate
        Factsheet content fields; may include nested assessment.
    session : SessionDep
        Database session.

    Returns
    -------
    FactsheetRead
        Newly created factsheet version.
    """
    tech = session.get(Technology, tech_id)
    if tech is None:
        raise HTTPException(status_code=404, detail="Technology not found")

    existing_versions = session.exec(
        select(Factsheet).where(Factsheet.technology_id == tech_id)
    ).all()
    next_version = max((fs.version for fs in existing_versions), default=0) + 1

    fs = Factsheet(
        technology_id=tech_id,
        version=next_version,
        summary=payload.summary,
        description=payload.description,
        key_players=payload.key_players,
        tax_credit_candidate=payload.tax_credit_candidate,
        publication_links=json.dumps([link.model_dump() for link in payload.publication_links]),
        recommended_next_steps=payload.recommended_next_steps,
        current_challenges=payload.current_challenges,
        last_updated=payload.last_updated,
        strategic_innovation_field_id=payload.strategic_innovation_field_id,
    )
    session.add(fs)
    session.flush()

    assessment = payload.assessment
    if assessment is not None:
        asmt = Assessment(
            factsheet_id=fs.id,
            trl=assessment.trl,
            trl_notes=assessment.trl_notes,
            strategic_relevance=assessment.strategic_relevance,
            strategic_relevance_notes=assessment.strategic_relevance_notes,
            impact_potential=assessment.impact_potential,
            impact_potential_notes=assessment.impact_potential_notes,
            implementation_feasibility=assessment.implementation_feasibility,
            implementation_feasibility_notes=assessment.implementation_feasibility_notes,
            time_to_mainstream=assessment.time_to_mainstream,
            time_to_mainstream_notes=assessment.time_to_mainstream_notes,
            collaboration_potential=assessment.collaboration_potential,
            collaboration_potential_notes=assessment.collaboration_potential_notes,
        )
        session.add(asmt)
        if assessment.trl is not None:
            tech.last_assessed_at = now_utc()

    tech.current_factsheet_id = fs.id
    session.add(tech)

    record_event(
        session=session,
        technology_id=tech_id,
        event_type=EventType.FactsheetEdited,
        from_value=None,
        to_value=str(next_version),
        rationale=f"Factsheet version {next_version} created.",
    )

    session.commit()
    session.refresh(fs)
    return FactsheetRead.model_validate(fs)


@router.get("/technologies/{tech_id}/factsheets", response_model=list[FactsheetRead])
def list_factsheets(tech_id: uuid.UUID, session: SessionDep) -> list[FactsheetRead]:
    """List all factsheet versions for a Technology.

    Parameters
    ----------
    tech_id : uuid.UUID
        Technology identifier.
    session : SessionDep
        Database session.

    Returns
    -------
    list[FactsheetRead]
        All versions, ordered by version ascending.
    """
    tech = session.get(Technology, tech_id)
    if tech is None:
        raise HTTPException(status_code=404, detail="Technology not found")

    factsheets = session.exec(
        select(Factsheet).where(Factsheet.technology_id == tech_id).order_by(asc(Factsheet.version))  # type: ignore[arg-type]
    ).all()
    return [FactsheetRead.model_validate(fs) for fs in factsheets]


@router.get("/technologies/{tech_id}/factsheets/{version}", response_model=FactsheetRead)
def get_factsheet_version(
    tech_id: uuid.UUID,
    version: int,
    session: SessionDep,
) -> FactsheetRead:
    """Retrieve a specific factsheet version.

    Parameters
    ----------
    tech_id : uuid.UUID
        Technology identifier.
    version : int
        Version number to retrieve.
    session : SessionDep
        Database session.

    Returns
    -------
    FactsheetRead
        The requested factsheet version.
    """
    tech = session.get(Technology, tech_id)
    if tech is None:
        raise HTTPException(status_code=404, detail="Technology not found")

    fs = session.exec(
        select(Factsheet)
        .where(Factsheet.technology_id == tech_id)
        .where(Factsheet.version == version)
    ).first()
    if fs is None:
        raise HTTPException(status_code=404, detail="Factsheet version not found")
    return FactsheetRead.model_validate(fs)
