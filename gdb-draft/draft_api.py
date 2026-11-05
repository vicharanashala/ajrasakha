"""HTTP service for the GDB Cleaning "Draft from library" button.

POST /draft  {"question": "..."}  ->  {"answer", "citations", "note"}
GET /documents/{documentId}/pdf  ->  the PDF a citation points to

Searches the translated POP documents (local_index.py), then drafts the answer from the
passages it finds. With POP_API_URL and DRAFT_SYNC_MINUTES set, the service also keeps the
documents up to date itself (sync_library.py), starting when it starts.
Set GDB_DRAFT_TOKEN and the backend sends it in the x-draft-token header; without
it, the service is open, so only leave it unset on a private network.

Run: uvicorn draft_api:app --host 0.0.0.0 --port 8013
"""

from __future__ import annotations

import hmac
import logging
import os
import threading
from contextlib import asynccontextmanager
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

import local_index
import anara_agent
import anara_drafter
import anara_search
import anara_sources
import record_sources
from anara_drafter import draft_answer
import library_files
from library_files import pdf_path_for_document

load_dotenv()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Start the document sync in the background, so the first questions are not held up by it."""
    url = os.getenv("POP_API_URL", "")
    minutes = int(os.getenv("DRAFT_SYNC_MINUTES", "0") or 0)
    if url and minutes > 0:
        from sync_library import sync_forever

        threading.Thread(target=sync_forever, args=(url, minutes), name="library-sync", daemon=True).start()
    if os.getenv("DRAFT_PREFETCH", "").strip() == "1":
        threading.Thread(target=library_files.prefetch_english, name="library-preload", daemon=True).start()
    # the deployment sets ANARA_KEEPALIVE_HOURS so the Anara sign-in is renewed even when nobody drafts
    hours = float(os.getenv("ANARA_KEEPALIVE_HOURS", "0") or 0)
    if hours > 0 and anara_search.enabled():
        threading.Thread(target=anara_search.keepalive, args=(hours,), name="anara-keepalive", daemon=True).start()
    yield


app = FastAPI(title="GDB library draft", lifespan=lifespan)


class SourceRef(BaseModel):
    url: str = Field(max_length=2000)
    name: str = Field(default="", max_length=300)


class DraftRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    # the crop of the record, when known: the search then looks only at documents of that crop
    crop: str | None = Field(default=None, max_length=200)
    # the state of the record: its own state's documents and the national ones are searched first
    state: str | None = Field(default=None, max_length=200)
    # the domain of the record (e.g. "Disease Management"): the answer follows that domain's outline
    domain: str | None = Field(default=None, max_length=200)
    # the files attached to the record as its sources; their text is searched before the library
    sources: list[SourceRef] = Field(default_factory=list, max_length=10)


class Passages(list):
    """The passages of a library search; `fallback` is True when Anara could not be used."""

    fallback = False


MAX_SOURCE_PASSAGES = 4
# a new record file is uploaded and read by Anara first; a draft does not wait longer than this for it
ANARA_SOURCES_SECONDS = 100


def search_library(question: str, crop: str | None = None, state: str | None = None) -> list[dict[str, Any]]:
    """Passages from the Anara library; if Anara cannot be used, from the documents on this machine."""
    hits = anara_search.search(question, crop, state)
    if hits is not None:
        return Passages(hits)
    local = Passages(local_index.search_library(question, crop))
    local.fallback = True  # the draft tells the reviewer, even when this search found nothing
    return local


def record_source_passages(
    question: str, sources: list[dict[str, str]], crop: str | None
) -> tuple[list[dict[str, Any]], list[str]]:
    """Passages from the record's own files: through Anara where it can take them, else from the PDF itself."""
    found: list[dict[str, Any]] = []
    handled: set[str] = set()
    problems: list[str] = []
    if anara_search.enabled():
        try:
            found, handled, problems = anara_search.within(ANARA_SOURCES_SECONDS, anara_sources.search, question, sources, crop)
        except Exception:
            logger.exception("Anara could not search the record's files in time; their PDFs are read directly")
    rest = [s for s in sources if (record_sources.parse_link(s["url"]) or (None, None))[1] not in handled]
    own, own_problems = record_sources.search_sources(question, rest, crop) if rest else ([], [])
    return found + own, problems + own_problems


