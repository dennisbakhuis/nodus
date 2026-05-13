"""Seed helpers used by app.cli for demo data convenience targets."""

import logging
from pathlib import Path

from sqlmodel import Session, select

from app.models import Technology
from app.services.media import upload_media_asset

logger = logging.getLogger(__name__)


_HERO_IMAGES_DIR = Path(__file__).resolve().parents[4] / "data" / "images"


def _link_curated_hero_image(session: Session, tech: Technology, slug: str) -> None:
    """Upload data/images/<slug>.png as a MediaAsset and link to the technology.

    Idempotent: if the technology already points at a media asset whose
    `original_filename` matches the on-disk PNG, the upload is skipped.
    """
    img_path = _HERO_IMAGES_DIR / f"{slug}.png"
    if not img_path.is_file():
        return
    if tech.hero_image_id is not None:
        from app.models.media_asset import MediaAsset

        existing = session.get(MediaAsset, tech.hero_image_id)
        if existing is not None and existing.original_filename == img_path.name:
            return
    try:
        asset = upload_media_asset(
            session=session,
            raw_bytes=img_path.read_bytes(),
            content_type="image/png",
            original_filename=img_path.name,
            alt_text=tech.topic_id and slug or None,
        )
    except Exception as exc:
        logger.warning("hero image upload failed for %s: %s", slug, exc)
        return
    tech.hero_image_id = asset.id
    session.add(tech)


DEMO_MOVEMENT_OVERRIDES: dict[str, dict[str, str]] = {
    "ai-agents": {"movement": "new"},
    "6g": {"movement": "new"},
    "agentic-ai-for-grid-operations": {"movement": "new"},
    "synthetic-inertia": {"movement": "new"},
    "high-altitude-pseudo-satellites": {"movement": "new"},
    "battery-energy-storage-systems": {"movement": "promoted"},
    "5g": {"movement": "promoted"},
    "advanced-power-flow-control": {"movement": "promoted"},
    "cybersecurity": {"movement": "promoted"},
    "digital-twins": {"movement": "promoted"},
    "green-hydrogen": {"movement": "promoted"},
    "quantum-computing": {"movement": "demoted"},
    "decentralized-autonomous-organizations": {"movement": "demoted"},
    "energy-islands": {"movement": "demoted"},
    "quantum-machine-learning": {"movement": "demoted"},
}


_DEMO_MOVEMENT_TO_EVENT_TYPE: dict[str, str] = {
    "new": "Added",
    "promoted": "Promoted",
    "demoted": "Demoted",
    "removed": "Removed",
}


def seed_demo_movements(session: Session) -> int:
    """Record curated demo MovementEvents so the radar dot encoding lights up.

    Writes MovementEvent rows scoped to the most-recent cycle.

    Idempotent: skips slugs whose tech already has an event of the target
    type in the current cycle. Returns the number of new events created.
    Returns 0 if no cycle exists yet.
    """
    import uuid as _uuid
    from datetime import UTC, datetime

    from app.models.cycle import Cycle
    from app.models.movement_event import MovementEvent
    from app.models.topic import Topic

    cycle = session.exec(
        select(Cycle).order_by(Cycle.start_date.desc())  # type: ignore[attr-defined]
    ).first()
    if cycle is None:
        return 0

    created = 0
    for slug, fields in DEMO_MOVEMENT_OVERRIDES.items():
        target = fields.get("movement")
        if target is None:
            continue
        event_type = _DEMO_MOVEMENT_TO_EVENT_TYPE.get(target)
        if event_type is None:
            continue
        topic = session.exec(select(Topic).where(Topic.slug == slug)).first()
        if topic is None:
            continue
        tech = session.exec(select(Technology).where(Technology.topic_id == topic.id)).first()
        if tech is None:
            continue
        existing = session.exec(
            select(MovementEvent)
            .where(MovementEvent.technology_id == tech.id)
            .where(MovementEvent.cycle_id == cycle.id)
            .where(MovementEvent.event_type == event_type)
        ).first()
        if existing is not None:
            continue
        session.add(
            MovementEvent(
                id=_uuid.uuid4(),
                technology_id=tech.id,
                cycle_id=cycle.id,
                event_type=event_type,
                rationale=f"Demo seed: {target}.",
                timestamp=datetime.now(UTC),
            )
        )
        created += 1
    if created:
        session.commit()
    return created


def relink_hero_images(session: Session) -> int:
    """Walk every Topic and (re)link `data/images/<topic.slug>.png` if present.

    Idempotent — re-running it on a freshly-seeded DB does no I/O when every
    technology already points at an asset matching the on-disk filename.

    Returns the number of technologies that had their hero image attached or
    refreshed by this call.
    """
    from app.models.topic import Topic

    linked = 0
    for tech in session.exec(select(Technology)).all():
        topic = session.get(Topic, tech.topic_id)
        if topic is None:
            continue
        before = tech.hero_image_id
        _link_curated_hero_image(session, tech, topic.slug)
        if tech.hero_image_id is not None and tech.hero_image_id != before:
            linked += 1
    if linked:
        session.commit()
    return linked
