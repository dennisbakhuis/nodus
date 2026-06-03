"""Auth endpoints — login (with optional TOTP MFA), logout, /me, and MFA management."""

from datetime import UTC
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Response, status
from sqlmodel import Session, select

from app import config
from app.auth import (
    MFA_CHALLENGE_TTL,
    SESSION_TTL,
    OptionalUserDep,
    auth_disabled,
    generate_token,
    generate_totp_secret,
    hash_password,
    hash_token,
    totp_provisioning_uri,
    totp_qr_data_url,
    verify_password,
    verify_totp,
)
from app.db import SessionDep
from app.models.auth_session import AuthSession
from app.models.mfa_challenge import MfaChallenge
from app.models.person import Person
from app.models.user import User, UserRole
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    MfaCodeRequest,
    MfaDisableRequest,
    MfaLoginRequest,
    MfaSetupResponse,
)
from app.schemas.person import PersonReadManagement
from app.schemas.user import SelfProfileLink, SelfProfileUpdate, UserMe
from app.services.persons import (
    count_topic_links_for_person,
    ensure_person_for_user,
    find_unlinked_person_candidates,
    get_person_for_user,
    update_person,
    user_profile_incomplete,
)
from app.time_utils import now_utc

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_me(session: Session, user: User) -> UserMe:
    """Build a UserMe, flagging an incomplete linked profile (skipped when auth is off)."""
    me = UserMe.model_validate(user)
    if not auth_disabled():
        me.profile_incomplete = user_profile_incomplete(session, user.id)
    return me


@router.get("/config")
def auth_config() -> dict[str, object]:
    """Public configuration describing the active auth mode and providers.

    The frontend uses this to decide:
    - whether to show any login UI at all (``auth_enabled``);
    - which providers to offer (``providers`` — currently ``"local"``
      and/or ``"entra"``).

    When ``NODUS_AUTH_DISABLED=1`` is set, ``auth_enabled`` is ``false`` and
    ``providers`` is empty — every request is treated as the synthetic
    admin and there is no login flow.

    ``public_reader_disabled`` mirrors ``NODUS_PUBLIC_READER_DISABLED``. When
    True, the SPA should not offer an "browse anonymously" affordance — every
    backend endpoint will 401 for anonymous and public-reader callers.
    """
    if auth_disabled():
        return {"auth_enabled": False, "providers": [], "public_reader_disabled": False}
    providers: list[str] = ["local"]
    if config.auth_entra_enabled():
        providers.append("entra")
    return {
        "auth_enabled": True,
        "providers": providers,
        "public_reader_disabled": config.public_reader_disabled(),
    }


def _issue_session(session: SessionDep, user: User) -> str:
    token = generate_token()
    session.add(
        AuthSession(
            token_hash=hash_token(token),
            user_id=user.id,
            expires_at=now_utc() + SESSION_TTL,
        )
    )
    session.commit()
    return token


# Dummy bcrypt hash — verify_password against this takes the same wall-time
# as a real comparison, so missing-username and wrong-password cases respond
# in indistinguishable time.
_DUMMY_PASSWORD_HASH = "$2b$12$abcdefghijklmnopqrstuuVgL5vQqQYyqQqQyqQyqQyqQyqQyqQyq"


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, session: SessionDep) -> LoginResponse:
    """Step 1 of login. Returns a session token directly when MFA is off,
    otherwise issues a short-lived `mfa_token` to be exchanged via /login/mfa.
    """
    user = session.exec(select(User).where(User.username == payload.username)).first()

    # Always run verify_password — even if the user is missing — so the
    # response time doesn't leak whether a username exists. Fall through to
    # the same generic 401 either way.
    if user is None:
        verify_password(payload.password, _DUMMY_PASSWORD_HASH)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    if not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    if config.public_reader_disabled() and user.role == UserRole.PublicReader.value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Public-reader access is disabled on this deployment",
        )

    if not user.mfa_enabled:
        token = _issue_session(session, user)
        return LoginResponse(token=token, user=_user_me(session, user))

    challenge_token = generate_token()
    session.add(
        MfaChallenge(
            challenge_hash=hash_token(challenge_token),
            user_id=user.id,
            expires_at=now_utc() + MFA_CHALLENGE_TTL,
        )
    )
    session.commit()
    return LoginResponse(requires_mfa=True, mfa_token=challenge_token)


@router.post("/login/mfa", response_model=LoginResponse)
def login_mfa(payload: MfaLoginRequest, session: SessionDep) -> LoginResponse:
    """Step 2 of MFA login. Verify the TOTP code and exchange the challenge
    token for a real session token."""
    challenge = session.exec(
        select(MfaChallenge).where(MfaChallenge.challenge_hash == hash_token(payload.mfa_token))
    ).first()
    if challenge is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired MFA challenge",
        )
    expires_at = challenge.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at <= now_utc():
        session.delete(challenge)
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="MFA challenge expired",
        )

    user = session.get(User, challenge.user_id)
    if user is None or not user.is_active or not user.mfa_enabled or not user.totp_secret:
        session.delete(challenge)
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="MFA no longer available for this user",
        )

    if config.public_reader_disabled() and user.role == UserRole.PublicReader.value:
        session.delete(challenge)
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Public-reader access is disabled on this deployment",
        )

    if not verify_totp(user.totp_secret, payload.code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authenticator code",
        )

    session.delete(challenge)
    token = _issue_session(session, user)
    return LoginResponse(token=token, user=_user_me(session, user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    session: SessionDep,
    authorization: Annotated[str | None, Header()] = None,
) -> Response:
    """Revoke the bearer token. Idempotent: returns 204 even if the token is unknown."""
    if authorization:
        parts = authorization.split(None, 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token_hash = hash_token(parts[1].strip())
            row = session.exec(
                select(AuthSession).where(AuthSession.token_hash == token_hash)
            ).first()
            if row is not None:
                session.delete(row)
                session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserMe)
def me(user: OptionalUserDep, session: SessionDep) -> UserMe:
    """Return the authenticated user's profile, or 401 if anonymous."""
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return _user_me(session, user)


@router.get("/me/profile", response_model=PersonReadManagement)
def get_my_profile(user: OptionalUserDep, session: SessionDep) -> PersonReadManagement:
    """Return the caller's own People profile, adopting/creating a linked one if missing."""
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if auth_disabled():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile when authentication is disabled",
        )
    person = ensure_person_for_user(session, user, adopt_match=True)
    return PersonReadManagement.model_validate(person)


