"""Endpoints for the generic key/value Setting store (global app config)."""

from fastapi import APIRouter
from sqlmodel import select

from app.auth import AdminDep
from app.db import SessionDep
from app.models.setting import Setting
from app.schemas.setting import SettingRead, SettingUpsert

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=list[SettingRead])
def list_settings(session: SessionDep) -> list[SettingRead]:
    """Return all settings as a flat list of key/value pairs."""
    rows = session.exec(select(Setting)).all()
    return [SettingRead(key=r.key, value=r.value) for r in rows]


@router.get("/{key}", response_model=SettingRead)
def get_setting(key: str, session: SessionDep) -> SettingRead:
    """Return a single setting; missing keys are reported as empty values rather than 404."""
    row = session.exec(select(Setting).where(Setting.key == key)).first()
    if row is None:
        return SettingRead(key=key, value="")
    return SettingRead(key=row.key, value=row.value)


@router.put("/{key}", response_model=SettingRead)
def upsert_setting(
    key: str,
    payload: SettingUpsert,
    session: SessionDep,
    _user: AdminDep,
) -> SettingRead:
    """Create or update a setting value by key."""
    row = session.exec(select(Setting).where(Setting.key == key)).first()
    if row is None:
        row = Setting(key=key, value=payload.value)
    else:
        row.value = payload.value
    session.add(row)
    session.commit()
    session.refresh(row)
    return SettingRead(key=row.key, value=row.value)
