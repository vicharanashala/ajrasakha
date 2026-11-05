"""Answer quality scoring — extracts final answer + context, runs DeepEval metrics.

Replaces the disabled stub. Called by run.py after technical/routing checks.
"""

import json
import logging
import re

from ajrasakha.evaluation.deepeval_metrics import evaluate_answer_with_deepeval

logger = logging.getLogger(__name__)

# Scores at or above this threshold count as PASS.
QUALITY_PASS_THRESHOLD = 0.7


# ---------------------------------------------------------------------------
# Task 3 — Extractors
# ---------------------------------------------------------------------------


def _coerce_message_text(content) -> str:
    """Convert LangGraph message content (str | list[dict]) to plain text."""
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
                # Text blocks from Anthropic responses
                text = block.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join(parts).strip()
    return str(content).strip()


def extract_final_answer(response_text: str) -> str:
    """Pull the last AI/assistant message from a LangGraph state JSON.

    The response_text from run_live_case() is the last 'values' SSE payload —
    the full LangGraph state as JSON with a 'messages' list.

    Returns the farmer-facing answer string, or "" if not found.
    """
    if not response_text or not response_text.strip():
        return ""

    try:
        data = json.loads(response_text)
    except (json.JSONDecodeError, TypeError):
        # Not valid JSON — try to extract answer from raw text
        return ""

    messages = data.get("messages") if isinstance(data, dict) else None
    if not isinstance(messages, list) or not messages:
        return ""

    # Walk messages in reverse to find the last AI message
    for msg in reversed(messages):
        if not isinstance(msg, dict):
            continue

        msg_type = msg.get("type", "").lower()
        msg_role = msg.get("role", "").lower()

        is_ai = msg_type in ("ai", "aimessage") or msg_role == "assistant"
        if not is_ai:
            continue

        content = _coerce_message_text(msg.get("content"))

        # Skip AI messages that are just tool-call requests (no text)
        if not content:
            continue

        # Skip if content looks like pure tool_use JSON (no farmer-facing text)
        if content.startswith("[{") and '"type": "tool_use"' in content:
            continue
        # TODO: replace with proper langchain_core.messages parser once
        # we capture a real fixture from live runs.

        return content

    return ""


def extract_retrieval_context(response_text: str) -> list[str]:
    """Pull retrieval context from tool messages in a LangGraph state JSON.

    Looks for ToolMessage entries (GDB, weather, market, soil, schemes).
    Returns a list of context strings for faithfulness scoring.
    """
    if not response_text or not response_text.strip():
        return []

    try:
        data = json.loads(response_text)
    except (json.JSONDecodeError, TypeError):
        return []

    messages = data.get("messages") if isinstance(data, dict) else None
    if not isinstance(messages, list):
        return []

    context_pieces: list[str] = []

    for msg in messages:
        if not isinstance(msg, dict):
            continue

        msg_type = msg.get("type", "").lower()
        is_tool = msg_type in ("tool", "toolmessage") or msg.get("role") == "tool"
        if not is_tool:
            continue

        tool_name = msg.get("name", "")
        raw_content = _coerce_message_text(msg.get("content"))
        if not raw_content:
            continue

        # Try to parse GDB JSON and extract the expert answers
        if tool_name == "gdb":
            context_pieces.extend(_extract_gdb_context(raw_content))
        else:
            # Weather, market, soil, schemes — use raw content as context
            # Truncate very long tool outputs to keep judge prompt reasonable
            context_pieces.append(raw_content[:3000])

    return context_pieces


def _extract_gdb_context(raw_content: str) -> list[str]:
    """Extract expert Q&A pairs from GDB tool output JSON."""
    pieces: list[str] = []
    try:
        gdb_data = json.loads(raw_content)
    except (json.JSONDecodeError, TypeError):
        # Not valid JSON — use raw content
        if raw_content.strip():
            pieces.append(raw_content[:3000])
        return pieces

    if not isinstance(gdb_data, dict):
        return pieces

    # Exact match
    exact = gdb_data.get("exact_match")
    if isinstance(exact, dict) and exact.get("answer"):
        q = exact.get("question", "")
        a = exact.get("answer", "")
        pieces.append(f"[GDB Exact Match]\nQ: {q}\nA: {a}")

    # Similar pairs (similar_pair1 through similar_pair5)
    for i in range(1, 6):
        pair = gdb_data.get(f"similar_pair{i}")
        if isinstance(pair, dict) and pair.get("answer"):
            q = pair.get("question", "")
            a = pair.get("answer", "")
            pieces.append(f"[GDB Similar Pair {i}]\nQ: {q}\nA: {a}")

    return pieces


# ---------------------------------------------------------------------------
# Task 4 — Main scoring function
# ---------------------------------------------------------------------------


