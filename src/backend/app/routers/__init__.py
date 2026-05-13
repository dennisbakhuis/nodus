from app.routers.api_keys import router as api_keys_router
from app.routers.auth import router as auth_router
from app.routers.auth_entra import router as auth_entra_router
from app.routers.backup import router as backup_router
from app.routers.cycles import router as cycles_router
from app.routers.initiatives import router as initiatives_router
from app.routers.media import router as media_router
from app.routers.movements import router as movements_router
from app.routers.parties import router as parties_router
from app.routers.peer_import import router as peer_import_router
from app.routers.peer_references import router as peer_references_router
from app.routers.persons import persons_router, topic_persons_router
from app.routers.radar import router as radar_router
from app.routers.registry import router as registry_router
from app.routers.relations import router as relations_router
from app.routers.segments import router as segments_router
from app.routers.settings import router as settings_router
from app.routers.users import router as users_router

__all__ = [
    "api_keys_router",
    "auth_entra_router",
    "auth_router",
    "backup_router",
    "cycles_router",
    "initiatives_router",
    "media_router",
    "movements_router",
    "parties_router",
    "peer_import_router",
    "peer_references_router",
    "persons_router",
    "radar_router",
    "registry_router",
    "relations_router",
    "segments_router",
    "settings_router",
    "topic_persons_router",
    "users_router",
]
