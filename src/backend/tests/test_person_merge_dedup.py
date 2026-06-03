"""Tests for adopt-on-create, merge_persons, and dedup_person_profiles."""

import uuid

import pytest
from sqlmodel import Session, select

from app.models.person import Person
from app.models.topic import Topic
from app.models.topic_person_link import PersonLinkRole, TopicPersonLink
from app.models.user import User, UserRole
from app.services.persons import (
    backfill_person_profiles,
    dedup_person_profiles,
    ensure_person_for_user,
    get_person_for_user,
    link_person_to_topic,
    merge_persons,
)


def _make_user(session: Session, first: str = "Jane", last: str = "Doe") -> User:
    user = User(
        username=f"{first}.{last}".lower(),
        first_name=first,
        last_name=last,
        role=UserRole.Reader.value,
        password_hash="x",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


# --- adopt-on-create -------------------------------------------------------


def test_ensure_adopts_single_unlinked_match(session: Session) -> None:
    user = _make_user(session)
    twin = Person(full_name="Jane Doe", company="Acme")
    session.add(twin)
    session.commit()

    person = ensure_person_for_user(session, user, adopt_match=True)

    assert person.id == twin.id
    assert person.user_id == user.id
    assert len(session.exec(select(Person)).all()) == 1


def test_ensure_creates_stub_when_match_ambiguous(session: Session) -> None:
    user = _make_user(session)
    session.add(Person(full_name="Jane Doe", company="A"))
    session.add(Person(full_name="Jane Doe", company="B"))
    session.commit()

    person = ensure_person_for_user(session, user, adopt_match=True)

    assert person.user_id == user.id
    assert person.company == ""  # a fresh stub, not one of the twins
    assert len(session.exec(select(Person)).all()) == 3


def test_ensure_without_adopt_always_creates(session: Session) -> None:
    user = _make_user(session)
    session.add(Person(full_name="Jane Doe", company="Acme"))
    session.commit()

    person = ensure_person_for_user(session, user)  # adopt_match defaults False

    assert person.user_id == user.id
    assert len(session.exec(select(Person)).all()) == 2


def test_backfill_adopts_match_without_duplicating(session: Session) -> None:
    user = _make_user(session)
    twin = Person(full_name="Jane Doe", company="Acme")
    session.add(twin)
    session.commit()

    backfill_person_profiles(session)

    linked = get_person_for_user(session, user.id)
    assert linked is not None
    assert linked.id == twin.id
    assert len(session.exec(select(Person)).all()) == 1


# --- merge_persons ---------------------------------------------------------


def test_merge_moves_account_and_deletes_source(session: Session) -> None:
    user = _make_user(session)
    stub = Person(full_name="Jane Doe", company="", user_id=user.id)
    twin = Person(full_name="Jane Doe", company="Acme")
    session.add(stub)
    session.add(twin)
    session.commit()

    merged = merge_persons(session, stub.id, twin.id)

    assert merged.id == twin.id
    assert merged.user_id == user.id
    assert session.get(Person, stub.id) is None


def test_merge_moves_and_dedupes_topic_links(session: Session) -> None:
    source = Person(full_name="X", company="Acme")
    target = Person(full_name="X", company="Acme")
    session.add(source)
    session.add(target)
    session.commit()
    t1 = Topic(id=uuid.uuid4(), canonical_name="T1", slug="t1")
    t2 = Topic(id=uuid.uuid4(), canonical_name="T2", slug="t2")
    session.add(t1)
    session.add(t2)
    session.commit()
    link_person_to_topic(session, t1.id, source.id, PersonLinkRole.Contact)
    link_person_to_topic(session, t1.id, target.id, PersonLinkRole.Contact)  # collision
    link_person_to_topic(session, t2.id, source.id, PersonLinkRole.Author)  # unique

    merge_persons(session, source.id, target.id)

    links = session.exec(
        select(TopicPersonLink).where(TopicPersonLink.person_id == target.id)
    ).all()
    keys = {(link.topic_id, link.link_role) for link in links}
    assert keys == {(t1.id, "Contact"), (t2.id, "Author")}
    assert session.get(Person, source.id) is None


def test_merge_fills_empty_target_fields(session: Session) -> None:
    target = Person(full_name="X", company="")
    source = Person(full_name="X", company="Acme", email="a@b.com", role="Lead")
    session.add(target)
    session.add(source)
    session.commit()

    merged = merge_persons(session, source.id, target.id)

    assert merged.company == "Acme"
    assert merged.email == "a@b.com"
    assert merged.role == "Lead"


def test_merge_both_linked_to_different_accounts_raises(session: Session) -> None:
    u1 = _make_user(session, "A", "One")
    u2 = _make_user(session, "B", "Two")
    p1 = Person(full_name="L", company="A", user_id=u1.id)
    p2 = Person(full_name="L", company="B", user_id=u2.id)
    session.add(p1)
    session.add(p2)
    session.commit()

    with pytest.raises(ValueError):
        merge_persons(session, p1.id, p2.id)


# --- dedup_person_profiles -------------------------------------------------


def test_dedup_dry_run_then_apply(session: Session) -> None:
    user = _make_user(session, "Dee", "Dup")
    stub = Person(full_name="Dee Dup", company="", user_id=user.id)
    twin = Person(full_name="Dee Dup", company="Acme")
    session.add(stub)
    session.add(twin)
    session.commit()

    plan = dedup_person_profiles(session, apply=False)
    assert len(plan) == 1
    assert len(session.exec(select(Person)).all()) == 2  # dry-run mutated nothing

    dedup_person_profiles(session, apply=True)
    survivors = session.exec(select(Person)).all()
    assert len(survivors) == 1
    linked = get_person_for_user(session, user.id)
    assert linked is not None
    assert linked.company == "Acme"  # real data carried over


def test_dedup_skips_ambiguous(session: Session) -> None:
    user = _make_user(session, "Hom", "Onym")
    session.add(Person(full_name="Hom Onym", company="", user_id=user.id))
    session.add(Person(full_name="Hom Onym", company="A"))
    session.add(Person(full_name="Hom Onym", company="B"))
    session.commit()

    plan = dedup_person_profiles(session, apply=True)
    assert plan == []
    assert len(session.exec(select(Person)).all()) == 3
