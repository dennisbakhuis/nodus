"""Party lookup + create endpoints for the inline peer-reference editor."""

import re
import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import select

from app.auth import WriterDep
from app.db import SessionDep
from app.models.party import Party

router = APIRouter(prefix="/parties", tags=["parties"])


class PartyRead(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    url: str | None

    model_config = {"from_attributes": True}


class PartyCreate(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=200)]
    url: str | None = None


def _slugify(name: str) -> str:
    s = re.sub(r"[^\w\s-]", "", name.lower())
    s = re.sub(r"[\s_-]+", "-", s).strip("-")
    return s or "party"


@router.get("", response_model=list[PartyRead])
def list_parties(session: SessionDep) -> list[Party]:
    """Return all parties ordered by name (case-insensitive)."""
    parties = session.exec(select(Party)).all()
    return sorted(parties, key=lambda p: p.name.lower())


@router.post("", response_model=PartyRead, status_code=201)
def create_party(payload: PartyCreate, session: SessionDep, _user: WriterDep) -> Party:
    """Create a new Party. If a party with the same name (case-insensitive)
    already exists, return that one instead — convenient for the inline
    "create-on-demand" editor flow.
    """
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="name must not be empty")
    existing = session.exec(select(Party)).all()
    for p in existing:
        if p.name.strip().lower() == name.lower():
            return p
    base_slug = _slugify(name)
    slug = base_slug
    n = 2
    existing_slugs = {p.slug for p in existing}
    while slug in existing_slugs:
        slug = f"{base_slug}-{n}"
        n += 1
    party = Party(name=name, slug=slug, url=payload.url)
    session.add(party)
    session.commit()
    session.refresh(party)
    return party
