"""CRUD service for Person and TopicPersonLink (§3.14, §3.15, §7)."""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlmodel import Session, select

from app.models.person import Person
from app.models.topic_person_link import PersonLinkRole, TopicPersonLink
from app.models.user import User

# Sentinel so callers can distinguish "leave user_id untouched" from
# "set user_id to None" (unlink) when updating a Person.
UNSET: Any = object()


def ensure_person_for_user(
    session: Session,
    user: User,
    *,
    email: str | None = None,
    company: str | None = None,
    department: str | None = None,
    role: str | None = None,
    adopt_match: bool = False,
    commit: bool = True,
) -> Person:
    """Return the Person linked to `user`, adopting or creating one if none exists.

    When `adopt_match` is set and the user has no linked Person, an existing
    *account-less* Person whose full name matches exactly (and uniquely) is linked
    instead of creating a duplicate — this is what prevents the backfill / first-login
    flow from stamping out a second copy of someone already in the People registry.
    With 0 or >1 matches (or `adopt_match` off) a fresh stub is created: `full_name`
    from the user's names, blank `company` (satisfies NOT NULL), completed at first
    login. Idempotent: a second call returns the existing linked Person untouched.
    """
    existing = session.exec(select(Person).where(Person.user_id == user.id)).first()
    if existing is not None:
        return existing
    full_name = f"{user.first_name} {user.last_name}".strip() or user.username
    if adopt_match:
        candidates = find_unlinked_person_candidates(session, full_name)
        if len(candidates) == 1:
            match = candidates[0]
            match.user_id = user.id
            session.add(match)
            if commit:
                session.commit()
                session.refresh(match)
            return match
    person = Person(
        full_name=full_name,
        company=company or "",
        email=email,
        department=department,
        role=role,
        user_id=user.id,
    )
    session.add(person)
    if commit:
        session.commit()
        session.refresh(person)
    return person


def get_person_for_user(session: Session, user_id: uuid.UUID) -> Person | None:
    """Return the Person linked to a user account, or None."""
    return session.exec(select(Person).where(Person.user_id == user_id)).first()


def profile_incomplete(person: Person | None) -> bool:
    """Whether a profile still needs completion: no Person, or missing company/email."""
    if person is None:
        return True
    if not (person.company or "").strip():
        return True
    return not (person.email or "").strip()


def user_profile_incomplete(session: Session, user_id: uuid.UUID) -> bool:
    """Whether the account's linked profile is incomplete (drives the first-login popup)."""
    return profile_incomplete(get_person_for_user(session, user_id))


def find_unlinked_person_candidates(session: Session, full_name: str) -> list[Person]:
    """Return account-less People whose full_name matches (case-insensitive)."""
    name = (full_name or "").strip().lower()
    if not name:
        return []
    rows = session.exec(select(Person).where(Person.user_id == None)).all()  # noqa: E711
    return [p for p in rows if p.full_name.strip().lower() == name]


def count_topic_links_for_person(session: Session, person_id: uuid.UUID) -> int:
    """Number of TopicPersonLink rows referencing this Person."""
    rows = session.exec(select(TopicPersonLink).where(TopicPersonLink.person_id == person_id)).all()
    return len(list(rows))


def backfill_person_profiles(session: Session) -> int:
    """Ensure every user has a linked Person. Returns the count created or adopted.

    Adopts a unique account-less same-name match where one exists (so a restored
    record isn't duplicated) and otherwise creates a stub.
    """
    touched = 0
    for user in session.exec(select(User)).all():
        if get_person_for_user(session, user.id) is None:
            ensure_person_for_user(session, user, adopt_match=True, commit=False)
            touched += 1
    if touched:
        session.commit()
    return touched


