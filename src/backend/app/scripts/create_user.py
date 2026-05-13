"""Create or update a Nodus auth user.

Usage
-----
    uv run python -m app.scripts.create_user --username alice \\
        --first-name Alice --last-name Smith --role admin
    uv run python -m app.scripts.create_user --username bob \\
        --first-name Bob --last-name Lee --role writer --force

The script prompts for the password (no echo) and refuses to overwrite an
existing username unless `--force` is passed. Run this against the live SQLite
database file the API uses (default: `./radar.db`).
"""

import argparse
import getpass
import logging
import sys
from datetime import UTC, datetime

from sqlalchemy import Engine
from sqlmodel import Session, create_engine, select

import app.models  # noqa: F401 — register all SQLModel tables
from app.auth import hash_password
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)


def _prompt_password() -> str:
    """Read a password twice from stdin and confirm they match."""
    password = getpass.getpass("Password: ")
    if not password:
        logger.error("Password must not be empty.")
        sys.exit(2)
    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        logger.error("Passwords do not match.")
        sys.exit(2)
    return password


def create_or_update_user(
    engine: Engine,
    username: str,
    first_name: str,
    last_name: str,
    role: UserRole,
    password: str,
    force: bool,
) -> User:
    """Insert a new user, or replace an existing one when `force` is True."""
    with Session(engine) as session:
        existing = session.exec(select(User).where(User.username == username)).first()
        if existing is not None and not force:
            logger.error("User '%s' already exists. Pass --force to overwrite.", username)
            sys.exit(2)

        now = datetime.now(UTC)
        if existing is not None:
            existing.first_name = first_name
            existing.last_name = last_name
            existing.role = role.value
            existing.password_hash = hash_password(password)
            existing.is_active = True
            existing.updated_at = now
            session.add(existing)
            user = existing
        else:
            user = User(
                username=username,
                first_name=first_name,
                last_name=last_name,
                role=role.value,
                password_hash=hash_password(password),
                created_at=now,
                updated_at=now,
            )
            session.add(user)

        session.commit()
        session.refresh(user)
        return user


def main() -> None:
    """CLI entrypoint."""
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--username", required=True)
    parser.add_argument("--first-name", required=True, dest="first_name")
    parser.add_argument("--last-name", required=True, dest="last_name")
    parser.add_argument(
        "--role",
        required=True,
        choices=[r.value for r in UserRole],
    )
    parser.add_argument(
        "--db-url",
        default="sqlite:///./radar.db",
        dest="db_url",
        help="SQLAlchemy database URL (default: sqlite:///./radar.db)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite an existing user with the same username.",
    )
    args = parser.parse_args()

    password = _prompt_password()
    engine = create_engine(args.db_url, connect_args={"check_same_thread": False})
    user = create_or_update_user(
        engine=engine,
        username=args.username,
        first_name=args.first_name,
        last_name=args.last_name,
        role=UserRole(args.role),
        password=password,
        force=args.force,
    )
    logger.info("OK: user '%s' (%s) saved.", user.username, user.role)


if __name__ == "__main__":
    main()
