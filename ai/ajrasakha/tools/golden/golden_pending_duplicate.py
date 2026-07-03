"""Pending duplicate check: open/delayed/in-review AJRASAKHA/WHATSAPP questions."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

try:
    from .gemma_classifier import GEMMA_MODEL, filter_pending_duplicate_batch
    from .golden_core import (
        PendingQuestionCandidate,
        _crop_from_question_details,
        _normalize_crop_state,
        _parse_created_at,
        _truncate_text,
        get_question_by_id,
        parse_created_before,
        pending_exact_search,
        pending_vector_search,
    )
except ImportError:
    from gemma_classifier import GEMMA_MODEL, filter_pending_duplicate_batch
    from golden_core import (
        PendingQuestionCandidate,
        _crop_from_question_details,
        _normalize_crop_state,
        _parse_created_at,
        _truncate_text,
        get_question_by_id,
        parse_created_before,
        pending_exact_search,
        pending_vector_search,
    )

log = logging.getLogger(__name__)


def _created_at_sort_key(candidate: PendingQuestionCandidate) -> tuple[int, float]:
    if candidate.created_at is None:
        return (1, float("inf"))
    return (0, candidate.created_at.timestamp())


def pick_duplicate_winner(
    candidates: list[PendingQuestionCandidate],
) -> PendingQuestionCandidate | None:
    """Prefer referenceQuestionId; else oldest by createdAt."""
    if not candidates:
        return None
    with_ref = [c for c in candidates if c.reference_question_id]
    if with_ref:
        return with_ref[0]
    return min(candidates, key=_created_at_sort_key)


def duplicate_return_id(candidate: PendingQuestionCandidate) -> str:
    return candidate.reference_question_id or candidate.question_id


def _candidate_audit_entry(
    candidate: PendingQuestionCandidate,
    *,
    llm_decision: str | None = None,
    llm_reason: str = "",
    llm_parse_ok: bool | None = None,
    is_duplicate: bool = False,
) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "question_id": candidate.question_id,
        "reference_question_id": candidate.reference_question_id,
        "question": candidate.question_text,
        "similarity_score": candidate.similarity_score,
        "created_at": (
            candidate.created_at.isoformat() if candidate.created_at else None
        ),
        "is_duplicate": is_duplicate,
    }
    if llm_decision is not None:
        entry["llm_decision"] = llm_decision
        entry["llm_reason"] = llm_reason
        entry["llm_parse_ok"] = llm_parse_ok
    return entry


def _build_no_duplicate_response(
    query: str,
    crop: str,
    state: str,
    candidates_checked: list[dict],
    *,
    created_before: datetime | None = None,
) -> dict[str, Any]:
    return {
        "is_duplicate": False,
        "duplicate_question_id": None,
        "matched_question_id": None,
        "similarity_score": None,
        "match_type": None,
        "query": query,
        "crop": crop,
        "state": state,
        "created_before": created_before.isoformat() if created_before else None,
        "candidates_checked": candidates_checked,
        "audit": {
            "model": GEMMA_MODEL,
            "status": "no_duplicate",
        },
    }


def _build_duplicate_response(
    query: str,
    crop: str,
    state: str,
    winner: PendingQuestionCandidate,
    match_type: str,
    candidates_checked: list[dict],
    *,
    audit_status: str,
    created_before: datetime | None = None,
) -> dict[str, Any]:
    return {
        "is_duplicate": True,
        "duplicate_question_id": duplicate_return_id(winner),
        "matched_question_id": winner.question_id,
        "similarity_score": winner.similarity_score,
        "match_type": match_type,
        "query": query,
        "crop": crop,
        "state": state,
        "created_before": created_before.isoformat() if created_before else None,
        "candidates_checked": candidates_checked,
        "audit": {
            "model": GEMMA_MODEL,
            "status": audit_status,
            "selected_question_id": winner.question_id,
            "returned_id": duplicate_return_id(winner),
            "similarity_score": winner.similarity_score,
        },
    }


async def check_pending_duplicate(
    *,
    question_id: str | None = None,
    rephrased_query: str | None = None,
    crop: str | None = None,
    state: str | None = None,
    created_before: str | None = None,
) -> dict[str, Any]:
    exclude_id: str | None = None
    created_before_dt: datetime | None = None

    if question_id:
        doc = await get_question_by_id(question_id)
        if not doc:
            raise LookupError(f"Question not found: {question_id}")
        query = (doc.get("question") or doc.get("text") or "").strip()
        details = doc.get("details") or {}
        crop_raw = _crop_from_question_details(details)
        state_raw = (details.get("state") or "").strip()
        exclude_id = question_id
        if created_before:
            created_before_dt = parse_created_before(created_before)
        else:
            created_before_dt = _parse_created_at(doc.get("createdAt"))
    else:
        query = (rephrased_query or "").strip()
        crop_raw = crop or ""
        state_raw = state or ""
        if created_before:
            created_before_dt = parse_created_before(created_before)

    if not query:
        raise ValueError("rephrased_query is required")

    crop_norm, state_norm = _normalize_crop_state(crop_raw, state_raw)

    log.info(
        "check_pending_duplicate start query=%r crop=%s state=%s exclude=%s created_before=%s",
        _truncate_text(query, 80),
        crop_norm,
        state_norm,
        exclude_id or "none",
        created_before_dt.isoformat() if created_before_dt else "none",
    )

    exact_matches = await pending_exact_search(
        query,
        crop_norm,
        state_norm,
        exclude_question_id=exclude_id,
        created_before=created_before_dt,
    )
    if exact_matches:
        winner = pick_duplicate_winner(exact_matches)
        if winner is None:
            return _build_no_duplicate_response(
                query, crop_norm, state_norm, [], created_before=created_before_dt
            )
        audit = [
            _candidate_audit_entry(c, is_duplicate=True) for c in exact_matches
        ]
        log.info(
            "check_pending_duplicate done path=exact winner=%s returned_id=%s score=%s",
            winner.question_id,
            duplicate_return_id(winner),
            winner.similarity_score,
        )
        return _build_duplicate_response(
            query,
            crop_norm,
            state_norm,
            winner,
            "exact",
            audit,
            audit_status="exact_match",
            created_before=created_before_dt,
        )

    vector_matches = await pending_vector_search(
        query,
        crop_norm,
        state_norm,
        exclude_question_id=exclude_id,
        created_before=created_before_dt,
    )
    if not vector_matches:
        log.info("check_pending_duplicate done path=empty (no vector hits)")
        return _build_no_duplicate_response(
            query, crop_norm, state_norm, [], created_before=created_before_dt
        )

    filter_results = await filter_pending_duplicate_batch(
        query, vector_matches, crop=crop_norm, state=state_norm
    )

    duplicate_candidates: list[PendingQuestionCandidate] = []
    candidates_checked: list[dict] = []
    for cand, filt in zip(vector_matches, filter_results):
        decision = filt.get("relevance_decision", "NOT_SAME")
        is_dup = decision == "SAME"
        candidates_checked.append(
            _candidate_audit_entry(
                cand,
                llm_decision=decision,
                llm_reason=filt.get("relevance_reason", ""),
                llm_parse_ok=filt.get("llm_parse_ok", False),
                is_duplicate=is_dup,
            )
        )
        if is_dup:
            duplicate_candidates.append(cand)

    if not duplicate_candidates:
        log.info(
            "check_pending_duplicate done path=no_duplicate (vector=%d, llm_same=0)",
            len(vector_matches),
        )
        return _build_no_duplicate_response(
            query, crop_norm, state_norm, candidates_checked,
            created_before=created_before_dt,
        )

    winner = pick_duplicate_winner(duplicate_candidates)
    if winner is None:
        return _build_no_duplicate_response(
            query, crop_norm, state_norm, candidates_checked,
            created_before=created_before_dt,
        )

    log.info(
        "check_pending_duplicate done path=similarity winner=%s returned_id=%s score=%s",
        winner.question_id,
        duplicate_return_id(winner),
        winner.similarity_score,
    )
    return _build_duplicate_response(
        query,
        crop_norm,
        state_norm,
        winner,
        "similarity",
        candidates_checked,
        audit_status="similarity_llm_verified",
        created_before=created_before_dt,
    )
