"""Entra (Azure AD) OIDC endpoints.

Two routes:

- ``GET /api/auth/entra/start`` — issues PKCE/state/nonce, stores them in a
  short-lived signed cookie, and redirects the browser to Microsoft.
- ``GET /api/auth/entra/callback`` — receives the code + state, validates
  the ID token, JIT-provisions the User if needed, recomputes role from
  Entra group membership, issues a local session, and redirects the SPA
  to ``/auth/callback?token=…``.

The local session token is the same shape as one minted by
``/api/auth/login`` — once issued, the bearer protocol is uniform.

Active only when ``NODUS_AUTH_ENTRA_ENABLED=1``. When disabled, the start
endpoint returns 404 so callers cannot probe Entra-specific 500s.
"""

from __future__ import annotations

import logging
from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, Cookie, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlmodel import select

from app import auth_entra, config
from app.auth import SESSION_TTL, generate_token, hash_token
from app.auth_entra import (
    EntraConfigError,
    EntraValidationError,
    extract_group_ids_from_claims,
    fetch_jwks,
    fetch_oidc_metadata,
    role_from_group_ids,
)
from app.db import SessionDep
from app.models.auth_session import AuthSession
from app.models.user import User, UserRole
from app.time_utils import now_utc

router = APIRouter(prefix="/auth/entra", tags=["auth"])

_log = logging.getLogger("app.auth_entra")

_OIDC_COOKIE_NAME = "nodus_oidc_state"
_OIDC_COOKIE_TTL_SECONDS = 5 * 60
_FRONTEND_CALLBACK_PATH = "/auth/callback"


def _entra_enabled_or_404() -> None:
    """404 when Entra is disabled. Prevents probing internal config errors."""
    if not config.auth_entra_enabled():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def _frontend_origin_from_redirect(redirect_uri: str) -> str:
    """Derive the SPA's origin (scheme + host) from the configured redirect URI.

    The frontend ``/auth/callback`` page lives on the same origin as the
    backend in our deployments, so reusing the redirect URI's origin keeps
    the operator's config surface to one URL.
    """
    from urllib.parse import urlsplit

    parts = urlsplit(redirect_uri)
    return f"{parts.scheme}://{parts.netloc}"


@router.get("/start")
def entra_start(response: Response) -> dict[str, str]:
    """Issue PKCE/state/nonce and return Microsoft's authorization URL.

    The frontend reads ``authorize_url`` and assigns it to
    ``window.location.href``. The signed state cookie is set on the
    response with a 5-minute lifetime; only the callback endpoint reads it.
    """
    _entra_enabled_or_404()
    try:
        settings = auth_entra.load_settings()
    except EntraConfigError as exc:
        _log.error("Entra start failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Entra SSO is not fully configured on this deployment.",
        ) from exc

    code_verifier, code_challenge = auth_entra.generate_pkce_pair()
    state, nonce = auth_entra.generate_state_nonce()
    packed = auth_entra.pack_oidc_state(state, nonce, code_verifier)

    metadata = fetch_oidc_metadata(settings)
    authorize_endpoint = metadata.get("authorization_endpoint")
    if not isinstance(authorize_endpoint, str):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Entra discovery document missing authorization_endpoint",
        )

    params = {
        "client_id": settings.client_id,
        "response_type": "code",
        "redirect_uri": settings.redirect_uri,
        "scope": "openid profile email User.Read",
        "response_mode": "query",
        "state": state,
        "nonce": nonce,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    authorize_url = f"{authorize_endpoint}?{urlencode(params)}"

    response.set_cookie(
        key=_OIDC_COOKIE_NAME,
        value=packed,
        max_age=_OIDC_COOKIE_TTL_SECONDS,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/api/auth/entra",
    )
    return {"authorize_url": authorize_url}


@router.get("/callback")
def entra_callback(
    request: Request,
    session: SessionDep,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    oidc_cookie: Annotated[str | None, Cookie(alias=_OIDC_COOKIE_NAME)] = None,
) -> RedirectResponse:
    """Exchange the code, validate the ID token, JIT-provision, redirect to SPA."""
    _entra_enabled_or_404()

    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Entra reported error: {error} ({error_description or ''})",
        )
    if not code or not state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Callback missing code/state",
        )
    if not oidc_cookie:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OIDC state cookie missing or expired",
        )

    try:
        unpacked = auth_entra.unpack_oidc_state(oidc_cookie)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OIDC state cookie is malformed",
        ) from exc

    if state != unpacked["state"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OIDC state mismatch",
        )

    try:
        settings = auth_entra.load_settings()
    except EntraConfigError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Entra SSO is not fully configured",
        ) from exc

    metadata = fetch_oidc_metadata(settings)
    token_endpoint = metadata.get("token_endpoint")
    jwks_uri = metadata.get("jwks_uri")
    if not isinstance(token_endpoint, str) or not isinstance(jwks_uri, str):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Entra discovery document missing token_endpoint or jwks_uri",
        )

    try:
        id_token = auth_entra.exchange_code_for_id_token(
            code=code,
            code_verifier=unpacked["code_verifier"],
            token_endpoint=token_endpoint,
            settings=settings,
        )
        jwks = fetch_jwks(jwks_uri)
        claims = auth_entra.validate_id_token(
            id_token,
            jwks=jwks,
            settings=settings,
            expected_nonce=unpacked["nonce"],
        )
    except EntraValidationError as exc:
        _log.warning("Entra callback rejected: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Entra ID token validation failed: {exc}",
        ) from exc

    user = _resolve_or_provision_user(session, claims)

    token = generate_token()
    session.add(
        AuthSession(
            token_hash=hash_token(token),
            user_id=user.id,
            expires_at=now_utc() + SESSION_TTL,
        )
    )
    session.commit()

    target = (
        f"{_frontend_origin_from_redirect(settings.redirect_uri)}"
        f"{_FRONTEND_CALLBACK_PATH}?token={token}"
    )
    redirect = RedirectResponse(url=target, status_code=status.HTTP_302_FOUND)
    redirect.delete_cookie(_OIDC_COOKIE_NAME, path="/api/auth/entra")
    return redirect


