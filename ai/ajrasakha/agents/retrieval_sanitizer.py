"""Filter GDB similar-match QA pairs by LLM relevance before synthesis."""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

from ajrasakha.agents.config import ChatAnthropic
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig

from ajrasakha.agents.config import SANITIZER_MODEL
from ajrasakha.agents.llm_trace import trace_llm_request, trace_llm_response
from ajrasakha.agents.prompts import RETRIEVAL_SANITIZER_SYSTEM_PROMPT
from ajrasakha.agents.state import (
    AjraSakhaState,
    RetrievalSanitizerAudit,
    RetrievalSanitizerEvaluation,
)

logger = logging.getLogger(__name__)

RELEVANCE_THRESHOLD = 0.7
SIMILAR_PAIR_KEYS = tuple(f"similar_pair{i}" for i in range(1, 6))

_BATCH_SUFFIX = (
    "\n\nReturn a JSON array only. One object per pair with keys: "
    "pair_key, relevance_score, reason. No other text."
)

_UI_SNIPPET_LEN = 400


def _snippet(text: str, limit: int = _UI_SNIPPET_LEN) -> str:
    cleaned = (text or "").strip().replace("\n", " ")
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 3] + "..."


def _evaluation_entry(
    key: str,
    pair: dict,
    *,
    relevance_score: Optional[float],
    reason: str,
    action: str,
) -> RetrievalSanitizerEvaluation:
    return {
        "pair_key": key,
        "retrieved_question": _snippet(str(pair.get("question") or "")),
        "retrieved_answer": _snippet(str(pair.get("answer") or "")),
        "relevance_score": relevance_score,
        "reason": reason,
        "action": action,
    }


def _audit_with_queries(
    audit: RetrievalSanitizerAudit,
    original_query: str,
    rephrased_query: str,
) -> RetrievalSanitizerAudit:
    audit["farmer_query_original"] = original_query
    audit["farmer_query_rephrased"] = rephrased_query
    return audit


def _message_to_text(message: BaseMessage) -> str:
    content = message.content
    if content is None:
        return ""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                text = block.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return " ".join(parts).strip()
    return str(content).strip()


def _latest_human_text(messages: list[BaseMessage]) -> str:
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            return _message_to_text(msg)
    return ""


def _find_gdb_tool_message(messages: list[BaseMessage]) -> Optional[tuple[int, ToolMessage]]:
    """Return (index, ToolMessage) for gdb in the current turn (after last HumanMessage)."""
    last_human_idx = -1
    for i in range(len(messages) - 1, -1, -1):
        if isinstance(messages[i], HumanMessage):
            last_human_idx = i
            break
    if last_human_idx < 0:
        return None
    for i in range(len(messages) - 1, last_human_idx, -1):
        msg = messages[i]
        if isinstance(msg, ToolMessage) and getattr(msg, "name", None) == "gdb":
            return i, msg
    return None


def _parse_gdb_payload(text: str) -> Optional[dict]:
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except (json.JSONDecodeError, TypeError):
        pass
    return None


def _pair_has_content(pair: dict) -> bool:
    return bool((pair.get("question") or "").strip() or (pair.get("answer") or "").strip())


def _pair_has_answer(pair: dict) -> bool:
    return bool((pair.get("answer") or "").strip())


def gdb_has_usable_answers(gdb_data: dict) -> bool:
    """True when GDB has an exact or similar pair with a non-empty expert answer."""
    if gdb_data.get("is_exact"):
        exact = gdb_data.get("exact_match") or {}
        if (exact.get("answer") or "").strip():
            return True
    for key in SIMILAR_PAIR_KEYS:
        pair = gdb_data.get(key)
        if isinstance(pair, dict) and _pair_has_answer(pair):
            return True
    return False


def _collect_similar_pairs(gdb_data: dict) -> list[tuple[str, dict]]:
    pairs: list[tuple[str, dict]] = []
    for key in SIMILAR_PAIR_KEYS:
        pair = gdb_data.get(key)
        if isinstance(pair, dict) and _pair_has_content(pair):
            pairs.append((key, pair))
    return pairs


def _has_exact_match(gdb_data: dict) -> bool:
    if not gdb_data.get("is_exact"):
        return False
    exact = gdb_data.get("exact_match") or {}
    return bool((exact.get("answer") or "").strip())


def _recompute_is_similar(gdb_data: dict) -> None:
    gdb_data["is_similar"] = any(
        isinstance(gdb_data.get(key), dict) and _pair_has_answer(gdb_data[key])
        for key in SIMILAR_PAIR_KEYS
    )


def _strip_json_fence(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.IGNORECASE)
        stripped = re.sub(r"\s*```$", "", stripped)
    return stripped.strip()


