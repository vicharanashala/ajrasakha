"""Reader for the Golden Database.

The real GDB (``golden_db.agri_qa``) is empty in the hackathon cluster, so the
mini golden DB ``farmer_feedback.gdb_entries`` is used. Swap ``load_gdb_entries``
for a reader over the production GDB later; ``from_gdb_entry`` stays the same.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from pymongo.database import Database

from backend.app.models import GdbEntry
from backend.app.normalize import (
    extract_crop,
    normalize_domain,
    normalize_language,
    normalize_state,
    parse_datetime,
)


def from_gdb_entry(doc: dict[str, Any]) -> GdbEntry | None:
    entry_id = doc.get("_id") or doc.get("entry_id")
    question = (doc.get("question") or "").strip()
    if not entry_id or not question:
        return None
    lang, code = normalize_language(doc.get("language"))
    return GdbEntry(
        entry_id=str(entry_id),
        question=question,
        answer=(doc.get("answer") or "").strip(),
        domain=normalize_domain(doc.get("domain")),
        domain_raw=doc.get("domain"),
        language=lang,
        language_code=code,
        state=normalize_state(doc.get("state")),
        crop=extract_crop(question),
        keywords=[str(k) for k in (doc.get("keywords") or [])],
        created_at=parse_datetime(doc.get("created_at")),
        updated_at=parse_datetime(doc.get("updated_at")),
    )


def convert_many(docs: Iterable[dict[str, Any]]) -> list[GdbEntry]:
    return [e for e in (from_gdb_entry(d) for d in docs) if e is not None]


def load_gdb_entries(feedback_db: Database) -> list[GdbEntry]:
    return convert_many(feedback_db["gdb_entries"].find({}))
