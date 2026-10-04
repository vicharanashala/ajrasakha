"""Golden DB search orchestration: exact → RAG → relevance filter → classify → select one."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any, Optional

from dotenv import load_dotenv

load_dotenv()

# v2 API Configuration
ENABLE_V2_SEARCH = os.getenv("ENABLE_V2_SEARCH", "true").lower() == "true"
BM25_RELEVANCE_WEIGHT = float(os.getenv("BM25_RELEVANCE_WEIGHT", "0.4"))
SEMANTIC_RELEVANCE_WEIGHT = float(os.getenv("SEMANTIC_RELEVANCE_WEIGHT", "0.6"))

try:
    from ajrasakha.utils import jev_client, jev_tasks
    from .gemma_classifier import (
        GEMMA_MODEL,
        _decision_to_score,
        classify_pair,
        filter_relevance_batch,
        select_best_match,
    )
    from .golden_core import (
        RETRIEVAL_SOURCE_RAG,
        RETRIEVAL_SOURCE_STRICT_EXACT,
        RETRIEVAL_SOURCE_BM25,
        QuestionAnswerPair,
        _truncate_text,
        _normalize_crop_state,
        match_entry,
        strict_exact_search,
        vector_rag_search,
        bm25_search,
    )
    from .keyword_extractor import extract_keywords, extract_keywords_for_bm25
except ImportError:
    import jev_client  # type: ignore[no-redef]
    import jev_tasks  # type: ignore[no-redef]
    from gemma_classifier import (
        GEMMA_MODEL,
        _decision_to_score,
        classify_pair,
        filter_relevance_batch,
        select_best_match,
    )
    from golden_core import (
        RETRIEVAL_SOURCE_RAG,
        RETRIEVAL_SOURCE_STRICT_EXACT,
        RETRIEVAL_SOURCE_BM25,
        QuestionAnswerPair,
        _truncate_text,
        _normalize_crop_state,
        match_entry,
        strict_exact_search,
        vector_rag_search,
        bm25_search,
    )
    from keyword_extractor import extract_keywords, extract_keywords_for_bm25

log = logging.getLogger(__name__)

SELECTION_RULE = "relevance_filter_then_same_intent_then_covered_by_context"


def _decision_model() -> str:
    """Name the model that the configured Golden decision path will call."""
    if jev_client.provider_for("golden_relevance") == "jev":
        return f"jev:{jev_client.gateway()}:{jev_client.model_name()}"
    return GEMMA_MODEL


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
            "model": "none (strict exact match)",
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
    scoring_query: str,  # Original user query for LLM scoring
) -> dict[str, Any]:
    _apply_crop_fallback_metadata(
        response,
        original_crop=original_crop,
        crop_fallback=crop_fallback,
    )

    filter_results = await filter_relevance_batch(
        scoring_query, rag_pairs, crop=crop, state=state
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
            original_query=scoring_query,  # Use original user query for LLM scoring
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
    use_dual_search: bool = False,
    embedding_field: str = "embedding",
    original_query: Optional[str] = None,  # User's original query for LLM scoring
) -> dict[str, Any]:
    crop, state = _normalize_crop_state(crop, state)
    original_crop = crop
    crop_fallback = False
    query = (rephrased_query or "").strip()
    if not query:
        raise ValueError("rephrased_query is required")
    
    # Use original query for LLM scoring, fallback to rephrased_query if not provided
    scoring_query = (original_query or rephrased_query or "").strip()
    if scoring_query != query:
        log.info("gdb_search using original_query=%r for LLM scoring", _truncate_text(scoring_query, 80))

    log.info(
        "gdb_search start rephrased_query=%r crop=%s state=%s",
        _truncate_text(query, 80),
        crop,
        state,
    )

    response: dict[str, Any] = {
        "rephrased_query": query,
        "original_query": scoring_query if scoring_query != query else None,
        "state": state,
        "crop": crop,
        "exact_match": {},
        "selected_match": None,
        "classification_audit": {
            "status": "empty",
            "model": _decision_model(),
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
        use_dual_search=use_dual_search,
        embedding_field=embedding_field,
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
            use_dual_search=use_dual_search,
            embedding_field=embedding_field,
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
        scoring_query=scoring_query,
    )


async def gdb_search_jev_existing_eval(
    rephrased_query: str,
    crop: str,
    state: str,
    *,
    season: Optional[str] = None,
    domain: Optional[str] = None,
) -> dict[str, Any]:
    """Run the existing GDB flow while forcing only its decision calls to Jev."""
    with jev_client.provider_override({
        jev_tasks.GOLDEN_FILTER_TASK: "jev",
        jev_tasks.GOLDEN_CLASSIFY_TASK: "jev",
        jev_tasks.GOLDEN_TIE_TASK: "jev",
        "fallback": "current",
    }):
        response = await gdb_search(
            rephrased_query=rephrased_query,
            crop=crop,
            state=state,
            season=season,
            domain=domain,
            embedding_field="embedding",
        )
    audit = response.get("classification_audit") or {}
    audit["mode"] = "jev_existing_flow_experimental"
    response["classification_audit"] = audit
    return response


async def gdb_search_choice_noul_eval(
    rephrased_query: str,
    crop: str,
    state: str,
    *,
    season: Optional[str] = None,
    domain: Optional[str] = None,
    sufficiency_threshold: float = 0.5,
) -> dict[str, Any]:
    """Experimental retrieval + batched Jev Choice/Noul selection.

    This is intentionally separate from ``gdb_search`` so Swagger evaluation
    cannot change the production selection path.
    """
    crop, state = _normalize_crop_state(crop, state)
    original_crop = crop
    crop_fallback = False
    query = (rephrased_query or "").strip()
    if not query:
        raise ValueError("rephrased_query is required")

    response: dict[str, Any] = {
        "rephrased_query": query,
        "state": state,
        "crop": crop,
        "exact_match": {},
        "selected_match": None,
        "classification_audit": {
            "status": "empty",
            "model": f"jev:{jev_client.gateway()}:{jev_client.model_name()}",
            "mode": "choice_plus_noul_experimental",
            "sufficiency_threshold": sufficiency_threshold,
            "evaluations": [],
            "selected_question_id": None,
            "selection_rule": "answer_sufficiency_then_same_probability_then_vector_similarity",
        },
    }

    strict_results = await strict_exact_search(query=query, crop=crop, state=state)
    if strict_results:
        exact = _exact_match_response(
            query, state, crop, strict_results[0], original_crop=original_crop, crop_fallback=False
        )
        exact["classification_audit"]["mode"] = "choice_plus_noul_experimental"
        return exact

    pairs = await vector_rag_search(query, crop, state, season=season, domain=domain)
    if not pairs and crop != "all":
        crop_fallback = True
        pairs = await vector_rag_search(query, "all", state, season=season, domain=domain)
        crop = "all"
        response["crop"] = crop
    if not pairs:
        _apply_crop_fallback_metadata(
            response, original_crop=original_crop, crop_fallback=crop_fallback
        )
        return response

    jev_state, questions = jev_tasks.golden_choice_noul_request(query, crop, state, pairs)
    result = await jev_client.adecide(jev_tasks.GOLDEN_CHOICE_NOUL_TASK, jev_state, questions)
    decisions = jev_tasks.golden_choice_noul_results(result, len(pairs))
    winner_idx = jev_tasks.select_golden_choice_noul(
        decisions, pairs, sufficiency_threshold=sufficiency_threshold
    )

    evaluations = []
    for i, (pair, decision) in enumerate(zip(pairs, decisions)):
        chosen = i == winner_idx
        sufficient = decision["answer_sufficiency"] >= sufficiency_threshold
        evaluations.append({
            "question_id": pair.question_id,
            "retrieved_question": pair.question_text,
            "similarity_score": pair.similarity_score,
            "intent": decision["intent"],
            "intent_probabilities": decision["intent_probabilities"],
            "intent_confidence": decision["intent_confidence"],
            "answer_sufficiency_noul": decision["answer_sufficiency"],
            "eligible": decision["intent"] != "REJECT" and sufficient,
            "chosen_for_answer": chosen,
            "action": "selected" if chosen else (
                "rejected_intent" if decision["intent"] == "REJECT" else
                "rejected_insufficient_answer" if not sufficient else
                "skipped_lower_answer_sufficiency"
            ),
        })

    audit = response["classification_audit"]
    audit["evaluations"] = evaluations
    audit["jev_usage"] = {
        "model": result.model,
        "latency_ms": round(result.latency_ms, 1),
        "input_tokens": result.input_tokens,
        "output_tokens": result.output_tokens,
        "cost": result.cost,
    }
    if winner_idx is not None:
        winner = pairs[winner_idx]
        response["selected_match"] = match_entry(
            winner,
            RETRIEVAL_SOURCE_RAG,
            gemma_class="JEV_CHOICE_NOUL",
            chosen_for_answer=True,
            answer_from_class="ANSWER_SUFFICIENT",
        )
        audit["status"] = "selected"
        audit["selected_question_id"] = winner.question_id
        audit["chosen_for_answer"] = True
    else:
        audit["chosen_for_answer"] = False

    _apply_crop_fallback_metadata(
        response, original_crop=original_crop, crop_fallback=crop_fallback
    )
    return response


async def gdb_search_jev_gated_eval(
    rephrased_query: str,
    crop: str,
    state: str,
    *,
    season: Optional[str] = None,
    domain: Optional[str] = None,
    max_conflict_probability: float = 0.2,
    reject_conflict_probability: float = 0.8,
) -> dict[str, Any]:
    """Run the existing GDB selection first, then let Jev verify its answer."""
    crop, state = _normalize_crop_state(crop, state)
    query = (rephrased_query or "").strip()
    if not query:
        raise ValueError("rephrased_query is required")
    # This route measures Jev's value as a verifier. The ordinary GDB pipeline
    # chooses its answer using the existing provider, even when environment
    # variables route other experimental GDB calls through Jev.
    with jev_client.provider_override({"*": "current", "fallback": "current"}):
        response = await gdb_search(
            rephrased_query=query,
            crop=crop,
            state=state,
            season=season,
            domain=domain,
            embedding_field="embedding",
        )

    baseline_audit = response.get("classification_audit") or {}
    baseline_match = response.get("exact_match") or response.get("selected_match")
    audit: dict[str, Any] = {
        "status": "baseline_no_answer",
        "mode": "verify_existing_gdb_answer_experimental",
        "model": f"jev:{jev_client.gateway()}:{jev_client.model_name()}",
        "baseline_model": baseline_audit.get("model"),
        "baseline_status": baseline_audit.get("status"),
        "baseline_selected_match": baseline_match,
        "thresholds": {
            "maximum_conflict": max_conflict_probability,
            "reject_conflict": reject_conflict_probability,
        },
        "checks": {},
        "gate_decision": "not_run",
        "requires_review": False,
        "selected_question_id": baseline_match.get("question_id") if baseline_match else None,
        "selection_rule": "existing_gdb_selects_then_jev_verifies_selected_answer",
        "baseline_audit": baseline_audit,
    }
    response["classification_audit"] = audit
    if not baseline_match:
        return response

    jev_state, questions = jev_tasks.golden_answer_verify_request(
        query, response.get("crop") or crop, state, baseline_match
    )
    result = await jev_client.adecide(
        jev_tasks.GOLDEN_ANSWER_VERIFY_TASK, jev_state, questions
    )
    checks = jev_tasks.golden_answer_verify_result(result)
    decision = jev_tasks.golden_answer_gate_decision(
        checks,
        max_conflict_probability=max_conflict_probability,
        reject_conflict_probability=reject_conflict_probability,
    )
    audit.update({
        "status": decision,
        "gate_decision": decision,
        "checks": {
            "target_alignment": checks["target_alignment"],
            "target_probabilities": checks["target_probabilities"],
            "target_confidence": checks["target_confidence"],
            "task_coverage": checks["task_coverage"],
            "task_probabilities": checks["task_probabilities"],
            "task_confidence": checks["task_confidence"],
            "conflict_probability": checks["has_conflict"],
        },
        "requires_review": decision == "review",
        "chosen_for_answer": decision == "accept",
        "jev_usage": {
            "model": result.model,
            "latency_ms": round(result.latency_ms, 1),
            "input_tokens": result.input_tokens,
            "output_tokens": result.output_tokens,
            "cost": result.cost,
        },
    })

    if decision != "accept":
        # Keep the blocked answer in baseline_selected_match for inspection,
        # but do not expose it as the endpoint's usable answer.
        response["exact_match"] = {}
        response["selected_match"] = None
    return response


def _rrf_merge_candidates(
    vector_pairs: list[QuestionAnswerPair],
    keyword_pairs: list[QuestionAnswerPair],
) -> tuple[list[QuestionAnswerPair], dict[str, dict[str, Any]]]:
    """Merge semantic and keyword results without comparing unlike raw scores."""
    by_id: dict[str, QuestionAnswerPair] = {}
    metadata: dict[str, dict[str, Any]] = {}
    for source, pairs in (("semantic", vector_pairs), ("keyword", keyword_pairs)):
        for rank, pair in enumerate(pairs, 1):
            by_id.setdefault(pair.question_id, pair)
            item = metadata.setdefault(
                pair.question_id,
                {"sources": [], "rrf_score": 0.0, "source_ranks": {}},
            )
            item["sources"].append(source)
            item["source_ranks"][source] = rank
            item["rrf_score"] += 1.0 / (60.0 + rank)
    ordered = sorted(
        by_id.values(),
        key=lambda p: (
            metadata[p.question_id]["rrf_score"],
            float(p.similarity_score or 0.0),
        ),
        reverse=True,
    )
    return ordered, metadata


async def _retrieve_rerank_candidates(
    query: str,
    crop: str,
    state: str,
    *,
    season: Optional[str],
    domain: Optional[str],
    retrieval_top_k: int,
) -> tuple[list[QuestionAnswerPair], dict[str, dict[str, Any]]]:
    """Retrieve a broad semantic + keyword union for the Jev experiment."""
    keywords = extract_keywords(query, max_keywords=10)
    vector_task = vector_rag_search(
        query,
        crop,
        state,
        season=season,
        domain=domain,
        top_k=retrieval_top_k,
        use_dual_search=False,
        embedding_field="embedding",
    )
    keyword_task = bm25_search(
        keywords=" ".join(keywords) if keywords else query,
        crop=crop,
        state=state,
        top_k=retrieval_top_k,
    )
    vector_result, keyword_result = await asyncio.gather(
        vector_task, keyword_task, return_exceptions=True
    )
    vector_pairs = [] if isinstance(vector_result, Exception) else vector_result
    keyword_pairs = [] if isinstance(keyword_result, Exception) else keyword_result
    return _rrf_merge_candidates(vector_pairs, keyword_pairs)


async def gdb_search_jev_reranked_eval(
    rephrased_query: str,
    crop: str,
    state: str,
    *,
    season: Optional[str] = None,
    domain: Optional[str] = None,
    retrieval_top_k: int = 20,
    evaluation_top_k: int = 10,
    max_concurrency: int = 5,
    task_threshold: float = 0.5,
    evidence_threshold: float = 0.5,
    target_threshold: float = 0.5,
    max_conflict_probability: float = 0.5,
    review_margin: float = 0.08,
    fallback_to_current: bool = True,
) -> dict[str, Any]:
    """Experimental hybrid retrieval followed by atomic Jev reranking.

    This endpoint is intentionally separate from ``gdb_search``. Thresholds
    are provisional and the returned audit exposes retrieval, decisions,
    latency and usage so they can be calibrated on reviewed examples.
    """
    started = time.perf_counter()
    crop, state = _normalize_crop_state(crop, state)
    original_crop = crop
    query = (rephrased_query or "").strip()
    if not query:
        raise ValueError("rephrased_query is required")

    strict_results = await strict_exact_search(query=query, crop=crop, state=state)
    if strict_results:
        response = _exact_match_response(
            query, state, crop, strict_results[0], original_crop=original_crop, crop_fallback=False
        )
        response["classification_audit"].update({
            "mode": "jev_atomic_reranker_experimental",
            "total_latency_ms": round((time.perf_counter() - started) * 1000, 1),
        })
        return response

    retrieval_started = time.perf_counter()
    pairs, retrieval_metadata = await _retrieve_rerank_candidates(
        query,
        crop,
        state,
        season=season,
        domain=domain,
        retrieval_top_k=retrieval_top_k,
    )
    crop_fallback = False
    if not pairs and crop != "all":
        crop_fallback = True
        crop = "all"
        pairs, retrieval_metadata = await _retrieve_rerank_candidates(
            query,
            crop,
            state,
            season=season,
            domain=domain,
            retrieval_top_k=retrieval_top_k,
        )
    retrieval_ms = (time.perf_counter() - retrieval_started) * 1000
    evaluated_pairs = pairs[:evaluation_top_k]

    audit: dict[str, Any] = {
        "status": "empty",
        "model": f"jev:{jev_client.gateway()}:{jev_client.model_name()}",
        "mode": "jev_atomic_reranker_experimental",
        "thresholds_are_provisional": True,
        "thresholds": {
            "same_task": task_threshold,
            "answer_evidence": evidence_threshold,
            "target_match": target_threshold,
            "max_conflict": max_conflict_probability,
            "review_margin": review_margin,
        },
        "retrieval": {
            "strategy": "semantic_plus_keyword_rrf",
            "requested_per_source": retrieval_top_k,
            "unique_candidates": len(pairs),
            "evaluated_candidates": len(evaluated_pairs),
            "latency_ms": round(retrieval_ms, 1),
            "candidates": [
                {
                    "rank": rank,
                    "question_id": pair.question_id,
                    "question": pair.question_text,
                    "sources": retrieval_metadata.get(pair.question_id, {}).get("sources", []),
                    "source_ranks": retrieval_metadata.get(pair.question_id, {}).get("source_ranks", {}),
                    "rrf_score": retrieval_metadata.get(pair.question_id, {}).get("rrf_score", 0.0),
                }
                for rank, pair in enumerate(pairs, 1)
            ],
        },
        "evaluations": [],
        "selected_question_id": None,
        "selection_rule": "eligibility_gates_then_risk_adjusted_score_then_rrf",
    }
    response: dict[str, Any] = {
        "rephrased_query": query,
        "state": state,
        "crop": crop,
        "exact_match": {},
        "selected_match": None,
        "classification_audit": audit,
    }
    _apply_crop_fallback_metadata(
        response, original_crop=original_crop, crop_fallback=crop_fallback
    )
    if not evaluated_pairs:
        audit["total_latency_ms"] = round((time.perf_counter() - started) * 1000, 1)
        return response

    semaphore = asyncio.Semaphore(max_concurrency)

    async def evaluate(pair: QuestionAnswerPair) -> tuple[QuestionAnswerPair, dict[str, Any]]:
        async with semaphore:
            state_obj, questions = jev_tasks.golden_candidate_rerank_request(
                query, crop, state, pair
            )
            result = await jev_client.adecide(
                jev_tasks.GOLDEN_CANDIDATE_RERANK_TASK, state_obj, questions
            )
            checks = jev_tasks.golden_candidate_rerank_result(result)
            policy = jev_tasks.golden_candidate_rerank_policy(
                checks,
                task_threshold=task_threshold,
                evidence_threshold=evidence_threshold,
                target_threshold=target_threshold,
                max_conflict_probability=max_conflict_probability,
            )
            return pair, {
                **checks,
                **policy,
                "jev_latency_ms": round(result.latency_ms, 1),
                "input_tokens": result.input_tokens,
                "output_tokens": result.output_tokens,
                "cost": result.cost,
            }

    jev_started = time.perf_counter()
    outcomes = await asyncio.gather(
        *(evaluate(pair) for pair in evaluated_pairs), return_exceptions=True
    )
    jev_ms = (time.perf_counter() - jev_started) * 1000
    successful: list[tuple[QuestionAnswerPair, dict[str, Any]]] = []
    costs: list[float] = []
    total_input_tokens = 0
    total_output_tokens = 0
    for pair, outcome in zip(evaluated_pairs, outcomes):
        meta = retrieval_metadata.get(pair.question_id, {})
        base = {
            "question_id": pair.question_id,
            "retrieved_question": pair.question_text,
            "similarity_score": pair.similarity_score,
            "retrieval_sources": meta.get("sources", []),
            "retrieval_ranks": meta.get("source_ranks", {}),
            "rrf_score": meta.get("rrf_score", 0.0),
            "chosen_for_answer": False,
        }
        if isinstance(outcome, Exception):
            audit["evaluations"].append({
                **base,
                "eligible": False,
                "action": "jev_error",
                "error": type(outcome).__name__,
            })
            continue
        _, decision = outcome
        successful.append((pair, decision))
        if decision.get("cost") is not None:
            costs.append(float(decision["cost"]))
        total_input_tokens += int(decision.get("input_tokens") or 0)
        total_output_tokens += int(decision.get("output_tokens") or 0)
        audit["evaluations"].append({
            **base,
            **decision,
            "action": (
                "eligible"
                if decision["eligible"]
                else "review_candidate"
                if decision.get("reviewable")
                else "rejected_by_gate"
            ),
        })

    audit["jev"] = {
        "requests": len(evaluated_pairs),
        "successful_requests": len(successful),
        "wall_latency_ms": round(jev_ms, 1),
        "summed_provider_latency_ms": round(
            sum(float(d.get("jev_latency_ms") or 0.0) for _, d in successful), 1
        ),
        "input_tokens": total_input_tokens,
        "output_tokens": total_output_tokens,
        "cost": round(sum(costs), 8) if costs else None,
        "max_concurrency": max_concurrency,
    }

    if not successful and fallback_to_current:
        with jev_client.provider_override({"*": "current", "fallback": "current"}):
            fallback = await gdb_search(
                rephrased_query=query,
                crop=original_crop,
                state=state,
                season=season,
                domain=domain,
                embedding_field="embedding",
            )
        fallback_audit = fallback.get("classification_audit") or {}
        fallback_audit.update({
            "mode": "jev_atomic_reranker_experimental",
            "status": "fallback",
            "fallback_used": "current_gdb",
            "reranker_audit": audit,
            "total_latency_ms": round((time.perf_counter() - started) * 1000, 1),
        })
        fallback["classification_audit"] = fallback_audit
        return fallback

    eligible = [(pair, decision) for pair, decision in successful if decision["eligible"]]

    def candidate_rank(item: tuple[QuestionAnswerPair, dict[str, Any]]) -> tuple[float, float, float]:
        pair, decision = item
        task_priority = 2.0 if decision.get("task_alignment") == "SAME_TASK" else 1.0
        return (
            task_priority,
            float(decision["risk_adjusted_score"]),
            float(retrieval_metadata[pair.question_id]["rrf_score"]),
        )

    eligible.sort(
        key=candidate_rank,
        reverse=True,
    )
    if eligible:
        winner, winner_decision = eligible[0]
        runner_score = float(eligible[1][1]["risk_adjusted_score"]) if len(eligible) > 1 else 0.0
        margin = float(winner_decision["risk_adjusted_score"]) - runner_score
        failed_requests = len(evaluated_pairs) - len(successful)
        status = (
            "review"
            if failed_requests or (len(eligible) > 1 and margin < review_margin)
            else "selected"
        )
        proposed_match = match_entry(
            winner,
            RETRIEVAL_SOURCE_RAG,
            gemma_class="JEV_RERANKED",
            chosen_for_answer=True,
            answer_from_class="JEV_RERANKED",
            selection_status=status,
            risk_adjusted_score=winner_decision["risk_adjusted_score"],
        )
        audit["proposed_match"] = proposed_match
        if status == "selected":
            response["selected_match"] = proposed_match
        audit["status"] = status
        audit["selected_question_id"] = winner.question_id
        audit["score_margin"] = margin
        audit["failed_jev_requests"] = failed_requests
        for ev in audit["evaluations"]:
            if ev["question_id"] == winner.question_id:
                ev["chosen_for_answer"] = True
                ev["action"] = "review" if status == "review" else "selected"
    else:
        reviewable = [
            (pair, decision)
            for pair, decision in successful
            if decision.get("reviewable")
        ]
        reviewable.sort(key=candidate_rank, reverse=True)
        if reviewable:
            winner, winner_decision = reviewable[0]
            proposed_match = match_entry(
                winner,
                RETRIEVAL_SOURCE_RAG,
                gemma_class="JEV_RERANKED_REVIEW",
                chosen_for_answer=False,
                answer_from_class="JEV_RERANKED_REVIEW",
                selection_status="review",
                risk_adjusted_score=winner_decision["risk_adjusted_score"],
            )
            audit["status"] = "review"
            audit["selected_question_id"] = winner.question_id
            audit["proposed_match"] = proposed_match
            for ev in audit["evaluations"]:
                if ev["question_id"] == winner.question_id:
                    ev["action"] = "review"
        else:
            audit["status"] = "no_answer"

    audit["total_latency_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return response


def _combined_score(similarity_score: float, relevance_score: float) -> float:
    """
    Calculate combined score for ranking candidates.
    
    Combines:
    - Similarity score (from semantic/BM25 search): normalized 0-1
    - Relevance score (from LLM relevance filter): 0-1 scale
    
    Weight: semantic (60%) + relevance (40%) by default
    """
    sim_norm = min(max(similarity_score or 0, 0), 1)  # Normalize to 0-1
    return (sim_norm * SEMANTIC_RELEVANCE_WEIGHT) + (relevance_score * BM25_RELEVANCE_WEIGHT)


# Retrieval source types for V2
RETRIEVAL_SOURCE_QUESTION_SEMANTIC = "question_semantic"
RETRIEVAL_SOURCE_ANSWER_SEMANTIC = "answer_semantic"
RETRIEVAL_SOURCE_KEYWORD = "keyword"


async def _semantic_question_search(
    query: str,
    crop: str,
    state: str,
    *,
    season: Optional[str] = None,
    domain: Optional[str] = None,
    embedding_field: str = "question_embedding",
) -> list[QuestionAnswerPair]:
    """Run question embedding search only, limited to QUESTIONS_TOP_K results."""
    from golden_core import QUESTIONS_TOP_K
    
    results = await vector_rag_search(
        query,
        crop,
        state,
        season=season,
        domain=domain,
        use_dual_search=False,  # Only question search
        embedding_field=embedding_field,
        top_k=QUESTIONS_TOP_K,  # Explicitly limit to 3 results
    )
    return results[:QUESTIONS_TOP_K]  # Ensure strict limit


async def _semantic_answer_search(
    query: str,
    crop: str,
    state: str,
    *,
    season: Optional[str] = None,
    domain: Optional[str] = None,
) -> list[QuestionAnswerPair]:
    """Run answer embedding search only using the dual index, limited to ANSWERS_TOP_K results."""
    from golden_core import (
        MONGODB_DUAL_EMBEDDING_INDEX,
        questions_collection,
        _embed_text,
        _get_answer_text_sources_and_author_name,
        ANSWERS_TOP_K,
    )
    
    crop_norm, state_norm = _normalize_crop_state(crop, state)
    
    filters: dict[str, Any] = {"status": "closed"}
    if crop_norm != "all":
        filters["details.normalised_crop"] = crop_norm
    if state_norm != "all":
        filters["details.state"] = state_norm
    if season:
        filters["details.season"] = season
    if domain:
        filters["details.domain"] = domain
    
    # Generate query vector
    query_vector = await _embed_text(query)
    
    k = ANSWERS_TOP_K  # 2 results
    pipeline: list[dict[str, Any]] = [
        {
            "$vectorSearch": {
                "index": MONGODB_DUAL_EMBEDDING_INDEX,
                "path": "answer_embedding",
                "queryVector": query_vector,
                "numCandidates": max(20, k * 10),
                "limit": k,
                "filter": filters,
            }
        },
        {
            "$project": {
                "_id": 1,
                "question": 1,
                "text": 1,
                "answer": 1,
                "answer_embedding": 1,
                "details": 1,
                "vector_score": {"$meta": "vectorSearchScore"},
            }
        },
    ]
    
    cursor = await questions_collection.aggregate(pipeline)
    answer_docs = await cursor.to_list(length=k)
    
    # Process answer results and return
    result: list[QuestionAnswerPair] = []
    
    for doc in answer_docs:
        score = doc.get("vector_score")
        question_id = str(doc["_id"])
        answer, sources, author_name = await _get_answer_text_sources_and_author_name(question_id)
        if not answer:
            continue
        result.append(
            QuestionAnswerPair(
                question_id=question_id,
                question_text=doc.get("question") or doc.get("text", ""),
                answer_text=answer,
                author=author_name,
                sources=sources,
                similarity_score=score,
            )
        )
    
    return result[:ANSWERS_TOP_K]  # Ensure strict limit


async def gdb_search_v2(
    rephrased_query: str,
    crop: str,
    state: str,
    *,
    season: Optional[str] = None,
    domain: Optional[str] = None,
    use_dual_search: bool = True,  # V2 defaults to dual search
    embedding_field: str = "question_embedding",  # V2 uses question_embedding
    original_query: Optional[str] = None,
) -> dict[str, Any]:
    """
    V2 Search: Combines 3 Q-semantic + 2 A-semantic + 3 BM25 = 8 pairs total.
    
    Pipeline:
    1. LLM refine query (already done in v2 endpoint)
    2. Extract keywords from refined query for BM25
    3. Run semantic search (3 Q + 2 A) + BM25 search in parallel
    4. Combine all 8 pairs, deduplicate
    5. LLM relevance scoring (batch, with numerical scores)
    6. Select highest-scoring pair for answer generation
    
    Args:
        rephrased_query: LLM-refined core farming question
        crop: Crop filter
        state: State filter
        season: Optional season filter
        domain: Optional domain filter
        use_dual_search: Enable Q+A semantic search (default True)
        embedding_field: Embedding field name (default question_embedding)
        original_query: Original user query for LLM scoring
    
    Returns:
        Extended response with v2-specific metadata
    """
    crop, state = _normalize_crop_state(crop, state)
    original_crop = crop
    crop_fallback = False
    query = (rephrased_query or "").strip()
    if not query:
        raise ValueError("rephrased_query is required")
    
    scoring_query = (original_query or rephrased_query or "").strip()
    
    log.info(
        "gdb_search_v2 start rephrased_query=%r crop=%s state=%s",
        _truncate_text(query, 80),
        crop,
        state,
    )
    
    # Step 3.1: Extract keywords for BM25 search
    keywords = extract_keywords(query, max_keywords=10)
    keywords_str = " ".join(keywords) if keywords else query
    log.info("gdb_search_v2 extracted keywords: %s", keywords)
    
    # Step 3.2: Run searches in parallel
    # Run Q and A searches separately to track sources
    all_tasks = []
    
    # Question semantic search (3 results)
    if use_dual_search:
        q_semantic_task = _semantic_question_search(
            query, crop, state, season=season, domain=domain, embedding_field=embedding_field,
        )
        all_tasks.append((RETRIEVAL_SOURCE_QUESTION_SEMANTIC, q_semantic_task))
        
        # Answer semantic search (2 results)
        a_semantic_task = _semantic_answer_search(
            query, crop, state, season=season, domain=domain,
        )
        all_tasks.append((RETRIEVAL_SOURCE_ANSWER_SEMANTIC, a_semantic_task))
    else:
        # Fall back to combined semantic search
        semantic_task = vector_rag_search(
            query, crop, state, season=season, domain=domain,
            use_dual_search=False, embedding_field=embedding_field,
        )
        all_tasks.append((RETRIEVAL_SOURCE_QUESTION_SEMANTIC, semantic_task))
    
    # BM25 search with keywords (3 results)
    if ENABLE_V2_SEARCH and keywords:
        bm25_task = bm25_search(
            keywords=keywords_str,
            crop=crop,
            state=state,
        )
        all_tasks.append((RETRIEVAL_SOURCE_KEYWORD, bm25_task))
    
    # Execute all searches in parallel
    search_results = await asyncio.gather(*[task for _, task in all_tasks], return_exceptions=True)
    
    # Collect all pairs and track ALL sources for each question
    all_pairs: list[tuple[QuestionAnswerPair, str]] = []
    seen_ids: set[str] = set()
    # Track all sources per question_id (each question can appear in multiple sources)
    question_sources: dict[str, list[str]] = {}
    question_semantic_ids: set[str] = set()
    answer_semantic_ids: set[str] = set()
    keyword_ids: set[str] = set()
    
    for (source_type, _), result in zip(all_tasks, search_results):
        if isinstance(result, Exception):
            log.warning("gdb_search_v2 %s search failed: %s", source_type, result)
            continue
        
        for pair in result:
            # Track ALL sources this question was found in (not just first)
            if pair.question_id not in question_sources:
                question_sources[pair.question_id] = []
            if source_type not in question_sources[pair.question_id]:
                question_sources[pair.question_id].append(source_type)
                log.info("gdb_search_v2: question_id=%s found in %s (total sources: %d)", 
                         pair.question_id, source_type, len(question_sources[pair.question_id]))
            
            if pair.question_id in seen_ids:
                # Already processed this question_id, but track the source
                continue
            
            all_pairs.append((pair, source_type))
            seen_ids.add(pair.question_id)
            
            if source_type == RETRIEVAL_SOURCE_QUESTION_SEMANTIC:
                question_semantic_ids.add(pair.question_id)
            elif source_type == RETRIEVAL_SOURCE_ANSWER_SEMANTIC:
                answer_semantic_ids.add(pair.question_id)
            elif source_type == RETRIEVAL_SOURCE_KEYWORD:
                keyword_ids.add(pair.question_id)
    
    log.info("gdb_search_v2 combined: Q_semantic=%d A_semantic=%d BM25=%d total=%d",
             len(question_semantic_ids), len(answer_semantic_ids), 
             len(keyword_ids), len(all_pairs))
    
    # Crop fallback if no results
    if not all_pairs and crop != "all":
        log.info("gdb_search_v2: no hits for crop=%s; retrying with crop=all", crop)
        crop_fallback = True
        
        # Re-run searches with crop=all
        fallback_tasks = []
        
        if use_dual_search:
            # Q + A semantic
            fallback_q = _semantic_question_search(query, "all", state, season=season, domain=domain, embedding_field=embedding_field)
            fallback_tasks.append((RETRIEVAL_SOURCE_QUESTION_SEMANTIC, fallback_q))
            
            fallback_a = _semantic_answer_search(query, "all", state, season=season, domain=domain)
            fallback_tasks.append((RETRIEVAL_SOURCE_ANSWER_SEMANTIC, fallback_a))
        else:
            fallback_semantic = vector_rag_search(query, "all", state, season=season, domain=domain,
                use_dual_search=False, embedding_field=embedding_field)
            fallback_tasks.append((RETRIEVAL_SOURCE_QUESTION_SEMANTIC, fallback_semantic))
        
        if ENABLE_V2_SEARCH and keywords:
            fallback_bm25 = bm25_search(keywords=keywords_str, crop="all", state=state)
            fallback_tasks.append((RETRIEVAL_SOURCE_KEYWORD, fallback_bm25))
        
        fallback_results = await asyncio.gather(*[t for _, t in fallback_tasks], return_exceptions=True)
        
        for (source_type, _), result in zip(fallback_tasks, fallback_results):
            if isinstance(result, Exception):
                continue
            for pair in result:
                if pair.question_id not in seen_ids:
                    all_pairs.append((pair, source_type))
                    seen_ids.add(pair.question_id)
        
        crop = "all"
    
    if not all_pairs:
        log.warning("gdb_search_v2 done path=empty (no hits)")
        return {
            "rephrased_query": query,
            "original_query": scoring_query if scoring_query != query else None,
            "state": state,
            "crop": original_crop,
            "exact_match": {},
            "selected_match": None,
            "classification_audit": {
                "status": "empty",
                "model": _decision_model(),
                "search_mode": "v2_combined",
                "keywords_used": keywords,
                "evaluations": [],
            },
            "v2_metadata": {
                "keywords_extracted": keywords,
                "semantic_results": 0,
                "bm25_results": 0,
                "total_candidates": 0,
            },
        }
    
    # Count by source type
    question_semantic_count = sum(1 for _, src in all_pairs if src == RETRIEVAL_SOURCE_QUESTION_SEMANTIC)
    answer_semantic_count = sum(1 for _, src in all_pairs if src == RETRIEVAL_SOURCE_ANSWER_SEMANTIC)
    keyword_count = sum(1 for _, src in all_pairs if src == RETRIEVAL_SOURCE_KEYWORD)
    
    # Extract pairs for Gemma pipeline
    pairs_only = [pair for pair, _ in all_pairs]
    
    # Build response with v2 metadata
    response: dict[str, Any] = {
        "rephrased_query": query,
        "original_query": scoring_query if scoring_query != query else None,
        "state": state,
        "crop": crop,
        "exact_match": {},
        "selected_match": None,
        "classification_audit": {
            "status": "empty",
            "model": _decision_model(),
            "search_mode": "v2_combined",
            "relevance_filter_mode": "batch_all_candidates",
            "evaluations": [],
            "selected_question_id": None,
            "selection_rule": SELECTION_RULE,
        },
        "v2_metadata": {
            "keywords_extracted": keywords,
            "question_semantic_results": question_semantic_count,
            "answer_semantic_results": answer_semantic_count,
            "keyword_results": keyword_count,
            "total_candidates": len(all_pairs),
            "retrieval_sources": question_sources,  # dict[str, list[str]] - ALL sources per question
        },
    }
    
    # Step 3.4: LLM Relevance Scoring with numerical scores
    filter_results = await filter_relevance_batch(
        scoring_query, pairs_only, crop=crop, state=state
    )
    
    # Add combined scores to evaluations
    evaluations: list[dict] = []
    kept_pairs_with_scores: list[tuple[QuestionAnswerPair, float, dict]] = []
    
    for i, ((pair, src), filt) in enumerate(zip(all_pairs, filter_results)):
        decision = filt.get("relevance_decision", "KEEP")
        relevance_score = _decision_to_score(decision)
        similarity = pair.similarity_score or 0.0
        combined = _combined_score(similarity, relevance_score)
        
        ev = {
            "question_id": pair.question_id,
            "similarity_score": similarity,
            "relevance_decision": decision,
            "relevance_score": relevance_score,
            "combined_score": combined,
            "retrieval_source": src,
            "retrieved_question": pair.question_text,
            "relevance_reason": filt.get("relevance_reason", ""),
            "classification": None,
            "reason": "",
            "llm_parse_ok": filt.get("llm_parse_ok", False),
            "action": "pending",
        }
        
        if decision == "REJECT":
            ev["action"] = "rejected_irrelevant"
            log.info("gdb_search_v2 REJECT question_id=%s score=%.3f", 
                     pair.question_id, combined)
        else:
            kept_pairs_with_scores.append((pair, combined, ev))
            ev["action"] = "passed_relevance_filter"
        
        evaluations.append(ev)
    
    # Step 3.5: Select highest-scoring pair
    # Sort by combined score and classify top candidates
    if kept_pairs_with_scores:
        kept_pairs_with_scores.sort(key=lambda x: x[1], reverse=True)
        kept_pairs = [item[0] for item in kept_pairs_with_scores]
        
        # Get top candidates for classification (max 5 for LLM efficiency)
        top_for_classify = kept_pairs[:5]
        
        # Run classification on top candidates
        classify_tasks = [
            classify_pair(
                original_query=scoring_query,
                retrieved_question=pair.question_text,
                retrieved_answer=pair.answer_text,
                crop=crop,
                state=state,
            )
            for pair in top_for_classify
        ]
        classify_results = await asyncio.gather(*classify_tasks)
        
        # Build evaluation map
        ev_by_id = {ev["question_id"]: ev for ev in evaluations}
        
        # Update evaluations with classification
        same_intent_candidates: list[tuple[float, QuestionAnswerPair, dict]] = []
        covered_candidates: list[tuple[float, QuestionAnswerPair, dict]] = []
        partially_covered_candidates: list[tuple[float, QuestionAnswerPair, dict]] = []
        
        for pair, cls_result in zip(top_for_classify, classify_results):
            ev = ev_by_id[pair.question_id]
            ev["classification"] = cls_result.get("classification", "NOT_COVERED")
            ev["reason"] = cls_result.get("reason", "")
            ev["action"] = "classified"
            
            # Find the combined score for this pair
            combined_score = next(
                (score for p, score, _ in kept_pairs_with_scores if p.question_id == pair.question_id),
                0.0
            )
            
            cls = cls_result.get("classification", "NOT_COVERED")
            if cls == "SAME_INTENT":
                same_intent_candidates.append((combined_score, pair, ev))
            elif cls == "COVERED_BY_CONTEXT":
                covered_candidates.append((combined_score, pair, ev))
            elif cls == "PARTIALLY_COVERED":
                partially_covered_candidates.append((combined_score, pair, ev))
        
        # Mark non-top candidates as skipped
        for ev in evaluations:
            if ev["action"] == "pending":
                ev["action"] = "skipped_lower_priority"
        
        # Select best: SAME_INTENT first, then COVERED_BY_CONTEXT
        selection = None
        selected_ev = None
        
        if same_intent_candidates:
            # Sort by combined score and pick highest
            same_intent_candidates.sort(key=lambda x: x[0], reverse=True)
            _, selected_pair, selected_ev = same_intent_candidates[0]
            selection = {
                "pair": selected_pair,
                "cls_result": {"classification": "SAME_INTENT", "reason": selected_ev.get("reason", "")},
                "winning_class": "SAME_INTENT",
            }
        elif covered_candidates:
            covered_candidates.sort(key=lambda x: x[0], reverse=True)
            _, selected_pair, selected_ev = covered_candidates[0]
            selection = {
                "pair": selected_pair,
                "cls_result": {"classification": "COVERED_BY_CONTEXT", "reason": selected_ev.get("reason", "")},
                "winning_class": "COVERED_BY_CONTEXT",
            }
        elif partially_covered_candidates:
            partially_covered_candidates.sort(key=lambda x: x[0], reverse=True)
            _, selected_pair, selected_ev = partially_covered_candidates[0]
            selection = {
                "pair": selected_pair,
                "cls_result": {"classification": "PARTIALLY_COVERED", "reason": selected_ev.get("reason", "")},
                "winning_class": "PARTIALLY_COVERED",
            }
        
        if selection:
            winner: QuestionAnswerPair = selection["pair"]
            winner_cls = selection["cls_result"]
            winner_class = selection["winning_class"]
            
            # Update evaluation for winner
            for ev in evaluations:
                if ev["question_id"] == winner.question_id:
                    ev["chosen_for_answer"] = True
                    ev["action"] = "selected"
                    ev["combined_score"] = next(
                        (score for p, score, _ in kept_pairs_with_scores if p.question_id == winner.question_id),
                        ev.get("combined_score", 0.0)
                    )
                else:
                    ev["chosen_for_answer"] = False
            
            # Get source for winner
            winner_src = next(
                src for pair, src in all_pairs if pair.question_id == winner.question_id
            )
            
            response["selected_match"] = match_entry(
                winner,
                winner_src,  # Use V2 source type directly
                gemma_class=winner_class,
                combined_score=selected_ev.get("combined_score", 0.0) if selected_ev else 0.0,
                chosen_for_answer=True,
                answer_from_class=winner_class,
            )
            
            audit = response["classification_audit"]
            audit["evaluations"] = evaluations
            audit["status"] = "selected"
            audit["selected_question_id"] = winner.question_id
            audit["selection_rule"] = f"v2_combined_{winner_class.lower()}"
            audit["answer_from_class"] = winner_class
            audit["selection_method"] = "combined_score_ranking"
            audit["chosen_for_answer"] = True
            
            log.info(
                "gdb_search_v2 done path=selected question_id=%s class=%s score=%.3f src=%s",
                winner.question_id,
                winner_class,
                selected_ev.get("combined_score", 0.0) if selected_ev else 0.0,
                winner_src,
            )
        else:
            # No SAME_INTENT or COVERED_BY_CONTEXT found
            for ev in evaluations:
                ev["chosen_for_answer"] = False
            
            audit = response["classification_audit"]
            audit["evaluations"] = evaluations
            audit["status"] = "empty"
            audit["chosen_for_answer"] = False
            
            log.warning("gdb_search_v2 done path=empty (no eligible candidates)")
    else:
        for ev in evaluations:
            ev["chosen_for_answer"] = False
        
        audit = response["classification_audit"]
        audit["evaluations"] = evaluations
        audit["status"] = "empty"
    
    return response