def merge_persons(session: Session, source_id: uuid.UUID, target_id: uuid.UUID) -> Person:
    """Merge `source` into `target`: move its topic links + account, then delete it.

    Topic links move to target, dropping any that would collide with an existing
    `(topic_id, person_id, link_role)` on target. The account link moves only when
    target has none; merging two Persons that are linked to *different* accounts
    raises ValueError. Target's empty profile fields are filled from source.
    Returns the surviving target Person.
    """
    if source_id == target_id:
        raise ValueError("Cannot merge a person into itself")
    source = session.get(Person, source_id)
    target = session.get(Person, target_id)
    if source is None or target is None:
        raise ValueError("Both source and target persons must exist")

    both_linked = source.user_id is not None and target.user_id is not None
    if both_linked and source.user_id != target.user_id:
        raise ValueError("Both people are linked to different accounts; unlink one first")

    for link in session.exec(
        select(TopicPersonLink).where(TopicPersonLink.person_id == source_id)
    ).all():
        clash = session.exec(
            select(TopicPersonLink)
            .where(TopicPersonLink.topic_id == link.topic_id)
            .where(TopicPersonLink.person_id == target_id)
            .where(TopicPersonLink.link_role == link.link_role)
        ).first()
        if clash is not None:
            session.delete(link)
        else:
            link.person_id = target_id
            session.add(link)
    session.flush()

    if source.user_id is not None and target.user_id is None:
        moved = source.user_id
        source.user_id = None
        session.add(source)
        session.flush()
        target.user_id = moved

    if not (target.company or "").strip() and (source.company or "").strip():
        target.company = source.company
    for field in ("email", "department", "role", "notes"):
        if not getattr(target, field) and getattr(source, field):
            setattr(target, field, getattr(source, field))

    target.updated_at = datetime.now(UTC)
    session.add(target)
    session.delete(source)
    session.commit()
    session.refresh(target)
    return target


def dedup_person_profiles(session: Session, *, apply: bool) -> list[dict[str, str]]:
    """Find (and optionally merge) accounts whose linked Person duplicates a twin.

    For each user whose linked Person has exactly one account-less same-name twin,
    plan a merge into whichever side carries topic links (else the linked one). With
    `apply` false this only reports the planned merges; with `apply` true it performs
    them. Returns one entry per planned/performed merge.
    """
    planned: list[dict[str, str]] = []
    for user in session.exec(select(User)).all():
        linked = get_person_for_user(session, user.id)
        if linked is None:
            continue
        twins = [
            p
            for p in find_unlinked_person_candidates(session, linked.full_name)
            if p.id != linked.id
        ]
        if len(twins) != 1:
            continue
        twin = twins[0]
        # Survivor keeps topic links; the linked stub is usually the empty one.
        if count_topic_links_for_person(session, twin.id) > count_topic_links_for_person(
            session, linked.id
        ):
            target, source = twin, linked
        else:
            target, source = linked, twin
        planned.append(
            {
                "username": user.username,
                "target": str(target.id),
                "source": str(source.id),
                "full_name": linked.full_name,
            }
        )
        if apply:
            merge_persons(session, source.id, target.id)
    return planned


