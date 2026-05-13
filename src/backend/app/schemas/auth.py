from pydantic import BaseModel

from app.schemas.user import UserMe


class LoginRequest(BaseModel):
    """Credentials submitted to POST /auth/login."""

    username: str
    password: str


class LoginResponse(BaseModel):
    """Result of step 1 of login.

    If `requires_mfa` is True the caller must POST to `/auth/login/mfa` with
    `mfa_token` and a TOTP code; `token` and `user` are absent. Otherwise the
    session is fully established and `token`/`user` are populated.
    """

    requires_mfa: bool = False
    mfa_token: str | None = None
    token: str | None = None
    user: UserMe | None = None


class MfaLoginRequest(BaseModel):
    """Step 2 of MFA login: submit the TOTP code with the challenge token."""

    mfa_token: str
    code: str


class MfaSetupResponse(BaseModel):
    """Returned when an authenticated user starts MFA enrollment.

    The secret is held on the User row but `mfa_enabled` stays False until the
    user POSTs `/auth/mfa/enable` with a valid code.
    """

    secret: str
    provisioning_uri: str
    qr_data_url: str


class MfaCodeRequest(BaseModel):
    """Body of `/auth/mfa/enable`."""

    code: str


class MfaDisableRequest(BaseModel):
    """Body of `/auth/mfa/disable` — requires the current password."""

    password: str


class ChangePasswordRequest(BaseModel):
    """Self-service password change. Verifies the caller's current password."""

    current_password: str
    new_password: str