def _resolve_or_provision_user(
    session: SessionDep,
    claims: dict[str, object],
) -> User:
    """Find or create the User row for an Entra identity, syncing role from groups."""
    oid = str(claims.get("oid") or "")
    if not oid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Entra ID token missing oid",
        )

    group_ids = extract_group_ids_from_claims(claims)
    if group_ids is None:
        # Overage mode: the ID token suppressed the groups claim because the
        # user is in too many groups. We need an access token with Graph
        # permissions to fetch them; for now we treat overage users as the
        # default role and rely on the operator to either configure smaller
        # security groups or grant Graph access. Documented in docs/auth.md.
        group_ids = []

    role = role_from_group_ids(group_ids)

    if config.public_reader_disabled() and role == UserRole.PublicReader:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "This account has no Reader/Writer/Admin group membership and "
                "public-reader access is disabled on this deployment."
            ),
        )

    existing = session.exec(select(User).where(User.entra_oid == oid)).first()
    if existing is not None:
        # Re-sync role on every login so demotions/promotions in Entra
        # propagate within one login round-trip. Local-only fields
        # (mfa_enabled, totp_secret, etc.) are left untouched.
        if existing.role != role.value:
            _log.info(
                "Entra role sync for %s: %s → %s",
                existing.username,
                existing.role,
                role.value,
            )
            existing.role = role.value
            session.add(existing)
            session.commit()
            session.refresh(existing)
        if not existing.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This user account is deactivated.",
            )
        return existing

    # JIT provisioning — first SSO login for this Entra oid.
    username = _username_from_claims(claims, oid)
    first_name, last_name = _names_from_claims(claims)
    user = User(
        username=username,
        first_name=first_name,
        last_name=last_name,
        password_hash="",  # SSO-only — local login impossible.
        role=role.value,
        entra_oid=oid,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    _log.info(
        "Entra JIT provisioning: created user %s (oid=%s, role=%s)",
        user.username,
        oid,
        role.value,
    )
    return user


def _username_from_claims(claims: dict[str, object], oid: str) -> str:
    """Pick a stable, human-readable username from the ID token claims."""
    for key in ("preferred_username", "upn", "email"):
        value = claims.get(key)
        if isinstance(value, str) and value:
            return value
    return f"entra-{oid[:8]}"


def _names_from_claims(claims: dict[str, object]) -> tuple[str, str]:
    """Pull first/last name from the ID token; fall back to derivation from ``name``."""
    given = claims.get("given_name")
    family = claims.get("family_name")
    if isinstance(given, str) and given and isinstance(family, str) and family:
        return given, family
    full = claims.get("name")
    if isinstance(full, str) and full:
        parts = full.split(" ", 1)
        if len(parts) == 2:
            return parts[0], parts[1]
        return parts[0], ""
    return "Entra", "User"
