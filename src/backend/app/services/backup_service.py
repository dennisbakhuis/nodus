"""Database + media backup/restore as a single zip with optional AES-256-GCM encryption.

The exported file is a zip with:
  - manifest.json         {format_version, exported_at, encrypted, tables}
  - <table>.json          one JSON array per SQLModel table
  - media/<asset_id>.bin  raw bytes for each MediaAsset (extension-less to keep
                          mime info inside the JSON metadata)

When `password` is set, the resulting zip is wrapped in a binary envelope:
  magic(8) | salt(16) | nonce(12) | ciphertext...
PBKDF2-HMAC-SHA256, 600k iterations, AES-256-GCM. Decryption requires the same
password; wrong passwords raise BackupAuthError, not a silent corruption.
"""

from __future__ import annotations

import datetime as _dt
import io
import json
import os
import uuid
import zipfile
from dataclasses import dataclass
from typing import Any, BinaryIO

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from sqlmodel import Session, SQLModel, select

from app.models import (
    Alias,
    Assessment,
    Cycle,
    Factsheet,
    MediaAsset,
    MovementEvent,
    Party,
    PeerReference,
    PeerReferenceUrl,
    Person,
    Relation,
    Segment,
    Setting,
    Source,
    StrategicInnovationField,
    Technology,
    Topic,
    TopicPersonLink,
    User,
)

BACKUP_FORMAT_VERSION = 1
ENVELOPE_MAGIC = b"NODUSBK1"
SALT_BYTES = 16
NONCE_BYTES = 12
PBKDF2_ITERATIONS = 600_000

# Tables to dump in dependency-friendly order (parents first, children later).
# Children come right after their parent so the importer can satisfy FKs.
_TABLE_ORDER: list[tuple[str, type[SQLModel]]] = [
    ("party", Party),
    ("strategic_innovation_field", StrategicInnovationField),
    ("segment", Segment),
    ("user", User),
    ("media_asset", MediaAsset),
    ("topic", Topic),
    ("technology", Technology),
    ("factsheet", Factsheet),
    ("assessment", Assessment),
    ("alias", Alias),
    ("source", Source),
    ("peer_reference", PeerReference),
    ("peer_reference_url", PeerReferenceUrl),
    ("relation", Relation),
    ("person", Person),
    ("topic_person_link", TopicPersonLink),
    # Cycle must precede MovementEvent: MovementEvent has a nullable
    # cycle_id FK -> cycle.id, so cycle rows have to exist first or the
    # restore fails with "FOREIGN KEY constraint failed" when seed data
    # carries cycle-anchored movements.
    ("cycle", Cycle),
    ("movement_event", MovementEvent),
    ("setting", Setting),
]

# Tables whose data is intentionally excluded from backups.
_EXCLUDED = {"auth_session", "mfa_challenge"}


# Tables that import-by-`addon` should match on a natural key (instead of UUID
# id) when comparing against existing rows. Fixes false-positive conflicts
# when a fresh-installed peer reseeds segments / parties from defaults.
_NATURAL_KEYS: dict[str, str] = {
    "segment": "slug",
    "party": "slug",
    "strategic_innovation_field": "slug",
    "user": "username",
    "topic": "slug",
    "setting": "key",
}


class BackupAuthError(ValueError):
    """Raised when a password-protected backup fails decryption (wrong password)."""


class BackupFormatError(ValueError):
    """Raised when a backup file is malformed or its format_version is unknown."""


@dataclass
class ConflictRow:
    """One row from the imported backup that already exists locally."""

    table: str
    natural_key: str | None  # None when matched by id only
    incoming: dict[str, Any]
    existing: dict[str, Any]


@dataclass
class InspectionReport:
    """Summary returned by inspect() for the frontend to drive conflict UI."""

    format_version: int
    exported_at: str | None
    encrypted: bool
    table_counts: dict[str, int]
    conflicts: list[ConflictRow]


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------


def _to_jsonable(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, _dt.datetime):
        return value.isoformat()
    if isinstance(value, _dt.date):
        return value.isoformat()
    if isinstance(value, bytes):
        # MediaAsset.data is handled separately as a file in media/
        return None
    return value


