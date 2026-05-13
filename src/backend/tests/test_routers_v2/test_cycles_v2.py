"""Cycle CRUD router tests — v2.

Covers create (with color), PATCH name/color, name-uniqueness on rename,
and the open/closed permission split for editing cycle metadata.
"""

from collections.abc import Callable
from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models.cycle import Cycle
from app.models.user import User, UserRole


def _make_cycle(
    session: Session,
    *,
    name: str = "Q1 2026",
    start: date | None = None,
    end: date | None = None,
    color: str | None = None,
) -> Cycle:
    cycle = Cycle(
        name=name,
        start_date=start or date.today() - timedelta(days=30),
        end_date=end,
        color=color,
    )
    session.add(cycle)
    session.commit()
    session.refresh(cycle)
    return cycle


class TestCreateCycle:
    def test_create_with_color_persists(self, client: TestClient) -> None:
        resp = client.post(
            "/api/cycles",
            json={
                "name": "New Cycle",
                "start_date": date.today().isoformat(),
                "color": "rose",
            },
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["color"] == "rose"

    def test_create_without_color_defaults_null(self, client: TestClient) -> None:
        resp = client.post(
            "/api/cycles",
            json={
                "name": "No Color Cycle",
                "start_date": date.today().isoformat(),
            },
        )
        assert resp.status_code == 201
        assert resp.json()["color"] is None


class TestOneOpenCycle:
    def test_second_open_cycle_returns_409(self, client: TestClient) -> None:
        first = client.post(
            "/api/cycles",
            json={"name": "First Open", "start_date": date.today().isoformat()},
        )
        assert first.status_code == 201, first.text

        second = client.post(
            "/api/cycles",
            json={"name": "Second Open", "start_date": date.today().isoformat()},
        )
        assert second.status_code == 409
        assert "open" in second.json()["detail"].lower()

    def test_can_create_cycle_after_closing_previous(
        self, client: TestClient, session: Session
    ) -> None:
        first = _make_cycle(session, name="To Be Closed")
        close_resp = client.post(f"/api/cycles/{first.id}/close", json={})
        assert close_resp.status_code == 200, close_resp.text

        second = client.post(
            "/api/cycles",
            json={"name": "Fresh Open", "start_date": date.today().isoformat()},
        )
        assert second.status_code == 201, second.text

    def test_create_with_end_date_does_not_count_as_open(self, client: TestClient) -> None:
        first = client.post(
            "/api/cycles",
            json={"name": "Live Open", "start_date": date.today().isoformat()},
        )
        assert first.status_code == 201

        backdated = client.post(
            "/api/cycles",
            json={
                "name": "Backfill Closed",
                "start_date": (date.today() - timedelta(days=90)).isoformat(),
                "end_date": (date.today() - timedelta(days=30)).isoformat(),
            },
        )
        assert backdated.status_code == 201, backdated.text

    def test_db_constraint_blocks_direct_duplicate_open(self, session: Session) -> None:
        """Sanity check: the partial unique index rejects two open cycles even
        if someone bypasses the route and inserts via the session directly."""
        from sqlalchemy.exc import IntegrityError

        _make_cycle(session, name="DB Open A")
        try:
            _make_cycle(session, name="DB Open B")
        except IntegrityError:
            session.rollback()
            return
        # If we reach here, there's a regression: the DB allowed two opens.
        raise AssertionError("Expected IntegrityError on second open cycle")


class TestPatchCycle:
    def test_patch_updates_name_and_color(self, client: TestClient, session: Session) -> None:
        cycle = _make_cycle(session, name="Original")
        resp = client.patch(
            f"/api/cycles/{cycle.id}",
            json={"name": "Renamed", "color": "violet"},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["name"] == "Renamed"
        assert body["color"] == "violet"

    def test_patch_unknown_returns_404(self, client: TestClient) -> None:
        import uuid

        resp = client.patch(f"/api/cycles/{uuid.uuid4()}", json={"color": "amber"})
        assert resp.status_code == 404

    def test_patch_duplicate_name_returns_409(self, client: TestClient, session: Session) -> None:
        _make_cycle(
            session,
            name="Alpha",
            start=date.today() - timedelta(days=90),
            end=date.today() - timedelta(days=30),
        )
        target = _make_cycle(session, name="Beta")
        resp = client.patch(f"/api/cycles/{target.id}", json={"name": "Alpha"})
        assert resp.status_code == 409

    def test_patch_to_same_name_is_no_op(self, client: TestClient, session: Session) -> None:
        cycle = _make_cycle(session, name="Same")
        resp = client.patch(f"/api/cycles/{cycle.id}", json={"name": "Same", "color": "gold"})
        assert resp.status_code == 200
        assert resp.json()["color"] == "gold"

    def test_writer_cannot_patch_closed_cycle(
        self,
        anon_client: TestClient,
        session: Session,
        make_user: Callable[..., tuple[User, str]],
        auth_header: Callable[[str], dict[str, str]],
    ) -> None:
        """Closed cycles are admin-only for metadata edits."""
        closed = _make_cycle(
            session,
            name="Closed",
            start=date.today() - timedelta(days=90),
            end=date.today() - timedelta(days=1),
        )
        _, token = make_user(role=UserRole.Writer)
        resp = anon_client.patch(
            f"/api/cycles/{closed.id}",
            json={"color": "teal"},
            headers=auth_header(token),
        )
        assert resp.status_code == 403

    def test_admin_can_patch_closed_cycle(
        self,
        anon_client: TestClient,
        session: Session,
        make_user: Callable[..., tuple[User, str]],
        auth_header: Callable[[str], dict[str, str]],
    ) -> None:
        closed = _make_cycle(
            session,
            name="ClosedAdmin",
            start=date.today() - timedelta(days=90),
            end=date.today() - timedelta(days=1),
        )
        _, token = make_user(role=UserRole.Admin)
        resp = anon_client.patch(
            f"/api/cycles/{closed.id}",
            json={"color": "teal"},
            headers=auth_header(token),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["color"] == "teal"

    def test_writer_can_patch_open_cycle(
        self,
        anon_client: TestClient,
        session: Session,
        make_user: Callable[..., tuple[User, str]],
        auth_header: Callable[[str], dict[str, str]],
    ) -> None:
        open_cycle = _make_cycle(session, name="Open")
        _, token = make_user(role=UserRole.Writer)
        resp = anon_client.patch(
            f"/api/cycles/{open_cycle.id}",
            json={"color": "green"},
            headers=auth_header(token),
        )
        assert resp.status_code == 200
        assert resp.json()["color"] == "green"


class TestRadarCurrentIncludesColor:
    def test_current_radar_includes_cycle_color(self, client: TestClient, session: Session) -> None:
        _make_cycle(session, name="ColorCycle", color="amber")
        resp = client.get("/api/radar/current")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["cycle"]["color"] == "amber"
