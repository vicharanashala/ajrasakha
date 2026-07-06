"""Gemma-based relevance filter, classification, and tie-breaker for Golden RAG pairs."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Literal, Optional

import httpx
from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger(__name__)

GEMMA_MODEL = os.getenv("GEMMA_MODEL", "google/gemma-4-26B-A4B-it")
GEMMA_BASE_URL = os.getenv("GEMMA_BASE_URL", "http://100.100.108.44:8013/v1")
GOLDEN_GEMMA_TIMEOUT_S = float(os.getenv("GOLDEN_GEMMA_TIMEOUT_S", "30"))
# LLM tie-breaker when this many or more share the winning class (2+)
GOLDEN_TIE_BREAK_MIN = int(os.getenv("GOLDEN_TIE_BREAK_MIN", "2"))

ANSWER_ELIGIBLE_CLASSES = frozenset({"SAME_INTENT", "COVERED_BY_CONTEXT"})

IntentClass = Literal[
    "SAME_INTENT",
    "COVERED_BY_CONTEXT",
    "PARTIALLY_COVERED",
    "NOT_COVERED",
]

VALID_CLASSES: frozenset[str] = frozenset({
    "SAME_INTENT",
    "COVERED_BY_CONTEXT",
    "PARTIALLY_COVERED",
    "NOT_COVERED",
})

BATCH_RELEVANCE_FILTER_PROMPT = """You are a lenient relevance gate for Indian agriculture expert Q&A retrieval.

Farmer question:
{original_query}

additional context about farmer's crop and location:
crop is: {crop} and state is: {state}

Assume all below candidates are for the crop: {crop} and state: {state}.
Below are {num_candidates} candidate Q&A pairs retrieved by vector search (numbered 1 to {num_candidates}).

{candidates_block}

For EACH candidate, decide SAME, KEEP, or REJECT:
- SAME: The retrieved question is the same as the farmer question — exact match OR clear paraphrase (same intent, same problem; wording may differ). Use crop/state only as context; they need not appear in the retrieved text.
- REJECT ONLY if that Q&A is COMPLETELY irrelevant to the farmer, or asked information is itself ambiguous.
- KEEP if there is ANY common thread: same/related topic, similar symptom or issue, same farming topic (pest, disease, nutrient, irrigation), or partial overlap that could help — but the question is NOT a same/paraphrase match.
- When unsure between KEEP and REJECT, KEEP it. Be NOT aggressive.
- Mark at most ONE candidate as SAME across the entire batch. If multiple look same, pick only the single best paraphrase match.

Reply with JSON only, no markdown — one entry per candidate index:
{{"results": [{{"index": 1, "decision": "SAME" or "KEEP" or "REJECT", "reason": "<short>"}}, ...]}}
"""

PENDING_DUPLICATE_BATCH_PROMPT = """You are checking whether pending farmer questions are duplicates of each other.

New question:
{original_query}

Context — crop: {crop}, state: {state}

Below are {num_candidates} existing pending question(s) (numbered 1 to {num_candidates}):

{candidates_block}

For EACH candidate, decide SAME or NOT_SAME:
- SAME: The candidate question is the same as the new question — exact match OR clear paraphrase (same intent, same problem; wording may differ).
- NOT_SAME: Different question or only loosely related topic.

Reply with JSON only, no markdown — one entry per candidate index:
{{"results": [{{"index": 1, "decision": "SAME" or "NOT_SAME", "reason": "<short>"}}, ...]}}
"""

CLASSIFICATION_PROMPT = """You classify whether a retrieved expert Q&A can answer a farmer's question.
Remember:: string matching is very important for local names, diseases, crops, chemicals name etc. If string is not matching then select PARTIALLY_COVERED or NOT_COVERED.
Treat all districts as same.I dont want this reason "Farmer asked for abc district information, but the answer provided xyz district."
Farmer question (original):
{original_query}

Farmer request: "Ignore my district name in the question."
additional context about farmer's crop and location:
state is: {state} and crop is: {crop}


Retrieved question from database:
{retrieved_question}
state is: {state} and crop is: {crop}

Retrieved expert answer:
This answer is for crop: {crop} and state: {state}
{retrieved_answer}

Choose exactly ONE class:
- SAME_INTENT:
    Either: Farmer question (original) is the same as the retrieved question (retrieved_question) even if answer is different.
    Or: Existing answer can be reused without modification. For local names, slang terms, and regional terminology, use exact string matching only. Do not use semantic matching or external knowledge to determine equivalence. 
