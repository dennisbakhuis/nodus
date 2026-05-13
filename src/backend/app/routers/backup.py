"""Admin backup/restore endpoints. Streams the zipped DB+media as one download."""

from __future__ import annotations

import contextlib
import json
import os
import tempfile
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.auth import AdminDep
from app.db import SessionDep
from app.services.backup_service import (
    BackupAuthError,
    BackupFormatError,
    export_backup_to_file,
    inspect_backup,
    restore_backup,
)

router = APIRouter(prefix="/admin/backup", tags=["admin-backup"])


def _filename(encrypted: bool) -> str:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M")
    suffix = "-encrypted.bin" if encrypted else ".zip"
    return f"nodus-backup-{timestamp}{suffix}"


def _stream_response(
    session: SessionDep,
    background: BackgroundTasks,
    password: str | None,
) -> FileResponse:
    """Build the backup on disk and return it as a streaming FileResponse.

    The tempfile is unlinked after the response finishes via BackgroundTasks
    so we don't pile up half-finished exports.
    """
    fd, tmp_path = tempfile.mkstemp(prefix="nodus-backup-", suffix=".bin")
    os.close(fd)
    try:
        export_backup_to_file(session, tmp_path, password=password or None)
    except Exception:
        with contextlib.suppress(OSError):
            os.unlink(tmp_path)
        raise
    background.add_task(os.unlink, tmp_path)
    encrypted = bool(password)
    return FileResponse(
        tmp_path,
        media_type="application/octet-stream" if encrypted else "application/zip",
        filename=_filename(encrypted),
    )


@router.get("")
def download_backup(
    session: SessionDep,
    _admin: AdminDep,
    background: BackgroundTasks,
) -> FileResponse:
    """Download the full DB+media as a plain zip.

    Designed for scripted pulls — bearer token in the Authorization header
    is the only secret needed. No query parameters; no encryption layer.
    Use POST /api/admin/backup/download when an encryption envelope is
    required.
    """
    return _stream_response(session, background, password=None)


@router.post("/download")
async def download_backup_encrypted(
    session: SessionDep,
    _admin: AdminDep,
    background: BackgroundTasks,
    password: Annotated[str | None, Form()] = None,
) -> FileResponse:
    """Download the backup with an optional AES-256-GCM envelope.

    Identical to GET / when `password` is blank. The password is read from
    the request body so it does not leak into access logs or browser history
    the way a GET query parameter would.
    """
    return _stream_response(session, background, password=password)


@router.post("/inspect")
async def inspect_uploaded(
    session: SessionDep,
    _admin: AdminDep,
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str | None, Form()] = None,
) -> dict[str, object]:
    """Read the manifest + identify which rows would conflict on add-on import."""
    payload = await file.read()
    try:
        report = inspect_backup(session, payload, password=password or None)
    except BackupAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except BackupFormatError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "format_version": report.format_version,
        "exported_at": report.exported_at,
        "encrypted": report.encrypted,
        "table_counts": report.table_counts,
        "conflicts": [
            {
                "table": c.table,
                "natural_key": c.natural_key,
                "incoming": c.incoming,
                "existing": c.existing,
            }
            for c in report.conflicts
        ],
    }


@router.post("/restore")
async def restore_uploaded(
    session: SessionDep,
    _admin: AdminDep,
    file: Annotated[UploadFile, File(...)],
    mode: Annotated[str, Form(...)] = "addon",
    password: Annotated[str | None, Form()] = None,
    resolutions_json: Annotated[str | None, Form()] = None,
) -> dict[str, int]:
    """Apply the backup. `mode` = "fresh" wipes existing rows first; "addon" merges.

    `resolutions_json` is an optional JSON-encoded map keyed by `<table>:<key>`
    with values "skip" | "overwrite" — drives per-row conflict handling in
    addon mode. Anything missing defaults to "skip".
    """
    if mode not in {"fresh", "addon"}:
        raise HTTPException(status_code=400, detail="mode must be 'fresh' or 'addon'")
    payload = await file.read()
    resolutions: dict[str, str] = {}
    if resolutions_json:
        try:
            parsed = json.loads(resolutions_json)
            if isinstance(parsed, dict):
                resolutions = {
                    str(k): str(v)
                    for k, v in parsed.items()
                    if isinstance(v, str) and v in {"skip", "overwrite"}
                }
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=400, detail="resolutions_json is not valid JSON"
            ) from None
    try:
        return restore_backup(
            session,
            payload,
            password=password or None,
            mode=mode,
            resolutions=resolutions,
        )
    except BackupAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except BackupFormatError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