def _build_batch_human_content(
    original_query: str,
    rephrased_query: str,
    pairs: list[tuple[str, dict]],
) -> str:
    lines = [
        f"Farmer Query (original):\n{original_query or '(not provided)'}",
        f"Farmer Query (English rephrased):\n{rephrased_query or '(not provided)'}",
        "",
        "Retrieved QA pairs to evaluate:",
    ]
    for key, pair in pairs:
        lines.append(f"\n--- {key} ---")
        lines.append(f"Retrieved Question:\n{pair.get('question') or ''}")
        lines.append(f"Retrieved Answer:\n{pair.get('answer') or ''}")
    lines.append(_BATCH_SUFFIX)
    return "\n".join(lines)


def _apply_scores(
    gdb_data: dict,
    pairs: list[tuple[str, dict]],
    scores: Optional[dict[str, float]],
    reasons: Optional[dict[str, str]] = None,
) -> list[RetrievalSanitizerEvaluation]:
    """Keep only the single highest-confidence pair above threshold."""
    evaluations: list[RetrievalSanitizerEvaluation] = []
    reasons = reasons or {}

    if scores is None:
        logger.warning("retrieval_sanitizer: could not parse batch scores — keeping all pairs")
        for key, pair in pairs:
            evaluations.append(
                _evaluation_entry(
                    key,
                    pair,
                    relevance_score=None,
                    reason="LLM response could not be parsed; pair kept (fail open)",
                    action="kept_fail_open",
                )
            )
        return evaluations

    # First pass: evaluate all pairs and track those above threshold
    scored_pairs: list[tuple[str, dict, float, str]] = []
    for key, pair in pairs:
        score = scores.get(key)
        reason_text = reasons.get(key, "")
        if score is None:
            logger.info("retrieval_sanitizer: no score for %s — keeping (fail open)", key)
            evaluations.append(
                _evaluation_entry(
                    key,
                    pair,
                    relevance_score=None,
                    reason=reason_text or "No score returned; pair kept (fail open)",
                    action="kept_fail_open",
                )
            )
            continue

        if score >= RELEVANCE_THRESHOLD:
            logger.info(
                "retrieval_sanitizer: %s above threshold (score=%.3f >= %.2f)",
                key,
                score,
                RELEVANCE_THRESHOLD,
            )
            scored_pairs.append((key, pair, score, reason_text))
            evaluations.append(
                _evaluation_entry(
                    key,
                    pair,
                    relevance_score=score,
                    reason=reason_text,
                    action="kept",
                )
            )
        else:
            logger.info(
                "retrieval_sanitizer: dropping %s (score=%.3f < %.2f)",
                key,
                score,
                RELEVANCE_THRESHOLD,
            )
            gdb_data.pop(key, None)
            evaluations.append(
                _evaluation_entry(
                    key,
                    pair,
                    relevance_score=score,
                    reason=reason_text,
                    action="dropped",
                )
            )

    # Second pass: select only the single highest-confidence pair
    if scored_pairs:
        best_key, best_pair, best_score, best_reason = max(scored_pairs, key=lambda x: x[2])
        # Remove all other above-threshold pairs from gdb_data
        for key, _, _, _ in scored_pairs:
            if key != best_key:
                gdb_data.pop(key, None)
        # Renumber: always store the best pair as similar_pair1 so synthesizer finds it
        if best_key != "similar_pair1":
            gdb_data.pop(best_key, None)
            gdb_data["similar_pair1"] = best_pair
            logger.info(
                "renumbered %s → similar_pair1 (score=%.3f)",
                best_key,
                best_score,
            )
        # Mark superseded pairs in evaluations
        for eval_entry in evaluations:
            if eval_entry["pair_key"] != "similar_pair1" and eval_entry.get("action") == "kept":
                eval_entry["action"] = "superseded"
                eval_entry["reason"] = (
                    f"Superseded by similar_pair1 with higher confidence (score={best_score:.3f})"
                )

    _recompute_is_similar(gdb_data)
    return evaluations


def _parse_batch_results(text: str) -> tuple[Optional[dict[str, float]], dict[str, str]]:
    """Parse LLM batch response into scores and reasons per pair_key."""
    cleaned = _strip_json_fence(text)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        return None, {}
    if not isinstance(data, list):
        return None, {}
    scores: dict[str, float] = {}
    reasons: dict[str, str] = {}
    for item in data:
        if not isinstance(item, dict):
            continue
        key = item.get("pair_key")
        if not isinstance(key, str):
            continue
        reason = item.get("reason")
        if isinstance(reason, str):
            reasons[key] = reason
        try:
            scores[key] = float(item.get("relevance_score"))
        except (TypeError, ValueError):
            continue
    return (scores if scores else None), reasons


def _audit_response(
    state: AjraSakhaState,
    audit: RetrievalSanitizerAudit,
    *,
    original_query: str = "",
    rephrased_query: str = "",
    messages: list[ToolMessage] | None = None,
) -> dict:
    """Return a small state delta — only sanitizer_audit, never the full plan.

    Previously this also wrote ``plan: {retrieval_sanitizer: audit}``.
    Because the ``plan`` channel uses a shallow-merge reducer
    (``{**left, **right}``), LangGraph Studio showed ALL planner keys
    (weather, mandi, soil …) in the retrieval_sanitizer node output,
    making it look like a duplicate planner node.

    The audit is now surfaced exclusively via the top-level
    ``sanitizer_audit`` state key (which uses a simple-replace reducer).
    """
    audit = _audit_with_queries(audit, original_query, rephrased_query)
    out: dict = {
        "sanitizer_audit": audit,
    }
    if messages:
        out["messages"] = messages
    return out


