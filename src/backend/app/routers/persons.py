"""Management endpoints for Person and TopicPersonLink."""

import uuid

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from app.auth import WriterDep
from app.db import SessionDep
from app.models.person import Person
from app.models.topic import Topic
from app.models.topic_person_link import TopicPersonLink
from app.schemas.person import (
    PersonCreate,
    PersonReadManagement,
    PersonUpdate,
    TopicPersonLinkCreate,
    TopicPersonLinkManagementRead,
    TopicPersonLinkUpsert,
)
from app.services.persons import (
    create_person,
    get_persons_for_topic,
    link_person_to_topic,
    update_person,
)

persons_router = APIRouter(prefix="/manage/persons", tags=["management-persons"])
topic_persons_router = APIRouter(prefix="/manage/topics", tags=["management-persons"])


@persons_router.get("", response_model=list[PersonReadManagement])
def list_persons(
    session: SessionDep,
    _user: WriterDep,
    search: str | None = Query(default=None),
    company: str | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[PersonReadManagement]:
    """List all Persons (management surface — includes PII).

    Parameters
    ----------
    session : SessionDep
        Database session.
    search : str | None
        Substring search on full_name.
    company : str | None
        Filter by company name (exact, case-sensitive).
    offset : int
        Pagination offset.
    limit : int
        Page size.

    Returns
    -------
    list[PersonReadManagement]
        Matching persons with full fields.
    """
    from sqlmodel import col

    stmt = select(Person)
    if search is not None:
        stmt = stmt.where(col(Person.full_name).like(f"%{search}%"))
    if company is not None:
        stmt = stmt.where(Person.company == company)
    stmt = stmt.offset(offset).limit(limit)
    persons = session.exec(stmt).all()
    return [PersonReadManagement.model_validate(p) for p in persons]


@persons_router.post("", response_model=PersonReadManagement, status_code=201)
def create_person_endpoint(
    payload: PersonCreate,
    session: SessionDep,
    _user: WriterDep,
) -> PersonReadManagement:
    """Create a new Person.

    Parameters
    ----------
    payload : PersonCreate
        Person creation fields.
    session : SessionDep
        Database session.

    Returns
    -------
    PersonReadManagement
        Created person with full fields.
    """
    person = create_person(
        session=session,
        full_name=payload.full_name,
        company=payload.company,
        email=payload.email,
        department=payload.department,
        role=payload.role,
        notes=payload.notes,
    )
    return PersonReadManagement.model_validate(person)


@persons_router.get("/{person_id}", response_model=PersonReadManagement)
def get_person(person_id: uuid.UUID, session: SessionDep, _user: WriterDep) -> PersonReadManagement:
    """Retrieve a Person by ID.

    Parameters
    ----------
    person_id : uuid.UUID
        Person identifier.
    session : SessionDep
        Database session.

    Returns
    -------
    PersonReadManagement
        Person with full fields.
    """
    person = session.get(Person, person_id)
    if person is None:
        raise HTTPException(status_code=404, detail="Person not found")
    return PersonReadManagement.model_validate(person)


@persons_router.patch("/{person_id}", response_model=PersonReadManagement)
def update_person_endpoint(
    person_id: uuid.UUID,
    payload: PersonUpdate,
    session: SessionDep,
    _user: WriterDep,
) -> PersonReadManagement:
    """Update a Person's mutable fields.

    Parameters
    ----------
    person_id : uuid.UUID
        Person identifier.
    payload : PersonUpdate
        Fields to update.
    session : SessionDep
        Database session.

    Returns
    -------
    PersonReadManagement
        Updated person.
    """
    person = session.get(Person, person_id)
    if person is None:
        raise HTTPException(status_code=404, detail="Person not found")
    updated = update_person(
        session=session,
        person_id=person_id,
        full_name=payload.full_name,
        company=payload.company,
        email=payload.email,
        department=payload.department,
        role=payload.role,
        notes=payload.notes,
    )
    return PersonReadManagement.model_validate(updated)


@persons_router.delete("/{person_id}", status_code=204)
def delete_person_endpoint(
    person_id: uuid.UUID,
    session: SessionDep,
    _user: WriterDep,
) -> None:
    """Delete a Person. Blocked when any TopicPersonLink still references them.

    Parameters
    ----------
    person_id : uuid.UUID
        Person identifier.
    session : SessionDep
        Database session.

    Raises
    ------
    HTTPException
        404 when no such person.
        409 when the person is still linked to one or more topics; returns the
        count so the UI can prompt the user to unlink first.
    """
    person = session.get(Person, person_id)
    if person is None:
        raise HTTPException(status_code=404, detail="Person not found")
    link_count = len(
        list(
            session.exec(
                select(TopicPersonLink).where(TopicPersonLink.person_id == person_id)
            ).all()
        )
    )
    if link_count > 0:
        raise HTTPException(
            status_code=409,
            detail={"reason": "person_in_use", "link_count": link_count},
        )
    session.delete(person)
    session.commit()


@topic_persons_router.get(
    "/{topic_id}/persons",
    response_model=list[TopicPersonLinkManagementRead],
)
def list_topic_persons(
    topic_id: uuid.UUID, session: SessionDep, _user: WriterDep
) -> list[TopicPersonLinkManagementRead]:
    """List all Persons linked to a Topic (management surface).

    Parameters
    ----------
    topic_id : uuid.UUID
        Topic identifier.
    session : SessionDep
        Database session.

    Returns
    -------
    list[TopicPersonLinkManagementRead]
        Links with full Person data.
    """
    topic = session.get(Topic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")

    pairs = get_persons_for_topic(session, topic_id)
    results: list[TopicPersonLinkManagementRead] = []
    for link, person in pairs:
        from app.schemas.person import PersonReadManagement as PRM

        results.append(
            TopicPersonLinkManagementRead(
                id=link.id,
                topic_id=link.topic_id,
                person_id=link.person_id,
                link_role=link.link_role,
                notes=link.notes,
                created_at=link.created_at,
                person=PRM.model_validate(person),
            )
        )
    return results


@topic_persons_router.post(
    "/{topic_id}/persons",
    response_model=TopicPersonLinkManagementRead,
    status_code=201,
)
def add_person_to_topic(
    topic_id: uuid.UUID,
    payload: TopicPersonLinkCreate,
    session: SessionDep,
    _user: WriterDep,
) -> TopicPersonLinkManagementRead:
    """Link a Person to a Topic with a role.

    Parameters
    ----------
    topic_id : uuid.UUID
        Topic identifier.
    payload : TopicPersonLinkCreate
        Person ID and role.
    session : SessionDep
        Database session.

    Returns
    -------
    TopicPersonLinkManagementRead
        Created link with full Person data.
    """
    topic = session.get(Topic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")
    person = session.get(Person, payload.person_id)
    if person is None:
        raise HTTPException(status_code=404, detail="Person not found")

    existing = session.exec(
        select(TopicPersonLink).where(
            TopicPersonLink.topic_id == topic_id,
            TopicPersonLink.person_id == payload.person_id,
            TopicPersonLink.link_role == payload.link_role.value,
        )
    ).first()
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="This person already has this role on this topic.",
        )

    link = link_person_to_topic(
        session=session,
        topic_id=topic_id,
        person_id=payload.person_id,
        link_role=payload.link_role,
        notes=payload.notes,
    )
    from app.schemas.person import PersonReadManagement as PRM

    return TopicPersonLinkManagementRead(
        id=link.id,
        topic_id=link.topic_id,
        person_id=link.person_id,
        link_role=link.link_role,
        notes=link.notes,
        created_at=link.created_at,
        person=PRM.model_validate(person),
    )


@topic_persons_router.post(
    "/{topic_id}/persons/upsert",
    response_model=TopicPersonLinkManagementRead,
    status_code=201,
)
def upsert_person_on_topic(
    topic_id: uuid.UUID,
    payload: TopicPersonLinkUpsert,
    session: SessionDep,
    _user: WriterDep,
) -> TopicPersonLinkManagementRead:
    """Find-or-create a Person and link it to the topic in a single call.

    `person_id` short-circuits the lookup. Otherwise (full_name, company) is
    used as the natural key — found rows are reused; missing rows are created.
    The link is then created if it doesn't already exist for this role.
    """
    topic = session.get(Topic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")

    person: Person | None = None
    if payload.person_id is not None:
        person = session.get(Person, payload.person_id)
        if person is None:
            raise HTTPException(status_code=404, detail="Person not found")
    else:
        if not payload.full_name or not payload.full_name.strip():
            raise HTTPException(
                status_code=400, detail="full_name is required when person_id is omitted"
            )
        company = (payload.company or "").strip()
        person = session.exec(
            select(Person)
            .where(Person.full_name == payload.full_name.strip())
            .where(Person.company == company)
        ).first()
        if person is None:
            person = create_person(
                session=session,
                full_name=payload.full_name.strip(),
                company=company,
                email=payload.email,
                department=payload.department,
                role=payload.role,
                notes=payload.notes,
            )
        else:
            updates_needed = (
                (payload.role and person.role != payload.role)
                or (payload.department and person.department != payload.department)
                or (payload.email and person.email != payload.email)
            )
            if updates_needed:
                person = update_person(
                    session=session,
                    person_id=person.id,
                    role=payload.role,
                    department=payload.department,
                    email=payload.email,
                )

    existing_link = session.exec(
        select(TopicPersonLink).where(
            TopicPersonLink.topic_id == topic_id,
            TopicPersonLink.person_id == person.id,
            TopicPersonLink.link_role == payload.link_role.value,
        )
    ).first()
    if existing_link is not None:
        link = existing_link
    else:
        link = link_person_to_topic(
            session=session,
            topic_id=topic_id,
            person_id=person.id,
            link_role=payload.link_role,
            notes=payload.notes,
        )

    return TopicPersonLinkManagementRead(
        id=link.id,
        topic_id=link.topic_id,
        person_id=link.person_id,
        link_role=link.link_role,
        notes=link.notes,
        created_at=link.created_at,
        person=PersonReadManagement.model_validate(person),
    )


@topic_persons_router.delete("/{topic_id}/persons/{link_id}", status_code=204)
def remove_person_from_topic(
    topic_id: uuid.UUID,
    link_id: uuid.UUID,
    session: SessionDep,
    _user: WriterDep,
) -> None:
    """Remove a Person-Topic link.

    Parameters
    ----------
    topic_id : uuid.UUID
        Topic identifier.
    link_id : uuid.UUID
        TopicPersonLink identifier.
    session : SessionDep
        Database session.
    """
    link = session.get(TopicPersonLink, link_id)
    if link is None or link.topic_id != topic_id:
        raise HTTPException(status_code=404, detail="Link not found")
    session.delete(link)
    session.commit()
