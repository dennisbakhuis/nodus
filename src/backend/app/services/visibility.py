"""Field-level visibility — strip sensitive fields from a topic-detail payload by role.

The configuration lives as a single Setting row keyed `visibility.field_roles`. The
value is a JSON map: `{ "<dot.path>": ["public_reader", "reader", "writer", "admin"] }`.
Every supported field path is listed in DEFAULT_FIELD_ROLES below; missing keys
fall back to the default role list. Admins always see everything.
"""

import json
from typing import Any

from sqlmodel import Session, select

from app.models.setting import Setting
from app.models.user import User, UserRole

VISIBILITY_SETTING_KEY = "visibility.field_roles"

ALL_ROLES: list[str] = [
    UserRole.PublicReader.value,
    UserRole.Reader.value,
    UserRole.Writer.value,
    UserRole.Admin.value,
]

INTERNAL_ROLES: list[str] = [
    UserRole.Reader.value,
    UserRole.Writer.value,
    UserRole.Admin.value,
]

WRITER_ROLES: list[str] = [
    UserRole.Writer.value,
    UserRole.Admin.value,
]


# Field paths supported by the visibility config. Key = dot-path inside the
# topic-detail payload returned by registry.get_topic. Value = default roles
# allowed to see this field. Admins always see everything regardless.
DEFAULT_FIELD_ROLES: dict[str, list[str]] = {
    "persons": INTERNAL_ROLES,
    "peer_references": ALL_ROLES,
    "recent_events": INTERNAL_ROLES,
    "aliases": ALL_ROLES,
    "created_by": INTERNAL_ROLES,
    "factsheet.tax_credit_candidate": WRITER_ROLES,
    "factsheet.publication_links": ALL_ROLES,
    "factsheet.key_players": INTERNAL_ROLES,
    "factsheet.recommended_next_steps": WRITER_ROLES,
    "factsheet.current_challenges": INTERNAL_ROLES,
    "assessment": ALL_ROLES,
}


CAPABILITY_SETTING_KEY = "access.capabilities"


# View affordances gated per role on the public/radar surface. Value = default
# roles allowed to use the capability. Internal-only by default, so anonymous
# public readers are excluded until an admin opts them in.
DEFAULT_CAPABILITIES: dict[str, list[str]] = {
    "cycle_selector": INTERNAL_ROLES,
    "list_view": INTERNAL_ROLES,
}


def _user_role(user: User | None) -> str:
    """Return the role string for visibility checks; anonymous → public_reader."""
    if user is None:
        return UserRole.PublicReader.value
    return user.role


def _load_role_map(
    session: Session, key: str, defaults: dict[str, list[str]]
) -> dict[str, list[str]]:
    """Read a `{ name: [roles] }` map from a Setting row, merging saved over defaults.

    Returns a complete map covering every key in `defaults`; saved overrides win,
    defaults fill gaps. Malformed JSON is silently ignored.
    """
    row = session.exec(select(Setting).where(Setting.key == key)).first()
    saved: dict[str, list[str]] = {}
    if row and row.value:
        try:
            parsed = json.loads(row.value)
            if isinstance(parsed, dict):
                for name, roles in parsed.items():
                    if isinstance(roles, list) and all(isinstance(r, str) for r in roles):
                        saved[name] = roles
        except json.JSONDecodeError:
            pass
    merged = dict(defaults)
    merged.update(saved)
    return merged


def load_visibility_config(session: Session) -> dict[str, list[str]]:
    """Read and merge the field-visibility config from settings, falling back to defaults."""
    return _load_role_map(session, VISIBILITY_SETTING_KEY, DEFAULT_FIELD_ROLES)


def load_capabilities(session: Session) -> dict[str, list[str]]:
    """Read and merge the view-capability config from settings, falling back to defaults."""
    return _load_role_map(session, CAPABILITY_SETTING_KEY, DEFAULT_CAPABILITIES)


def role_has_capability(config: dict[str, list[str]], capability: str, role: str) -> bool:
    """Whether `role` is granted `capability`; admins always pass."""
    if role == UserRole.Admin.value:
        return True
    allowed = config.get(capability, DEFAULT_CAPABILITIES.get(capability, []))
    return role in allowed


def _strip_path(payload: dict[str, Any], path: str) -> None:
    """Remove `path` (dot-separated) from `payload` in-place if present."""
    parts = path.split(".")
    cursor: Any = payload
    for part in parts[:-1]:
        if not isinstance(cursor, dict):
            return
        nxt = cursor.get(part)
        if nxt is None:
            return
        cursor = nxt
    if isinstance(cursor, dict):
        cursor.pop(parts[-1], None)


def apply_field_visibility(
    payload: dict[str, Any],
    session: Session,
    user: User | None,
    config: dict[str, list[str]] | None = None,
) -> dict[str, Any]:
    """Return `payload` with fields stripped that the caller's role may not see.

    Admins always see everything; otherwise each configured field is removed if
    the caller's role isn't in that field's role list. Mutates and returns
    `payload` for caller convenience.

    `config` may be passed pre-loaded by callers that strip many payloads in a
    row (e.g. `/radar/current`); when omitted, the config is loaded from the
    DB on every call.
    """
    role = _user_role(user)
    if role == UserRole.Admin.value:
        return payload
    if config is None:
        config = load_visibility_config(session)
    for path, roles in config.items():
        if role not in roles:
            _strip_path(payload, path)
    return payload
