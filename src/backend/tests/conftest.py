from collections.abc import Callable, Generator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.auth import generate_token, hash_password, hash_token
from app.main import application
from app.models.auth_session import AuthSession
from app.models.segment import Segment
from app.models.user import User, UserRole

_TEST_SEGMENTS = (
    {"name": "Engineering", "slug": "engineering", "display_order": 1, "theme_key": "dark-blue"},
    {"name": "Data & AI", "slug": "data-ai", "display_order": 2, "theme_key": "violet"},
    {"name": "Platforms", "slug": "platforms", "display_order": 3, "theme_key": "bright-blue"},
)


def _seed_test_segments(session: Session) -> None:
    """Insert generic test segments. App lifespan no longer seeds these."""
    for seg in _TEST_SEGMENTS:
        session.add(Segment(**seg))
    session.commit()


@pytest.fixture(name="session")
def session_fixture() -> Generator[Session]:
    """Provide an in-memory SQLite session with all tables created."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    import app.models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        _seed_test_segments(session)
        yield session


@pytest.fixture(name="make_user")
def make_user_fixture(session: Session) -> Callable[..., tuple[User, str]]:
    """Return a factory that creates a User + an active session token.

    Usage: `user, token = make_user(role=UserRole.Writer)`.
    """
    counter = {"n": 0}

    def factory(
        role: UserRole = UserRole.Reader,
        username: str | None = None,
        first_name: str = "Test",
        last_name: str = "User",
        password: str = "secret123",
    ) -> tuple[User, str]:
        counter["n"] += 1
        if username is None:
            username = f"u{counter['n']}_{role.value}"
        user = User(
            username=username,
            first_name=first_name,
            last_name=last_name,
            role=role.value,
            password_hash=hash_password(password),
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        token = generate_token()
        session.add(
            AuthSession(
                token_hash=hash_token(token),
                user_id=user.id,
                expires_at=datetime.now(UTC) + timedelta(days=1),
            )
        )
        session.commit()
        return user, token

    return factory


@pytest.fixture(name="auth_header")
def auth_header_fixture() -> Callable[[str], dict[str, str]]:
    """Return a helper that turns a raw token into an Authorization header dict."""
    return lambda token: {"Authorization": f"Bearer {token}"}


@pytest.fixture(name="anon_client")
def anon_client_fixture(session: Session) -> Generator[TestClient]:
    """TestClient with no preset Authorization — for anonymous-flow tests."""
    from app.db import get_session

    def override_get_session() -> Session:
        return session

    application.dependency_overrides[get_session] = override_get_session
    client = TestClient(application)
    yield client
    application.dependency_overrides.clear()


@pytest.fixture(name="client")
def client_fixture(
    session: Session,
    make_user: Callable[..., tuple[User, str]],
) -> Generator[TestClient]:
    """Default TestClient — pre-authenticated as an admin so legacy tests keep working.

    Tests that need to assert anonymous-or-reader behavior should use
    `anon_client` (or set their own Authorization header).
    """
    from app.db import get_session

    def override_get_session() -> Session:
        return session

    _, token = make_user(role=UserRole.Admin, username="default_admin")

    application.dependency_overrides[get_session] = override_get_session
    client = TestClient(application, headers={"Authorization": f"Bearer {token}"})
    yield client
    application.dependency_overrides.clear()