def agent_research(request: "DraftRequest", from_sources: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Anara's own agent researches the question, as in its web chat. None when it is off or cannot be used,
    and the plain library search is used instead (DRAFT_ENGINE=search turns the agent off)."""
    if os.getenv("DRAFT_ENGINE", "agent").strip().lower() == "search" or not anara_search.enabled():
        return None
    names = list(dict.fromkeys(str(p.get("documentName")) for p in from_sources if p.get("documentName")))
    return anara_agent.research(request.question, request.crop, request.state, request.domain, names)


def _pdf_path(document_id: str):
    return (
        pdf_path_for_document(document_id)
        or local_index.pdf_path_for_document(document_id)
        or record_sources.pdf_path_for_document(document_id)
    )


def _check_token(supplied: str | None) -> None:
    expected = os.getenv("GDB_DRAFT_TOKEN", "")
    if expected and not hmac.compare_digest(supplied or "", expected):
        raise HTTPException(status_code=401, detail="Invalid draft token")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/status")
def status(x_draft_token: str | None = Header(default=None)) -> dict[str, Any]:
    """Why a draft or an Open might be failing: whether Anara works, and how much of the library can be opened."""
    _check_token(x_draft_token)
    return {
        "anara": anara_search.check(),
        "library": {
            "documents": len(library_files.load_manifest()),
            "openable": len(library_files.openable_document_ids()),
            "englishPreload": dict(library_files.PREFETCH_STATE),
        },
    }


# a plain def, so FastAPI runs it in a worker thread and the blocking search and model calls
# do not stall other requests
@app.post("/draft")
def draft(request: DraftRequest, x_draft_token: str | None = Header(default=None)) -> dict[str, Any]:
    _check_token(x_draft_token)
    try:
        from_sources, problems = record_source_passages(
            request.question, [source.model_dump() for source in request.sources], request.crop
        )
        # the model reads only the first few passages, so the record's files cannot fill them all
        from_sources = from_sources[:MAX_SOURCE_PASSAGES]
        taken = {passage.get("passageId") for passage in from_sources}
        problems = list(dict.fromkeys(problems))  # the same file can be reported by two searches
        notes = ""
        researched = agent_research(request, from_sources)
        if researched is not None:
            library = Passages(researched["passages"])
            passages = from_sources + [p for p in library if p.get("passageId") not in taken]
            if not passages:  # the agent looked and found nothing: its own explanation is the best note
                reason = anara_agent.plain_notes(researched["notes"]) or "The library has nothing for this question."
                return {"answer": "", "citations": [], "note": " ".join([reason[:900]] + (["Source files not used: " + "; ".join(problems) + "."] if problems else []))}
            limit = anara_agent.MAX_PASSAGES  # the agent already chose which passages matter, so all of them are read
            passages = passages[:limit]
            notes = anara_agent.number_notes(researched["notes"], passages)
        else:
            library = search_library(request.question, request.crop, request.state)
            passages = from_sources + [p for p in library if p.get("passageId") not in taken]
        if not passages and problems:
            return {"answer": "", "citations": [], "note": "; ".join(problems)}
        draft = draft_answer(
            request.question, passages, request.crop, request.domain, notes=notes or None,
            max_passages=anara_agent.MAX_PASSAGES if notes else None,
        )
        notes = [draft.get("note") or ""]
        if not draft.get("answer") and researched is not None:
            # the agent's own explanation says what the library does and does not hold, which is more use to the
            # reviewer than the model's generic "the passages do not contain ..."
            reason = anara_agent.plain_notes(researched["notes"])
            if reason:
                notes = [reason[:900]]
        if draft.get("answer"):
            notes.append(anara_search.other_state_notice(draft.get("citations") or [], request.state))
        if draft.get("answer"):
            openable = library_files.openable_document_ids()
            closed = sorted({
                str(c.get("documentName")) for c in draft.get("citations") or []
                if c.get("documentId") not in openable and not str(c.get("documentId")).startswith("src-")
            })
            if closed:  # in Anara's library but not among the files this service can show
                notes.append("These cited documents are in the Anara library but cannot be opened from here: " + "; ".join(closed) + ".")
        if problems:  # a source file that could not be read must not be silently ignored
            notes.append("Source files not used: " + "; ".join(problems) + ".")
        draft["note"] = " ".join(note for note in notes if note).strip()
        if getattr(library, "fallback", False):
            draft["note"] = (
                f"{draft.get('note') or ''} The Anara library search was not available, so this draft uses only "
                "the record's own files and a simpler local search."
            ).strip()
        return draft
    except Exception as error:
        logger.exception("library draft failed")
        raise HTTPException(status_code=502, detail=f"Library draft failed: {error}") from error


@app.get("/documents/{document_id}/pdf")
def document_pdf(document_id: str, x_draft_token: str | None = Header(default=None)) -> FileResponse:
    _check_token(x_draft_token)
    path = _pdf_path(document_id)
    if path is None:
        raise HTTPException(status_code=404, detail="No such library document")
    return FileResponse(path, media_type="application/pdf", filename=path.name, content_disposition_type="inline")
