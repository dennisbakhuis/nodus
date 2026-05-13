"""Operator CLI for one-shot tasks that used to run inside the FastAPI lifespan.

The lifespan should not be doing seed imports, backfills, or destructive DB
rebuilds — those are operator actions, not boot-time concerns. This module
exposes them as explicit subcommands so they only run when invoked.

Usage
-----
``uv run python -m app.cli <command> [args]``

Commands
--------
``db init``
    Create all SQLModel tables if missing. Idempotent. Safe to run on a live
    database.
``db reset --confirm``
    Delete the SQLite database file and recreate empty tables. Refuses to run
    without ``--confirm``. Use only on local development databases.
``seed [--settings] [--users] [--movements] [--all]``
    Run one or more seed steps. ``--users`` is refused outside ``NODUS_ENV in
    {dev, test}`` to keep the demo-password accounts out of production.
``backfill [--hero-images] [--all]``
    Run one or more backfill steps. Idempotent.
``create-admin --username <name> [--first-name <fn>] [--last-name <ln>] [--force]``
    Create a local admin user, prompting for the password via ``getpass``.
    Refuses to clobber an existing user unless ``--force`` is passed. Use this
    as the first-deploy bootstrap step (e.g. via ``az containerapp exec``).
``restore --backup-path <path> [--mode fresh|addon] [--password <pw>] [--resolutions <json>]``
    Restore a Nodus backup (zip or encrypted envelope) from disk. Reuses the
    same code path as ``POST /api/admin/backup/restore`` — runs against the
    DB the CLI is configured for. ``--mode fresh`` truncates every table
    first; ``--mode addon`` (default) merges per the conflict resolutions.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from collections.abc import Iterable

from sqlmodel import Session

from app import config

logger = logging.getLogger("app.cli")


def _setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def _env_dev_or_test() -> bool:
    return config.env_allows_demo_seeding()


def _cmd_db_init(_args: argparse.Namespace) -> int:
    from app.db import create_db_and_tables

    create_db_and_tables()
    logger.info("Database schema present (created if missing).")
    return 0


def _cmd_db_reset(args: argparse.Namespace) -> int:
    if not args.confirm:
        logger.error(
            "Refusing to delete the database without --confirm. "
            "This permanently destroys all data at %s.",
            _db_path(),
        )
        return 2
    from sqlmodel import SQLModel

    from app.db import DB_FILE, create_db_and_tables, engine

    SQLModel.metadata.drop_all(engine)
    engine.dispose()
    if DB_FILE and os.path.exists(DB_FILE):
        os.remove(DB_FILE)
        logger.warning("Deleted database file: %s", DB_FILE)
    create_db_and_tables()
    logger.info("Recreated empty schema.")
    return 0


def _cmd_seed(args: argparse.Namespace) -> int:
    from app.db import engine
    from app.main import seed_demo_users, seed_settings
    from app.seed.importer import seed_demo_movements

    targets = _resolve_seed_targets(args)
    if not targets:
        logger.error(
            "No seed targets selected. Pass at least one of "
            "--settings, --users, --movements, --all."
        )
        return 2

    if "users" in targets and not _env_dev_or_test():
        logger.error(
            "Refusing to seed demo users — NODUS_ENV must be 'dev' or 'test' "
            "(currently %r). Demo accounts are seeded with a known password and "
            "must not be created in production.",
            config.env_label(),
        )
        return 2

    with Session(engine) as session:
        if "settings" in targets:
            seed_settings(session)
            logger.info("Seeded default settings.")
        if "users" in targets:
            seed_demo_users(session)
            logger.warning("Seeded demo users with the well-known demo password.")
        if "movements" in targets:
            seed_demo_movements(session)
            logger.info("Seeded demo movements.")
    return 0


def _cmd_create_admin(args: argparse.Namespace) -> int:
    import getpass

    from app.db import engine
    from app.models.user import UserRole
    from app.scripts.create_user import create_or_update_user

    password = getpass.getpass("Password: ")
    if not password:
        logger.error("Password must not be empty.")
        return 2
    if password != getpass.getpass("Confirm password: "):
        logger.error("Passwords do not match.")
        return 2

    try:
        user = create_or_update_user(
            engine=engine,
            username=args.username,
            first_name=args.first_name,
            last_name=args.last_name,
            role=UserRole.Admin,
            password=password,
            force=args.force,
        )
    except SystemExit as exc:
        return int(exc.code or 2)

    logger.info("Created admin user %r at %s.", user.username, _db_path())
    return 0


def _cmd_restore(args: argparse.Namespace) -> int:
    import json

    from app.db import engine
    from app.services.backup_service import (
        BackupAuthError,
        BackupFormatError,
        restore_backup,
    )

    backup_path = args.backup_path
    if not os.path.isfile(backup_path):
        logger.error("Backup file does not exist: %s", backup_path)
        return 2

    resolutions: dict[str, str] = {}
    if args.resolutions:
        try:
            parsed = json.loads(args.resolutions)
        except json.JSONDecodeError as exc:
            logger.error("Invalid --resolutions JSON: %s", exc)
            return 2
        if not isinstance(parsed, dict):
            logger.error("--resolutions must be a JSON object")
            return 2
        resolutions = {str(k): str(v) for k, v in parsed.items()}

    with open(backup_path, "rb") as fh:
        payload = fh.read()

    with Session(engine) as session:
        try:
            counts = restore_backup(
                session,
                payload,
                password=args.password or None,
                mode=args.mode,
                resolutions=resolutions,
            )
        except BackupAuthError as exc:
            logger.error("Backup decryption failed: %s", exc)
            return 2
        except BackupFormatError as exc:
            logger.error("Backup format error: %s", exc)
            return 2

    logger.info(
        "Restore complete (mode=%s): %d inserted, %d skipped, %d overwritten at %s",
        args.mode,
        counts.get("inserted", 0),
        counts.get("skipped", 0),
        counts.get("overwritten", 0),
        _db_path(),
    )
    return 0


def _cmd_backfill(args: argparse.Namespace) -> int:
    from app.db import engine
    from app.seed.importer import relink_hero_images

    targets = _resolve_backfill_targets(args)
    if not targets:
        logger.error("No backfill targets selected. Pass --hero-images or --all.")
        return 2

    with Session(engine) as session:
        if "hero-images" in targets:
            relink_hero_images(session)
            logger.info("Relinked hero images.")
    return 0


def _resolve_seed_targets(args: argparse.Namespace) -> set[str]:
    if args.all:
        return {"settings", "users", "movements"}
    return {
        name
        for name, on in (
            ("settings", args.settings),
            ("users", args.users),
            ("movements", args.movements),
        )
        if on
    }


def _resolve_backfill_targets(args: argparse.Namespace) -> set[str]:
    if args.all:
        return {"hero-images"}
    return {name for name, on in (("hero-images", args.hero_images),) if on}


def _db_path() -> str:
    """Human-readable description of where the database lives.

    Returns the absolute SQLite file path when running on SQLite, or the
    raw ``DATABASE_URL`` otherwise (Postgres etc.). Used only for log
    messages; do not parse this value.
    """
    from app.db import DATABASE_URL, DB_FILE

    if DB_FILE:
        return os.path.abspath(DB_FILE)
    return DATABASE_URL


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="app.cli", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    db = sub.add_parser("db", help="Database lifecycle commands")
    db_sub = db.add_subparsers(dest="db_command", required=True)
    db_init = db_sub.add_parser("init", help="Create tables if missing (idempotent)")
    db_init.set_defaults(func=_cmd_db_init)
    db_reset = db_sub.add_parser("reset", help="Drop the database and recreate empty schema")
    db_reset.add_argument(
        "--confirm", action="store_true", help="Required: confirms destructive intent"
    )
    db_reset.set_defaults(func=_cmd_db_reset)

    seed = sub.add_parser("seed", help="Seed reference data")
    seed.add_argument("--settings", action="store_true", help="Seed default settings rows")
    seed.add_argument(
        "--users", action="store_true", help="Seed demo users (NODUS_ENV=dev/test only)"
    )
    seed.add_argument("--movements", action="store_true", help="Seed demo movements")
    seed.add_argument("--all", action="store_true", help="Run every seed step")
    seed.set_defaults(func=_cmd_seed)

    backfill = sub.add_parser("backfill", help="Idempotent post-seed backfills")
    backfill.add_argument("--hero-images", action="store_true", help="Relink hero images")
    backfill.add_argument("--all", action="store_true", help="Run every backfill step")
    backfill.set_defaults(func=_cmd_backfill)

    admin = sub.add_parser(
        "create-admin",
        help="Create a local admin user (prompts for password)",
    )
    admin.add_argument("--username", required=True)
    admin.add_argument("--first-name", default="Admin", dest="first_name")
    admin.add_argument("--last-name", default="User", dest="last_name")
    admin.add_argument(
        "--force",
        action="store_true",
        help="Overwrite the user if it already exists",
    )
    admin.set_defaults(func=_cmd_create_admin)

    restore = sub.add_parser(
        "restore",
        help="Restore a Nodus backup zip from disk into the configured database",
    )
    restore.add_argument("--backup-path", required=True, dest="backup_path")
    restore.add_argument(
        "--mode",
        choices=("fresh", "addon"),
        default="addon",
        help="fresh truncates all tables first; addon merges (default)",
    )
    restore.add_argument(
        "--password",
        default=None,
        help="Decryption password if the backup is an encrypted envelope",
    )
    restore.add_argument(
        "--resolutions",
        default=None,
        help='JSON object mapping "<table>:<key>" -> "skip"|"overwrite" (addon mode)',
    )
    restore.set_defaults(func=_cmd_restore)

    return parser


def main(argv: Iterable[str] | None = None) -> int:
    """Parse arguments and dispatch to the selected subcommand handler."""
    _setup_logging()
    parser = _build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    result: int = args.func(args)
    return result


if __name__ == "__main__":
    sys.exit(main())
