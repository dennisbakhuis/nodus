"""Tests for media service — upload pipeline and fetch cycle."""

import io
import uuid

import pytest
from PIL import Image
from sqlmodel import Session

from app.services.media import (
    HERO_HEIGHT,
    HERO_WIDTH,
    get_media_asset,
    upload_media_asset,
)


def _make_png_bytes(width: int = 1, height: int = 1) -> bytes:
    """Build a minimal in-memory PNG using Pillow."""
    img = Image.new("RGB", (width, height), color=(128, 64, 32))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_jpeg_bytes(width: int = 10, height: int = 10) -> bytes:
    img = Image.new("RGB", (width, height), color=(200, 100, 50))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_upload_png_returns_asset(session: Session) -> None:
    raw = _make_png_bytes()
    asset = upload_media_asset(
        session,
        raw,
        content_type="image/png",
        original_filename="test.png",
        alt_text="A test image",
    )
    assert asset.id is not None
    assert asset.content_type == "image/avif"
    assert asset.width_px == HERO_WIDTH
    assert asset.height_px == HERO_HEIGHT
    assert asset.byte_size > 0
    assert asset.original_filename == "test.png"
    assert asset.alt_text == "A test image"


def test_upload_jpeg_returns_asset(session: Session) -> None:
    raw = _make_jpeg_bytes(2400, 1260)
    asset = upload_media_asset(session, raw, content_type="image/jpeg")
    assert asset.width_px == HERO_WIDTH
    assert asset.height_px == HERO_HEIGHT
    assert asset.content_type == "image/avif"


def test_upload_webp_returns_asset(session: Session) -> None:
    img = Image.new("RGB", (100, 100), color=(0, 0, 255))
    buf = io.BytesIO()
    img.save(buf, format="WEBP")
    raw = buf.getvalue()
    asset = upload_media_asset(session, raw, content_type="image/webp")
    assert asset.id is not None


def test_upload_rejects_invalid_content_type(session: Session) -> None:
    raw = _make_png_bytes()
    with pytest.raises(ValueError, match="not allowed"):
        upload_media_asset(session, raw, content_type="image/gif")


def test_upload_rejects_oversized(session: Session) -> None:
    oversized = bytes(11 * 1024 * 1024)
    with pytest.raises(ValueError, match="maximum size"):
        upload_media_asset(session, oversized, content_type="image/png")


def test_upload_stores_bytes(session: Session) -> None:
    raw = _make_png_bytes()
    asset = upload_media_asset(session, raw, content_type="image/png")
    assert len(asset.data) == asset.byte_size
    assert asset.data[4:8] == b"ftyp"
    opened = Image.open(io.BytesIO(asset.data))
    assert opened.format == "AVIF"


def test_upload_avif_input_accepted(session: Session) -> None:
    img = Image.new("RGB", (800, 400), color=(0, 200, 100))
    buf = io.BytesIO()
    img.save(buf, format="AVIF", quality=70)
    asset = upload_media_asset(session, buf.getvalue(), content_type="image/avif")
    assert asset.id is not None
    assert asset.content_type == "image/avif"
    assert asset.width_px == HERO_WIDTH
    assert asset.height_px == HERO_HEIGHT


def test_get_media_asset_round_trip(session: Session) -> None:
    raw = _make_png_bytes()
    created = upload_media_asset(session, raw, content_type="image/png")
    fetched = get_media_asset(session, created.id)
    assert fetched is not None
    assert fetched.id == created.id
    assert fetched.data == created.data


def test_get_media_asset_missing_returns_none(session: Session) -> None:
    result = get_media_asset(session, uuid.uuid4())
    assert result is None


def test_upload_creates_correct_dimensions_wide_source(session: Session) -> None:
    img = Image.new("RGB", (3000, 500), color=(255, 255, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    asset = upload_media_asset(session, buf.getvalue(), content_type="image/png")
    assert asset.width_px == HERO_WIDTH
    assert asset.height_px == HERO_HEIGHT


def test_upload_creates_correct_dimensions_tall_source(session: Session) -> None:
    img = Image.new("RGB", (200, 3000), color=(0, 255, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    asset = upload_media_asset(session, buf.getvalue(), content_type="image/png")
    assert asset.width_px == HERO_WIDTH
    assert asset.height_px == HERO_HEIGHT
