"""Round-trip, encryption, and atomicity tests for the backup service."""

from __future__ import annotations

import io
import json
import uuid
import zipfile

import pytest
from sqlmodel import Session, select

from app.models.media_asset import MediaAsset
from app.models.segment import Segment
from app.models.setting import Setting
from app.models.topic import Topic
from app.services.backup_service import (
    BACKUP_FORMAT_VERSION,
    BackupAuthError,
    BackupFormatError,
    export_backup,
    inspect_backup,
    restore_backup,
)


def _make_topic(session: Session, name: str, slug: str) -> Topic:
    topic = Topic(canonical_name=name, slug=slug)
    session.add(topic)
    session.commit()
    session.refresh(topic)
    return topic


def _make_media(session: Session, payload: bytes = b"hello-bytes") -> MediaAsset:
    asset = MediaAsset(
        content_type="image/png",
        data=payload,
        width_px=10,
        height_px=10,
        byte_size=len(payload),
    )
    session.add(asset)
    session.commit()
    session.refresh(asset)
    return asset


class TestExportShape:
    def test_export_produces_zip_with_manifest(self, session: Session) -> None:
        _make_topic(session, "Sample Topic", "sample-topic")
        payload = export_backup(session)
        assert isinstance(payload, bytes)
        zf = zipfile.ZipFile(io.BytesIO(payload))
        names = set(zf.namelist())
        assert "manifest.json" in names
        manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
        assert manifest["format_version"] == BACKUP_FORMAT_VERSION
        assert manifest["encrypted"] is False
        assert "topic" in manifest["tables"]

    def test_export_includes_media_blob_outside_json(self, session: Session) -> None:
        asset = _make_media(session, b"image-bytes-here")
        payload = export_backup(session)
        zf = zipfile.ZipFile(io.BytesIO(payload))
        # Media bytes live in media/<uuid>.bin, NOT in media_asset.json
        media_json = json.loads(zf.read("media_asset.json").decode("utf-8"))
        assert all(row.get("data") is None for row in media_json)
        assert f"media/{asset.id}.bin" in zf.namelist()
        assert zf.read(f"media/{asset.id}.bin") == b"image-bytes-here"


class TestEncryption:
    def test_encrypted_payload_is_not_a_zip(self, session: Session) -> None:
        _make_topic(session, "Encrypted Topic", "encrypted-topic")
        plain = export_backup(session)
        encrypted = export_backup(session, password="hunter2")
        # Plain zip starts with PK; encrypted envelope starts with NODUSBK1.
        assert plain[:2] == b"PK"
        assert encrypted[:8] == b"NODUSBK1"

    def test_wrong_password_raises_auth_error(self, session: Session) -> None:
        encrypted = export_backup(session, password="correct-horse")
        with pytest.raises(BackupAuthError):
            inspect_backup(session, encrypted, password="wrong-horse")

    def test_missing_password_on_encrypted_raises(self, session: Session) -> None:
        encrypted = export_backup(session, password="x")
        with pytest.raises(BackupAuthError):
            inspect_backup(session, encrypted, password=None)


class TestInspect:
    def test_truncated_zip_raises_format_error(self, session: Session) -> None:
        with pytest.raises(BackupFormatError):
            inspect_backup(session, b"PK\x03\x04not-a-zip")

    def test_missing_manifest_raises_format_error(self, session: Session) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("topic.json", "[]")
        with pytest.raises(BackupFormatError):
            inspect_backup(session, buf.getvalue())

    def test_unknown_format_version_raises(self, session: Session) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr(
                "manifest.json",
                json.dumps({"format_version": 9999, "tables": [], "encrypted": False}),
            )
        with pytest.raises(BackupFormatError):
            inspect_backup(session, buf.getvalue())

    def test_inspect_detects_natural_key_conflict(self, session: Session) -> None:
        _make_topic(session, "Quantum Networks", "quantum-networks")
        payload = export_backup(session)
        # Local DB still has the same row → addon would conflict.
        report = inspect_backup(session, payload)
        topic_conflicts = [c for c in report.conflicts if c.table == "topic"]
        assert any(c.incoming.get("slug") == "quantum-networks" for c in topic_conflicts)
        assert all(c.natural_key == "slug" for c in topic_conflicts)

    def test_inspect_no_conflicts_when_target_empty(self, session: Session) -> None:
        topic = _make_topic(session, "Solo Topic", "solo-topic")
        payload = export_backup(session)
        session.delete(topic)
        session.commit()
        report = inspect_backup(session, payload)
        topic_conflicts = [c for c in report.conflicts if c.table == "topic"]
        assert topic_conflicts == []