def _row_to_dict(row: SQLModel) -> dict[str, Any]:
    raw = row.model_dump()
    return {k: _to_jsonable(v) for k, v in raw.items()}


def _coerce_value(model_cls: type[SQLModel], field: str, value: Any) -> Any:
    """Best-effort revival of UUIDs and dates from JSON-friendly strings."""
    if value is None:
        return None
    info = model_cls.model_fields.get(field)
    if info is None:
        return value
    annotation = info.annotation
    annotation_str = str(annotation)
    if "UUID" in annotation_str and isinstance(value, str):
        try:
            return uuid.UUID(value)
        except ValueError:
            return value
    if "datetime" in annotation_str and isinstance(value, str):
        try:
            return _dt.datetime.fromisoformat(value)
        except ValueError:
            return value
    if "date" in annotation_str and "datetime" not in annotation_str and isinstance(value, str):
        try:
            return _dt.date.fromisoformat(value)
        except ValueError:
            return value
    return value


def _row_from_dict(model_cls: type[SQLModel], row: dict[str, Any]) -> SQLModel:
    coerced = {k: _coerce_value(model_cls, k, v) for k, v in row.items()}
    return model_cls(**coerced)


# ---------------------------------------------------------------------------
# Encryption envelope
# ---------------------------------------------------------------------------


def _derive_key(password: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
    )
    return kdf.derive(password.encode("utf-8"))


def _encrypt_envelope(plaintext: bytes, password: str) -> bytes:
    salt = os.urandom(SALT_BYTES)
    nonce = os.urandom(NONCE_BYTES)
    key = _derive_key(password, salt)
    aes = AESGCM(key)
    ciphertext = aes.encrypt(nonce, plaintext, None)
    return ENVELOPE_MAGIC + salt + nonce + ciphertext


def _decrypt_envelope(envelope: bytes, password: str) -> bytes:
    if not envelope.startswith(ENVELOPE_MAGIC):
        raise BackupFormatError("Not an encrypted Nodus backup envelope")
    body = envelope[len(ENVELOPE_MAGIC) :]
    if len(body) < SALT_BYTES + NONCE_BYTES + 16:
        raise BackupFormatError("Encrypted envelope is truncated")
    salt = body[:SALT_BYTES]
    nonce = body[SALT_BYTES : SALT_BYTES + NONCE_BYTES]
    ciphertext = body[SALT_BYTES + NONCE_BYTES :]
    key = _derive_key(password, salt)
    aes = AESGCM(key)
    try:
        return aes.decrypt(nonce, ciphertext, None)
    except Exception as exc:  # cryptography raises InvalidTag for wrong password
        raise BackupAuthError("Wrong password or corrupted backup") from exc


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


def _write_zip(session: Session, target: BinaryIO) -> None:
    """Stream the database into a zip written to `target` (file or BytesIO)."""
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        manifest = {
            "format_version": BACKUP_FORMAT_VERSION,
            "exported_at": _dt.datetime.now(_dt.UTC).isoformat(),
            "encrypted": False,
            "tables": [name for name, _cls in _TABLE_ORDER],
        }
        for table_name, model_cls in _TABLE_ORDER:
            rows = session.exec(select(model_cls)).all()
            if table_name == "media_asset":
                # Strip blob bytes from JSON; write each blob to media/<id>.bin
                serialized = []
                for row in rows:
                    rec = _row_to_dict(row)
                    rec.pop("data", None)
                    serialized.append(rec)
                    blob = getattr(row, "data", None)
                    if blob:
                        row_id = getattr(row, "id", None)
                        zf.writestr(f"media/{row_id}.bin", blob)
                zf.writestr("media_asset.json", json.dumps(serialized, indent=2))
            else:
                serialized = [_row_to_dict(row) for row in rows]
                zf.writestr(f"{table_name}.json", json.dumps(serialized, indent=2))
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))


def export_backup(session: Session, password: str | None = None) -> bytes:
    """Build a backup zip from the current DB. Returns raw bytes.

    For large backups, prefer `export_backup_to_file` — this in-memory
    helper is kept for tests and small exports.
    """
    buf = io.BytesIO()
    _write_zip(session, buf)
    raw = buf.getvalue()
    if password:
        return _encrypt_envelope(raw, password)
    return raw


