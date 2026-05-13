import uuid
from datetime import UTC, datetime
from typing import Any

from sqlmodel import Session, select

from app.models.cycle import Cycle
from app.models.factsheet import Factsheet
from app.models.initiative import Initiative
from app.models.movement_event import MovementEvent
from app.models.peer_reference import PeerReference
from app.models.segment import Segment
from app.models.setting import Setting
from app.models.technology import RegistryStatus, Technology
from app.models.topic import Topic
from app.models.topic_person_link import TopicPersonLink


def _radar_title(session: Session) -> str:
    """Read the configurable ``radar.title`` setting (with sensible fallback)."""
    row = session.exec(select(Setting).where(Setting.key == "radar.title")).first()
    if row is not None and row.value:
        return row.value
    return "Technology Radar"


def _public_visible_tech_ids(session: Session) -> set[uuid.UUID]:
    """Return the set of Technology IDs whose Topic is publishable externally.

    Used by every deliverable function when ``public_only=True`` so the
    deliverable surfaces honour the same ``not_for_external_publication``
    perimeter as ``/radar/current``.
    """
    rows = session.exec(
        select(Technology.id, Topic.not_for_external_publication).join(
            Topic,
            Topic.id == Technology.topic_id,  # type: ignore[arg-type]
        )
    ).all()
    return {tech_id for tech_id, hidden in rows if not hidden}


def _cycle_event_window(cycle: Cycle) -> tuple[datetime, datetime]:
    """Return [start, end) datetime bounds for events that belong to this cycle."""
    start = datetime.combine(cycle.start_date, datetime.min.time(), tzinfo=UTC)
    end_date = cycle.end_date
    end = (
        datetime.combine(end_date, datetime.max.time(), tzinfo=UTC)
        if end_date is not None
        else datetime.now(UTC)
    )
    return start, end


def _get_cycle(session: Session, cycle_id: uuid.UUID) -> Cycle:
    cycle = session.get(Cycle, cycle_id)
    if cycle is None:
        raise ValueError(f"Cycle {cycle_id} not found")
    return cycle


def _get_segment_map(session: Session) -> dict[uuid.UUID, Segment]:
    segments = session.exec(select(Segment)).all()
    return {s.id: s for s in segments}


def _get_current_factsheet(session: Session, technology: Technology) -> Factsheet | None:
    if technology.current_factsheet_id is None:
        return None
    return session.get(Factsheet, technology.current_factsheet_id)


def _get_topic(session: Session, technology: Technology) -> Topic | None:
    return session.get(Topic, technology.topic_id)


def _canonical_name(session: Session, technology: Technology) -> str:
    topic = _get_topic(session, technology)
    return topic.canonical_name if topic else str(technology.topic_id)


def _peer_reference_count(session: Session, topic_id: uuid.UUID) -> int:
    refs = session.exec(select(PeerReference).where(PeerReference.topic_id == topic_id)).all()
    return len(refs)


def _person_link_count(session: Session, topic_id: uuid.UUID) -> int:
    links = session.exec(select(TopicPersonLink).where(TopicPersonLink.topic_id == topic_id)).all()
    return len(links)


