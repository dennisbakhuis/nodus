"""Tests for User <-> Person linking: auto-create, candidates, self-profile, safe delete."""

import uuid
from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.person import Person
from app.models.topic import Topic
from app.models.topic_person_link import PersonLinkRole, TopicPersonLink
from app.models.user import User, UserRole
from app.services.persons import get_person_for_user, link_person_to_topic


def _create_user_body(**over: object) -> dict[str, object]:
    body: dict[str, object] = {
        "username": "newcomer",
        "first_name": "New",
        "last_name": "Comer",
        "role": "reader",
        "initial_password": "secret123",
    }
    body.update(over)
    return body


def test_create_user_auto_creates_linked_person(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    _, admin_token = make_user(role=UserRole.Admin)
    resp = anon_client.post(
        "/api/admin/users", headers=auth_header(admin_token), json=_create_user_body()
    )
    assert resp.status_code == 201, resp.text
    user_id = uuid.UUID(resp.json()["id"])

    person = get_person_for_user(session, user_id)
    assert person is not None
    assert person.full_name == "New Comer"
    assert person.company == ""
    assert person.email is None


def test_create_user_links_existing_person(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    _, admin_token = make_user(role=UserRole.Admin)
    orphan = Person(full_name="Free Agent", company="Acme")
    session.add(orphan)
    session.commit()
    session.refresh(orphan)

    resp = anon_client.post(
        "/api/admin/users",
        headers=auth_header(admin_token),
        json=_create_user_body(person_id=str(orphan.id)),
    )
    assert resp.status_code == 201, resp.text
    user_id = uuid.UUID(resp.json()["id"])
    session.refresh(orphan)
    assert orphan.user_id == user_id
    # No duplicate profile was created.
    assert len(list(session.exec(select(Person).where(Person.user_id == user_id)).all())) == 1


def test_create_user_link_already_linked_person_409(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    existing_user, admin_token = make_user(role=UserRole.Admin)
    taken = Person(full_name="Taken Person", company="Acme", user_id=existing_user.id)
    session.add(taken)
    session.commit()

    resp = anon_client.post(
        "/api/admin/users",
        headers=auth_header(admin_token),
        json=_create_user_body(person_id=str(taken.id)),
    )
    assert resp.status_code == 409


def test_create_user_name_match_requires_choice(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    _, admin_token = make_user(role=UserRole.Admin)
    session.add(Person(full_name="New Comer", company="Acme"))
    session.commit()

    resp = anon_client.post(
        "/api/admin/users", headers=auth_header(admin_token), json=_create_user_body()
    )
    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert detail["reason"] == "person_match"
    assert any(c["full_name"] == "New Comer" for c in detail["candidates"])


def test_create_user_create_new_person_bypasses_match(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    _, admin_token = make_user(role=UserRole.Admin)
    session.add(Person(full_name="New Comer", company="Acme"))
    session.commit()

    resp = anon_client.post(
        "/api/admin/users",
        headers=auth_header(admin_token),
        json=_create_user_body(create_new_person=True),
    )
    assert resp.status_code == 201, resp.text
    user_id = uuid.UUID(resp.json()["id"])
    assert get_person_for_user(session, user_id) is not None


def test_person_candidates_endpoint_returns_unlinked_matches(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    _, admin_token = make_user(role=UserRole.Admin)
    session.add(Person(full_name="Jane Doe", company="Acme"))
    session.commit()

    resp = anon_client.get(
        "/api/admin/users/person-candidates",
        headers=auth_header(admin_token),
        params={"first_name": "Jane", "last_name": "Doe"},
    )
    assert resp.status_code == 200
    names = [p["full_name"] for p in resp.json()]
    assert "Jane Doe" in names


def test_me_profile_incomplete_flips_after_completion(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
) -> None:
    _, token = make_user(role=UserRole.Reader)
    assert (
        anon_client.get("/api/auth/me", headers=auth_header(token)).json()["profile_incomplete"]
        is True
    )

    patched = anon_client.patch(
        "/api/auth/me/profile",
        headers=auth_header(token),
        json={"company": "Acme", "email": "user@example.com"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["profile_incomplete"] is False
    assert (
        anon_client.get("/api/auth/me", headers=auth_header(token)).json()["profile_incomplete"]
        is False
    )


def test_delete_user_keep_appends_note_and_unlinks(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    _, admin_token = make_user(role=UserRole.Admin)
    victim, _ = make_user(role=UserRole.Writer)
    person = Person(full_name="V Writer", company="Acme", user_id=victim.id)
    session.add(person)
    session.commit()
    person_id = person.id

    resp = anon_client.request(
        "DELETE",
        f"/api/admin/users/{victim.id}",
        headers=auth_header(admin_token),
        json={"person_action": "keep", "note": "left the company"},
    )
    assert resp.status_code == 200, resp.text
    session.expire_all()
    kept = session.get(Person, person_id)
    assert kept is not None
    assert kept.user_id is None
    assert "left the company" in (kept.notes or "")


def test_delete_user_delete_person_blocked_by_topic_links(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    _, admin_token = make_user(role=UserRole.Admin)
    victim, _ = make_user(role=UserRole.Writer)
    person = Person(full_name="Linked Person", company="Acme", user_id=victim.id)
    session.add(person)
    session.commit()
    session.refresh(person)
    topic = Topic(id=uuid.uuid4(), canonical_name="Topic A", slug="topic-a")
    session.add(topic)
    session.commit()
    link_person_to_topic(session, topic.id, person.id, PersonLinkRole.Contact)

    blocked = anon_client.request(
        "DELETE",
        f"/api/admin/users/{victim.id}",
        headers=auth_header(admin_token),
        json={"person_action": "delete"},
    )
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["topic_link_count"] == 1


def test_delete_user_force_unlink_topics_deletes_person(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    _, admin_token = make_user(role=UserRole.Admin)
    victim, _ = make_user(role=UserRole.Writer)
    person = Person(full_name="Doomed Person", company="Acme", user_id=victim.id)
    session.add(person)
    session.commit()
    session.refresh(person)
    person_id = person.id
    topic = Topic(id=uuid.uuid4(), canonical_name="Topic B", slug="topic-b")
    session.add(topic)
    session.commit()
    link_person_to_topic(session, topic.id, person.id, PersonLinkRole.Contact)

    resp = anon_client.request(
        "DELETE",
        f"/api/admin/users/{victim.id}",
        headers=auth_header(admin_token),
        json={"person_action": "delete", "force_unlink_topics": True},
    )
    assert resp.status_code == 200, resp.text
    session.expire_all()
    assert session.get(Person, person_id) is None
    assert (
        len(
            list(
                session.exec(
                    select(TopicPersonLink).where(TopicPersonLink.person_id == person_id)
                ).all()
            )
        )
        == 0
    )


def test_user_linked_person_preview(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    _, admin_token = make_user(role=UserRole.Admin)
    victim, _ = make_user(role=UserRole.Writer)
    person = Person(full_name="Preview Person", company="Acme", user_id=victim.id)
    session.add(person)
    session.commit()

    resp = anon_client.get(f"/api/admin/users/{victim.id}/person", headers=auth_header(admin_token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["person"]["full_name"] == "Preview Person"
    assert body["topic_link_count"] == 0


def test_linking_a_second_person_to_same_user_409(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    target, admin_token = make_user(role=UserRole.Admin)
    first = Person(full_name="First", company="Acme", user_id=target.id)
    second = Person(full_name="Second", company="Acme")
    session.add(first)
    session.add(second)
    session.commit()
    session.refresh(second)

    resp = anon_client.patch(
        f"/api/manage/persons/{second.id}",
        headers=auth_header(admin_token),
        json={"user_id": str(target.id)},
    )
    assert resp.status_code == 409


def test_bootstrap_seed_creates_linked_person(session: Session, monkeypatch) -> None:
    from app.main import seed_bootstrap_admin

    monkeypatch.setenv("NODUS_BOOTSTRAP_ADMIN_USERNAME", "seedadmin")
    monkeypatch.setenv("NODUS_BOOTSTRAP_ADMIN_PASSWORD", "secret123")
    seed_bootstrap_admin(session)

    admin = session.exec(select(User).where(User.username == "seedadmin")).first()
    assert admin is not None
    assert get_person_for_user(session, admin.id) is not None


def test_self_profile_candidates_lists_matches(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    user, token = make_user(role=UserRole.Reader, first_name="Claim", last_name="Me")
    twin = Person(full_name="Claim Me", company="Acme")
    session.add(twin)
    session.commit()
    session.refresh(twin)

    resp = anon_client.get("/api/auth/me/profile/candidates", headers=auth_header(token))
    assert resp.status_code == 200
    assert any(c["id"] == str(twin.id) for c in resp.json())


def test_link_my_profile_replaces_blank_stub(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    user, token = make_user(role=UserRole.Reader, first_name="Stub", last_name="User")
    stub = Person(full_name="Stub User", company="", user_id=user.id)
    twin = Person(full_name="Stub User", company="Acme", email="s@u.com")
    session.add(stub)
    session.add(twin)
    session.commit()
    stub_id, twin_id = stub.id, twin.id

    resp = anon_client.post(
        "/api/auth/me/profile/link",
        headers=auth_header(token),
        json={"person_id": str(twin_id)},
    )
    assert resp.status_code == 200, resp.text
    session.expire_all()
    assert session.get(Person, stub_id) is None
    assert session.get(Person, twin_id).user_id == user.id


def test_link_my_profile_rejects_already_linked(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    user, token = make_user(role=UserRole.Reader, first_name="Claim", last_name="Two")
    other, _ = make_user(role=UserRole.Reader)
    taken = Person(full_name="Claim Two", company="Acme", user_id=other.id)
    session.add(taken)
    session.commit()

    resp = anon_client.post(
        "/api/auth/me/profile/link",
        headers=auth_header(token),
        json={"person_id": str(taken.id)},
    )
    assert resp.status_code == 409


def test_merge_endpoint_merges_and_deletes_source(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    _, admin_token = make_user(role=UserRole.Admin)
    source = Person(full_name="M1", company="Acme")
    target = Person(full_name="M2", company="Beta")
    session.add(source)
    session.add(target)
    session.commit()
    source_id, target_id = source.id, target.id

    resp = anon_client.post(
        f"/api/manage/persons/{source_id}/merge",
        headers=auth_header(admin_token),
        json={"target_id": str(target_id)},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["id"] == str(target_id)
    session.expire_all()
    assert session.get(Person, source_id) is None


def test_merge_endpoint_self_400(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    _, admin_token = make_user(role=UserRole.Admin)
    person = Person(full_name="Solo", company="X")
    session.add(person)
    session.commit()

    resp = anon_client.post(
        f"/api/manage/persons/{person.id}/merge",
        headers=auth_header(admin_token),
        json={"target_id": str(person.id)},
    )
    assert resp.status_code == 400


def test_merge_endpoint_both_linked_409(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    admin, admin_token = make_user(role=UserRole.Admin)
    other, _ = make_user(role=UserRole.Reader)
    p1 = Person(full_name="L", company="A", user_id=admin.id)
    p2 = Person(full_name="L", company="B", user_id=other.id)
    session.add(p1)
    session.add(p2)
    session.commit()

    resp = anon_client.post(
        f"/api/manage/persons/{p1.id}/merge",
        headers=auth_header(admin_token),
        json={"target_id": str(p2.id)},
    )
    assert resp.status_code == 409


def test_get_my_profile_adopts_existing_unlinked_record(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    """Regression: logging in adopts an account-less same-name record instead of
    creating a second, duplicate People profile."""
    user, token = make_user(role=UserRole.Reader, first_name="Existing", last_name="Person")
    twin = Person(full_name="Existing Person", company="Acme")
    session.add(twin)
    session.commit()
    twin_id = twin.id

    resp = anon_client.get("/api/auth/me/profile", headers=auth_header(token))
    assert resp.status_code == 200
    assert resp.json()["id"] == str(twin_id)  # adopted, not a fresh stub

    session.expire_all()
    assert session.get(Person, twin_id).user_id == user.id
    matches = session.exec(select(Person).where(Person.full_name == "Existing Person")).all()
    assert len(matches) == 1  # no duplicate created


def test_get_my_profile_creates_stub_when_no_match(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    """A genuinely new user (no matching record) gets a fresh blank profile to complete."""
    user, token = make_user(role=UserRole.Reader, first_name="Brand", last_name="New")

    resp = anon_client.get("/api/auth/me/profile", headers=auth_header(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["full_name"] == "Brand New"
    assert body["company"] == ""

    session.expire_all()
    linked = session.exec(select(Person).where(Person.user_id == user.id)).all()
    assert len(linked) == 1