def export_backup_to_file(session: Session, dest_path: str, password: str | None = None) -> None:
    """Write a backup to `dest_path` without holding it all in memory.

    Plain zips stream straight to disk row-by-row. The encrypted variant
    still buffers the plaintext in RAM (AES-GCM needs the full plaintext to
    finalize its auth tag); this is acceptable until single backups exceed a
    few hundred MB, at which point we'd need a chunked AEAD scheme.
    """
    if password:
        buf = io.BytesIO()
        _write_zip(session, buf)
        with open(dest_path, "wb") as out:
            out.write(_encrypt_envelope(buf.getvalue(), password))
    else:
        with open(dest_path, "wb") as out:
            _write_zip(session, out)


# ---------------------------------------------------------------------------
# Inspect
# ---------------------------------------------------------------------------


def _read_zip_bytes(payload: bytes, password: str | None) -> bytes:
    if payload.startswith(ENVELOPE_MAGIC):
        if not password:
            raise BackupAuthError("Backup is encrypted; password required")
        return _decrypt_envelope(payload, password)
    return payload


def _open_zip(payload: bytes, password: str | None) -> zipfile.ZipFile:
    raw = _read_zip_bytes(payload, password)
    try:
        return zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile as exc:
        raise BackupFormatError("Not a valid Nodus backup zip") from exc


def _read_manifest(zf: zipfile.ZipFile) -> dict[str, Any]:
    try:
        raw = zf.read("manifest.json")
    except KeyError as exc:
        raise BackupFormatError("Missing manifest.json in backup") from exc
    try:
        manifest: dict[str, Any] = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise BackupFormatError("Manifest is not valid JSON") from exc
    if manifest.get("format_version") != BACKUP_FORMAT_VERSION:
        raise BackupFormatError(
            f"Unsupported backup format_version {manifest.get('format_version')}"
        )
    return manifest


def _natural_key_lookup(
    session: Session, table_name: str, model_cls: type[SQLModel], value: Any
) -> SQLModel | None:
    field = _NATURAL_KEYS.get(table_name)
    if field is None or value is None:
        return None
    column = getattr(model_cls, field, None)
    if column is None:
        return None
    return session.exec(select(model_cls).where(column == value)).first()


def inspect_backup(
    session: Session, payload: bytes, password: str | None = None
) -> InspectionReport:
    """Read manifest + detect rows that would conflict on add-on import."""
    zf = _open_zip(payload, password)
    manifest = _read_manifest(zf)

    table_counts: dict[str, int] = {}
    conflicts: list[ConflictRow] = []

    for table_name, model_cls in _TABLE_ORDER:
        try:
            raw = zf.read(f"{table_name}.json")
        except KeyError:
            continue
        rows = json.loads(raw.decode("utf-8"))
        table_counts[table_name] = len(rows)

        for incoming in rows:
            existing: SQLModel | None = None
            field = _NATURAL_KEYS.get(table_name)
            value = incoming.get(field) if field else None
            if field is not None and value is not None:
                existing = _natural_key_lookup(session, table_name, model_cls, value)
            if existing is None:
                row_id = incoming.get("id")
                if row_id is not None:
                    try:
                        coerced_id = uuid.UUID(row_id) if isinstance(row_id, str) else row_id
                        existing = session.get(model_cls, coerced_id)
                    except ValueError, TypeError:
                        existing = None
            if existing is not None:
                conflicts.append(
                    ConflictRow(
                        table=table_name,
                        natural_key=field,
                        incoming=incoming,
                        existing=_row_to_dict(existing),
                    )
                )

    return InspectionReport(
        format_version=manifest.get("format_version", 0),
        exported_at=manifest.get("exported_at"),
        encrypted=manifest.get("encrypted", False),
        table_counts=table_counts,
        conflicts=conflicts,
    )


# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------


def _truncate_all(session: Session) -> None:
    """Wipe every restorable table in reverse dependency order.

    Called inside an existing transaction; the caller commits.
    """
    for table_name, model_cls in reversed(_TABLE_ORDER):
        if table_name in _EXCLUDED:
            continue
        for row in session.exec(select(model_cls)).all():
            session.delete(row)
    session.flush()


