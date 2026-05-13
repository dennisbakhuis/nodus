"""Admin backup router tests — covers GET pull, POST encrypted, inspect, restore."""

from __future__ import annotations

import io
import json
import uuid
import zipfile
from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.segment import Segment
from app.models.topic import Topic
from app.models.user import User, UserRole
from app.services.backup_service import BACKUP_FORMAT_VERSION, export_backup


def _topic(session: Session, name: str, slug: str) -> Topic:
    topic = Topic(canonical_name=name, slug=slug)
    session.add(topic)
    session.commit()
    session.refresh(topic)
    return topic


class TestGetDownload:
    def test_admin_pulls_plain_zip(self, client: TestClient, session: Session) -> None:
        _topic(session, "Admin Pull", "admin-pull")
        resp = client.get("/api/admin/backup")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/zip"
        assert resp.headers["content-disposition"].startswith("attachment;")
        assert resp.headers["content-disposition"].endswith('.zip"')

        zf = zipfile.ZipFile(io.BytesIO(resp.content))
        manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
        assert manifest["format_version"] == BACKUP_FORMAT_VERSION
        assert manifest["encrypted"] is False

    def test_api_key_can_pull(
        self,
        anon_client: TestClient,
        client: TestClient,
    ) -> None:
        # Mint an API key via the admin client, then pull with the key alone.
        create_resp = client.post(
            "/api/manage/api-keys",
            json={"name": "backup-puller"},
        )
        assert create_resp.status_code == 201
        token = create_resp.json()["token"]

        resp = anon_client.get(
            "/api/admin/backup",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/zip"

    def test_anonymous_rejected(self, anon_client: TestClient) -> None:
        resp = anon_client.get("/api/admin/backup")
        assert resp.status_code == 401

    def test_reader_forbidden(
        self,
        anon_client: TestClient,
        make_user: Callable[..., tuple[User, str]],
        auth_header: Callable[[str], dict[str, str]],
    ) -> None:
        _, token = make_user(role=UserRole.Reader)
        resp = anon_client.get("/api/admin/backup", headers=auth_header(token))
        assert resp.status_code == 403

    def test_writer_forbidden(
        self,
        anon_client: TestClient,
        make_user: Callable[..., tuple[User, str]],
        auth_header: Callable[[str], dict[str, str]],
    ) -> None:
        _, token = make_user(role=UserRole.Writer)
        resp = anon_client.get("/api/admin/backup", headers=auth_header(token))
        assert resp.status_code == 403


class TestPostDownload:
    def test_password_in_body_returns_encrypted_envelope(
        self, client: TestClient, session: Session
    ) -> None:
        _topic(session, "Encrypted Pull", "encrypted-pull")
        resp = client.post(
            "/api/admin/backup/download",
            data={"password": "hunter2"},
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/octet-stream"
        assert resp.headers["content-disposition"].endswith('-encrypted.bin"')
        # Body must be the AES envelope, not a raw zip.
        assert resp.content[:8] == b"NODUSBK1"

    def test_blank_password_returns_plain_zip(self, client: TestClient) -> None:
        resp = client.post("/api/admin/backup/download", data={"password": ""})
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/zip"
        assert resp.content[:2] == b"PK"


class TestInspect:
    def test_inspect_returns_manifest_and_counts(
        self, client: TestClient, session: Session
    ) -> None:
        seg = Segment(name="Inspect Seg", slug="inspect-seg", display_order=10)
        session.add(seg)
        session.commit()
        payload = export_backup(session)

        resp = client.post(
            "/api/admin/backup/inspect",
            files={"file": ("backup.zip", payload, "application/zip")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["format_version"] == BACKUP_FORMAT_VERSION
        assert body["encrypted"] is False
        # Router conftest pre-seeds 5 canonical segments; our added row makes 6.
        assert body["table_counts"]["segment"] >= 1
        seg_conflicts = [c for c in body["conflicts"] if c["table"] == "segment"]
        assert any(
            c["incoming"]["slug"] == "inspect-seg" and c["natural_key"] == "slug"
            for c in seg_conflicts
        )

    def test_wrong_password_returns_401(self, client: TestClient, session: Session) -> None:
        payload = export_backup(session, password="correct")
        resp = client.post(
            "/api/admin/backup/inspect",
            data={"password": "wrong"},
            files={"file": ("backup.bin", payload, "application/octet-stream")},
        )
        assert resp.status_code == 401

    def test_malformed_zip_returns_400(self, client: TestClient) -> None:
        resp = client.post(
            "/api/admin/backup/inspect",
            files={"file": ("backup.zip", b"not-a-zip", "application/zip")},
        )
        assert resp.status_code == 400


class TestRestoreEndpoint:
    def test_addon_restore_inserts_new_rows(self, client: TestClient, session: Session) -> None:
        _topic(session, "Topic Before Export", "round-trip-router")
        payload = export_backup(session)
        # Delete the row locally so addon restore should insert it back.
        local = session.exec(select(Topic).where(Topic.slug == "round-trip-router")).first()
        assert local is not None
        session.delete(local)
        session.commit()

        resp = client.post(
            "/api/admin/backup/restore",
            data={"mode": "addon"},
            files={"file": ("backup.zip", payload, "application/zip")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["inserted"] >= 1
        after = session.exec(select(Topic).where(Topic.slug == "round-trip-router")).first()
        assert after is not None

    def test_invalid_mode_rejected(self, client: TestClient) -> None:
        resp = client.post(
            "/api/admin/backup/restore",
            data={"mode": "explode"},
            files={"file": ("backup.zip", b"PK\x03\x04", "application/zip")},
        )
        assert resp.status_code == 400

    def test_bad_resolutions_json_rejected(self, client: TestClient) -> None:
        resp = client.post(
            "/api/admin/backup/restore",
            data={"mode": "addon", "resolutions_json": "{not-json"},
            files={"file": ("backup.zip", b"PK\x03\x04", "application/zip")},
        )
        assert resp.status_code == 400

    def test_atomicity_orphan_media_blob_leaves_db_unchanged(
        self, client: TestClient, session: Session
    ) -> None:
        topic = _topic(session, "Stays Around", "stays-around")
        original_id = topic.id

        # Build a malformed backup: media blob with no matching MediaAsset row.
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr(
                "manifest.json",
                json.dumps(
                    {
                        "format_version": BACKUP_FORMAT_VERSION,
                        "exported_at": "2026-01-01T00:00:00+00:00",
                        "encrypted": False,
                        "tables": [],
                    }
                ),
            )
            zf.writestr(
                "topic.json",
                json.dumps(
                    [
                        {
                            "id": str(uuid.uuid4()),
                            "canonical_name": "Ghost Topic",
                            "slug": "ghost-topic",
                        }
                    ]
                ),
            )
            zf.writestr("media_asset.json", json.dumps([]))
            zf.writestr(f"media/{uuid.uuid4()}.bin", b"orphan")

        resp = client.post(
            "/api/admin/backup/restore",
            data={"mode": "addon"},
            files={"file": ("malformed.zip", buf.getvalue(), "application/zip")},
        )
        assert resp.status_code == 400

        # Pre-existing topic survives; ghost topic was rolled back.
        assert session.get(Topic, original_id) is not None
        assert session.exec(select(Topic).where(Topic.slug == "ghost-topic")).first() is None

    def test_anonymous_cannot_restore(self, anon_client: TestClient) -> None:
        resp = anon_client.post(
            "/api/admin/backup/restore",
            data={"mode": "addon"},
            files={"file": ("backup.zip", b"PK\x03\x04", "application/zip")},
        )
        assert resp.status_code == 401