- COVERED_BY_CONTEXT: Query has no ambiguity and Retrieved answer fully covers farmer query without any missing information.
- PARTIALLY_COVERED: Different question, but the retrieved expert answer already answers the farmer's specific question. The answer can be shown to the farmer as-is, without rephrasing, additional reasoning, diagnosis, assumptions, or adding information from outside the retrieved Q&A. No important information is missing.
- NOT_COVERED: Q&A does not contain the information needed.

Important:

If deciding between COVERED_BY_CONTEXT and PARTIALLY_COVERED, choose PARTIALLY_COVERED.
Don't assume local names, slang terms, or regional disease names are the same, even if your knowledge suggests they are. Treat them as different unless the retrieved Q&A explicitly states they are the same.
Example:
If the farmer mentions Disease A and the retrieved Q&A discusses Disease B, do not assume they are the same condition. Classify as NOT_COVERED unless the retrieved Q&A explicitly states that Disease A and Disease B refer to the same disease.

Decision process:

1. Is farmer question the same as retrieved question?
   -> SAME_INTENT

2. Otherwise, can the retrieved answer be shown directly with no missing information?
   -> COVERED_BY_CONTEXT

3. Otherwise, is it relevant but incomplete?
   -> PARTIALLY_COVERED

4. Otherwise
   -> NOT_COVERED

Reply with JSON only, no markdown:
{{ "reason": "<one short sentence>","classification": "<CLASS>"}}
"""

TIE_BREAKER_PROMPT = """You pick the single best expert Q&A to answer a farmer's question.

Farmer question:
{original_query}

These candidates were all classified as "{winning_class}" (equally eligible). Pick the ONE that best answers the farmer.

{candidates_block}

