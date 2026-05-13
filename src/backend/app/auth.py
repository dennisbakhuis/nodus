"""Authentication primitives — token hashing, password hashing, FastAPI deps.

Anonymous requests resolve to `current_user_optional() -> None`. Anonymous
callers (and the explicit `public_reader` role) only see Topics flagged as
public; authenticated readers and above see everything. Endpoints that mutate
state declare `Depends(require_writer)` or `Depends(require_admin)`.

The whole auth system can be turned off for local single-user use by setting
`NODUS_AUTH_DISABLED=1` in the environment. When disabled, every request is
treated as an authenticated admin and `is_public_only` is never True.

The public-reader fallback can also be turned off independently by setting
`NODUS_PUBLIC_READER_DISABLED=1`. In that mode, anonymous requests and
accounts with role `public_reader` are rejected with 401 — the deployment
requires a Reader/Writer/Admin login to see anything. `NODUS_AUTH_DISABLED`
still wins (synthetic admin short-circuits the check).
"""

import base64
import hashlib
import io
import secrets
import uuid
from datetime import UTC, timedelta
from typing import Annotated, Protocol

import bcrypt
import pyotp
import qrcode
from fastapi import Depends, Header, HTTPException, status
from sqlmodel import Session, select

from app import config
from app.db import SessionDep
from app.models.api_key import ApiKey
from app.models.auth_session import AuthSession
from app.models.user import User, UserRole
from app.time_utils import now_utc

SESSION_TTL = timedelta(days=14)
MFA_CHALLENGE_TTL = timedelta(minutes=5)
TOTP_ISSUER = "Nodus"

API_KEY_TOKEN_PREFIX = "ntr_"
API_KEY_PREFIX_DISPLAY_LEN = 12
API_KEY_LAST_USED_DEBOUNCE = timedelta(seconds=60)


def auth_disabled() -> bool:
    """Whether the auth system has been turned off via NODUS_AUTH_DISABLED env.

    Thin wrapper kept for backwards compatibility — the canonical source is
    :func:`app.config.auth_disabled`.
    """
    return config.auth_disabled()


_SYNTHETIC_ADMIN_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


def synthetic_admin() -> User:
    """In-memory admin user returned when auth is disabled. Never persisted."""
    return User(
        id=_SYNTHETIC_ADMIN_ID,
        username="local",
        first_name="Local",
        last_name="Admin",
        password_hash="",
        role=UserRole.Admin.value,
        is_active=True,
    )


def is_public_only(user: User | None) -> bool:
    """Whether the caller may only see Topics flagged as public."""
    if user is None:
        return True
    return user.role == UserRole.PublicReader.value


def hash_password(plain: str) -> str:
    """Return a bcrypt hash for `plain` using a fresh salt."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time check of a plaintext password against a stored bcrypt hash."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def generate_token() -> str:
    """Return a fresh URL-safe random token to hand to the client."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Return SHA-256 hex digest of a token; what we persist in `auth_session`."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_api_key() -> tuple[str, str]:
    """Return ``(plaintext, prefix)`` for a fresh API key.

    The plaintext is ``"ntr_" + secrets.token_urlsafe(32)``. The prefix is the
    first ``API_KEY_PREFIX_DISPLAY_LEN`` characters of the plaintext and is
    safe to persist as plaintext — it's used by the admin UI to identify keys.
    """
    plaintext = API_KEY_TOKEN_PREFIX + secrets.token_urlsafe(32)
    return plaintext, plaintext[:API_KEY_PREFIX_DISPLAY_LEN]


def generate_totp_secret() -> str:
    """Return a fresh base32-encoded TOTP secret (160 bits)."""
    return pyotp.random_base32()


def totp_provisioning_uri(secret: str, account_name: str) -> str:
    """Build the otpauth:// URI a user scans into their authenticator app."""
    return pyotp.totp.TOTP(secret).provisioning_uri(name=account_name, issuer_name=TOTP_ISSUER)


def verify_totp(secret: str, code: str) -> bool:
    """Return True if `code` matches the current TOTP for `secret` (±1 window)."""
    if not secret or not code:
        return False
    cleaned = code.replace(" ", "").strip()
    if not cleaned.isdigit() or len(cleaned) != 6:
        return False
    return pyotp.totp.TOTP(secret).verify(cleaned, valid_window=1)


