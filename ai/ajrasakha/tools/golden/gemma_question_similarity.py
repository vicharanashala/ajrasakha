"""Gemma-based classification and filtering for similar question detection."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Optional

import httpx
from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger(__name__)

GEMMA_MODEL = os.getenv("GEMMA_MODEL", "google/gemma-4-26B-A4B-it")
GEMMA_BASE_URL = os.getenv("GEMMA_BASE_URL", "http://100.100.108.44:8013/v1")
GOLDEN_GEMMA_TIMEOUT_S = float(os.getenv("GOLDEN_GEMMA_TIMEOUT_S", "30"))

QUESTION_SIMILARITY_FILTER_PROMPT = """You are a relevance gate for finding similar questions in an Indian agriculture Q&A database.

Input question:
{original_query}

Below are {num_candidates} candidate questions retrieved by vector search (numbered 1 to {num_candidates}):

{candidates_block}

For EACH candidate, decide SAME, KEEP, or REJECT:
- SAME: The candidate question is essentially the same as the input question — exact match OR clear paraphrase (same intent, same problem; wording may differ).
- REJECT ONLY if the candidate is COMPLETELY irrelevant to the input question.
- KEEP if there is ANY common thread: same/related topic, similar symptom or issue, same farming topic (pest, disease, nutrient, irrigation), or partial overlap — but the question is NOT a same/paraphrase match.
- When unsure between KEEP and REJECT, KEEP it. Be lenient.
- Mark at most ONE candidate as SAME across the entire batch. If multiple look same, pick only the single best paraphrase match.

Reply with JSON only, no markdown — one entry per candidate index:
{{"results": [{{"index": 1, "decision": "SAME" or "KEEP" or "REJECT", "reason": "<short>"}}, ...]}}
"""

QUESTION_SIMILARITY_CLASSIFICATION_PROMPT = """You classify whether a candidate question from the database is similar enough to answer the input question.

Input question:
{original_query}

Candidate question from database:
{candidate_question}

For this candidate, decide if it is:
- SAME: The candidate question is the same as the input — exact match OR clear paraphrase.
- RELATED: The candidate covers a related topic or similar issue that could help answer the input.
- DIFFERENT: The candidate is about a different topic or problem.

Important considerations:
- String matching is critical for local names, diseases, crops, chemicals, etc.
- If the question is about the same disease/pest/issue but different crop, consider RELATED.
- If the question is completely different, mark DIFFERENT.
- Be lenient: prefer RELATED over DIFFERENT when there's any connection.

Reply with JSON only, no markdown:
{{"classification": "SAME" or "RELATED" or "DIFFERENT", "reason": "<short explanation>"}}
"""

QUESTION_TIEBREAKER_PROMPT = """You are a tie-breaker for finding the best matching question.

Input question:
{original_query}

Below are {num_candidates} candidate(s) that all received the same "{winning_class}" classification (numbered 1 to {num_candidates}):

{candidates_block}

Pick ONLY ONE — the single best match for the input question based on:
- Intent alignment
- Specificity vs generality
- Topic relevance

Reply with JSON only, no markdown:
{{"winner_index": <number 1-{num_candidates}>, "reason": "<short explanation>"}}
"""


async def _gemma_chat(prompt: str, *, max_tokens: int = 120) -> str:
    """Call Gemma LLM API."""
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
    """Remove markdown code fences from JSON response."""
    stripped = (text or "").strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.IGNORECASE)
        stripped = re.sub(r"\s*```$", "", stripped)
    return stripped.strip()


def _format_questions_for_filter(questions: list) -> str:
    """Format questions for the similarity filter prompt."""
    lines = []
    for i, q in enumerate(questions, 1):
        qid = getattr(q, "question_id", f"q{i}")
        qtext = getattr(q, "question_text", str(q))
        lines.append(f"{i}. [ID: {qid}] {qtext}")
    return "\n\n".join(lines)


def _parse_question_similarity_filter_response(
    content: str,
    num_candidates: int,
) -> list[dict]:
    """
    Parse Gemma response for question similarity filter.
    Returns one result dict per candidate (1..num_candidates).
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
        log.warning("gemma question similarity filter: JSON parse failed — keeping all")
        return defaults

    items = data if isinstance(data, list) else data.get("results") if isinstance(data, dict) else None
    if not isinstance(items, list):
        log.warning("gemma question similarity filter: no results array — keeping all")
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