Reply with JSON only, no markdown:
{{"best_index": <1-based index>, "reason": "<one short sentence>"}}
"""


async def _gemma_chat(prompt: str, *, max_tokens: int = 120) -> str:
    url = f"{GEMMA_BASE_URL.rstrip('/')}/chat/completions"
    payload = {
        "model": GEMMA_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.0,
        "max_tokens": max_tokens,
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=GOLDEN_GEMMA_TIMEOUT_S,
        )
        response.raise_for_status()
        result = response.json()
    return result["choices"][0]["message"]["content"]


def _strip_json_fence(text: str) -> str:
    stripped = (text or "").strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.IGNORECASE)
        stripped = re.sub(r"\s*```$", "", stripped)
    return stripped.strip()


def _format_rag_candidates_for_filter(pairs: list) -> str:
    lines = []
    for i, pair in enumerate(pairs, 1):
        q = (pair.question_text or "")[:400]
        a = (pair.answer_text or "")[:400]
        lines.append(
            f"--- Candidate {i} (question_id={pair.question_id}) ---\n"
            f"Question: {q}\n"
            f"Answer excerpt: {a}"
        )
    return "\n\n".join(lines)


def _format_pending_candidates_for_filter(candidates: list) -> str:
    lines = []
    for i, cand in enumerate(candidates, 1):
        q = (getattr(cand, "question_text", None) or "")[:400]
        lines.append(
            f"--- Candidate {i} (question_id={cand.question_id}) ---\n"
            f"Question: {q}"
        )
    return "\n\n".join(lines)


def _parse_pending_duplicate_response(
    content: str,
    num_candidates: int,
) -> list[dict]:
    """Return one result dict per candidate; defaults to NOT_SAME (safe — no false duplicate)."""
    defaults = [
        {
            "relevance_decision": "NOT_SAME",
            "relevance_reason": "No filter entry — not same by default",
            "llm_parse_ok": False,
        }
        for _ in range(num_candidates)
    ]
    text = _strip_json_fence(content)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        log.warning("gemma pending duplicate: JSON parse failed — defaulting NOT_SAME")
        return defaults

    items = data if isinstance(data, list) else data.get("results") if isinstance(data, dict) else None
    if not isinstance(items, list):
        log.warning("gemma pending duplicate: no results array — defaulting NOT_SAME")
        return defaults

    for item in items:
        if not isinstance(item, dict):
            continue
        try:
            idx = int(item.get("index", 0))
        except (TypeError, ValueError):
            continue
        if not (1 <= idx <= num_candidates):
            continue
        decision = str(item.get("decision", "NOT_SAME")).strip().upper()
        if decision == "SAME":
            mapped = "SAME"
            default_reason = "Same or paraphrased question"
        else:
            mapped = "NOT_SAME"
            default_reason = "Not the same question"
        reason = str(item.get("reason", "")).strip()
        defaults[idx - 1] = {
            "relevance_decision": mapped,
            "relevance_reason": reason or default_reason,
            "llm_parse_ok": True,
        }
    return defaults


def _parse_batch_relevance_response(
    content: str,
    num_candidates: int,
) -> list[dict]:
    """
    Return one result dict per candidate (1..num_candidates).
    Missing or unparseable entries default to KEEP (lenient).
    """
    defaults = [
        {
            "relevance_decision": "KEEP",
            "relevance_reason": "No filter entry — kept by default (lenient)",
            "llm_parse_ok": False,
        }
        for _ in range(num_candidates)
    ]
    text = _strip_json_fence(content)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        log.warning("gemma batch relevance: JSON parse failed — keeping all")
        return defaults

    items = data if isinstance(data, list) else data.get("results") if isinstance(data, dict) else None
    if not isinstance(items, list):
        log.warning("gemma batch relevance: no results array — keeping all")
        return defaults

    for item in items:
        if not isinstance(item, dict):
            continue
        try:
            idx = int(item.get("index", 0))
        except (TypeError, ValueError):
            continue
        if not (1 <= idx <= num_candidates):
            continue
        decision = str(item.get("decision", "KEEP")).strip().upper()
        if decision not in ("SAME", "KEEP", "REJECT"):
            decision = "KEEP"
        reason = str(item.get("reason", "")).strip()
        if decision == "SAME":
            default_reason = "Same or paraphrased question"
        elif decision == "REJECT":
            default_reason = "Rejected"
        else:
            default_reason = "Kept"
        defaults[idx - 1] = {
            "relevance_decision": decision,
            "relevance_reason": reason or default_reason,
            "llm_parse_ok": True,
        }
    return defaults


def _enforce_at_most_one_same(results: list[dict], pairs: list) -> list[dict]:
    """Keep at most one SAME decision; demote extras to KEEP (highest vector score wins)."""
    same_indices = [
        i for i, r in enumerate(results) if r.get("relevance_decision") == "SAME"
    ]
    if len(same_indices) <= 1:
        return results

    def _score(i: int) -> float:
        s = pairs[i].similarity_score
        return s if s is not None else 0.0

    winner = max(same_indices, key=_score)
    log.warning(
        "gemma batch relevance: %d SAME decisions — keeping index %d (highest vector score)",
        len(same_indices),
        winner + 1,
    )
    updated = [dict(r) for r in results]
    for i in same_indices:
        if i == winner:
            continue
        reason = updated[i].get("relevance_reason", "")
        updated[i] = {
            **updated[i],
            "relevance_decision": "KEEP",
            "relevance_reason": (
                f"{reason}; demoted: multiple SAME — kept highest vector score"
                if reason
                else "demoted: multiple SAME — kept highest vector score"
            ),
        }
    return updated


def _parse_classification_response(content: str) -> tuple[IntentClass, str]:
    text = _strip_json_fence(content)
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            cls = str(data.get("classification", "")).strip().upper()
            reason = str(data.get("reason", "")).strip()
            if cls in VALID_CLASSES:
                return cls, reason  # type: ignore[return-value]
    except json.JSONDecodeError:
        pass

    upper = text.upper()
    for cls in VALID_CLASSES:
        if cls in upper:
            return cls, text[:200]  # type: ignore[return-value]

    log.warning("gemma classify: unparseable response %r — default NOT_COVERED", content[:200])
    return "NOT_COVERED", "Could not parse classifier response"


def _parse_tie_breaker_response(content: str, num_candidates: int) -> tuple[int, str]:
    """Return 1-based best_index. Defaults to 1 on failure."""
    text = _strip_json_fence(content)
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            idx = int(data.get("best_index", 1))
            reason = str(data.get("reason", "")).strip()
            if 1 <= idx <= num_candidates:
                return idx, reason
    except (json.JSONDecodeError, TypeError, ValueError):
        pass
    m = re.search(r"\b([1-9])\b", text)
    if m:
        idx = int(m.group(1))
        if 1 <= idx <= num_candidates:
            return idx, text[:200]
    return 1, "Could not parse tie-breaker — defaulting to top candidate"


async def filter_relevance_batch(
    original_query: str,
    pairs: list,
    *,
    crop: str = "all",
    state: str = "all",
) -> list[dict]:
    """
    Single LLM call: review all RAG candidates together and reject only
    completely irrelevant ones. Lenient — defaults to KEEP on errors.
    May return exactly one SAME decision for same/paraphrased question bypass.
    """
    n = len(pairs)
    if n == 0:
        return []
    block = _format_rag_candidates_for_filter(pairs)

    prompt = BATCH_RELEVANCE_FILTER_PROMPT.format(
        original_query=original_query.strip(),
        crop=(crop or "all").strip() or "all",
        state=(state or "all").strip() or "all",
        num_candidates=n,
        candidates_block=block,
    )
    try:
        # Scale tokens with candidate count (~40 per result)
        content = await _gemma_chat(prompt, max_tokens=min(400, 60 + n * 50))
        results = _parse_batch_relevance_response(content, n)
        results = _enforce_at_most_one_same(results, pairs)
        same = sum(1 for r in results if r.get("relevance_decision") == "SAME")
        kept = sum(1 for r in results if r.get("relevance_decision") == "KEEP")
        rejected = sum(1 for r in results if r.get("relevance_decision") == "REJECT")
        log.info(
            "gemma batch relevance: total=%d same=%d kept=%d rejected=%d",
            n,
            same,
            kept,
            rejected,
        )
        for i, (pair, res) in enumerate(zip(pairs, results), 1):
            log.info(
                "gemma batch relevance[%d]: question_id=%s decision=%s reason=%r",
                i,
                pair.question_id,
                res.get("relevance_decision"),
                (res.get("relevance_reason") or "")[:80],
            )
        return results
    except Exception as exc:
        log.warning(
            "gemma batch relevance failed: %s: %s — keeping all %d",
            type(exc).__name__,
            exc,
            n,
        )
        return [
            {
                "relevance_decision": "KEEP",
                "relevance_reason": f"Batch filter error — kept: {type(exc).__name__}",
                "llm_parse_ok": False,
            }
            for _ in range(n)
        ]


async def filter_pending_duplicate_batch(
    original_query: str,
    candidates: list,
    *,
    crop: str = "all",
    state: str = "all",
) -> list[dict]:
    """
    Single LLM call: check if pending question candidates are duplicates.
    Defaults to NOT_SAME on errors (safe — no false-positive duplicates).
    May return multiple SAME decisions.
    """
    n = len(candidates)
    if n == 0:
        return []
    block = _format_pending_candidates_for_filter(candidates)

    prompt = PENDING_DUPLICATE_BATCH_PROMPT.format(
        original_query=original_query.strip(),
        crop=(crop or "all").strip() or "all",
        state=(state or "all").strip() or "all",
        num_candidates=n,
        candidates_block=block,
    )
    try:
        content = await _gemma_chat(prompt, max_tokens=min(400, 60 + n * 50))
        results = _parse_pending_duplicate_response(content, n)
        same = sum(1 for r in results if r.get("relevance_decision") == "SAME")
        not_same = sum(1 for r in results if r.get("relevance_decision") == "NOT_SAME")
        log.info(
            "gemma pending duplicate: total=%d same=%d not_same=%d",
            n,
            same,
            not_same,
        )
        for i, (cand, res) in enumerate(zip(candidates, results), 1):
            log.info(
                "gemma pending duplicate[%d]: question_id=%s decision=%s reason=%r",
                i,
                cand.question_id,
                res.get("relevance_decision"),
                (res.get("relevance_reason") or "")[:80],
            )
        return results
    except Exception as exc:
        log.warning(
            "gemma pending duplicate failed: %s: %s — defaulting NOT_SAME for %d",
            type(exc).__name__,
            exc,
            n,
        )
        return [
            {
                "relevance_decision": "NOT_SAME",
                "relevance_reason": f"Batch filter error — not same: {type(exc).__name__}",
                "llm_parse_ok": False,
            }
            for _ in range(n)
        ]


async def classify_pair(
    original_query: str,
    retrieved_question: str,
    retrieved_answer: str,
    *,
    crop: str = "all",
    state: str = "all",
) -> dict:
    """Classify one RAG pair against the farmer's original question."""
    prompt = CLASSIFICATION_PROMPT.format(
        original_query=original_query.strip(),
        crop=(crop or "all").strip() or "all",
        state=(state or "all").strip() or "all",
        retrieved_question=(retrieved_question or "")[:2000],
        retrieved_answer=(retrieved_answer or "")[:4000],
    )
    try:
        content = await _gemma_chat(prompt, max_tokens=120)
        classification, reason = _parse_classification_response(content)
        log.info(
            "gemma classify: class=%s question=%r reason=%r",
            classification,
            (retrieved_question or "")[:60],
            reason[:80],
        )
        return {
            "classification": classification,
            "reason": reason,
            "llm_parse_ok": True,
        }
    except Exception as exc:
        log.warning("gemma classify failed: %s: %s", type(exc).__name__, exc)
        return {
            "classification": "NOT_COVERED",
            "reason": f"Classifier error: {type(exc).__name__}",
            "llm_parse_ok": False,
        }