def totp_qr_data_url(provisioning_uri: str) -> str:
    """Render the otpauth URI to a base64-encoded PNG data URL for inline display."""
    img = qrcode.make(provisioning_uri)
    buf = io.BytesIO()
    img.save(buf, kind="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _extract_bearer(authorization: str | None) -> str | None:
    """Return the token from a `Bearer <token>` header value, or None."""
    if not authorization:
        return None
    parts = authorization.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


def _resolve_api_key(session: SessionDep, token: str) -> User | None:
    """Resolve an API-key bearer token to a User, or return None.

    Rejects revoked, expired, or inactive-user keys. Updates ``last_used_at``
    at most once per ``API_KEY_LAST_USED_DEBOUNCE`` to bound write amplification.
    """
    token_hash = hash_token(token)
    api_key = session.exec(select(ApiKey).where(ApiKey.token_hash == token_hash)).first()
    if api_key is None:
        return None
    if api_key.revoked_at is not None:
        return None

    now = now_utc()
    expires_at = api_key.expires_at
    if expires_at is not None:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if expires_at <= now:
            return None

    user = session.get(User, api_key.user_id)
    if user is None or not user.is_active:
        return None

    last_used = api_key.last_used_at
    if last_used is not None and last_used.tzinfo is None:
        last_used = last_used.replace(tzinfo=UTC)
    if last_used is None or now - last_used >= API_KEY_LAST_USED_DEBOUNCE:
        api_key.last_used_at = now
        session.add(api_key)
        session.commit()
    return user


def _resolve_session_token(session: Session, token: str) -> User | None:
    """Resolve a local login session bearer token to a User, or None.

    Expired sessions are deleted opportunistically. The session row's
    ``last_seen_at`` is refreshed on every successful match.
    """
    token_hash = hash_token(token)
    auth_session = session.exec(
        select(AuthSession).where(AuthSession.token_hash == token_hash)
    ).first()
    if auth_session is None:
        return None

    now = now_utc()
    expires_at = auth_session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at <= now:
        session.delete(auth_session)
        session.commit()
        return None

    user = session.get(User, auth_session.user_id)
    if user is None or not user.is_active:
        return None

    auth_session.last_seen_at = now
    session.add(auth_session)
    session.commit()
    return user


class AuthProvider(Protocol):
    """A pluggable strategy for resolving an inbound request to a User.

    Each provider is consulted in order by :func:`current_user_optional`.
    The first provider that returns a non-None User wins. Returning None
    means "I cannot or will not handle this request" — the chain moves on.

    Providers must be cheap when they decline (e.g., when the token doesn't
    match their prefix or the relevant env flag isn't set) since every
    request walks the full chain.
    """

    name: str

    def resolve(self, session: Session, authorization: str | None) -> User | None: ...


class AuthDisabledProvider:
    """Short-circuit provider that returns the synthetic admin when auth is off.

    Active only when ``NODUS_AUTH_DISABLED`` is set. Ignores the request's
    Authorization header — single-user mode means "everyone is admin."
    """

    name = "auth-disabled"

    def resolve(self, session: Session, authorization: str | None) -> User | None:
        del session, authorization
        if config.auth_disabled():
            return synthetic_admin()
        return None


class ApiKeyProvider:
    """Resolve long-lived API keys (prefix ``ntr_``) to their owning user."""

    name = "api-key"

    def resolve(self, session: Session, authorization: str | None) -> User | None:
        token = _extract_bearer(authorization)
        if token is None or not token.startswith(API_KEY_TOKEN_PREFIX):
            return None
        return _resolve_api_key(session, token)


class LocalSessionProvider:
    """Resolve local login session tokens (issued by ``/api/auth/login``)."""

    name = "local-session"

    def resolve(self, session: Session, authorization: str | None) -> User | None:
        token = _extract_bearer(authorization)
        if token is None:
            return None
        # API-key tokens are handled by ApiKeyProvider; skip them here so the
        # two providers never both try to match the same token shape.
        if token.startswith(API_KEY_TOKEN_PREFIX):
            return None
        return _resolve_session_token(session, token)


# Registration order is the resolution order. Tests may insert/replace items
# to verify the chain semantics — see ``tests/test_auth_providers.py``.
PROVIDERS: list[AuthProvider] = [
    AuthDisabledProvider(),
    ApiKeyProvider(),
    LocalSessionProvider(),
]


def current_user_optional(
    session: SessionDep,
    authorization: Annotated[str | None, Header()] = None,
) -> User | None:
    """Resolve the bearer token to a User, or return None for anonymous callers.

    Walks the :data:`PROVIDERS` chain in order; the first provider to return a
    non-None User wins. When ``NODUS_AUTH_DISABLED`` is set,
    :class:`AuthDisabledProvider` short-circuits and returns the synthetic
    admin regardless of the request headers.

    When ``NODUS_PUBLIC_READER_DISABLED`` is set (and auth is not globally
    disabled), this dependency raises 401 for any caller that would otherwise
    fall through to the public-reader surface — i.e. anonymous requests and
    accounts whose role is ``public_reader``. This is the single chokepoint
    that enforces "login required to see anything" across every router that
    declares ``OptionalUserDep``.
    """
    user: User | None = None
    for provider in PROVIDERS:
        resolved = provider.resolve(session, authorization)
        if resolved is not None:
            user = resolved
            break

    if (
        config.public_reader_disabled()
        and not config.auth_disabled()
        and (user is None or user.role == UserRole.PublicReader.value)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return user


def require_writer(
    user: Annotated[User | None, Depends(current_user_optional)],
) -> User:
    """Allow writers and admins; 401 anonymous, 403 authenticated readers."""
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if user.role not in (UserRole.Writer.value, UserRole.Admin.value):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Writer role required",
        )
    return user


def require_admin(
    user: Annotated[User | None, Depends(current_user_optional)],
) -> User:
    """Allow admins only; 401 anonymous, 403 readers/writers."""
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if user.role != UserRole.Admin.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )
    return user


OptionalUserDep = Annotated[User | None, Depends(current_user_optional)]
WriterDep = Annotated[User, Depends(require_writer)]
AdminDep = Annotated[User, Depends(require_admin)]
