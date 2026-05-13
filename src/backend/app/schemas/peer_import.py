"""Schemas for the peer-reference import endpoint.

The payload mirrors what the frontend's `dataExport/jsonPeerRef.ts` serializer
emits, so a JSON exported from one Nodus instance can be POSTed back into
another to land as peer references.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class PeerImportUrl(BaseModel):
    """A URL belonging to one topic-level peer reference in the import payload."""

    url: str = Field(min_length=1)
    label: str | None = None
    display_order: int = 0


class PeerImportTopic(BaseModel):
    """One topic's peer-reference contribution from the exporting org."""

    canonical_name: str = Field(min_length=1)
    slug: str = Field(min_length=1)
    peer_title: str = Field(min_length=1)
    peer_ring_label: str | None = None
    peer_segment_label: str | None = None
    peer_time_to_mainstream_label: str | None = None
    summary: str | None = None
    urls: list[PeerImportUrl] = []


class PeerImportSource(BaseModel):
    """Identity of the exporting organisation, used to resolve Party + Source rows."""

    party_name: str = Field(min_length=1)
    party_slug: str | None = None
    party_url: str | None = None
    source_name: str = Field(min_length=1)
    source_url: str | None = None


class PeerImportPayload(BaseModel):
    """Full peer-reference import payload."""

    version: str
    format: str
    exported_at: datetime | None = None
    source: PeerImportSource
    topics: list[PeerImportTopic]


class UnmatchedTopic(BaseModel):
    """A topic from the payload that did not match any local Topic row."""

    canonical_name: str
    slug: str


class ImportSummary(BaseModel):
    """Outcome of an import or dry-run."""

    dry_run: bool
    party_resolved: str
    party_created: bool
    source_resolved: str
    source_created: bool
    topics_in_payload: int
    topics_matched: int
    topics_unmatched: list[UnmatchedTopic]
    peer_references_created: int
    peer_references_updated: int
    urls_added: int
    urls_skipped: int
