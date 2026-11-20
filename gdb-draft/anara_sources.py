"""A record's own source files, searched through Anara like the rest of the library.

A source is a shared Zoho file. It is downloaded once and uploaded to Anara as
"src-<file id>__<name>.pdf"; later drafts find it by that name, so a file is never uploaded twice,
even after a restart. Anara needs a minute or so to read a new upload. A file that is not ready by
then is left to the caller, which searches the PDF itself (record_sources.py).
"""

from __future__ import annotations

import contextlib
import json
import logging
import re
import threading
import time
from typing import Any

import anara_search
import library_files
import record_sources

logger = logging.getLogger(__name__)


def _literal(value: Any) -> str:
    """A Python expression for a JSON-compatible value, to place inside a sandbox script."""
    return "json.loads(%r)" % json.dumps(value)


def _client():
    """The Anara client, loaded when first needed, so a missing package only turns Anara off."""
    import anara_client

    return anara_client

READY_WAIT_SECONDS = 60
POLL_SECONDS = 5
LOCK_WAIT_SECONDS = 30
TOP_K = 6
_lock = threading.Lock()  # two drafts for the same new file must not upload it twice


@contextlib.contextmanager
def _locked(seconds: float):
    """The upload lock, or a TimeoutError when another draft keeps it too long (the caller reads the PDF itself)."""
    if not _lock.acquire(timeout=seconds):
        raise TimeoutError("another draft is uploading a record file")
    try:
        yield
    finally:
        _lock.release()
_pending: dict[str, tuple[str, str]] = {}  # document id -> (file id, name): uploaded, not renamed yet


def anara_name(file_id: str, name: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9 _.-]+", " ", name).strip()[:60] or "source"
    return f"src-{file_id}__{stem}.pdf"


def _lookup(file_ids: list[str]) -> dict[str, dict[str, Any]]:
    """The Anara document of each source file already uploaded, with its reading status."""
    if not file_ids:
        return {}
    code = f"""IDS = {_literal(file_ids)}
def one(i):
    found = anara("entities.query", {{"type": "DOCUMENT", "nameContains": "src-" + i, "limit": 1}})
    if not found:
        return {{"id": i, "documentId": None}}
    e = anara("entities.get", {{"id": found[0]["id"], "withIngestion": True}})
    ingestion = (e or {{}}).get("ingestion")
    return {{"id": i, "documentId": found[0]["id"], "status": ingestion.get("status") if ingestion else "unknown"}}
RESULT = [one(i) for i in IDS]
"""
    return {row["id"]: row for row in (_client().execute(code) or []) if row.get("documentId")}


def _interleave(lists: list[list[dict[str, Any]]]) -> list[dict[str, Any]]:
    """The hits of several searches, best first from each in turn, each passage once."""
    merged: list[dict[str, Any]] = []
    seen: set[Any] = set()
    for rank in range(max(map(len, lists), default=0)):
        for hits in lists:
            if rank < len(hits) and hits[rank].get("passageId") not in seen:
                seen.add(hits[rank].get("passageId"))
                merged.append(hits[rank])
    return merged


def _rename(document_id: str, file_id: str, name: str) -> None:
    """Anara renames a document to its title once it has read it, so the lookup by name would no longer
    find it; the name is set back when the document is ready."""
    try:
        _client().execute(
            f"anara('entities.update', {{'id': {_literal(document_id)}, 'name': {_literal(anara_name(file_id, name))}}})\n"
            "RESULT = True"
        )
    except Exception:
        logger.exception("could not rename the Anara document of a record source")


def _settle_pending() -> None:
    """Rename the documents that were still being read when an earlier draft returned."""
    if not _pending:
        return
    statuses = _statuses(list(_pending))
    for document_id, (file_id, name) in list(_pending.items()):
        status = statuses.get(document_id)
        if status == "ready":
            _rename(document_id, file_id, name)
        if status in ("ready", "failed"):
            del _pending[document_id]


def _statuses(document_ids: list[str]) -> dict[str, str]:
    code = f"""IDS = {_literal(document_ids)}
RESULT = {{}}
for i in IDS:
    e = anara("entities.get", {{"id": i, "withIngestion": True}})
    ingestion = (e or {{}}).get("ingestion")
    RESULT[i] = ingestion.get("status") if ingestion else "unknown"
"""
    return _client().execute(code) or {}


