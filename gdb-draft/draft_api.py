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
from anara_drafter import draft_answer
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
    yield


app = FastAPI(title="GDB library draft", lifespan=lifespan)


class DraftRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    # the crop of the record, when known: the search then looks only at documents of that crop
    crop: str | None = Field(default=None, max_length=200)


def search_library(question: str, crop: str | None = None) -> list[dict[str, Any]]:
    """Passages from the translated documents on this machine (see local_index.py)."""
    return local_index.search_library(question, crop)


def _pdf_path(document_id: str):
    return pdf_path_for_document(document_id) or local_index.pdf_path_for_document(document_id)


def _check_token(supplied: str | None) -> None:
    expected = os.getenv("GDB_DRAFT_TOKEN", "")
    if expected and not hmac.compare_digest(supplied or "", expected):
        raise HTTPException(status_code=401, detail="Invalid draft token")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# a plain def, so FastAPI runs it in a worker thread and the blocking search and model calls
# do not stall other requests
@app.post("/draft")
def draft(request: DraftRequest, x_draft_token: str | None = Header(default=None)) -> dict[str, Any]:
    _check_token(x_draft_token)
    try:
        passages = search_library(request.question, request.crop)
        return draft_answer(request.question, passages)
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