class TestRestoreFresh:
    def test_fresh_restore_round_trips_plain(self, session: Session) -> None:
        topic = _make_topic(session, "Round Trip", "round-trip")
        payload = export_backup(session)

        # Wipe the row, then restore — fresh mode should bring it back.
        session.delete(topic)
        session.commit()
        assert session.exec(select(Topic).where(Topic.slug == "round-trip")).first() is None

        counts = restore_backup(session, payload, mode="fresh")
        assert counts["inserted"] >= 1
        restored = session.exec(select(Topic).where(Topic.slug == "round-trip")).first()
        assert restored is not None
        assert restored.canonical_name == "Round Trip"

    def test_fresh_restore_wipes_diverging_rows(self, session: Session) -> None:
        _make_topic(session, "Original", "shared-slug")
        payload = export_backup(session)
        # Replace canonical_name with something different.
        local = session.exec(select(Topic).where(Topic.slug == "shared-slug")).first()
        assert local is not None
        local.canonical_name = "Diverged Locally"
        session.add(local)
        session.commit()

        restore_backup(session, payload, mode="fresh")
        after = session.exec(select(Topic).where(Topic.slug == "shared-slug")).first()
        assert after is not None
        assert after.canonical_name == "Original"

    def test_fresh_restore_preserves_media_bytes(self, session: Session) -> None:
        asset = _make_media(session, b"\x89PNG\r\n\x1a\n-fake-png")
        original_id = asset.id
        payload = export_backup(session)

        # Wipe the asset row.
        session.delete(asset)
        session.commit()

        restore_backup(session, payload, mode="fresh")
        restored = session.get(MediaAsset, original_id)
        assert restored is not None
        assert restored.data == b"\x89PNG\r\n\x1a\n-fake-png"


class TestRestoreAddon:
    def test_addon_skip_keeps_existing_row(self, session: Session) -> None:
        _make_topic(session, "Original Name", "addon-slug")
        payload = export_backup(session)

        local = session.exec(select(Topic).where(Topic.slug == "addon-slug")).first()
        assert local is not None
        local.canonical_name = "Locally Renamed"
        session.add(local)
        session.commit()

        restore_backup(
            session,
            payload,
            mode="addon",
            resolutions={"topic:addon-slug": "skip"},
        )
        after = session.exec(select(Topic).where(Topic.slug == "addon-slug")).first()
        assert after is not None
        assert after.canonical_name == "Locally Renamed"

    def test_addon_overwrite_replaces_existing(self, session: Session) -> None:
        _make_topic(session, "Backup Name", "addon-slug")
        payload = export_backup(session)

        local = session.exec(select(Topic).where(Topic.slug == "addon-slug")).first()
        assert local is not None
        local.canonical_name = "Locally Renamed"
        session.add(local)
        session.commit()

        restore_backup(
            session,
            payload,
            mode="addon",
            resolutions={"topic:addon-slug": "overwrite"},
        )
        after = session.exec(select(Topic).where(Topic.slug == "addon-slug")).first()
        assert after is not None
        assert after.canonical_name == "Backup Name"

    def test_addon_inserts_new_rows(self, session: Session) -> None:
        _make_topic(session, "Will Stay", "will-stay")
        payload = export_backup(session)

        # Add a new row locally; export still only has "will-stay".
        # Then restoring should not delete the new local row.
        _make_topic(session, "Local Extra", "local-extra")
        counts = restore_backup(session, payload, mode="addon")
        # The local-extra row should survive the addon restore.
        assert session.exec(select(Topic).where(Topic.slug == "local-extra")).first() is not None
        assert isinstance(counts["inserted"], int)


