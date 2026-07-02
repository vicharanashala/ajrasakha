"""Golden DB search orchestration: exact → RAG → relevance filter → classify → select one."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

try:
    from .gemma_classifier import (
        GEMMA_MODEL,
        classify_pair,
        filter_relevance_batch,
        select_best_match,
    )
    from .golden_core import (
        RETRIEVAL_SOURCE_RAG,
        RETRIEVAL_SOURCE_STRICT_EXACT,
        QuestionAnswerPair,
        _truncate_text,
        _normalize_crop_state,
        match_entry,
        strict_exact_search,
        vector_rag_search,
    )
except ImportError:
    from gemma_classifier import (
        GEMMA_MODEL,
        classify_pair,
        filter_relevance_batch,
        select_best_match,
    )
    from golden_core import (
        RETRIEVAL_SOURCE_RAG,
        RETRIEVAL_SOURCE_STRICT_EXACT,
        QuestionAnswerPair,
        _truncate_text,
        _normalize_crop_state,
        match_entry,
        strict_exact_search,
        vector_rag_search,
    )

log = logging.getLogger(__name__)

SELECTION_RULE = "relevance_filter_then_same_intent_then_covered_by_context"


def _apply_crop_fallback_metadata(
    response: dict[str, Any],
    *,
    original_crop: str,
    crop_fallback: bool,
) -> None:
    if not crop_fallback:
        return
    response["original_crop"] = original_crop
    response["crop_fallback"] = True
    audit = response.get("classification_audit") or {}
    audit["crop_fallback"] = True
    audit["original_crop"] = original_crop
    response["classification_audit"] = audit


def _exact_match_response(
    query: str,
    state: str,
    crop: str,
    pair: QuestionAnswerPair,
    *,
    original_crop: str,
    crop_fallback: bool,
) -> dict[str, Any]:
    response: dict[str, Any] = {
        "rephrased_query": query,
        "state": state,
        "crop": crop,
        "exact_match": match_entry(
            pair,
            RETRIEVAL_SOURCE_STRICT_EXACT,
            similarity_score=1.0,
            chosen_for_answer=True,
            answer_from_class="strict_exact",
        ),
        "selected_match": None,
        "classification_audit": {
            "status": "exact_bypass",
            "model": GEMMA_MODEL,
            "evaluations": [],
            "selected_question_id": pair.question_id,
            "selection_rule": "strict_exact",
            "selection_method": "strict_exact",
            "chosen_for_answer": True,
            "answer_from_class": "strict_exact",
        },
    }
    _apply_crop_fallback_metadata(
        response,
        original_crop=original_crop,
        crop_fallback=crop_fallback,
    )
    return response


async def _run_gemma_pipeline(
    query: str,
    crop: str,
    state: str,
    rag_pairs: list[QuestionAnswerPair],
    response: dict[str, Any],
    *,
    original_crop: str,
    crop_fallback: bool,
) -> dict[str, Any]:
    _apply_crop_fallback_metadata(
        response,
        original_crop=original_crop,
        crop_fallback=crop_fallback,
    )

    filter_results = await filter_relevance_batch(
        query, rag_pairs, crop=crop, state=state
    )

    same_winner_idx: int | None = None
    for i, filt in enumerate(filter_results):
        if filt.get("relevance_decision") == "SAME":
            same_winner_idx = i
            break

    if same_winner_idx is not None:
        winner = rag_pairs[same_winner_idx]
        winner_filt = filter_results[same_winner_idx]
        evaluations: list[dict] = []
        for pair, filt in zip(rag_pairs, filter_results):
            decision = filt.get("relevance_decision", "KEEP")
            ev = {
                "question_id": pair.question_id,
                "similarity_score": pair.similarity_score,
                "retrieved_question": pair.question_text,
                "relevance_decision": decision,
                "relevance_reason": filt.get("relevance_reason", ""),
                "classification": "SAME_INTENT" if decision == "SAME" else None,
                "reason": (
                    filt.get("relevance_reason", "")
                    if decision == "SAME"
                    else ""
                ),
                "llm_parse_ok": filt.get("llm_parse_ok", False),
                "action": "pending",
                "chosen_for_answer": pair.question_id == winner.question_id,
            }
            if decision == "REJECT":
                ev["action"] = "rejected_irrelevant"
            elif decision == "SAME":
                ev["action"] = "selected"
            else:
                ev["action"] = "skipped_same_bypass"
            evaluations.append(ev)

        response["selected_match"] = match_entry(
            winner,
            RETRIEVAL_SOURCE_RAG,
            gemma_class="SAME_INTENT",
            chosen_for_answer=True,
            answer_from_class="SAME_INTENT",
        )
        audit = response["classification_audit"]
        audit["evaluations"] = evaluations
        audit["status"] = "selected"
        audit["selected_question_id"] = winner.question_id
        audit["selection_rule"] = "same_question_relevance_bypass"
        audit["answer_from_class"] = "SAME_INTENT"
        audit["selection_method"] = "same_question_bypass"
        audit["chosen_for_answer"] = True

        log.info(
            "gdb_search done path=same_question_bypass question_id=%s reason=%r",
            winner.question_id,
            (winner_filt.get("relevance_reason") or "")[:80],
        )
        return response

    evaluations: list[dict] = []
    kept_pairs: list[QuestionAnswerPair] = []

    for pair, filt in zip(rag_pairs, filter_results):
        decision = filt.get("relevance_decision", "KEEP")
        ev = {
            "question_id": pair.question_id,
            "similarity_score": pair.similarity_score,
            "retrieved_question": pair.question_text,
            "relevance_decision": decision,
            "relevance_reason": filt.get("relevance_reason", ""),
            "classification": None,
            "reason": "",
            "llm_parse_ok": filt.get("llm_parse_ok", False),
            "action": "pending",
        }
        if decision == "REJECT":
            ev["action"] = "rejected_irrelevant"
            log.info(
                "gdb_search relevance REJECT question_id=%s reason=%r",
                pair.question_id,
                ev["relevance_reason"][:80],
            )
        else:
            kept_pairs.append(pair)
            ev["action"] = "passed_relevance_filter"
        evaluations.append(ev)

    if not kept_pairs:
        for ev in evaluations:
            if ev["action"] == "pending":
                ev["action"] = "rejected_irrelevant"
        audit = response["classification_audit"]
        audit["evaluations"] = evaluations
        audit["status"] = "empty"
        log.warning(
            "gdb_search done path=empty (all %d RAG hits rejected by relevance filter)",
            len(rag_pairs),
        )
        return response

    classify_tasks = [
        classify_pair(
            original_query=query,
            retrieved_question=pair.question_text,
            retrieved_answer=pair.answer_text,
            crop=crop,
            state=state,
        )
        for pair in kept_pairs
    ]
    classify_results = await asyncio.gather(*classify_tasks)

    ev_by_id = {ev["question_id"]: ev for ev in evaluations}
    for pair, cls_result in zip(kept_pairs, classify_results):
        ev = ev_by_id[pair.question_id]
        ev["classification"] = cls_result.get("classification", "NOT_COVERED")
        ev["reason"] = cls_result.get("reason", "")
        ev["llm_parse_ok"] = cls_result.get("llm_parse_ok", False)
        ev["action"] = "classified"

    selection = await select_best_match(query, kept_pairs, classify_results)
    audit = response["classification_audit"]
    audit["evaluations"] = evaluations

    if selection is None:
        for ev in evaluations:
            ev["chosen_for_answer"] = False
            if ev["action"] in ("classified", "passed_relevance_filter"):
                ev["action"] = "rejected_classification"
            elif ev["action"] == "pending":
                ev["action"] = "rejected_irrelevant"
        audit["status"] = "empty"
        audit["chosen_for_answer"] = False
        log.warning(
            "gdb_search done path=empty (kept=%d after filter, none SAME_INTENT/COVERED)",
            len(kept_pairs),
        )
        return response

    winner: QuestionAnswerPair = selection["pair"]
    winner_cls: dict = selection["cls_result"]
    rule: str = selection["selection_rule"]
    winner_class: str = selection["winning_class"]
    selection_method: str = selection["selection_method"]
    tie_reason = winner_cls.get("tie_breaker_reason")

    for ev in evaluations:
        ev["chosen_for_answer"] = ev["question_id"] == winner.question_id
        if ev["chosen_for_answer"]:
            ev["action"] = "selected"
            if tie_reason:
                ev["tie_breaker_reason"] = tie_reason
        elif ev.get("classification") in ("SAME_INTENT", "COVERED_BY_CONTEXT"):
            ev["action"] = "skipped_lower_priority"
        elif ev["relevance_decision"] == "REJECT":
            ev["action"] = "rejected_irrelevant"
        elif ev.get("classification"):
            ev["action"] = "rejected_classification"
        else:
            ev["action"] = "rejected_irrelevant"

    response["selected_match"] = match_entry(
        winner,
        RETRIEVAL_SOURCE_RAG,
        gemma_class=winner_class,
        chosen_for_answer=True,
        answer_from_class=winner_class,
    )
    audit["status"] = "selected"
    audit["selected_question_id"] = winner.question_id
    audit["selection_rule"] = rule
    audit["answer_from_class"] = winner_class
    audit["selection_method"] = selection_method
    audit["chosen_for_answer"] = True

    log.info(
        "gdb_search done path=selected question_id=%s class=%s method=%s rule=%s",
        winner.question_id,
        winner_class,
        selection_method,
        rule,
    )
    return response


async def gdb_search(
    rephrased_query: str,
    crop: str,
    state: str,
    *,
    season: Optional[str] = None,
    domain: Optional[str] = None,
) -> dict[str, Any]:
    crop, state = _normalize_crop_state(crop, state)
    original_crop = crop
    crop_fallback = False
    query = (rephrased_query or "").strip()
    if not query:
        raise ValueError("rephrased_query is required")

    log.info(
        "gdb_search start rephrased_query=%r crop=%s state=%s",
        _truncate_text(query, 80),
        crop,
        state,
    )

    response: dict[str, Any] = {
        "rephrased_query": query,
        "state": state,
        "crop": crop,
        "exact_match": {},
        "selected_match": None,
        "classification_audit": {
            "status": "empty",
            "model": GEMMA_MODEL,
            "relevance_filter_mode": "batch_all_candidates",
            "evaluations": [],
            "selected_question_id": None,
            "selection_rule": SELECTION_RULE,
        },
    }

    strict_results = await strict_exact_search(query=query, crop=crop, state=state)
    log.info("gdb_search strict exact returned %d hit(s)", len(strict_results))

    if strict_results:
        log.info(
            "gdb_search done path=strict_exact question_id=%s",
            strict_results[0].question_id,
        )
        return _exact_match_response(
            query,
            state,
            crop,
            strict_results[0],
            original_crop=original_crop,
            crop_fallback=False,
        )

    rag_pairs = await vector_rag_search(
        query,
        crop,
        state,
        season=season,
        domain=domain,
    )

    if not rag_pairs and crop != "all":
        log.info(
            "gdb_search: no retrieval hits for crop=%s; retrying with crop=all",
            crop,
        )
        crop_fallback = True
        strict_results = await strict_exact_search(query=query, crop="all", state=state)
        log.info(
            "gdb_search strict exact (crop=all) returned %d hit(s)",
            len(strict_results),
        )
        if strict_results:
            log.info(
                "gdb_search done path=strict_exact_crop_fallback question_id=%s",
                strict_results[0].question_id,
            )
            return _exact_match_response(
                query,
                state,
                "all",
                strict_results[0],
                original_crop=original_crop,
                crop_fallback=True,
            )

        rag_pairs = await vector_rag_search(
            query,
            "all",
            state,
            season=season,
            domain=domain,
        )
        crop = "all"
        response["crop"] = "all"

    if not rag_pairs:
        _apply_crop_fallback_metadata(
            response,
            original_crop=original_crop,
            crop_fallback=crop_fallback,
        )
        log.warning("gdb_search done path=empty (no vector hits)")
        return response

    return await _run_gemma_pipeline(
        query,
        crop,
        state,
        rag_pairs,
        response,
        original_crop=original_crop,
        crop_fallback=crop_fallback,
    )