def _format_candidates_block(candidates: list[tuple]) -> str:
    """Each item: (score, pair, cls_result)."""
    lines = []
    for i, (_, pair, cls_result) in enumerate(candidates, 1):
        q = (pair.question_text or "")[:300]
        a = (pair.answer_text or "")[:500]
        lines.append(
            f"Candidate {i} (question_id={pair.question_id}):\n"
            f"  Question: {q}\n"
            f"  Answer excerpt: {a}\n"
            f"  Prior classification reason: {cls_result.get('reason', '')}"
        )
    return "\n\n".join(lines)


async def tie_breaker(
    original_query: str,
    candidates: list[tuple],
    winning_class: str,
) -> tuple:
    """
    LLM picks best among 2+ candidates with the same winning class.
    candidates: list of (score, pair, cls_result)
    Returns (pair, cls_result, rule_suffix).
    """
    block = _format_candidates_block(candidates)
    prompt = TIE_BREAKER_PROMPT.format(
        original_query=original_query.strip(),
        winning_class=winning_class,
        candidates_block=block,
    )
    try:
        content = await _gemma_chat(prompt, max_tokens=100)
        idx, reason = _parse_tie_breaker_response(content, len(candidates))
        _, pair, cls_result = candidates[idx - 1]
        log.info(
            "gemma tie-breaker: class=%s picked index=%d question_id=%s reason=%r",
            winning_class,
            idx,
            pair.question_id,
            reason[:80],
        )
        cls_result = {**cls_result, "tie_breaker_reason": reason, "tie_breaker_index": idx}
        return pair, cls_result, f"{winning_class.lower()}_tie_breaker"
    except Exception as exc:
        log.warning(
            "gemma tie-breaker failed: %s: %s — fallback to highest vector score",
            type(exc).__name__,
            exc,
        )
        candidates.sort(key=lambda x: x[0], reverse=True)
        return candidates[0][1], candidates[0][2], f"{winning_class.lower()}_highest_score_fallback"