def restore_backup(
    session: Session,
    payload: bytes,
    *,
    password: str | None = None,
    mode: str = "addon",
    resolutions: dict[str, str] | None = None,
) -> dict[str, int]:
    """Apply a backup file to the database atomically.

    mode = "fresh"  → wipe every table first, then load every row from the file.
    mode = "addon"  → leave existing rows; new IDs/keys inserted; per-conflict
                       resolution drives skip / overwrite per row.

    `resolutions` is a map from "<table>:<natural-or-id>" to "skip" | "overwrite".
    Missing entries default to "skip" in addon mode.

    Any failure mid-restore rolls back the entire operation — the database is
    either fully migrated or untouched. Constraint violations on individual
    rows propagate as-is so the admin can correct the backup and retry.
    """
    if mode not in {"fresh", "addon"}:
        raise ValueError(f"Unknown restore mode: {mode}")

    zf = _open_zip(payload, password)
    _read_manifest(zf)
    resolutions = resolutions or {}

    counts = {"inserted": 0, "skipped": 0, "overwritten": 0}

    def _media_blob(row_id: Any) -> bytes | None:
        if row_id is None:
            return None
        try:
            return zf.read(f"media/{row_id}.bin")
        except KeyError:
            return None

    try:
        if mode == "fresh":
            _truncate_all(session)

        for table_name, model_cls in _TABLE_ORDER:
            try:
                raw = zf.read(f"{table_name}.json")
            except KeyError:
                continue
            rows = json.loads(raw.decode("utf-8"))
            for incoming in rows:
                existing = None
                field = _NATURAL_KEYS.get(table_name)
                value = incoming.get(field) if field else None
                if field is not None and value is not None:
                    existing = _natural_key_lookup(session, table_name, model_cls, value)
                if existing is None:
                    row_id = incoming.get("id")
                    if row_id is not None:
                        try:
                            coerced_id = uuid.UUID(row_id) if isinstance(row_id, str) else row_id
                            existing = session.get(model_cls, coerced_id)
                        except ValueError, TypeError:
                            existing = None

                key = (
                    f"{table_name}:{value}"
                    if field is not None and value is not None
                    else f"{table_name}:{incoming.get('id')}"
                )

                if mode == "addon" and existing is not None:
                    action = resolutions.get(key, "skip")
                    if action == "skip":
                        counts["skipped"] += 1
                        continue
                    if action == "overwrite":
                        coerced = {k: _coerce_value(model_cls, k, v) for k, v in incoming.items()}
                        for k, v in coerced.items():
                            if k == "id":
                                continue
                            if hasattr(existing, k):
                                setattr(existing, k, v)
                        if table_name == "media_asset":
                            blob = _media_blob(incoming.get("id"))
                            if blob is None:
                                raise BackupFormatError(
                                    f"media_asset {incoming.get('id')!r} has no media/<id>.bin blob"
                                )
                            existing.data = blob
                        session.add(existing)
                        counts["overwritten"] += 1
                        continue

                if table_name == "media_asset":
                    # MediaAsset.data is NOT NULL — attach the blob from the
                    # zip alongside the metadata before insert.
                    blob = _media_blob(incoming.get("id"))
                    if blob is None:
                        raise BackupFormatError(
                            f"media_asset {incoming.get('id')!r} has no media/<id>.bin blob"
                        )
                    obj = _row_from_dict(model_cls, {**incoming, "data": blob})
                else:
                    obj = _row_from_dict(model_cls, incoming)
                session.add(obj)
                counts["inserted"] += 1

            session.flush()

        # Sanity check: every media/<uuid>.bin must match a restored row.
        restored_asset_ids = {asset.id for asset in session.exec(select(MediaAsset)).all()}
        for name in zf.namelist():
            if not name.startswith("media/") or not name.endswith(".bin"):
                continue
            try:
                asset_id = uuid.UUID(name[len("media/") : -len(".bin")])
            except ValueError as exc:
                raise BackupFormatError(f"Media blob {name!r} has a non-UUID filename") from exc
            if asset_id not in restored_asset_ids:
                raise BackupFormatError(f"Media blob {name!r} has no matching MediaAsset row")

        session.commit()
    except Exception:
        session.rollback()
        raise

    return counts
