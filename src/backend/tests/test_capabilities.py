"""Tests for the view-capability config and the public-reader field visibility it sits beside."""

import json

from sqlmodel import Session

from app.models.setting import Setting
from app.services.visibility import (
    DEFAULT_CAPABILITIES,
    apply_field_visibility,
    load_capabilities,
    role_has_capability,
)


def _set_capabilities(session: Session, value: object) -> None:
    row = Setting(key="access.capabilities", value=json.dumps(value))
    session.add(row)
    session.commit()


def test_load_capabilities_returns_defaults_when_unset(session: Session) -> None:
    assert load_capabilities(session) == DEFAULT_CAPABILITIES


def test_load_capabilities_saved_override_wins(session: Session) -> None:
    _set_capabilities(session, {"list_view": ["public_reader", "reader", "writer", "admin"]})
    config = load_capabilities(session)
    assert config["list_view"] == ["public_reader", "reader", "writer", "admin"]
    assert config["cycle_selector"] == DEFAULT_CAPABILITIES["cycle_selector"]


def test_load_capabilities_ignores_malformed_json(session: Session) -> None:
    session.add(Setting(key="access.capabilities", value="{not json"))
    session.commit()
    assert load_capabilities(session) == DEFAULT_CAPABILITIES


def test_public_reader_lacks_capabilities_by_default(session: Session) -> None:
    config = load_capabilities(session)
    assert role_has_capability(config, "cycle_selector", "public_reader") is False
    assert role_has_capability(config, "list_view", "public_reader") is False
    assert role_has_capability(config, "list_view", "reader") is True


def test_admin_always_has_capabilities(session: Session) -> None:
    config = load_capabilities(session)
    assert role_has_capability(config, "cycle_selector", "admin") is True
    assert role_has_capability(config, "list_view", "admin") is True


def test_override_can_grant_public_reader_capability(session: Session) -> None:
    _set_capabilities(session, {"cycle_selector": ["public_reader", "reader", "writer", "admin"]})
    config = load_capabilities(session)
    assert role_has_capability(config, "cycle_selector", "public_reader") is True


def test_public_reader_field_visibility_still_enforced(session: Session) -> None:
    """Regression guard: the Visibility menu really controls what a public reader sees."""
    payload = {
        "persons": [{"name": "Internal Contact"}],
        "recent_events": [{"kind": "moved"}],
        "created_by": "alice",
        "assessment": {"trl": 5},
    }
    stripped = apply_field_visibility(dict(payload), session, user=None)
    assert "persons" not in stripped
    assert "recent_events" not in stripped
    assert "created_by" not in stripped
    assert stripped["assessment"] == {"trl": 5}


def test_public_reader_field_override_makes_field_reappear(session: Session) -> None:
    session.add(
        Setting(
            key="visibility.field_roles",
            value=json.dumps({"persons": ["public_reader", "reader", "writer", "admin"]}),
        )
    )
    session.commit()
    payload = {"persons": [{"name": "Now Public"}], "recent_events": [{"kind": "moved"}]}
    stripped = apply_field_visibility(dict(payload), session, user=None)
    assert stripped["persons"] == [{"name": "Now Public"}]
    assert "recent_events" not in stripped
