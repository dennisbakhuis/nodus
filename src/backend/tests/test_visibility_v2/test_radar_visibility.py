"""Visibility-filter tests for `GET /api/radar/current` across all four roles.

Two perimeters are exercised here:

1. Topic-level: `not_for_external_publication=True` topics are excluded from
   the entry list when the caller is anonymous (= PublicReader).
2. Field-level: `apply_field_visibility` is applied per entry, so PII inside
   `persons` / `recent_events` / `created_by` is stripped for anonymous callers.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models.setting import Setting
from app.models.user import UserRole
from app.services.visibility import VISIBILITY_SETTING_KEY


def _get_radar(
    client: TestClient,
    role: UserRole | None,
    role_headers: dict[UserRole, dict[str, str]],
) -> dict:
    """Issue GET /api/radar/current as `role`; None = anonymous PublicReader."""
    headers = role_headers[role] if role is not None else {}
    resp = client.get("/api/radar/current", headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.mark.parametrize(
    "role,allowed",
    [
        (None, False),
        (UserRole.Reader, True),
        (UserRole.Writer, True),
        (UserRole.Admin, True),
    ],
)
def test_private_topic_excluded_from_radar_for_public_only(
    anon_client: TestClient,
    public_topic_slug: str,
    private_topic_slug: str,
    role_headers: dict[UserRole, dict[str, str]],
    role: UserRole | None,
    allowed: bool,
) -> None:
    """Private topics are absent from `/radar/current` entries for anonymous callers."""
    body = _get_radar(anon_client, role, role_headers)
    slugs = {e.get("slug") for e in body.get("entries", [])}
    assert public_topic_slug in slugs, "public topic missing from entries"
    assert (private_topic_slug in slugs) is allowed, (
        f"private topic visibility wrong for role={role} (expected allowed={allowed})"
    )


def test_radar_entries_strip_persons_for_anonymous(
    anon_client: TestClient,
    public_topic_slug: str,
    role_headers: dict[UserRole, dict[str, str]],
) -> None:
    """`persons` is gated to internal roles; absent (or empty) for anonymous entries."""
    body = _get_radar(anon_client, None, role_headers)
    entry = next((e for e in body["entries"] if e.get("slug") == public_topic_slug), None)
    assert entry is not None
    assert not entry.get("persons"), "persons array leaked to anonymous radar caller"


@pytest.mark.parametrize("role", (UserRole.Reader, UserRole.Writer, UserRole.Admin))
def test_radar_entries_include_persons_for_authed_roles(
    anon_client: TestClient,
    public_topic_slug: str,
    role_headers: dict[UserRole, dict[str, str]],
    role: UserRole,
) -> None:
    """`persons` is populated on radar entries for Reader, Writer, Admin."""
    body = _get_radar(anon_client, role, role_headers)
    entry = next((e for e in body["entries"] if e.get("slug") == public_topic_slug), None)
    assert entry is not None
    assert entry.get("persons"), f"persons missing for role={role}"


def test_radar_anonymous_does_not_leak_pii_strings(
    anon_client: TestClient, public_topic_slug: str
) -> None:
    """No person email or private-notes string appears anywhere in the anonymous radar payload."""
    resp = anon_client.get("/api/radar/current")
    assert resp.status_code == 200
    text = resp.text
    assert "jane.internal@example.com" not in text
    assert "Confidential notes (internal-only)." not in text


def test_radar_survives_peer_references_hidden_from_anonymous(
    anon_client: TestClient, session: Session, public_topic_slug: str
) -> None:
    """Hiding `peer_references` from public readers empties it instead of failing validation."""
    session.add(
        Setting(
            key=VISIBILITY_SETTING_KEY,
            value=json.dumps({"peer_references": ["reader", "writer", "admin"]}),
        )
    )
    session.commit()

    resp = anon_client.get("/api/radar/current")
    assert resp.status_code == 200, resp.text
    entry = next(e for e in resp.json()["entries"] if e["slug"] == public_topic_slug)
    assert entry["peer_references"] == []
    assert "Same tech at peer org" not in resp.text


def test_radar_keeps_peer_references_for_reader_when_hidden_from_anonymous(
    anon_client: TestClient,
    session: Session,
    public_topic_slug: str,
    role_headers: dict[UserRole, dict[str, str]],
) -> None:
    """The same override leaves `peer_references` intact for roles it still lists."""
    session.add(
        Setting(
            key=VISIBILITY_SETTING_KEY,
            value=json.dumps({"peer_references": ["reader", "writer", "admin"]}),
        )
    )
    session.commit()

    body = _get_radar(anon_client, UserRole.Reader, role_headers)
    entry = next(e for e in body["entries"] if e["slug"] == public_topic_slug)
    assert [pr["peer_title"] for pr in entry["peer_references"]] == ["Same tech at peer org"]