def _pick_single_candidate(candidates: list[tuple]) -> tuple:
    """Only one eligible candidate in bucket — no LLM tie-breaker needed."""
    _, pair, cls_result = candidates[0]
    return pair, cls_result, "single_candidate"


async def _resolve_class_bucket(
    original_query: str,
    bucket: list[tuple],
    winning_class: str,
) -> tuple:
    """
    Pick one from (score, pair, cls_result) list sharing winning_class.
    Returns (pair, cls_result, rule_suffix, selection_method).
    """
    if not bucket:
        raise ValueError("empty bucket")
    if len(bucket) == 1:
        pair, cls_result, method = _pick_single_candidate(bucket)
        return pair, cls_result, f"{winning_class.lower()}_{method}", method
    pair, cls_result, rule = await tie_breaker(original_query, bucket, winning_class)
    return pair, cls_result, rule, "tie_breaker"


async def select_best_match(
    original_query: str,
    pairs: list,
    classifications: list[dict],
) -> Optional[dict]:
    """
    Pick one pair for the farmer answer: SAME_INTENT first, else COVERED_BY_CONTEXT.
    1 candidate in bucket → auto-pick; 2+ → LLM tie-breaker.
    Returns dict with pair, cls_result, selection_rule, winning_class, selection_method.
    """
    same_intent: list[tuple] = []
    covered: list[tuple] = []

    for pair, cls_result in zip(pairs, classifications):
        cls = cls_result.get("classification", "NOT_COVERED")
        score = pair.similarity_score if pair.similarity_score is not None else 0.0
        if cls == "SAME_INTENT":
            same_intent.append((score, pair, cls_result))
        elif cls == "COVERED_BY_CONTEXT":
            covered.append((score, pair, cls_result))

    if same_intent:
        pair, cls_result, rule, method = await _resolve_class_bucket(
            original_query, same_intent, "SAME_INTENT"
        )
        return {
            "pair": pair,
            "cls_result": cls_result,
            "selection_rule": f"same_intent_{rule}",
            "winning_class": "SAME_INTENT",
            "selection_method": method,
        }

    if covered:
        pair, cls_result, rule, method = await _resolve_class_bucket(
            original_query, covered, "COVERED_BY_CONTEXT"
        )
        return {
            "pair": pair,
            "cls_result": cls_result,
            "selection_rule": f"covered_by_context_{rule}",
            "winning_class": "COVERED_BY_CONTEXT",
            "selection_method": method,
        }

    return None