def _enforce_at_most_one_same_questions(results: list[dict], questions: list) -> list[dict]:
    """Keep at most one SAME decision; demote extras to KEEP (highest vector score wins)."""
    same_indices = [
        i for i, r in enumerate(results) if r.get("relevance_decision") == "SAME"
    ]
    if len(same_indices) <= 1:
        return results

    def _score(i: int) -> float:
        s = getattr(questions[i], "similarity_score", None)
        return s if s is not None else 0.0

    winner = max(same_indices, key=_score)
    log.warning(
        "gemma question similarity filter: %d SAME decisions — keeping index %d (highest vector score)",
        len(same_indices),
        winner + 1,
    )
    updated = [dict(r) for r in results]
    for i in same_indices:
        if i == winner:
            continue
        reason = updated[i].get("relevance_reason", "")
        updated[i]["relevance_decision"] = "KEEP"
        updated[i]["relevance_reason"] = f"{reason} (demoted from SAME)" if reason else "Demoted from SAME"
    return updated


async def filter_similar_questions_batch(
    original_query: str,
    questions: list,
) -> list[dict]:
    """
    Single LLM call: review all similar question candidates and reject only
    completely irrelevant ones. Lenient — defaults to KEEP on errors.
    May return exactly one SAME decision for same/paraphrased question bypass.
    """
    n = len(questions)
    if n == 0:
        return []
    block = _format_questions_for_filter(questions)

    prompt = QUESTION_SIMILARITY_FILTER_PROMPT.format(
        original_query=original_query.strip(),
        num_candidates=n,
        candidates_block=block,
    )
    try:
        content = await _gemma_chat(prompt, max_tokens=min(400, 60 + n * 50))
        results = _parse_question_similarity_filter_response(content, n)
        results = _enforce_at_most_one_same_questions(results, questions)
        same = sum(1 for r in results if r.get("relevance_decision") == "SAME")
        kept = sum(1 for r in results if r.get("relevance_decision") == "KEEP")
        rejected = sum(1 for r in results if r.get("relevance_decision") == "REJECT")
        log.info(
            "gemma question similarity filter: total=%d same=%d kept=%d rejected=%d",
            n,
            same,
            kept,
            rejected,
        )
        for i, (q, res) in enumerate(zip(questions, results), 1):
            log.info(
                "gemma question similarity filter[%d]: question_id=%s decision=%s reason=%r",
                i,
                getattr(q, "question_id", "unknown"),
                res.get("relevance_decision"),
                (res.get("relevance_reason") or "")[:80],
            )
        return results
    except Exception as exc:
        log.warning(
            "gemma question similarity filter failed: %s: %s — keeping all %d",
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


async def classify_question_similarity(
    original_query: str,
    question: object,
) -> dict:
    """
    Classify a single question's similarity to the original query.
    Returns dict with classification and reason.
    """
    qtext = getattr(question, "question_text", str(question))

    prompt = QUESTION_SIMILARITY_CLASSIFICATION_PROMPT.format(
        original_query=original_query.strip(),
        candidate_question=qtext.strip(),
    )

    try:
        content = await _gemma_chat(prompt, max_tokens=100)
        result = _parse_question_classification_response(content)
        log.info(
            "gemma question classification: question_id=%s classification=%s reason=%r",
            getattr(question, "question_id", "unknown"),
            result.get("classification"),
            (result.get("reason") or "")[:80],
        )
        return result
    except Exception as exc:
        log.warning(
            "gemma question classification failed: %s: %s — defaulting to DIFFERENT",
            type(exc).__name__,
            exc,
        )
        return {
            "classification": "DIFFERENT",
            "reason": f"Classification error: {type(exc).__name__}",
            "llm_parse_ok": False,
        }


def _parse_question_classification_response(content: str) -> dict:
    """Parse Gemma response for question classification."""
    text = _strip_json_fence(content)
    default = {
        "classification": "DIFFERENT",
        "reason": "Could not parse classification response",
        "llm_parse_ok": False,
    }
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            classification = str(data.get("classification", "DIFFERENT")).strip().upper()
            if classification not in ("SAME", "RELATED", "DIFFERENT"):
                classification = "DIFFERENT"
            reason = str(data.get("reason", "")).strip()
            return {
                "classification": classification,
                "reason": reason,
                "llm_parse_ok": True,
            }
    except json.JSONDecodeError:
        log.warning("gemma question classification: JSON parse failed — defaulting to DIFFERENT")
    return default


def _parse_question_tiebreaker_response(content: str, num_candidates: int) -> tuple[int, str]:
    """Parse Gemma response for question tie-breaker. Returns (winner_index, reason)."""
    text = _strip_json_fence(content)
    default = 1, "Could not parse tie-breaker — defaulting to top candidate"
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            winner = data.get("winner_index", 1)
            try:
                winner = int(winner)
                if not (1 <= winner <= num_candidates):
                    winner = 1
            except (TypeError, ValueError):
                winner = 1
            reason = str(data.get("reason", ""))[:200].strip()
            return winner, reason
    except json.JSONDecodeError:
        pass
    m = re.search(r"\b([1-9])\b", text)
    if m:
        idx = int(m.group(1))
        if 1 <= idx <= num_candidates:
            return idx, text[:200]
    return 1, "Could not parse tie-breaker — defaulting to top candidate"


async def tie_breaker_questions(
    original_query: str,
    candidates: list,
    winning_class: str,
) -> tuple:
    """
    LLM tie-breaker when multiple questions share the winning class.
    Returns (selected_question, cls_result, rule_suffix, selection_method).
    """
    if len(candidates) <= 1:
        _, q, cls_result = candidates[0]
        return q, cls_result, f"{winning_class.lower()}_single_candidate", "single_candidate"

    block_parts = []
    for i, (score, q, cls_result) in enumerate(candidates, 1):
        qid = getattr(q, "question_id", f"q{i}")
        qtext = getattr(q, "question_text", str(q))
        block_parts.append(f"{i}. [ID: {qid}, score: {score:.4f}] {qtext}")
    block = "\n\n".join(block_parts)

    prompt = QUESTION_TIEBREAKER_PROMPT.format(
        original_query=original_query.strip(),
        num_candidates=len(candidates),
        winning_class=winning_class,
        candidates_block=block,
    )
    try:
        content = await _gemma_chat(prompt, max_tokens=100)
        idx, reason = _parse_question_tiebreaker_response(content, len(candidates))
        _, q, cls_result = candidates[idx - 1]
        log.info(
            "gemma question tie-breaker: class=%s picked index=%d question_id=%s reason=%r",
            winning_class,
            idx,
            getattr(q, "question_id", "unknown"),
            reason[:80],
        )
        cls_result = {**cls_result, "tie_breaker_reason": reason, "tie_breaker_index": idx}
        return q, cls_result, f"{winning_class.lower()}_tie_breaker", "tie_breaker"
    except Exception as exc:
        log.warning(
            "gemma question tie-breaker failed: %s: %s — fallback to highest vector score",
            type(exc).__name__,
            exc,
        )
        candidates.sort(key=lambda x: x[0], reverse=True)
        return candidates[0][1], candidates[0][2], f"{winning_class.lower()}_highest_score_fallback", "highest_score_fallback"


async def select_best_similar_question(
    original_query: str,
    questions: list,
    classifications: list[dict],
) -> Optional[dict]:
    """
    Pick one question from similar questions: SAME first, else RELATED.
    1 candidate in bucket → auto-pick; 2+ → LLM tie-breaker.
    Returns dict with question, cls_result, selection_rule, winning_class, selection_method.
    """
    same: list[tuple] = []
    related: list[tuple] = []

    for q, cls_result in zip(questions, classifications):
        cls = cls_result.get("classification", "DIFFERENT")
        score = getattr(q, "similarity_score", None) or 0.0
        if cls == "SAME":
            same.append((score, q, cls_result))
        elif cls == "RELATED":
            related.append((score, q, cls_result))

    if same:
        q, cls_result, rule, method = await _resolve_question_class_bucket(
            original_query, same, "SAME"
        )
        return {
            "question": q,
            "cls_result": cls_result,
            "selection_rule": f"same_{rule}",
            "winning_class": "SAME",
            "selection_method": method,
        }

    if related:
        q, cls_result, rule, method = await _resolve_question_class_bucket(
            original_query, related, "RELATED"
        )
        return {
            "question": q,
            "cls_result": cls_result,
            "selection_rule": f"related_{rule}",
            "winning_class": "RELATED",
            "selection_method": method,
        }

    return None


async def _resolve_question_class_bucket(
    original_query: str,
    bucket: list[tuple],
    winning_class: str,
) -> tuple:
    """
    Pick one from (score, question, cls_result) list sharing winning_class.
    Returns (question, cls_result, rule_suffix, selection_method).
    """
    if not bucket:
        raise ValueError("empty bucket")
    if len(bucket) == 1:
        _, q, cls_result = bucket[0]
        return q, cls_result, f"{winning_class.lower()}_single_candidate", "single_candidate"
    q, cls_result, rule, method = await tie_breaker_questions(original_query, bucket, winning_class)
    return q, cls_result, rule, method