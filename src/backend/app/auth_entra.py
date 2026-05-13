"""Microsoft Entra (Azure AD) OIDC integration.

Implements the authorization-code flow with PKCE against the Microsoft
identity platform v2.0 endpoint. The flow:

1. Frontend calls ``GET /api/auth/entra/start`` which issues a state +
   nonce + PKCE verifier (signed cookie) and returns the authorization URL.
2. User signs in on Microsoft, gets redirected back to
   ``GET /api/auth/entra/callback?code=…&state=…``.
3. Callback exchanges the code for an ID token, validates it against the
   tenant's JWKS, looks up or JIT-provisions the User row by ``oid``,
   recomputes role from group membership, issues a local session token,
   and redirects to the SPA's ``/auth/callback?token=…`` route.

After step 3 the user is identified by the same bearer protocol as a
local login — the Entra layer is only relevant during the OIDC dance.

Tests mock the discovery, JWKS, and token endpoints so no live tenant is
required (see ``tests/test_auth_entra.py``).
"""

from __future__ import annotations

import json
import secrets
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

import httpx
from joserfc import jwt
from joserfc.jwk import KeySet

from app import config
from app.models.user import UserRole

_GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"


class EntraConfigError(RuntimeError):
    """Raised when Entra is requested but the operator config is incomplete."""


class EntraValidationError(RuntimeError):
    """Raised when an ID token fails validation (issuer/audience/nonce/sig)."""


@dataclass(frozen=True)
class EntraSettings:
    """Snapshot of the operator-configured Entra parameters.

    Held as an immutable record so a single OIDC callback sees a coherent
    config view even if env vars change mid-request (they shouldn't, but
    being defensive is cheap).
    """

    tenant_id: str
    client_id: str
    client_secret: str
    redirect_uri: str

    @property
    def issuer(self) -> str:
        """Expected ``iss`` claim for ID tokens from this tenant."""
        return f"https://login.microsoftonline.com/{self.tenant_id}/v2.0"

    @property
    def discovery_url(self) -> str:
        """OIDC discovery document URL for this tenant."""
        return (
            f"https://login.microsoftonline.com/{self.tenant_id}/v2.0/"
            ".well-known/openid-configuration"
        )


def load_settings() -> EntraSettings:
    """Read NODUS_AUTH_ENTRA_* env vars; raise if any required field is empty."""
    tenant = config.entra_tenant_id()
    client = config.entra_client_id()
    secret = config.entra_client_secret()
    redirect = config.entra_redirect_uri()
    missing = [
        name
        for name, value in (
            ("NODUS_AUTH_ENTRA_TENANT_ID", tenant),
            ("NODUS_AUTH_ENTRA_CLIENT_ID", client),
            ("NODUS_AUTH_ENTRA_CLIENT_SECRET", secret),
            ("NODUS_AUTH_ENTRA_REDIRECT_URI", redirect),
        )
        if not value
    ]
    if missing:
        raise EntraConfigError(
            "Entra SSO is enabled but missing required config: " + ", ".join(missing)
        )
    return EntraSettings(
        tenant_id=tenant,
        client_id=client,
        client_secret=secret,
        redirect_uri=redirect,
    )


def role_from_group_ids(group_ids: Iterable[str]) -> UserRole:
    """Pick the highest-privilege role whose configured group ID matches.

    Returns ``UserRole.PublicReader`` when no group matches — never raises.
    Order of precedence: Admin > Writer > Reader > PublicReader.
    """
    ids = {gid for gid in group_ids if gid}
    for role in (UserRole.Admin, UserRole.Writer, UserRole.Reader, UserRole.PublicReader):
        configured = config.entra_group_for_role(role.value)
        if configured and configured in ids:
            return role
    return UserRole.PublicReader


# --- PKCE & state helpers ------------------------------------------------


def generate_pkce_pair() -> tuple[str, str]:
    """Return ``(verifier, challenge)`` for an OIDC PKCE exchange.

    Uses S256 — challenge = base64url(SHA-256(verifier)).
    """
    import base64
    import hashlib

    verifier = secrets.token_urlsafe(64)[:96]  # 43–128 chars per RFC 7636
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def generate_state_nonce() -> tuple[str, str]:
    """Return ``(state, nonce)`` — two independent random tokens."""
    return secrets.token_urlsafe(32), secrets.token_urlsafe(32)


# --- discovery / JWKS / token exchange ----------------------------------


def fetch_oidc_metadata(
    settings: EntraSettings, *, client: httpx.Client | None = None
) -> dict[str, Any]:
    """Fetch the OIDC discovery document for the configured tenant.

    Callers can pass a custom ``httpx.Client`` (tests use this to short-
    circuit the network with a ``MockTransport``).
    """
    owns_client = client is None
    c = client or httpx.Client(timeout=10.0)
    try:
        response = c.get(settings.discovery_url)
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data
    finally:
        if owns_client:
            c.close()


def fetch_jwks(jwks_uri: str, *, client: httpx.Client | None = None) -> KeySet:
    """Fetch the tenant's JWKS and return it as a joserfc ``KeySet``."""
    owns_client = client is None
    c = client or httpx.Client(timeout=10.0)
    try:
        response = c.get(jwks_uri)
        response.raise_for_status()
        return KeySet.import_key_set(response.json())
    finally:
        if owns_client:
            c.close()


