"""MediaAsset upload and retrieval tests — v2."""

import io
import struct
import uuid
import zlib

from fastapi.testclient import TestClient


def _make_minimal_png() -> bytes:
    """Generate a minimal valid 1x1 transparent PNG in-memory."""
    signature = b"\x89PNG\r\n\x1a\n"

    def chunk(name: bytes, data: bytes) -> bytes:
        length = struct.pack(">I", len(data))
        body = name + data
        crc = struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
        return length + body + crc

    ihdr_data = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    ihdr = chunk(b"IHDR", ihdr_data)

    raw_row = b"\x00\xff\xff\xff"
    compressed = zlib.compress(raw_row)
    idat = chunk(b"IDAT", compressed)

    iend = chunk(b"IEND", b"")
    return signature + ihdr + idat + iend


class TestMediaUpload:
    def test_upload_png_returns_asset_metadata(self, client: TestClient) -> None:
        png_bytes = _make_minimal_png()
        resp = client.post(
            "/api/manage/media",
            files={"file": ("test.png", io.BytesIO(png_bytes), "image/png")},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "id" in data
        assert data["content_type"] == "image/avif"
        assert data["width_px"] == 1200
        assert data["height_px"] == 630

    def test_upload_rejects_non_image(self, client: TestClient) -> None:
        resp = client.post(
            "/api/manage/media",
            files={"file": ("test.txt", io.BytesIO(b"not an image"), "text/plain")},
        )
        assert resp.status_code == 422

    def test_upload_rejects_oversized_file(self, client: TestClient) -> None:
        oversized = b"\x00" * (11 * 1024 * 1024)
        resp = client.post(
            "/api/manage/media",
            files={"file": ("big.png", io.BytesIO(oversized), "image/png")},
        )
        assert resp.status_code == 422


class TestMediaFetch:
    def test_fetch_returns_avif_bytes(self, client: TestClient) -> None:
        png_bytes = _make_minimal_png()
        upload_resp = client.post(
            "/api/manage/media",
            files={"file": ("roundtrip.png", io.BytesIO(png_bytes), "image/png")},
        )
        asset_id = upload_resp.json()["id"]

        fetch_resp = client.get(f"/api/media/{asset_id}")
        assert fetch_resp.status_code == 200
        assert fetch_resp.headers["content-type"] == "image/avif"
        assert "cache-control" in fetch_resp.headers
        assert "immutable" in fetch_resp.headers["cache-control"]
        assert fetch_resp.content[4:8] == b"ftyp"

    def test_fetch_unknown_asset_returns_404(self, client: TestClient) -> None:
        resp = client.get(f"/api/media/{uuid.uuid4()}")
        assert resp.status_code == 404