def create_person(
    session: Session,
    full_name: str,
    company: str,
    email: str | None = None,
    department: str | None = None,
    role: str | None = None,
    notes: str | None = None,
) -> Person:
    """Create a new Person record.

    Parameters
    ----------
    session : Session
        Active database session.
    full_name : str
        Person's full name.
    company : str
        Organisation or company name (free text).
    email : str | None
        PII email address; nullable; management-surface only.
    department : str | None
        Department within company.
    role : str | None
        Organisational title.
    notes : str | None
        Curator notes.

    Returns
    -------
    Person
        The persisted Person row.
    """
    person = Person(
        id=uuid.uuid4(),
        full_name=full_name,
        company=company,
        email=email,
        department=department,
        role=role,
        notes=notes,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    session.add(person)
    session.commit()
    session.refresh(person)
    return person


def get_person(session: Session, person_id: uuid.UUID) -> Person | None:
    """Fetch a Person by ID.

    Parameters
    ----------
    session : Session
        Active database session.
    person_id : uuid.UUID
        Primary key of the Person.

    Returns
    -------
    Person | None
        The Person row, or None if not found.
    """
    return session.get(Person, person_id)


def list_persons(session: Session) -> list[Person]:
    """Return all Person rows ordered by full_name.

    Parameters
    ----------
    session : Session
        Active database session.

    Returns
    -------
    list[Person]
        All Person records.
    """
    stmt = select(Person).order_by(Person.full_name)
    return list(session.exec(stmt).all())


def update_person(
    session: Session,
    person_id: uuid.UUID,
    full_name: str | None = None,
    company: str | None = None,
    email: str | None = None,
    department: str | None = None,
    role: str | None = None,
    notes: str | None = None,
    user_id: uuid.UUID | None | Any = UNSET,
) -> Person:
    """Update mutable fields on a Person record.

    Parameters
    ----------
    session : Session
        Active database session.
    person_id : uuid.UUID
        ID of the person to update.
    full_name : str | None
        New full name if provided.
    company : str | None
        New company if provided.
    email : str | None
        New email if provided.
    department : str | None
        New department if provided.
    role : str | None
        New role title if provided.
    notes : str | None
        New notes if provided.

    Returns
    -------
    Person
        The updated Person row.

    Raises
    ------
    ValueError
        If no Person exists with the given ID.
    """
    person = session.get(Person, person_id)
    if person is None:
        raise ValueError(f"Person {person_id} not found")
    if full_name is not None:
        person.full_name = full_name
    if company is not None:
        person.company = company
    if email is not None:
        person.email = email
    if department is not None:
        person.department = department
    if role is not None:
        person.role = role
    if notes is not None:
        person.notes = notes
    if user_id is not UNSET:
        person.user_id = user_id
    person.updated_at = datetime.now(UTC)
    session.add(person)
    session.commit()
    session.refresh(person)
    return person


def link_person_to_topic(
    session: Session,
    topic_id: uuid.UUID,
    person_id: uuid.UUID,
    link_role: PersonLinkRole,
    notes: str | None = None,
) -> TopicPersonLink:
    """Create a TopicPersonLink attaching a Person to a Topic with a role.

    Each (topic_id, person_id, link_role) triple is unique. Raises if the link
    already exists.

    Parameters
    ----------
    session : Session
        Active database session.
    topic_id : uuid.UUID
        ID of the Topic.
    person_id : uuid.UUID
        ID of the Person.
    link_role : PersonLinkRole
        Role enum value.
    notes : str | None
        Optional curator notes.

    Returns
    -------
    TopicPersonLink
        The persisted junction row.

    Raises
    ------
    ValueError
        If the (topic_id, person_id, link_role) triple already exists.
    """
    existing = session.exec(
        select(TopicPersonLink)
        .where(TopicPersonLink.topic_id == topic_id)
        .where(TopicPersonLink.person_id == person_id)
        .where(TopicPersonLink.link_role == link_role)
    ).first()
    if existing is not None:
        raise ValueError(
            f"Link already exists for topic={topic_id}, person={person_id}, role={link_role}"
        )
    link = TopicPersonLink(
        id=uuid.uuid4(),
        topic_id=topic_id,
        person_id=person_id,
        link_role=link_role,
        notes=notes,
        created_at=datetime.now(UTC),
    )
    session.add(link)
    session.commit()
    session.refresh(link)
    return link


def unlink_person_from_topic(
    session: Session,
    topic_id: uuid.UUID,
    person_id: uuid.UUID,
    link_role: PersonLinkRole,
) -> None:
    """Remove a TopicPersonLink.

    Parameters
    ----------
    session : Session
        Active database session.
    topic_id : uuid.UUID
        ID of the Topic.
    person_id : uuid.UUID
        ID of the Person.
    link_role : PersonLinkRole
        Role to remove.

    Raises
    ------
    ValueError
        If no matching link exists.
    """
    link = session.exec(
        select(TopicPersonLink)
        .where(TopicPersonLink.topic_id == topic_id)
        .where(TopicPersonLink.person_id == person_id)
        .where(TopicPersonLink.link_role == link_role)
    ).first()
    if link is None:
        raise ValueError(
            f"No link found for topic={topic_id}, person={person_id}, role={link_role}"
        )
    session.delete(link)
    session.commit()


def get_persons_for_topic(
    session: Session, topic_id: uuid.UUID
) -> list[tuple[TopicPersonLink, Person]]:
    """Return all TopicPersonLink rows for a Topic, each paired with its Person.

    Parameters
    ----------
    session : Session
        Active database session.
    topic_id : uuid.UUID
        ID of the Topic.

    Returns
    -------
    list[tuple[TopicPersonLink, Person]]
        Pairs of (link, person) for all links on the topic.
    """
    links = list(
        session.exec(select(TopicPersonLink).where(TopicPersonLink.topic_id == topic_id)).all()
    )
    pairs: list[tuple[TopicPersonLink, Person]] = []
    for link in links:
        person = session.get(Person, link.person_id)
        if person is not None:
            pairs.append((link, person))
    return pairs


def list_links_for_topic(session: Session, topic_id: uuid.UUID) -> list[TopicPersonLink]:
    """Return all TopicPersonLink rows for a given Topic.

    Parameters
    ----------
    session : Session
        Active database session.
    topic_id : uuid.UUID
        ID of the Topic.

    Returns
    -------
    list[TopicPersonLink]
        All links for the topic.
    """
    return list(
        session.exec(select(TopicPersonLink).where(TopicPersonLink.topic_id == topic_id)).all()
    )