class TestAtomicity:
    def test_failed_restore_leaves_db_unchanged(self, session: Session) -> None:
        _make_topic(session, "Pre-existing", "pre-existing")
        topic_count_before = len(session.exec(select(Topic)).all())

        # Build a malformed zip: media blob points to a UUID with no MediaAsset
        # row, which our atomic restore should reject.
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
                            "canonical_name": "Should Not Persist",
                            "slug": "should-not-persist",
                        }
                    ]
                ),
            )
            zf.writestr(
                "media_asset.json",
                json.dumps([]),
            )
            # Orphan media blob — no matching row in media_asset.json.
            zf.writestr(f"media/{uuid.uuid4()}.bin", b"orphan")

        with pytest.raises(BackupFormatError):
            restore_backup(session, buf.getvalue(), mode="addon")

        session.rollback()
        topic_count_after = len(session.exec(select(Topic)).all())
        assert topic_count_after == topic_count_before
        assert session.exec(select(Topic).where(Topic.slug == "should-not-persist")).first() is None


class TestSeededTables:
    def test_segment_natural_key_conflict_detected(self, session: Session) -> None:
        # Add a segment, export, then keep the local row — addon import
        # should report a natural-key conflict on `slug`, not silently
        # insert a duplicate.
        seg = Segment(name="Grid Demo", slug="grid-demo", display_order=10)
        session.add(seg)
        session.commit()

        payload = export_backup(session)
        report = inspect_backup(session, payload)
        assert report.table_counts["segment"] == 1
        segment_conflicts = [c for c in report.conflicts if c.table == "segment"]
        assert len(segment_conflicts) == 1
        assert segment_conflicts[0].natural_key == "slug"
        assert segment_conflicts[0].incoming["slug"] == "grid-demo"


class TestSettingRoundTrip:
    """`Setting` rows are serialized in backups and matched by key on restore,
    so any frontend feature that persists state via the settings API (e.g.
    auth.hide_local_admin_badge, demo.enabled) survives export/import without
    extra plumbing. These tests pin that contract."""

    def test_fresh_restore_brings_back_custom_setting_key(self, session: Session) -> None:
        session.add(Setting(key="auth.hide_local_admin_badge", value="true"))
        session.commit()
        payload = export_backup(session)

        local = session.exec(
            select(Setting).where(Setting.key == "auth.hide_local_admin_badge")
        ).first()
        assert local is not None
        session.delete(local)
        session.commit()
        assert (
            session.exec(
                select(Setting).where(Setting.key == "auth.hide_local_admin_badge")
            ).first()
            is None
        )

        restore_backup(session, payload, mode="fresh")
        restored = session.exec(
            select(Setting).where(Setting.key == "auth.hide_local_admin_badge")
        ).first()
        assert restored is not None
        assert restored.value == "true"

    def test_addon_overwrite_replaces_setting_value(self, session: Session) -> None:
        session.add(Setting(key="auth.hide_local_admin_badge", value="true"))
        session.commit()
        payload = export_backup(session)

        local = session.exec(
            select(Setting).where(Setting.key == "auth.hide_local_admin_badge")
        ).first()
        assert local is not None
        local.value = "false"
        session.add(local)
        session.commit()

        restore_backup(
            session,
            payload,
            mode="addon",
            resolutions={"setting:auth.hide_local_admin_badge": "overwrite"},
        )
        after = session.exec(
            select(Setting).where(Setting.key == "auth.hide_local_admin_badge")
        ).first()
        assert after is not None
        assert after.value == "true"
