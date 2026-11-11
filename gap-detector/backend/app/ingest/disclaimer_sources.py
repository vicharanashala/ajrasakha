"""Readers for disclaimer-triggered (unanswered) farmer queries.

* ``farmer_feedback.disclaimer_logs``  primary: query, state, domain, confidence, no crop
* ``gdb_gap_detector.raw_queries``     secondary: only rows with disclaimer_triggered=True;
                                        has an explicit crop and a different domain taxonomy
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any

from pymongo.database import Database

from backend.app.models import DisclaimerQuery
from backend.app.normalize import (
    extract_crop,
    farmer_key,
    normalize_crop,
    normalize_domain,
    normalize_language,
    normalize_state,
    normalize_text,
    parse_datetime,
)


def _float(v: Any) -> float | None:
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def from_disclaimer_log(doc: dict[str, Any]) -> DisclaimerQuery | None:
    query = (doc.get("query") or "").strip()
    ts = parse_datetime(doc.get("timestamp"))
    if not query or ts is None:
        return None
    lang, code = normalize_language(doc.get("language"))
    return DisclaimerQuery(
        source_ref=f"farmer_feedback.disclaimer_logs:{doc.get('_id')}",
        source="disclaimer_logs",
        query=query,
        query_normalized=normalize_text(doc.get("query_normalized") or query),
        farmer_key=farmer_key(doc.get("farmer_id")),
        channel=(doc.get("source") or "unknown").strip().lower(),
        language=lang,
        language_code=code,
        state=normalize_state(doc.get("state")),
        domain=normalize_domain(doc.get("domain")),
        domain_raw=doc.get("domain"),
        crop=extract_crop(query),
        confidence=_float(doc.get("confidence")),
        best_match_id=str(doc["best_match_id"]) if doc.get("best_match_id") else None,
        best_match_score=_float(doc.get("best_match_score")),
        timestamp=ts,
        status=str(doc.get("status") or "unanswered"),
    )


def from_raw_query(doc: dict[str, Any]) -> DisclaimerQuery | None:
    """gdb_gap_detector.raw_queries -> DisclaimerQuery; None unless disclaimer_triggered."""
    if not doc.get("disclaimer_triggered"):
        return None
    query = (doc.get("question") or "").strip()
    ts = parse_datetime(doc.get("timestamp"))
    if not query or ts is None:
        return None
    lang, code = normalize_language(doc.get("language"))
    return DisclaimerQuery(
        source_ref=f"gdb_gap_detector.raw_queries:{doc.get('_id')}",
        source="raw_queries",
        query=query,
        query_normalized=normalize_text(query),
        farmer_key=farmer_key(doc.get("user_id")),
        channel="unknown",
        language=lang,
        language_code=code,
        state=normalize_state(doc.get("state")),
        domain=normalize_domain(doc.get("domain")),
        domain_raw=doc.get("domain"),
        crop=normalize_crop(doc.get("crop")) or extract_crop(query),
        timestamp=ts,
        status="unanswered",
    )


def convert_many(
    docs: Iterable[dict[str, Any]], converter: Callable[[dict[str, Any]], DisclaimerQuery | None]
) -> list[DisclaimerQuery]:
    return [q for q in (converter(d) for d in docs) if q is not None]


def load_disclaimer_queries(feedback_db: Database, gap_db: Database) -> list[DisclaimerQuery]:
    """Read both seed sources (read-only) and return normalised disclaimer queries."""
    out = convert_many(feedback_db["disclaimer_logs"].find({}), from_disclaimer_log)
    out += convert_many(gap_db["raw_queries"].find({"disclaimer_triggered": True}), from_raw_query)
    return out