def search(
    question: str, sources: list[dict[str, str]], crop: str | None = None
) -> tuple[list[dict[str, Any]], set[str], list[str]]:
    """(passages, file ids searched through Anara, problems) for the record's source files.

    `sources` are {"url", "name"}; only shared Zoho files count. A file Anara could not take, or has
    not finished reading, is left out of the ids so the caller searches it another way.
    """
    wanted: dict[str, tuple[str, str]] = {}  # file id -> (name, url)
    for source in sources:
        link = record_sources.parse_link((source.get("url") or "").strip())
        if link and link[1] not in wanted and len(wanted) < record_sources.MAX_SOURCES:
            wanted[link[1]] = ((source.get("name") or "").strip() or f"Source {link[1][:8]}", source["url"].strip())
    if not wanted:
        return [], set(), []
    anara_search.prepare()  # without it a server with no saved sign-in waits for a browser that does not exist

    problems: list[str] = []
    in_library = {  # a file that is one of the library's own documents needs no upload
        entry["zohoFileId"]: entry["documentId"]
        for entry in library_files.load_manifest().values()
        if entry.get("zohoFileId") and entry.get("documentId")
    }
    document_ids = {fid: in_library[fid] for fid in wanted if fid in in_library}
    reading: dict[str, str] = {}  # file id -> document id, for files Anara is still reading

    with _locked(LOCK_WAIT_SECONDS):
        _settle_pending()
        found = _lookup([fid for fid in wanted if fid not in in_library])
        for fid, (name, url) in wanted.items():
            if fid in document_ids:
                continue
            if fid in found:
                (document_ids if found[fid].get("status") == "ready" else reading)[fid] = found[fid]["documentId"]
                continue
            try:
                reading[fid] = _client().upload_pdf(record_sources.fetch_pdf(url), anara_name(fid, name))
                logger.info("uploaded the record source %s to Anara", name)
            except (record_sources.SourceUnavailable, RuntimeError, OSError) as error:
                problems.append(f"{name}: {error}")

    deadline = time.time() + READY_WAIT_SECONDS
    while reading and time.time() < deadline:
        statuses = _statuses(list(reading.values()))
        for fid, document_id in list(reading.items()):
            status = statuses.get(document_id)
            if status == "ready":
                document_ids[fid] = reading.pop(fid)
                _rename(document_ids[fid], fid, wanted[fid][0])
            elif status == "failed":
                reading.pop(fid)
                problems.append(f"{wanted[fid][0]}: Anara could not read the file")
        if reading:
            time.sleep(POLL_SECONDS)
    if reading:
        logger.info("Anara is still reading %d record sources; they are searched directly this time", len(reading))
        for fid, document_id in reading.items():
            _pending[document_id] = (fid, wanted[fid][0])
    if not document_ids:
        return [], set(), problems

    words = anara_search.crop_words(crop)
    query = question if not words or any(w in question.lower() for w in words) else f"{crop} {question}"
    client = _client()
    ids = list(document_ids.values())
    # Anara ranks differently for the full question and for its content words, so both are asked
    lists = [client.search_library(query, ids)] + [client.search_library(words_only, ids) for words_only in client._phrasings(question)]
    hits = _interleave(lists)
    if words:  # a file that lists many crops returns pages about the others
        hits = [hit for hit in hits if anara_search.mentions_crop(hit, words)] or hits
    file_of = {document_id: fid for fid, document_id in document_ids.items()}
    by_file: dict[str, list[dict[str, Any]]] = {}
    for hit in hits:
        if hit.get("documentId") in file_of:
            by_file.setdefault(file_of[hit["documentId"]], []).append(hit)
    # in turn from each file, so a file with many matching pages cannot crowd out another
    turns = [group[rank] for rank in range(TOP_K) for group in by_file.values() if rank < len(group)]
    passages = []
    for hit in turns[:TOP_K]:
        fid = file_of[hit["documentId"]]
        library_id = in_library.get(fid)
        passages.append({
            **hit,
            "documentId": library_id or record_sources.document_id_for(fid),
            "documentName": (library_files.name_for_document(library_id) if library_id else None) or wanted[fid][0],
            "sourcePages": hit.get("sourcePages") or [],
        })
    return passages, set(document_ids), problems