def radar_snapshot_json(
    session: Session, cycle_id: uuid.UUID, *, public_only: bool = False
) -> dict[str, Any]:
    """Build the full radar state dict for the given cycle (Technology only).

    Parameters
    ----------
    session : Session
        Active database session.
    cycle_id : uuid.UUID
        ID of the cycle to snapshot.
    public_only : bool
        When True, exclude topics flagged ``not_for_external_publication``.
        Anonymous and PublicReader callers must pass True so deliverables
        honour the same visibility perimeter as the live
        ``/radar/current`` endpoint.

    Returns
    -------
    dict
        Topic-grouped radar shape. Captures Technology state only.
    """
    cycle = _get_cycle(session, cycle_id)
    segment_map = _get_segment_map(session)

    technologies = session.exec(
        select(Technology).where(Technology.registry_status == RegistryStatus.OnRadar)
    ).all()

    ring_order = {"Invest": 0, "Pilot": 1, "Explore": 2, "Monitor": 3}

    entries = []
    for tech in technologies:
        topic = _get_topic(session, tech)
        if public_only and topic is not None and topic.not_for_external_publication:
            continue
        factsheet = _get_current_factsheet(session, tech)
        movement = _resolve_movement(session, tech, cycle)
        peer_count = _peer_reference_count(session, tech.topic_id)
        person_count = _person_link_count(session, tech.topic_id)

        entries.append(
            {
                "topic_id": str(tech.topic_id),
                "technology_id": str(tech.id),
                "canonical_name": topic.canonical_name if topic else str(tech.topic_id),
                "slug": topic.slug if topic else "",
                "not_for_external_publication": (
                    topic.not_for_external_publication if topic else False
                ),
                "segment_id": (str(tech.current_segment_id) if tech.current_segment_id else None),
                "ring": tech.current_ring,
                "ring_id": ring_order.get(tech.current_ring or "", -1) + 1,
                "movement": movement,
                "summary": factsheet.summary if factsheet else None,
                "last_updated": factsheet.last_updated.isoformat() if factsheet else None,
                "peer_reference_count": peer_count,
                "person_count": person_count,
                "hero_image_id": str(tech.hero_image_id) if tech.hero_image_id else None,
            }
        )

    segments_list = [
        {
            "id": str(s.id),
            "name": s.name,
            "slug": s.slug,
            "order": s.display_order,
        }
        for s in sorted(segment_map.values(), key=lambda x: x.display_order)
    ]

    rings_list = [
        {"id": 1, "name": "Invest", "order": 0},
        {"id": 2, "name": "Pilot", "order": 1},
        {"id": 3, "name": "Explore", "order": 2},
        {"id": 4, "name": "Monitor", "order": 3},
    ]

    return {
        "radar": {
            "title": _radar_title(session),
            "cycle": cycle.name,
            "generated_at": datetime.now(UTC).isoformat(),
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


def _resolve_movement(session: Session, tech: Technology, cycle: Cycle) -> str:
    """Determine the movement label for a technology within a cycle.

    Parameters
    ----------
    session : Session
        Active database session.
    tech : Technology
        The technology to classify.
    cycle : Cycle
        The cycle context.

    Returns
    -------
    str
        One of: 'new', 'promoted', 'demoted', 'unchanged'.
    """
    start, end = _cycle_event_window(cycle)
    stmt = (
        select(MovementEvent)
        .where(MovementEvent.technology_id == tech.id)
        .where(MovementEvent.timestamp >= start)
        .where(MovementEvent.timestamp <= end)
        .order_by(MovementEvent.timestamp)  # type: ignore[arg-type]
    )
    events = session.exec(stmt).all()

    ring_order = {"Invest": 0, "Pilot": 1, "Explore": 2, "Monitor": 3}

    for event in events:
        if event.event_type in ("Added", "Reactivated"):
            return "new"
        if event.event_type in ("Promoted", "Demoted", "RingChanged"):
            from_rank = ring_order.get(event.from_value or "", -1)
            to_rank = ring_order.get(event.to_value or "", -1)
            if from_rank >= 0 and to_rank >= 0:
                if to_rank < from_rank:
                    return "promoted"
                if to_rank > from_rank:
                    return "demoted"

    return "unchanged"


def _count_movements_in_cycle(session: Session, cycle: Cycle) -> dict[str, list[Technology]]:
    """Group technologies by movement type for a closed cycle snapshot.

    Parameters
    ----------
    session : Session
        Active database session.
    cycle : Cycle
        The cycle to analyse.

    Returns
    -------
    dict[str, list[Technology]]
        Keys: 'added', 'promoted', 'demoted', 'removed'.
    """
    start, end = _cycle_event_window(cycle)
    stmt = (
        select(MovementEvent)
        .where(MovementEvent.timestamp >= start)
        .where(MovementEvent.timestamp <= end)
        .order_by(MovementEvent.timestamp)  # type: ignore[arg-type]
    )
    events = session.exec(stmt).all()

    ring_order = {"Invest": 0, "Pilot": 1, "Explore": 2, "Monitor": 3}
    added: list[Technology] = []
    promoted: list[Technology] = []
    demoted: list[Technology] = []
    removed: list[Technology] = []
    seen: set[uuid.UUID] = set()

    for event in events:
        if event.technology_id in seen:
            continue
        tech = session.get(Technology, event.technology_id)
        if tech is None:
            continue
        if event.event_type in ("Added", "Reactivated") and event.technology_id not in seen:
            added.append(tech)
            seen.add(event.technology_id)
        elif event.event_type == "Removed":
            removed.append(tech)
            seen.add(event.technology_id)
        elif event.event_type in ("Promoted", "Demoted", "RingChanged"):
            from_rank = ring_order.get(event.from_value or "", -1)
            to_rank = ring_order.get(event.to_value or "", -1)
            if from_rank >= 0 and to_rank >= 0:
                if to_rank < from_rank:
                    promoted.append(tech)
                elif to_rank > from_rank:
                    demoted.append(tech)
                seen.add(event.technology_id)

    return {"added": added, "promoted": promoted, "demoted": demoted, "removed": removed}


def summary_brief_markdown(
    session: Session, cycle_id: uuid.UUID, *, public_only: bool = False
) -> str:
    """Generate a one-page Summary Brief markdown document.

    Parameters
    ----------
    session : Session
        Active database session.
    cycle_id : uuid.UUID
        ID of the cycle to summarise.
    public_only : bool
        When True, exclude technologies whose topic is flagged
        ``not_for_external_publication``.

    Returns
    -------
    str
        Markdown-formatted one-page report.
    """
    cycle = _get_cycle(session, cycle_id)
    segment_map = _get_segment_map(session)
    movements = _count_movements_in_cycle(session, cycle)
    visible_ids = _public_visible_tech_ids(session) if public_only else None
    if visible_ids is not None:
        movements = {
            kind: [t for t in techs if t.id in visible_ids] for kind, techs in movements.items()
        }

    lines: list[str] = [
        f"# {_radar_title(session)} — {cycle.name} Summary Brief",
        "",
        f"**Cycle:** {cycle.name}  ",
        f"**Start date:** {cycle.start_date.isoformat()}  ",
        f"**End date:** {cycle.end_date.isoformat() if cycle.end_date else 'Open'}  ",
        f"**Generated:** {datetime.now(UTC).strftime('%Y-%m-%d %H:%M UTC')}",
        "",
        "---",
        "",
        "## Headline Changes",
        "",
        f"- **Added / Reactivated:** {len(movements['added'])}",
        f"- **Promoted:** {len(movements['promoted'])}",
        f"- **Demoted:** {len(movements['demoted'])}",
        f"- **Removed:** {len(movements['removed'])}",
        "",
        "---",
        "",
        "## Highlights by Segment",
        "",
    ]

    by_segment: dict[str, list[str]] = {s.name: [] for s in segment_map.values()}

    for movement_type, tech_list in movements.items():
        for tech in tech_list:
            seg_name = "Unassigned"
            if tech.current_segment_id and tech.current_segment_id in segment_map:
                seg_name = segment_map[tech.current_segment_id].name
            canonical = _canonical_name(session, tech)
            label = {
                "added": "New",
                "promoted": "Promoted",
                "demoted": "Demoted",
                "removed": "Removed",
            }[movement_type]
            entry = by_segment.setdefault(seg_name, [])
            entry.append(f"- **{canonical}** ({label})")

    for seg_name, items in sorted(by_segment.items()):
        if items:
            lines.append(f"### {seg_name}")
            lines.extend(items)
            lines.append("")

    on_radar = session.exec(
        select(Technology).where(Technology.registry_status == RegistryStatus.OnRadar)
    ).all()
    if visible_ids is not None:
        on_radar = [t for t in on_radar if t.id in visible_ids]
    lines.extend(
        [
            "---",
            "",
            f"**Total On Radar:** {len(on_radar)} technologies across all segments.",
            "",
        ]
    )

    return "\n".join(lines)


def detailed_report_markdown(
    session: Session, cycle_id: uuid.UUID, *, public_only: bool = False
) -> str:
    """Generate a Detailed Report with factsheets for new/changed technologies.

    Parameters
    ----------
    session : Session
        Active database session.
    cycle_id : uuid.UUID
        ID of the cycle.

    Returns
    -------
    str
        Concatenated Markdown factsheets.
    """
    cycle = _get_cycle(session, cycle_id)
    movements = _count_movements_in_cycle(session, cycle)
    visible_ids = _public_visible_tech_ids(session) if public_only else None

    changed_techs: list[Technology] = []
    seen_ids: set[uuid.UUID] = set()
    for tech_list in (movements["added"], movements["promoted"], movements["demoted"]):
        for tech in tech_list:
            if tech.id in seen_ids:
                continue
            if visible_ids is not None and tech.id not in visible_ids:
                continue
            changed_techs.append(tech)
            seen_ids.add(tech.id)

    lines: list[str] = [
        f"# {_radar_title(session)} — {cycle.name} Detailed Report",
        "",
        f"*{len(changed_techs)} new or changed technologies in this cycle.*",
        "",
        "---",
        "",
    ]

    for tech in changed_techs:
        factsheet = _get_current_factsheet(session, tech)
        canonical = _canonical_name(session, tech)
        peer_count = _peer_reference_count(session, tech.topic_id)
        lines.append(f"## {canonical}")
        lines.append("")
        lines.append(f"**Registry Status:** {tech.registry_status}  ")
        lines.append(f"**Ring:** {tech.current_ring or 'N/A'}  ")
        if peer_count > 0:
            lines.append(f"**Peer References:** {peer_count} organisation(s)  ")
        if factsheet:
            if factsheet.summary:
                lines.append(f"**Summary:** {factsheet.summary}  ")
            lines.append("")
            if factsheet.description:
                lines.append("### Description")
                lines.append("")
                lines.append(factsheet.description)
                lines.append("")
            initiatives = session.exec(
                select(Initiative)
                .where(Initiative.technology_id == tech.id)
                .order_by(Initiative.display_order, Initiative.created_at)  # type: ignore[arg-type]
            ).all()
            if initiatives:
                lines.append("### Initiatives")
                lines.append("")
                for init in initiatives:
                    lines.append(f"- **{init.title}** — _{init.status}_")
                    if init.description:
                        lines.append("")
                        lines.append(f"  {init.description}")
                lines.append("")
            if factsheet.key_players:
                lines.append("### Key Players")
                lines.append("")
                lines.append(factsheet.key_players)
                lines.append("")
            if factsheet.recommended_next_steps:
                lines.append("### Recommended Next Steps")
                lines.append("")
                lines.append(factsheet.recommended_next_steps)
                lines.append("")
            if factsheet.current_challenges:
                lines.append("### Current Challenges")
                lines.append("")
                lines.append(factsheet.current_challenges)
                lines.append("")
        lines.append("---")
        lines.append("")

    return "\n".join(lines)


_DELTA_EVENT_HEADINGS: dict[str, str] = {
    "Added": "Addition",
    "Promoted": "Promotion",
    "Demoted": "Demotion",
    "Removed": "Removal",
}


def delta_document_markdown(
    session: Session, cycle_id: uuid.UUID, *, public_only: bool = False
) -> str:
    """Generate a Delta Document from MovementEvents in the cycle.

    Filters to the four ring-movement event types per methodology §4.3 — the
    Delta Document describes "what moved, what was added, what was removed".
    Audit-only events (FactsheetEdited, RingChanged, SegmentChanged,
    StatusChanged, Reactivated) are excluded; they remain visible in the
    per-topic recent_events timeline.

    Parameters
    ----------
    session : Session
        Active database session.
    cycle_id : uuid.UUID
        ID of the cycle.
    public_only : bool
        When True, exclude events whose technology's topic is flagged
        ``not_for_external_publication``.

    Returns
    -------
    str
        Markdown delta document listing the cycle's ring-movement events
        with rationale.
    """
    cycle = _get_cycle(session, cycle_id)
    visible_ids = _public_visible_tech_ids(session) if public_only else None

    start, end = _cycle_event_window(cycle)
    stmt = (
        select(MovementEvent)
        .where(MovementEvent.timestamp >= start)
        .where(MovementEvent.timestamp <= end)
        .where(MovementEvent.event_type.in_(tuple(_DELTA_EVENT_HEADINGS)))  # type: ignore[attr-defined]
        .order_by(MovementEvent.timestamp)  # type: ignore[arg-type]
    )
    events = session.exec(stmt).all()
    if visible_ids is not None:
        events = [e for e in events if e.technology_id in visible_ids]

    lines: list[str] = [
        f"# {_radar_title(session)} — {cycle.name} Delta Document",
        "",
        f"**Cycle:** {cycle.name}  ",
        f"**Period:** {cycle.start_date.isoformat()} – "
        f"{cycle.end_date.isoformat() if cycle.end_date else 'present'}  ",
        f"**Ring movements:** {len(events)}",
        "",
        "---",
        "",
        "## Movement Log",
        "",
    ]

    if not events:
        lines.append("*No ring movements recorded for this cycle.*")
        lines.append("")
        return "\n".join(lines)

    for event in events:
        tech = session.get(Technology, event.technology_id)
        tech_name = _canonical_name(session, tech) if tech is not None else str(event.technology_id)
        timestamp = event.timestamp.strftime("%Y-%m-%d %H:%M UTC")
        heading_kind = _DELTA_EVENT_HEADINGS[event.event_type]

        from_str = f"`{event.from_value}`" if event.from_value else "—"
        to_str = f"`{event.to_value}`" if event.to_value else "—"

        lines.extend(
            [
                f"### {tech_name} — {heading_kind}",
                "",
                f"- **Timestamp:** {timestamp}",
                f"- **Change:** {from_str} → {to_str}",
                f"- **Rationale:** {event.rationale}",
                "",
            ]
        )

    return "\n".join(lines)
