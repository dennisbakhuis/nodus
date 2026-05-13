"""POST /manage/import/peer-references — write or preview a peer-ref import."""

from fastapi import APIRouter, HTTPException, Query

from app.auth import WriterDep
from app.db import SessionDep
from app.schemas.peer_import import ImportSummary, PeerImportPayload
from app.services.peer_import import preview_import, run_import

router = APIRouter(prefix="/manage/import", tags=["management-peer-import"])


@router.post("/peer-references", response_model=ImportSummary)
def import_peer_references(
    payload: PeerImportPayload,
    session: SessionDep,
    _user: WriterDep,
    dry_run: bool = Query(default=False),
) -> ImportSummary:
    """Import (or preview) peer references from another Nodus instance.

    Parameters
    ----------
    payload : PeerImportPayload
        Exported peer-reference JSON from another Nodus instance.
    dry_run : bool
        When true, resolve and count what would happen without writing.

    Returns
    -------
    ImportSummary
        Counts of matched/unmatched topics and created/updated peer references.
    """
    try:
        if dry_run:
            return preview_import(session, payload)
        return run_import(session, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
