"""Time helpers.

Centralizes ``datetime.now(UTC)`` so the codebase has one canonical
"current time" callsite. Tests can monkeypatch this single function to
freeze time without having to know about every caller.
"""

from datetime import UTC, datetime


def now_utc() -> datetime:
    """Return the current time as a tz-aware UTC datetime."""
    return datetime.now(UTC)
