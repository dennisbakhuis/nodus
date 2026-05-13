"""MediaAsset upload pipeline (§3.17)."""

import io
import uuid
from datetime import UTC, datetime

from PIL import Image
from sqlmodel import Session

from app.models.media_asset import MediaAsset

ALLOWED_CONTENT_TYPES: frozenset[str] = frozenset(
    {"image/jpeg", "image/png", "image/webp", "image/avif"}
)
MAX_BYTES = 10 * 1024 * 1024
HERO_WIDTH = 1200
HERO_HEIGHT = 630
AVIF_QUALITY = 70


def upload_media_asset(
    session: Session,
    raw_bytes: bytes,
    content_type: str,
    original_filename: str | None = None,
    alt_text: str | None = None,
) -> MediaAsset:
    """Process, store, and return a new MediaAsset.

    Validates the content type against the whitelist and enforces a 10 MB size cap
    on the raw input. Resizes to 1200×630 (fit-cover, centre-crop) and encodes as
    AVIF quality 70. The original bytes are not retained.

    Parameters
    ----------
    session : Session
        Active database session.
    raw_bytes : bytes
        Raw image bytes from the upload request.
    content_type : str
        MIME type declared by the client (e.g., 'image/jpeg').
    original_filename : str | None
        The client's filename, retained for traceability.
    alt_text : str | None
        Accessibility text for the image.

    Returns
    -------
    MediaAsset
        The persisted MediaAsset row.

    Raises
    ------
    ValueError
        If content_type is not whitelisted, or raw_bytes exceeds 10 MB.
    """
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError(
            f"content_type {content_type!r} not allowed; "
            f"must be one of {sorted(ALLOWED_CONTENT_TYPES)}"
        )
    if len(raw_bytes) > MAX_BYTES:
        raise ValueError(f"Image exceeds maximum size of {MAX_BYTES // (1024 * 1024)} MB")

    image = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
    resized = _fit_cover_crop(image, HERO_WIDTH, HERO_HEIGHT)

    output = io.BytesIO()
    resized.save(output, format="AVIF", quality=AVIF_QUALITY)
    encoded_bytes = output.getvalue()

    asset = MediaAsset(
        id=uuid.uuid4(),
        content_type="image/avif",
        data=encoded_bytes,
        width_px=HERO_WIDTH,
        height_px=HERO_HEIGHT,
        byte_size=len(encoded_bytes),
        alt_text=alt_text,
        original_filename=original_filename,
        created_at=datetime.now(UTC),
    )
    session.add(asset)
    session.commit()
    session.refresh(asset)
    return asset


def get_media_asset(session: Session, asset_id: uuid.UUID) -> MediaAsset | None:
    """Fetch a MediaAsset by ID.

    Parameters
    ----------
    session : Session
        Active database session.
    asset_id : uuid.UUID
        Primary key.

    Returns
    -------
    MediaAsset | None
        The asset row, or None if not found.
    """
    return session.get(MediaAsset, asset_id)


def _fit_cover_crop(image: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """Resize image to fill target dimensions with centre crop.

    Parameters
    ----------
    image : Image.Image
        Source PIL image.
    target_w : int
        Target width in pixels.
    target_h : int
        Target height in pixels.

    Returns
    -------
    Image.Image
        Resized and cropped image of exactly (target_w, target_h).
    """
    src_w, src_h = image.size
    scale = max(target_w / src_w, target_h / src_h)
    new_w = round(src_w * scale)
    new_h = round(src_h * scale)
    resized = image.resize((new_w, new_h), Image.Resampling.LANCZOS)
    left = (new_w - target_w) // 2
    top = (new_h - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))