@router.get("/me/profile/candidates", response_model=list[PersonReadManagement])
def get_my_profile_candidates(
    user: OptionalUserDep, session: SessionDep
) -> list[PersonReadManagement]:
    """Account-less People matching the caller's name, so they can claim the right one."""
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if auth_disabled():
        return []
    full_name = f"{user.first_name} {user.last_name}".strip()
    return [
        PersonReadManagement.model_validate(p)
        for p in find_unlinked_person_candidates(session, full_name)
    ]


@router.post("/me/profile/link", response_model=UserMe)
def link_my_profile(
    payload: SelfProfileLink, user: OptionalUserDep, session: SessionDep
) -> UserMe:
    """Link the caller's account to an existing account-less People record.

    Discards the caller's current linked Person when it's an empty auto-created stub
    (blank company, no topic links); otherwise just unlinks it to avoid data loss.
    """
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if auth_disabled():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile when authentication is disabled",
        )
    chosen = session.get(Person, payload.person_id)
    if chosen is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")
    if chosen.user_id is not None and chosen.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That person is already linked to another account",
        )

    current = get_person_for_user(session, user.id)
    if current is not None and current.id != chosen.id:
        is_stub = (
            not (current.company or "").strip()
            and count_topic_links_for_person(session, current.id) == 0
        )
        if is_stub:
            session.delete(current)
        else:
            current.user_id = None
            session.add(current)
        session.flush()

    chosen.user_id = user.id
    session.add(chosen)
    session.commit()
    session.refresh(user)
    return _user_me(session, user)


@router.patch("/me/profile", response_model=UserMe)
def update_my_profile(
    payload: SelfProfileUpdate, user: OptionalUserDep, session: SessionDep
) -> UserMe:
    """Update the caller's own People profile (used by the first-login completion popup)."""
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if auth_disabled():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile when authentication is disabled",
        )
    person = ensure_person_for_user(session, user, adopt_match=True)
    update_person(
        session=session,
        person_id=person.id,
        full_name=payload.full_name,
        company=payload.company,
        email=payload.email,
        department=payload.department,
        role=payload.role,
    )
    session.refresh(user)
    return _user_me(session, user)


@router.post("/mfa/setup", response_model=MfaSetupResponse)
def mfa_setup(user: OptionalUserDep, session: SessionDep) -> MfaSetupResponse:
    """Generate a fresh TOTP secret for the authenticated user.

    The new secret is stored on the user row but `mfa_enabled` remains False
    until /auth/mfa/enable is called with a valid code. Calling this again
    overwrites any pending (un-confirmed) secret.
    """
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if user.mfa_enabled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="MFA is already enabled. Disable it first to re-enroll.",
        )

    secret = generate_totp_secret()
    user.totp_secret = secret
    user.updated_at = now_utc()
    session.add(user)
    session.commit()

    uri = totp_provisioning_uri(secret, account_name=user.username)
    return MfaSetupResponse(
        secret=secret,
        provisioning_uri=uri,
        qr_data_url=totp_qr_data_url(uri),
    )


@router.post("/mfa/enable", response_model=UserMe)
def mfa_enable(payload: MfaCodeRequest, user: OptionalUserDep, session: SessionDep) -> UserMe:
    """Confirm the pending TOTP secret and enable MFA for this user."""
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if user.mfa_enabled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="MFA is already enabled")
    if not user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No pending MFA secret — call /auth/mfa/setup first.",
        )
    if not verify_totp(user.totp_secret, payload.code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authenticator code",
        )

    user.mfa_enabled = True
    user.updated_at = now_utc()
    session.add(user)
    session.commit()
    session.refresh(user)
    return _user_me(session, user)


@router.post("/change-password", response_model=UserMe)
def change_password(
    payload: ChangePasswordRequest, user: OptionalUserDep, session: SessionDep
) -> UserMe:
    """Self-service password change. Clears must_change_password on success."""
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect"
        )
    if len(payload.new_password) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 4 characters",
        )
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    user.updated_at = now_utc()
    session.add(user)
    session.commit()
    session.refresh(user)
    return _user_me(session, user)


@router.post("/mfa/disable", response_model=UserMe)
def mfa_disable(payload: MfaDisableRequest, user: OptionalUserDep, session: SessionDep) -> UserMe:
    """Disable MFA after the user re-enters their password."""
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password")

    user.mfa_enabled = False
    user.totp_secret = None
    user.updated_at = now_utc()
    session.add(user)
    session.commit()
    session.refresh(user)
    return _user_me(session, user)