def evaluate_response_quality(
    result: dict,
    case: dict | None = None,
    enabled: bool = False,
) -> dict:
    """Score the bot's answer for relevance and faithfulness.

    Called by run.py after technical/routing checks for every test case.

    Returns a flat dict with quality columns for CSV integration.
    Keys include both the legacy 'answerrelevancymetric_*' format (backward
    compat) and new descriptive keys.
    """
    # ── Mock mode or explicitly disabled ──────────────────────────
    if not enabled:
        return _disabled_result()

    response_text = result.get("response_text", "")
    query = (case or {}).get("query", "") or result.get("query", "")

    if not query:
        return _error_result("no_query", "No query found in case or result")

    # ── Extract answer ────────────────────────────────────────────
    try:
        final_answer = extract_final_answer(response_text)
    except Exception as exc:
        logger.warning("answer_eval: answer extraction failed: %s", exc)
        return _error_result("parse_error", f"Answer extraction failed: {exc}")

    if not final_answer or len(final_answer.strip()) < 10:
        return _no_answer_result(final_answer)

    # ── Extract retrieval context ─────────────────────────────────
    try:
        retrieval_context = extract_retrieval_context(response_text)
    except Exception as exc:
        logger.warning("answer_eval: context extraction failed: %s", exc)
        retrieval_context = []

    # ── Run DeepEval scoring ──────────────────────────────────────
    try:
        deepeval_results = evaluate_answer_with_deepeval(
            query=query,
            answer=final_answer,
            context=retrieval_context,
            threshold=QUALITY_PASS_THRESHOLD,
        )
    except Exception as exc:
        logger.warning("answer_eval: DeepEval scoring failed: %s", exc)
        return _error_result("deepeval_error", f"DeepEval scoring failed: {exc}")

    # ── Unpack scores ─────────────────────────────────────────────
    relevance = deepeval_results.get("AnswerRelevancyMetric", {})
    faithfulness = deepeval_results.get("FaithfulnessMetric", {})

    relevance_score = relevance.get("score")
    relevance_passed = relevance.get("passed", False)
    relevance_reason = relevance.get("reason", "")

    faithfulness_score = faithfulness.get("score")
    faithfulness_passed = faithfulness.get("passed", False)
    faithfulness_reason = faithfulness.get("reason", "")

    # ── Compute overall quality status ────────────────────────────
    all_scores_present = relevance_score is not None and faithfulness_score is not None
    all_passed = relevance_passed and faithfulness_passed

    if not all_scores_present:
        quality_status = "ERROR"
        quality_pass = None
    elif all_passed:
        quality_status = "PASS"
        quality_pass = True
    elif relevance_passed or faithfulness_passed:
        quality_status = "WARN"
        quality_pass = False
    else:
        quality_status = "FAIL"
        quality_pass = False

    return {
        # Legacy keys (backward compat with old stub)
        "answer_quality_enabled": True,
        "answerrelevancymetric_score": relevance_score if relevance_score is not None else "",
        "answerrelevancymetric_passed": relevance_passed,
        "answerrelevancymetric_reason": relevance_reason,
        # New descriptive keys
        "relevance_score": relevance_score,
        "relevance_passed": relevance_passed,
        "relevance_reason": relevance_reason,
        "faithfulness_score": faithfulness_score,
        "faithfulness_passed": faithfulness_passed,
        "faithfulness_reason": faithfulness_reason,
        "quality_pass": quality_pass,
        "quality_status": quality_status,
    }


# ---------------------------------------------------------------------------
# Result builders for edge cases
# ---------------------------------------------------------------------------


def _disabled_result() -> dict:
    """Return when quality scoring is disabled (mock mode)."""
    return {
        "answer_quality_enabled": False,
        "answerrelevancymetric_score": "",
        "answerrelevancymetric_passed": "",
        "answerrelevancymetric_reason": "disabled",
        "relevance_score": None,
        "relevance_passed": None,
        "relevance_reason": "disabled",
        "faithfulness_score": None,
        "faithfulness_passed": None,
        "faithfulness_reason": "disabled",
        "quality_pass": None,
        "quality_status": "DISABLED",
    }


def _no_answer_result(answer: str | None) -> dict:
    """Return when the bot produced no usable answer.

    TODO(v2): run.py should also set graph_status='error' here so triage
    routes to 'needs_review' instead of relying on the quality_pass fallback.
    """
    preview = (answer or "")[:100]
    return {
        "answer_quality_enabled": True,
        "answerrelevancymetric_score": "",
        "answerrelevancymetric_passed": False,
        "answerrelevancymetric_reason": f"no_answer: {preview}",
        "relevance_score": None,
        "relevance_passed": False,
        "relevance_reason": f"Answer too short or empty: {preview}",
        "faithfulness_score": None,
        "faithfulness_passed": False,
        "faithfulness_reason": "no_answer",
        "quality_pass": None,
        "quality_status": "NO_ANSWER",
    }


def _error_result(error_type: str, detail: str) -> dict:
    """Return when quality scoring encountered an error."""
    return {
        "answer_quality_enabled": True,
        "answerrelevancymetric_score": "",
        "answerrelevancymetric_passed": "",
        "answerrelevancymetric_reason": f"{error_type}: {detail}",
        "relevance_score": None,
        "relevance_passed": None,
        "relevance_reason": f"{error_type}: {detail}",
        "faithfulness_score": None,
        "faithfulness_passed": None,
        "faithfulness_reason": f"{error_type}: {detail}",
        "quality_pass": None,
        "quality_status": "ERROR",
    }