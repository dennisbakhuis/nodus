"""Pydantic response schemas for ``GET /api/radar/current``.

Pre-Phase-8b the route returned ``dict[str, Any]`` and the frontend mirrored
the shape via a hand-typed ``radar/types.ts``. With these schemas attached
as the route's ``response_model``, the OpenAPI surface exposes the full
shape and the frontend can drop the parallel hand-typed module.

The shape mirrors the dict construction at ``app/routers/radar.py:266-325``
line-by-line; tests cover the round-trip so any drift surfaces immediately.

Visibility-filtered fields (``persons`` for non-admin / non-internal callers)
are declared ``Optional`` so the post-strip payload still validates.
"""

from __future__ import annotations

from pydantic import BaseModel

from app.schemas.peer_reference import PeerReferenceSummary
from app.schemas.person import PersonReadPublic


class RadarMeta(BaseModel):
    title: str
    cycle: str | None
    generated_at: str


class RadarCycleInfo(BaseModel):
    id: str
    name: str
    start_date: str
    end_date: str | None
    color: str | None = None


class RadarSegment(BaseModel):
    id: str
    name: str
    slug: str
    order: int
    theme_key: str | None
    is_active: bool


class RadarRing(BaseModel):
    id: int
    name: str
    order: int


class RadarPersonLink(BaseModel):
    link_role: str
    person: PersonReadPublic


class RadarEntry(BaseModel):
    id: str
    topic_id: str
    canonical_name: str
    slug: str
    # Nullable so the same shape can carry "candidate" topics — topics that
    # exist in the registry but have no Technology row yet (e.g. peer-radar
    # references that haven't been triaged). The list view merges these
    # alongside real radar entries for writer/admin curators.
    technology_id: str | None
    registry_status: str | None
    segment_id: str | None
    segment_name: str | None
    segment_slug: str | None
    ring: str | None
    ring_id: int | None
    summary: str | None
    last_updated: str | None
    hero_image_url: str | None
    peer_reference_count: int
    peer_references: list[PeerReferenceSummary]
    # Stripped for PublicReader by apply_field_visibility. Required for
    # internal roles, omitted (not None) for public.
    persons: list[RadarPersonLink] | None = None
    trl: int | None
    strategic_relevance: str | None
    time_to_mainstream: str | None
    # Nullable for candidate topics: no Technology yet, no movement to derive.
    movement: str | None
    # The topic's "not for external publication" flag. Surfaced so the list
    # view can render a 🌐 / 🔒 column for writers; anonymous and PublicReader
    # callers never see private topics in the first place (visibility config
    # already filters them out at the topic level).
    not_for_external_publication: bool = False

    model_config = {"extra": "allow"}


class RadarSnapshotResponse(BaseModel):
    """Full /radar/current response.

    ``model_config`` allows extra keys so future fields don't break clients
    that haven't regenerated their types; the schemas above only describe the
    declared shape.
    """

    radar: RadarMeta
    cycle: RadarCycleInfo | None
    segments: list[RadarSegment]
    rings: list[RadarRing]
    entries: list[RadarEntry]

    model_config = {"extra": "allow"}
