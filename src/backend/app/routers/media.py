"""MediaAsset upload and retrieval endpoints."""

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from app.auth import WriterDep
from app.db import SessionDep
from app.models.media_asset import MediaAsset
from app.services.media import ALLOWED_CONTENT_TYPES, MAX_BYTES, upload_media_asset


class MediaAssetRead(BaseModel):
    """Response schema for a MediaAsset (metadata only — no bytes)."""

    id: uuid.UUID
    content_type: str
    width_px: int
    height_px: int
    byte_size: int
    alt_text: str | None
    original_filename: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


router = APIRouter(tags=["media"])


@router.post("/manage/media", response_model=MediaAssetRead, status_code=201)
async def upload_media(
    file: UploadFile,
    session: SessionDep,
    _user: WriterDep,
) -> MediaAssetRead:
    """Upload an image, resize to hero dimensions, store as AVIF.

    Accepts image/jpeg, image/png, image/webp, image/avif up to 10 MB. Resizes
    server-side to 1200x630 (fit-cover, centre-crop) and encodes as AVIF
    quality 70.

    Parameters
    ----------
    file : UploadFile
        Uploaded image file.
    session : SessionDep
        Database session.

    Returns
    -------
    MediaAssetRead
        Created MediaAsset metadata (id, dimensions, content_type).

    Raises
    ------
    HTTPException
        422 if content type is not allowed or file exceeds size limit.
    """
    content_type = file.content_type or ""
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported content type '{content_type}'. "
            f"Allowed: {', '.join(sorted(ALLOWED_CONTENT_TYPES))}",
        )

    raw_bytes = await file.read()
    if len(raw_bytes) > MAX_BYTES:
        raise HTTPException(
            status_code=422,
            detail=f"File exceeds maximum size of {MAX_BYTES // (1024 * 1024)} MB",
        )

    try:
        asset = upload_media_asset(
            session=session,
            raw_bytes=raw_bytes,
            content_type=content_type,
            original_filename=file.filename,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return MediaAssetRead.model_validate(asset)


@router.get("/media/{asset_id}")
def get_media(asset_id: uuid.UUID, session: SessionDep) -> Response:
    """Return image bytes for a MediaAsset with correct Content-Type.

    Public endpoint — radar visualization uses this to render hero images.

    Parameters
    ----------
    asset_id : uuid.UUID
        MediaAsset identifier.
    session : SessionDep
        Database session.

    Returns
    -------
    Response
        Image bytes with Content-Type and Cache-Control headers.

    Raises
    ------
    HTTPException
        404 if asset not found.
    """
    asset = session.get(MediaAsset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Media asset not found")

    return Response(
        content=asset.data,
        media_type=asset.content_type,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    )
