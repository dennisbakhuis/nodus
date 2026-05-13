"""CRUD endpoints for Topic-to-Topic Relation (v2)."""

import uuid

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import or_, select

from app.auth import OptionalUserDep, WriterDep, is_public_only
from app.db import SessionDep
from app.models.relation import Relation
from app.models.topic import Topic
from app.schemas.relation import RelationCreate, RelationRead

router = APIRouter(prefix="/relations", tags=["relations"])


@router.get("", response_model=list[RelationRead])
def list_relations(
    session: SessionDep,
    user: OptionalUserDep,
    topic_id: uuid.UUID | None = Query(default=None),  # noqa: B008
    relation_type: str | None = Query(default=None),  # noqa: B008
) -> list[RelationRead]:
    """List relations, optionally filtered by topic or type.

    Parameters
    ----------
    session : SessionDep
        Database session.
    topic_id : uuid.UUID | None
        Filter to relations involving this topic (either direction).
    relation_type : str | None
        Filter by relation type.

    Returns
    -------
    list[RelationRead]
        Matching relations.
    """
    stmt = select(Relation)
    if topic_id is not None:
        stmt = stmt.where(
            or_(
                Relation.from_topic_id == topic_id,
                Relation.to_topic_id == topic_id,
            )
        )
    if relation_type is not None:
        stmt = stmt.where(Relation.relation_type == relation_type)
    rows = list(session.exec(stmt).all())

    if is_public_only(user) and rows:
        # Hide relations whose endpoints touch any private topic so anonymous
        # callers can't deduce a private topic exists from a relation row.
        topic_ids = {r.from_topic_id for r in rows} | {r.to_topic_id for r in rows}
        private_ids = {
            t.id
            for t in session.exec(
                select(Topic).where(
                    Topic.id.in_(topic_ids),  # type: ignore[attr-defined]
                    Topic.not_for_external_publication == True,  # noqa: E712
                )
            ).all()
        }
        rows = [
            r
            for r in rows
            if r.from_topic_id not in private_ids and r.to_topic_id not in private_ids
        ]
    return [RelationRead.model_validate(r) for r in rows]


@router.post("", response_model=RelationRead, status_code=201)
def create_relation(payload: RelationCreate, session: SessionDep, _user: WriterDep) -> RelationRead:
    """Create a new relation between two Topics.

    Parameters
    ----------
    payload : RelationCreate
        Relation fields including topic IDs and type.
    session : SessionDep
        Database session.

    Returns
    -------
    RelationRead
        Created relation.

    Raises
    ------
    HTTPException
        404 if either topic not found. 422 if self-loop. 409 if duplicate.
    """
    for topic_id in (payload.from_topic_id, payload.to_topic_id):
        if session.get(Topic, topic_id) is None:
            raise HTTPException(status_code=404, detail=f"Topic {topic_id} not found")
    if payload.from_topic_id == payload.to_topic_id:
        raise HTTPException(status_code=422, detail="A topic cannot relate to itself")
    existing = session.exec(
        select(Relation)
        .where(Relation.from_topic_id == payload.from_topic_id)
        .where(Relation.to_topic_id == payload.to_topic_id)
        .where(Relation.relation_type == str(payload.relation_type))
    ).first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Relation already exists")
    relation = Relation(
        from_topic_id=payload.from_topic_id,
        to_topic_id=payload.to_topic_id,
        relation_type=str(payload.relation_type),
    )
    session.add(relation)
    session.commit()
    session.refresh(relation)
    return RelationRead.model_validate(relation)


@router.delete("/{relation_id}", status_code=204)
def delete_relation(relation_id: uuid.UUID, session: SessionDep, _user: WriterDep) -> None:
    """Delete a relation by ID.

    Parameters
    ----------
    relation_id : uuid.UUID
        Relation identifier.
    session : SessionDep
        Database session.
    """
    rel = session.get(Relation, relation_id)
    if rel is None:
        raise HTTPException(status_code=404, detail="Relation not found")
    session.delete(rel)
    session.commit()
