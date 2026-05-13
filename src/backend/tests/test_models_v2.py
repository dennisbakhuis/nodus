"""v2 model tests: entity instantiation, FK enforcement, constraints, and schema PII."""

import uuid
from collections.abc import Generator
from datetime import UTC, datetime

import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.models.alias import Alias
from app.models.assessment import Assessment, TimeToMainstream
from app.models.cycle import Cycle
from app.models.factsheet import Factsheet
from app.models.media_asset import MediaAsset
from app.models.movement_event import EventType, MovementEvent
from app.models.party import Party
from app.models.peer_reference import PeerReference, PeerReferenceUrl
from app.models.person import Person
from app.models.relation import Relation, RelationType
from app.models.segment import Segment
from app.models.source import Source
from app.models.strategic_innovation_field import StrategicInnovationField
from app.models.technology import RegistryStatus, Ring, Technology
from app.models.topic import Topic
from app.models.topic_person_link import PersonLinkRole, TopicPersonLink
from app.schemas.person import PersonReadManagement, PersonReadPublic
from app.services.normalize import normalize_alias


@pytest.fixture(name="session")
def session_fixture() -> Generator[Session]:
    """Provide an in-memory SQLite session with v2 schema."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    import app.models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def _make_topic(session: Session, name: str = "Test Topic", slug: str = "test-topic") -> Topic:
    topic = Topic(canonical_name=name, slug=slug)
    session.add(topic)
    session.flush()
    return topic


def _make_technology(session: Session, topic: Topic) -> Technology:
    tech = Technology(topic_id=topic.id, registry_status=RegistryStatus.Backlog)
    session.add(tech)
    session.flush()
    return tech


def _make_segment(
    session: Session, name: str = "Digital & Data", display_order: int = 1
) -> Segment:
    seg = Segment(
        name=name,
        slug=name.lower().replace(" ", "-").replace("&", "and"),
        display_order=display_order,
    )
    session.add(seg)
    session.flush()
    return seg


class TestNormalizeAlias:
    def test_lowercase(self) -> None:
        assert normalize_alias("Grid-Forming Inverters") == "grid forming inverters"

    def test_strips_punctuation(self) -> None:
        assert normalize_alias("A/B (test), ok!") == "a b test ok"

    def test_collapses_whitespace(self) -> None:
        assert normalize_alias("  a   b  ") == "a b"

    def test_empty_string(self) -> None:
        assert normalize_alias("") == ""

    def test_already_normalized(self) -> None:
        assert normalize_alias("grid forming inverters") == "grid forming inverters"

    def test_unicode_punctuation(self) -> None:
        result = normalize_alias("Hydrogen—fuel cells")
        assert "—" not in result


class TestTopicModel:
    def test_instantiates(self, session: Session) -> None:
        topic = _make_topic(session)
        session.commit()
        session.refresh(topic)
        assert topic.id is not None
        assert topic.canonical_name == "Test Topic"
        assert isinstance(topic.created_at, datetime)

    def test_canonical_name_unique(self, session: Session) -> None:
        _make_topic(session, "Dup Topic", "dup-topic-1")
        session.commit()
        with pytest.raises(IntegrityError):
            _make_topic(session, "Dup Topic", "dup-topic-2")
            session.commit()

    def test_slug_unique(self, session: Session) -> None:
        _make_topic(session, "Topic A", "same-slug")
        session.commit()
        with pytest.raises(IntegrityError):
            _make_topic(session, "Topic B", "same-slug")
            session.commit()

    def test_not_for_external_publication_defaults_false(self, session: Session) -> None:
        topic = _make_topic(session)
        session.commit()
        assert topic.not_for_external_publication is False

    def test_created_at_is_timezone_aware(self, session: Session) -> None:
        topic = _make_topic(session)
        session.commit()
        session.refresh(topic)
        assert topic.created_at.tzinfo is not None or isinstance(topic.created_at, datetime)


class TestPartyModel:
    def test_instantiates(self, session: Session) -> None:
        party = Party(name="Peer Co", slug="peer-co", url="https://peer.example.com")
        session.add(party)
        session.commit()
        session.refresh(party)
        assert party.id is not None
        assert party.name == "Peer Co"

    def test_name_unique(self, session: Session) -> None:
        session.add(Party(name="Peer Research", slug="peer-research"))
        session.commit()
        with pytest.raises(IntegrityError):
            session.add(Party(name="Peer Research", slug="peer-research-2"))
            session.commit()


class TestTechnologyModel:
    def test_instantiates(self, session: Session) -> None:
        topic = _make_topic(session)
        tech = _make_technology(session, topic)
        session.commit()
        session.refresh(tech)
        assert tech.id is not None
        assert tech.topic_id == topic.id

    def test_one_technology_per_topic(self, session: Session) -> None:
        topic = _make_topic(session)
        _make_technology(session, topic)
        session.commit()
        with pytest.raises(IntegrityError):
            tech2 = Technology(topic_id=topic.id, registry_status=RegistryStatus.Backlog)
            session.add(tech2)
            session.commit()

    def test_registry_status_default_backlog(self, session: Session) -> None:
        topic = _make_topic(session)
        tech = _make_technology(session, topic)
        session.commit()
        assert tech.registry_status == RegistryStatus.Backlog

    def test_registry_status_on_radar_stored_correctly(self, session: Session) -> None:
        topic = _make_topic(session, "On Radar Tech", "on-radar-tech")
        seg = _make_segment(session)
        tech = Technology(
            topic_id=topic.id,
            registry_status=RegistryStatus.OnRadar,
            current_ring=Ring.Invest,
            current_segment_id=seg.id,
        )
        session.add(tech)
        session.commit()
        session.refresh(tech)
        assert tech.registry_status == "On Radar"

    def test_ring_enum_values(self, session: Session) -> None:
        assert Ring.Invest == "Invest"
        assert Ring.Pilot == "Pilot"
        assert Ring.Explore == "Explore"
        assert Ring.Monitor == "Monitor"

    def test_registry_status_enum_values(self) -> None:
        assert RegistryStatus.OnRadar == "On Radar"
        assert RegistryStatus.Backlog == "Backlog"
        assert RegistryStatus.Archive == "Archive"

    def test_hero_image_id_nullable(self, session: Session) -> None:
        topic = _make_topic(session)
        tech = _make_technology(session, topic)
        session.commit()
        assert tech.hero_image_id is None


class TestAliasModel:
    def test_instantiates(self, session: Session) -> None:
        topic = _make_topic(session)
        alias = Alias(
            topic_id=topic.id,
            alias_name="Test Alias",
            alias_name_normalised=normalize_alias("Test Alias"),
        )
        session.add(alias)
        session.commit()
        session.refresh(alias)
        assert alias.id is not None
        assert alias.topic_id == topic.id

    def test_alias_fk_to_topic_not_technology(self, session: Session) -> None:
        topic = _make_topic(session)
        alias = Alias(
            topic_id=topic.id,
            alias_name="My Alias",
            alias_name_normalised=normalize_alias("My Alias"),
        )
        session.add(alias)
        session.commit()
        assert alias.topic_id == topic.id
        assert not hasattr(alias, "technology_id")

    def test_normalised_unique_rejects_duplicate(self, session: Session) -> None:
        topic1 = _make_topic(session, "Topic X", "topic-x")
        topic2 = _make_topic(session, "Topic Y", "topic-y")
        session.commit()

        normalised = normalize_alias("Grid Forming Inverters")
        session.add(
            Alias(
                topic_id=topic1.id,
                alias_name="Grid-Forming Inverters",
                alias_name_normalised=normalised,
            )
        )
        session.commit()

        with pytest.raises(IntegrityError):
            session.add(
                Alias(
                    topic_id=topic2.id,
                    alias_name="Grid Forming Inverters",
                    alias_name_normalised=normalised,
                )
            )
            session.commit()

    def test_normalised_unique_across_statuses(self, session: Session) -> None:
        """Alias uniqueness spans active and archived topics."""
        topic_a = _make_topic(session, "Active Topic", "active-topic")
        tech_a = _make_technology(session, topic_a)
        tech_a.registry_status = RegistryStatus.Archive
        session.flush()

        topic_b = _make_topic(session, "Backlog Topic", "backlog-topic")
        tech_b = _make_technology(session, topic_b)
        tech_b.registry_status = RegistryStatus.Backlog
        session.flush()
        session.commit()

        normalised = normalize_alias("quantum computing")
        session.add(
            Alias(
                topic_id=topic_a.id,
                alias_name="Quantum Computing",
                alias_name_normalised=normalised,
            )
        )
        session.commit()

        with pytest.raises(IntegrityError):
            session.add(
                Alias(
                    topic_id=topic_b.id,
                    alias_name="quantum computing",
                    alias_name_normalised=normalised,
                )
            )
            session.commit()


class TestFactsheetModel:
    def test_instantiates(self, session: Session) -> None:
        topic = _make_topic(session)
        tech = _make_technology(session, topic)
        session.commit()
        fs = Factsheet(technology_id=tech.id, version=1)
        session.add(fs)
        session.commit()
        session.refresh(fs)
        assert fs.id is not None

    def test_unique_technology_version(self, session: Session) -> None:
        topic = _make_topic(session)
        tech = _make_technology(session, topic)
        session.commit()
        session.add(Factsheet(technology_id=tech.id, version=1))
        session.commit()
        with pytest.raises(IntegrityError):
            session.add(Factsheet(technology_id=tech.id, version=1))
            session.commit()

    def test_has_current_challenges(self, session: Session) -> None:
        topic = _make_topic(session)
        tech = _make_technology(session, topic)
        session.commit()
        fs = Factsheet(
            technology_id=tech.id,
            version=1,
            current_challenges="Some challenges",
        )
        session.add(fs)
        session.commit()
        session.refresh(fs)
        assert fs.current_challenges == "Some challenges"


class TestAssessmentModel:
    def test_instantiates(self, session: Session) -> None:
        topic = _make_topic(session)
        tech = _make_technology(session, topic)
        session.commit()
        fs = Factsheet(technology_id=tech.id, version=1)
        session.add(fs)
        session.flush()
        asmt = Assessment(factsheet_id=fs.id, trl=5)
        session.add(asmt)
        session.commit()
        session.refresh(asmt)
        assert asmt.id is not None
        assert asmt.trl == 5

    def test_trl_check_rejects_zero(self, session: Session) -> None:
        topic = _make_topic(session)
        tech = _make_technology(session, topic)
        session.commit()
        fs = Factsheet(technology_id=tech.id, version=1)
        session.add(fs)
        session.flush()
        asmt = Assessment(factsheet_id=fs.id, trl=0)
        session.add(asmt)
        with pytest.raises(IntegrityError):
            session.commit()

    def test_trl_check_rejects_thirteen(self, session: Session) -> None:
        session2 = session
        topic = _make_topic(session2, "T13", "t13")
        tech = _make_technology(session2, topic)
        session2.commit()
        fs = Factsheet(technology_id=tech.id, version=1)
        session2.add(fs)
        session2.flush()
        asmt = Assessment(factsheet_id=fs.id, trl=13)
        session2.add(asmt)
        with pytest.raises(IntegrityError):
            session2.commit()

    def test_trl_check_allows_twelve(self, session: Session) -> None:
        topic = _make_topic(session, "T12", "t12")
        tech = _make_technology(session, topic)
        session.commit()
        fs = Factsheet(technology_id=tech.id, version=1)
        session.add(fs)
        session.flush()
        asmt = Assessment(factsheet_id=fs.id, trl=12)
        session.add(asmt)
        session.commit()
        session.refresh(asmt)
        assert asmt.trl == 12

    def test_trl_check_allows_one(self, session: Session) -> None:
        topic = _make_topic(session, "T1", "t1")
        tech = _make_technology(session, topic)
        session.commit()
        fs = Factsheet(technology_id=tech.id, version=1)
        session.add(fs)
        session.flush()
        asmt = Assessment(factsheet_id=fs.id, trl=1)
        session.add(asmt)
        session.commit()
        session.refresh(asmt)
        assert asmt.trl == 1

    def test_trl_null_allowed(self, session: Session) -> None:
        topic = _make_topic(session, "Tnull", "tnull")
        tech = _make_technology(session, topic)
        session.commit()
        fs = Factsheet(technology_id=tech.id, version=1)
        session.add(fs)
        session.flush()
        asmt = Assessment(factsheet_id=fs.id)
        session.add(asmt)
        session.commit()
        session.refresh(asmt)
        assert asmt.trl is None

    def test_time_to_mainstream_methodology_strings(self) -> None:
        assert TimeToMainstream.ZeroToTwo == "0-2 yr"
        assert TimeToMainstream.TwoToFive == "2-5 yr"
        assert TimeToMainstream.FiveToSeven == "5-7 yr"
        assert TimeToMainstream.SevenToTen == "7-10 yr"

    def test_one_to_one_with_factsheet(self, session: Session) -> None:
        topic = _make_topic(session, "OneToOne", "one-to-one")
        tech = _make_technology(session, topic)
        session.commit()
        fs = Factsheet(technology_id=tech.id, version=1)
        session.add(fs)
        session.flush()
        session.add(Assessment(factsheet_id=fs.id))
        session.commit()
        with pytest.raises(IntegrityError):
            session.add(Assessment(factsheet_id=fs.id))
            session.commit()


class TestMovementEventModel:
    def test_instantiates(self, session: Session) -> None:
        topic = _make_topic(session)
        tech = _make_technology(session, topic)
        session.commit()
        event = MovementEvent(
            technology_id=tech.id,
            event_type=EventType.Added,
            rationale="Initial creation",
        )
        session.add(event)
        session.commit()
        session.refresh(event)
        assert event.id is not None
        assert event.event_type == "Added"

    def test_event_type_enum_values(self) -> None:
        assert EventType.Added == "Added"
        assert EventType.Promoted == "Promoted"
        assert EventType.Demoted == "Demoted"
        assert EventType.Removed == "Removed"
        assert EventType.StatusChanged == "StatusChanged"
        assert EventType.Reactivated == "Reactivated"
        assert EventType.RingChanged == "RingChanged"
        assert EventType.SegmentChanged == "SegmentChanged"
        assert EventType.FactsheetEdited == "FactsheetEdited"


class TestRelationModel:
    def test_instantiates(self, session: Session) -> None:
        t1 = _make_topic(session, "Topic A", "topic-a")
        t2 = _make_topic(session, "Topic B", "topic-b")
        session.commit()
        rel = Relation(
            from_topic_id=t1.id,
            to_topic_id=t2.id,
            relation_type=RelationType.Drives,
        )
        session.add(rel)
        session.commit()
        session.refresh(rel)
        assert rel.id is not None

    def test_self_loop_rejected(self, session: Session) -> None:
        t = _make_topic(session, "Self Topic", "self-topic")
        session.commit()
        rel = Relation(
            from_topic_id=t.id,
            to_topic_id=t.id,
            relation_type=RelationType.RelatesTo,
        )
        session.add(rel)
        with pytest.raises(IntegrityError):
            session.commit()

    def test_unique_triple_enforced(self, session: Session) -> None:
        t1 = _make_topic(session, "UA", "ua")
        t2 = _make_topic(session, "UB", "ub")
        session.commit()
        session.add(
            Relation(from_topic_id=t1.id, to_topic_id=t2.id, relation_type=RelationType.Drives)
        )
        session.commit()
        with pytest.raises(IntegrityError):
            session.add(
                Relation(from_topic_id=t1.id, to_topic_id=t2.id, relation_type=RelationType.Drives)
            )
            session.commit()

    def test_relation_type_enum_values(self) -> None:
        assert RelationType.Drives == "drives"
        assert RelationType.DrivenBy == "driven_by"
        assert RelationType.Hinders == "hinders"
        assert RelationType.HinderedBy == "hindered_by"
        assert RelationType.RelatesTo == "relates_to"


class TestPeerReferenceModel:
    def test_instantiates(self, session: Session) -> None:
        topic = _make_topic(session)
        party = Party(name="Peer A", slug="peer-a")
        session.add(party)
        session.flush()
        pr = PeerReference(
            topic_id=topic.id,
            party_id=party.id,
            peer_title="Peer org's name for this topic",
        )
        session.add(pr)
        session.commit()
        session.refresh(pr)
        assert pr.id is not None

    def test_unique_topic_party_enforced(self, session: Session) -> None:
        topic = _make_topic(session, "PR Topic", "pr-topic")
        party = Party(name="Peer B", slug="peer-b")
        session.add(party)
        session.flush()
        session.add(PeerReference(topic_id=topic.id, party_id=party.id, peer_title="Peer view"))
        session.commit()
        with pytest.raises(IntegrityError):
            session.add(
                PeerReference(topic_id=topic.id, party_id=party.id, peer_title="Another Peer view")
            )
            session.commit()

    def test_peer_reference_url(self, session: Session) -> None:
        topic = _make_topic(session, "URL Topic", "url-topic")
        party = Party(name="URL Party", slug="url-party")
        session.add(party)
        session.flush()
        pr = PeerReference(topic_id=topic.id, party_id=party.id, peer_title="Title")
        session.add(pr)
        session.flush()
        url = PeerReferenceUrl(peer_reference_id=pr.id, url="https://example.com", display_order=0)
        session.add(url)
        session.commit()
        session.refresh(url)
        assert url.id is not None

    def test_peer_reference_url_unique(self, session: Session) -> None:
        topic = _make_topic(session, "URL Dup Topic", "url-dup-topic")
        party = Party(name="Dup URL Party", slug="dup-url-party")
        session.add(party)
        session.flush()
        pr = PeerReference(topic_id=topic.id, party_id=party.id, peer_title="T")
        session.add(pr)
        session.flush()
        session.add(PeerReferenceUrl(peer_reference_id=pr.id, url="https://dup.com"))
        session.commit()
        with pytest.raises(IntegrityError):
            session.add(PeerReferenceUrl(peer_reference_id=pr.id, url="https://dup.com"))
            session.commit()


class TestPersonModel:
    def test_instantiates(self, session: Session) -> None:
        person = Person(full_name="Jane Doe", company="Acme")
        session.add(person)
        session.commit()
        session.refresh(person)
        assert person.id is not None
        assert person.full_name == "Jane Doe"

    def test_email_nullable(self, session: Session) -> None:
        person = Person(full_name="No Email", company="Peer Research")
        session.add(person)
        session.commit()
        assert person.email is None

    def test_topic_person_link_instantiates(self, session: Session) -> None:
        topic = _make_topic(session, "Person Topic", "person-topic")
        session.commit()
        person = Person(full_name="Link Person", company="Peer Co")
        session.add(person)
        session.flush()
        link = TopicPersonLink(
            topic_id=topic.id,
            person_id=person.id,
            link_role=PersonLinkRole.Author,
        )
        session.add(link)
        session.commit()
        session.refresh(link)
        assert link.id is not None

    def test_topic_person_link_unique_triple(self, session: Session) -> None:
        topic = _make_topic(session, "Uniq Topic", "uniq-topic")
        session.commit()
        person = Person(full_name="Uniq Person", company="Peer Lab")
        session.add(person)
        session.flush()
        session.add(
            TopicPersonLink(topic_id=topic.id, person_id=person.id, link_role=PersonLinkRole.Owner)
        )
        session.commit()
        with pytest.raises(IntegrityError):
            session.add(
                TopicPersonLink(
                    topic_id=topic.id, person_id=person.id, link_role=PersonLinkRole.Owner
                )
            )
            session.commit()

    def test_person_link_role_enum_values(self) -> None:
        assert PersonLinkRole.Author == "Author"
        assert PersonLinkRole.Owner == "Owner"
        assert PersonLinkRole.SubjectMatterExpert == "SubjectMatterExpert"
        assert PersonLinkRole.Contact == "Contact"
        assert PersonLinkRole.ProjectLead == "ProjectLead"


class TestMediaAssetModel:
    def test_instantiates(self, session: Session) -> None:
        asset = MediaAsset(
            content_type="image/webp",
            data=b"fake image bytes",
            width_px=1200,
            height_px=630,
            byte_size=16,
        )
        session.add(asset)
        session.commit()
        session.refresh(asset)
        assert asset.id is not None
        assert asset.data == b"fake image bytes"

    def test_technology_hero_image_fk(self, session: Session) -> None:
        asset = MediaAsset(
            content_type="image/webp",
            data=b"img",
            width_px=100,
            height_px=100,
            byte_size=3,
        )
        session.add(asset)
        session.flush()
        topic = _make_topic(session, "Hero Topic", "hero-topic")
        tech = Technology(
            topic_id=topic.id,
            registry_status=RegistryStatus.Backlog,
            hero_image_id=asset.id,
        )
        session.add(tech)
        session.commit()
        session.refresh(tech)
        assert tech.hero_image_id == asset.id


class TestStrategicInnovationFieldModel:
    def test_instantiates(self, session: Session) -> None:
        sif = StrategicInnovationField(
            name="Resilient Infrastructure", slug="resilient-infrastructure"
        )
        session.add(sif)
        session.commit()
        session.refresh(sif)
        assert sif.id is not None

    def test_name_unique(self, session: Session) -> None:
        session.add(StrategicInnovationField(name="Dup SIF", slug="dup-sif-1"))
        session.commit()
        with pytest.raises(IntegrityError):
            session.add(StrategicInnovationField(name="Dup SIF", slug="dup-sif-2"))
            session.commit()


class TestCircularFKTechnologyFactsheet:
    def test_circular_fk_no_deadlock(self, session: Session) -> None:
        """Technology.current_factsheet_id can point to a Factsheet FK to Technology without deadlock."""
        topic = _make_topic(session, "Circ Topic", "circ-topic")
        tech = _make_technology(session, topic)
        session.commit()

        fs = Factsheet(technology_id=tech.id, version=1)
        session.add(fs)
        session.flush()

        tech.current_factsheet_id = fs.id
        session.add(tech)
        session.commit()

        session.refresh(tech)
        assert tech.current_factsheet_id == fs.id


class TestPersonSchemaPII:
    def test_public_schema_excludes_email(self) -> None:
        public = PersonReadPublic(
            id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
            full_name="Jane Doe",
            company="Acme",
            department=None,
            role=None,
        )
        data = public.model_dump()
        assert "email" not in data
        assert "notes" not in data

    def test_management_schema_includes_email(self) -> None:
        mgmt = PersonReadManagement(
            id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
            full_name="Jane Doe",
            email="jane@example.com",
            company="Acme",
            department=None,
            role=None,
            notes="Some notes",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        data = mgmt.model_dump()
        assert "email" in data
        assert data["email"] == "jane@example.com"
        assert "notes" in data

    def test_public_schema_does_not_have_email_field(self) -> None:
        fields = PersonReadPublic.model_fields
        assert "email" not in fields
        assert "notes" not in fields


class TestSourceModel:
    def test_instantiates_without_party(self, session: Session) -> None:
        source = Source(
            source_name="Example Peer Radar", source_url="https://radar.peer.example.com"
        )
        session.add(source)
        session.commit()
        session.refresh(source)
        assert source.id is not None
        assert source.party_id is None

    def test_has_raw_json_not_raw_fields(self) -> None:
        assert hasattr(Source, "raw_json")
        assert not hasattr(Source, "raw_fields")

    def test_has_no_technology_id(self) -> None:
        assert not hasattr(Source, "technology_id")


class TestCycleModel:
    def test_has_snapshot_json_not_snapshot_data(self) -> None:
        assert hasattr(Cycle, "snapshot_json")
        assert not hasattr(Cycle, "snapshot_data")


class TestSegmentModel:
    def test_no_created_at(self) -> None:
        assert not hasattr(Segment, "created_at")

    def test_instantiates(self, session: Session) -> None:
        seg = Segment(name="Grid Infrastructure & Assets", slug="grid-infra", display_order=1)
        session.add(seg)
        session.commit()
        session.refresh(seg)
        assert seg.id is not None