def validate_id_token(
    id_token: str,
    *,
    jwks: KeySet,
    settings: EntraSettings,
    expected_nonce: str,
) -> dict[str, Any]:
    """Verify the ID token's signature, issuer, audience, and nonce.

    Returns the decoded claims on success. Raises
    :class:`EntraValidationError` with a short reason on any failure.
    """
    try:
        decoded = jwt.decode(id_token, jwks)
    except Exception as exc:  # noqa: BLE001 — wrap any joserfc error
        raise EntraValidationError(f"ID token signature/decoding failed: {exc}") from exc

    claims = decoded.claims
    if claims.get("iss") != settings.issuer:
        raise EntraValidationError(
            f"Unexpected issuer {claims.get('iss')!r}, want {settings.issuer!r}"
        )
    aud = claims.get("aud")
    if aud != settings.client_id and settings.client_id not in (aud or []):
        raise EntraValidationError(f"ID token audience {aud!r} does not match configured client_id")
    nonce = claims.get("nonce")
    if nonce != expected_nonce:
        raise EntraValidationError("ID token nonce does not match the issued nonce")
    if not claims.get("oid"):
        raise EntraValidationError("ID token missing required 'oid' claim")
    return dict(claims)


def exchange_code_for_id_token(
    *,
    code: str,
    code_verifier: str,
    token_endpoint: str,
    settings: EntraSettings,
    client: httpx.Client | None = None,
) -> str:
    """POST to the OIDC token endpoint and return the raw ID token string."""
    owns_client = client is None
    c = client or httpx.Client(timeout=10.0)
    try:
        response = c.post(
            token_endpoint,
            data={
                "client_id": settings.client_id,
                "client_secret": settings.client_secret,
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.redirect_uri,
                "code_verifier": code_verifier,
            },
            headers={"Accept": "application/json"},
        )
        if response.status_code >= 400:
            raise EntraValidationError(
                f"Token exchange failed ({response.status_code}): {response.text}"
            )
        body = response.json()
        id_token = body.get("id_token")
        if not isinstance(id_token, str) or not id_token:
            raise EntraValidationError("Token response missing id_token")
        return id_token
    finally:
        if owns_client:
            c.close()


# --- group membership ---------------------------------------------------


def extract_group_ids_from_claims(claims: dict[str, Any]) -> list[str] | None:
    """Read the ``groups`` claim from an ID token, if present.

    Entra emits ``groups`` only when the app registration's group claims
    are configured. For users with >150 groups, the claim is suppressed
    in favor of a ``_claim_names`` overage indicator; callers should fall
    back to :func:`fetch_group_ids_from_graph` in that case.

    Returns ``None`` if the claim is absent or in overage mode, signalling
    "ask Graph instead". Returns an empty list if the claim is explicitly
    empty.
    """
    overage = claims.get("_claim_names")
    if isinstance(overage, dict) and "groups" in overage:
        return None
    raw = claims.get("groups")
    if raw is None:
        return None
    if isinstance(raw, list):
        return [str(gid) for gid in raw]
    return []


def fetch_group_ids_from_graph(
    access_token: str, *, client: httpx.Client | None = None
) -> list[str]:
    """Call Microsoft Graph ``/me/transitiveMemberOf`` to enumerate group IDs.

    Used as the fallback when the ``groups`` claim is in overage mode.
    Returns object IDs only — display names are ignored because role
    mapping is configured by object ID for stability.
    """
    owns_client = client is None
    c = client or httpx.Client(timeout=10.0)
    try:
        ids: list[str] = []
        url: str | None = f"{_GRAPH_BASE_URL}/me/transitiveMemberOf?$select=id"
        while url:
            response = c.get(url, headers={"Authorization": f"Bearer {access_token}"})
            response.raise_for_status()
            body = response.json()
            for entry in body.get("value", []):
                gid = entry.get("id")
                if isinstance(gid, str):
                    ids.append(gid)
            url = body.get("@odata.nextLink")
        return ids
    finally:
        if owns_client:
            c.close()


# --- short-lived state envelope -----------------------------------------


def pack_oidc_state(state: str, nonce: str, code_verifier: str) -> str:
    """Bundle the short-lived OIDC parameters into a single opaque string.

    The result is stored in a signed, HttpOnly cookie for the duration of
    the OIDC round-trip (≤5 min). Tests can decode it independently via
    :func:`unpack_oidc_state`.
    """
    return json.dumps(
        {"state": state, "nonce": nonce, "code_verifier": code_verifier},
        separators=(",", ":"),
    )


def unpack_oidc_state(packed: str) -> dict[str, str]:
    """Inverse of :func:`pack_oidc_state`. Raises ``ValueError`` on bad input."""
    raw = json.loads(packed)
    if not isinstance(raw, dict):
        raise ValueError("packed OIDC state is not an object")
    out: dict[str, str] = {}
    for key in ("state", "nonce", "code_verifier"):
        value = raw.get(key)
        if not isinstance(value, str) or not value:
            raise ValueError(f"packed OIDC state missing {key}")
        out[key] = value
    return out