async def retrieval_sanitizer_node(
    state: AjraSakhaState,
    config: RunnableConfig,
) -> dict:
    messages = list(state.get("messages") or [])
    found = _find_gdb_tool_message(messages)
    if found is None:
        return _audit_response(
            state,
            {
                "status": "noop",
                "skip_reason": "no_gdb_tool_message",
                "threshold": RELEVANCE_THRESHOLD,
                "pairs_evaluated": 0,
                "pairs_kept": 0,
                "pairs_dropped": 0,
                "evaluations": [],
                "llm_parse_ok": False,
            },
        )

    _idx, gdb_msg = found
    text = _message_to_text(gdb_msg)
    gdb_data = _parse_gdb_payload(text)
    if gdb_data is None:
        return _audit_response(
            state,
            {
                "status": "noop",
                "skip_reason": "gdb_json_invalid",
                "threshold": RELEVANCE_THRESHOLD,
                "pairs_evaluated": 0,
                "pairs_kept": 0,
                "pairs_dropped": 0,
                "evaluations": [],
                "llm_parse_ok": False,
            },
        )

    if _has_exact_match(gdb_data):
        return _audit_response(
            state,
            {
                "status": "skipped",
                "skip_reason": "exact_match_bypass",
                "threshold": RELEVANCE_THRESHOLD,
                "pairs_evaluated": 0,
                "pairs_kept": 0,
                "pairs_dropped": 0,
                "evaluations": [],
                "llm_parse_ok": False,
            },
        )

    pairs = _collect_similar_pairs(gdb_data)
    if not pairs:
        return _audit_response(
            state,
            {
                "status": "noop",
                "skip_reason": "no_similar_pairs",
                "threshold": RELEVANCE_THRESHOLD,
                "pairs_evaluated": 0,
                "pairs_kept": 0,
                "pairs_dropped": 0,
                "evaluations": [],
                "llm_parse_ok": False,
            },
        )

    plan = state.get("plan") or {}
    original_query = _latest_human_text(messages)
    rephrased_query = (
        plan.get("rephrased_query")
        or gdb_data.get("rephrased_query")
        or ""
    )

    human_content = _build_batch_human_content(original_query, rephrased_query, pairs)
    llm_messages = [
        SystemMessage(content=RETRIEVAL_SANITIZER_SYSTEM_PROMPT),
        HumanMessage(content=human_content),
    ]

    scores: Optional[dict[str, float]] = None
    reasons: dict[str, str] = {}
    llm_parse_ok = False
    llm_error: Optional[str] = None
    try:
        trace_llm_request(
            "retrieval_sanitizer",
            model=SANITIZER_MODEL,
            messages=llm_messages,
            pairs_evaluated=len(pairs),
        )
        llm = ChatAnthropic(model=SANITIZER_MODEL)
        response = await llm.ainvoke(llm_messages, config=config)
        raw_text = _message_to_text(response)
        scores, reasons = _parse_batch_results(raw_text)
        llm_parse_ok = scores is not None
        trace_llm_response(
            "retrieval_sanitizer",
            output=raw_text,
            llm_parse_ok=llm_parse_ok,
            scores=scores,
        )
    except Exception as exc:
        llm_error = type(exc).__name__
        logger.warning(
            "retrieval_sanitizer: LLM call failed (%s) — keeping all pairs",
            llm_error,
        )

    evaluations = _apply_scores(gdb_data, pairs, scores, reasons)
    pairs_kept = sum(1 for e in evaluations if e.get("action") in ("kept", "kept_fail_open"))
    pairs_dropped = sum(1 for e in evaluations if e.get("action") == "dropped")

    audit: RetrievalSanitizerAudit = {
        "status": "filtered",
        "skip_reason": llm_error or "",
        "threshold": RELEVANCE_THRESHOLD,
        "pairs_evaluated": len(pairs),
        "pairs_kept": pairs_kept,
        "pairs_dropped": pairs_dropped,
        "evaluations": evaluations,
        "llm_parse_ok": llm_parse_ok,
    }

    updated_content = json.dumps(gdb_data, ensure_ascii=False)
    stable_id = getattr(gdb_msg, "id", None) or f"gdb-{gdb_msg.tool_call_id}"
    updated_msg = ToolMessage(
        content=updated_content,
        tool_call_id=gdb_msg.tool_call_id,
        name="gdb",
        id=stable_id,
    )
    return _audit_response(
        state,
        audit,
        original_query=original_query,
        rephrased_query=rephrased_query,
        messages=[updated_msg],
    )


def should_skip_sanitizer_for_gdb(data: dict) -> bool:
    """True when routing should bypass retrieval_sanitizer (exact match with answer)."""
    return _has_exact_match(data)
