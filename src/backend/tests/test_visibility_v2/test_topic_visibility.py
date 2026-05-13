"""Visibility-filter tests for `GET /api/topics/{slug}` across all four roles.

Locks the security perimeter described in `app.services.visibility`. Each
parametrized case verifies that fields gated by `DEFAULT_FIELD_ROLES` are
present for permitted roles and stripped for the rest. Admins see everything;
anonymous callers (= PublicReader) are denied access to topics flagged
`not_for_external_publication`.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.models.user import UserRole

PUBLIC_ROLES = (None, UserRole.Reader, UserRole.Writer, UserRole.Admin)


def _get(
    client: TestClient,
    slug: str,
    role: UserRole | None,
    role_headers: dict[UserRole, dict[str, str]],
) -> tuple[int, dict | None]:
    """Issue GET /api/topics/{slug} as `role`; None means anonymous (PublicReader)."""
    headers = role_headers[role] if role is not None else {}
    resp = client.get(f"/api/topics/{slug}", headers=headers)
    body = resp.json() if resp.status_code == 200 else None
    return resp.status_code, body


@pytest.mark.parametrize("role", PUBLIC_ROLES)
def test_public_topic_returns_200_for_every_role(
    anon_client: TestClient,
    public_topic_slug: str,
    role_headers: dict[UserRole, dict[str, str]],
    role: UserRole | None,
) -> None:
    """Public topics are reachable by every role (perimeter test)."""
    status, _ = _get(anon_client, public_topic_slug, role, role_headers)
    assert status == 200


@pytest.mark.parametrize(
    "role,allowed",
    [
        (None, False),
        (UserRole.Reader, True),
        (UserRole.Writer, True),
        (UserRole.Admin, True),
    ],
)
def test_private_topic_404s_for_public_only(
    anon_client: TestClient,
    private_topic_slug: str,
    role_headers: dict[UserRole, dict[str, str]],
    role: UserRole | None,
    allowed: bool,
) -> None:
    """`not_for_external_publication=True` topics 404 for anonymous; visible to authed."""
    status, _ = _get(anon_client, private_topic_slug, role, role_headers)
    assert status == (200 if allowed else 404)


# Field paths gated by DEFAULT_FIELD_ROLES, partitioned by visibility tier.
ALL_ROLE_FIELDS = ("aliases", "peer_references", "assessment")
INTERNAL_TOP_FIELDS = ("persons", "recent_events", "created_by")
ALL_ROLE_FACTSHEET_FIELDS = ("publication_links",)
INTERNAL_FACTSHEET_FIELDS = ("key_players", "current_challenges")
WRITER_FACTSHEET_FIELDS = ("tax_credit_candidate", "recommended_next_steps")


@pytest.mark.parametrize("role", PUBLIC_ROLES)
def test_all_role_top_level_fields_present_for_every_role(
    anon_client: TestClient,
    public_topic_slug: str,
    role_headers: dict[UserRole, dict[str, str]],
    role: UserRole | None,
) -> None:
    """Fields gated to ALL_ROLES are visible to every caller including anonymous."""
    status, body = _get(anon_client, public_topic_slug, role, role_headers)
    assert status == 200 and body is not None
    for field in ALL_ROLE_FIELDS:
        assert field in body, f"{field} missing for role={role}"


@pytest.mark.parametrize("field", INTERNAL_TOP_FIELDS)
def test_internal_top_fields_hidden_from_anonymous(
    anon_client: TestClient,
    public_topic_slug: str,
    role_headers: dict[UserRole, dict[str, str]],
    field: str,
) -> None:
    """`persons` / `recent_events` / `created_by` are stripped for anonymous callers."""
    status, body = _get(anon_client, public_topic_slug, None, role_headers)
    assert status == 200 and body is not None
    assert field not in body, f"{field} leaked to anonymous caller"


@pytest.mark.parametrize("role", (UserRole.Reader, UserRole.Writer, UserRole.Admin))
@pytest.mark.parametrize("field", INTERNAL_TOP_FIELDS)
def test_internal_top_fields_present_for_authed_roles(
    anon_client: TestClient,
    public_topic_slug: str,
    role_headers: dict[UserRole, dict[str, str]],
    role: UserRole,
    field: str,
) -> None:
    """`persons` / `recent_events` / `created_by` are visible to Reader and above."""
    status, body = _get(anon_client, public_topic_slug, role, role_headers)
    assert status == 200 and body is not None
    assert field in body, f"{field} missing for role={role}"


@pytest.mark.parametrize("role", PUBLIC_ROLES)
@pytest.mark.parametrize("field", ALL_ROLE_FACTSHEET_FIELDS)
def test_all_role_factsheet_fields_present_for_every_role(
    anon_client: TestClient,
    public_topic_slug: str,
    role_headers: dict[UserRole, dict[str, str]],
    role: UserRole | None,
    field: str,
) -> None:
    """`factsheet.publication_links` is visible to every role."""
    status, body = _get(anon_client, public_topic_slug, role, role_headers)
    assert status == 200 and body is not None
    factsheet = body.get("factsheet")
    assert factsheet is not None and field in factsheet, (
        f"factsheet.{field} missing for role={role}"
    )


@pytest.mark.parametrize("field", INTERNAL_FACTSHEET_FIELDS)
def test_internal_factsheet_fields_hidden_from_anonymous(
    anon_client: TestClient,
    public_topic_slug: str,
    role_headers: dict[UserRole, dict[str, str]],
    field: str,
) -> None:
    """`factsheet.{key_players, current_challenges}` hidden anonymous."""
    status, body = _get(anon_client, public_topic_slug, None, role_headers)
    assert status == 200 and body is not None
    factsheet = body.get("factsheet") or {}
    assert field not in factsheet, f"factsheet.{field} leaked to anonymous"


@pytest.mark.parametrize("role", (UserRole.Reader, UserRole.Writer, UserRole.Admin))
@pytest.mark.parametrize("field", INTERNAL_FACTSHEET_FIELDS)
def test_internal_factsheet_fields_present_for_authed_roles(
    anon_client: TestClient,
    public_topic_slug: str,
    role_headers: dict[UserRole, dict[str, str]],
    role: UserRole,
    field: str,
) -> None:
    """Internal factsheet fields are visible to Reader and above."""
    status, body = _get(anon_client, public_topic_slug, role, role_headers)
    assert status == 200 and body is not None
    factsheet = body.get("factsheet")
    assert factsheet is not None and field in factsheet, (
        f"factsheet.{field} missing for role={role}"
    )


@pytest.mark.parametrize(
    "role,allowed",
    [
        (None, False),
        (UserRole.Reader, False),
        (UserRole.Writer, True),
        (UserRole.Admin, True),
    ],
)
@pytest.mark.parametrize("field", WRITER_FACTSHEET_FIELDS)
def test_writer_only_factsheet_fields_gated_at_writer(
    anon_client: TestClient,
    public_topic_slug: str,
    role_headers: dict[UserRole, dict[str, str]],
    role: UserRole | None,
    allowed: bool,
    field: str,
) -> None:
    """`tax_credit_candidate` and `recommended_next_steps` need ≥Writer."""
    status, body = _get(anon_client, public_topic_slug, role, role_headers)
    assert status == 200 and body is not None
    factsheet = body.get("factsheet") or {}
    assert (field in factsheet) is allowed, (
        f"factsheet.{field} visibility wrong for role={role} (expected allowed={allowed})"
    )


def test_admin_sees_all_fields(
    anon_client: TestClient,
    public_topic_slug: str,
    role_headers: dict[UserRole, dict[str, str]],
) -> None:
    """Admin bypasses field-stripping entirely (visibility.py:115-116)."""
    status, body = _get(anon_client, public_topic_slug, UserRole.Admin, role_headers)
    assert status == 200 and body is not None
    for field in (*ALL_ROLE_FIELDS, *INTERNAL_TOP_FIELDS):
        assert field in body, f"admin missing top-level {field}"
    factsheet = body.get("factsheet")
    assert factsheet is not None
    for field in (
        *ALL_ROLE_FACTSHEET_FIELDS,
        *INTERNAL_FACTSHEET_FIELDS,
        *WRITER_FACTSHEET_FIELDS,
    ):
        assert field in factsheet, f"admin missing factsheet.{field}"


def test_anonymous_does_not_leak_pii_strings(
    anon_client: TestClient, public_topic_slug: str
) -> None:
    """Belt-and-braces: anonymous response body must not contain person email or notes.

    Catches accidental leakage even if the field-strip logic changes shape
    (e.g. a future field rename or nested-dict refactor).
    """
    resp = anon_client.get(f"/api/topics/{public_topic_slug}")
    assert resp.status_code == 200
    text = resp.text
    assert "jane.internal@example.com" not in text
    assert "Confidential notes (internal-only)." not in text
