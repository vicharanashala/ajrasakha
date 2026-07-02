import json
import logging
import os
import re
from typing import Optional

import httpx
from dotenv import load_dotenv
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from pydantic import BaseModel, Field

from ajrasakha.agents.config import GOLDEN_API_URL
from ajrasakha.agents.resolution_trace import trace_resolution
from ajrasakha.agents.thread_trace import trace_event

load_dotenv()

logger = logging.getLogger(__name__)
GOLDEN_API_TIMEOUT_S = float(os.getenv("GOLDEN_API_TIMEOUT_S", "120"))
_GDB_SEARCH_PATH = "/v1/gdb/search"


def _golden_search_url() -> str:
    """Build POST URL from GOLDEN_API_URL (base host:port only, or full path)."""
    base = (GOLDEN_API_URL or "").rstrip("/")
    if base.endswith(_GDB_SEARCH_PATH):
        return base
    return f"{base}{_GDB_SEARCH_PATH}"


def _standardize_label(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return "all"
    return " ".join(word.capitalize() for word in re.sub(r"\s+", " ", value).split())


class GDBInput(BaseModel):
    rephrased_query: str = Field(
        ...,
        description=(
            "Planner English query (spelling/grammar cleaned). Required for Golden DB search."
        ),
    )
    crop: str = Field(
        ...,
        description=(
            "Crop for Golden DB retrieval (required). Use the crop from the farmer's "
            "question; use 'all' only as a last resort when not crop-specific."
        ),
    )
    state: str = Field(
        ...,
        description=(
            "Indian state for Golden DB retrieval (required). Use thread location state "
            "or the state in the farmer's message; use 'all' only as a last resort."
        ),
    )
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None


def _normalize_details_list(raw_details) -> list[dict]:
    """Normalize raw details into a list of source dicts, preserving ALL entries."""
    if isinstance(raw_details, list):
        result = []
        for item in raw_details:
            if isinstance(item, dict):
                result.append({
                    "source_name": item.get("source_name") or None,
                    "source_link": item.get("source_link") or None,
                    "author_name": item.get("author_name") or None,
                })
        return result if result else []
    elif isinstance(raw_details, dict):
        return [{
            "source_name": raw_details.get("source_name") or None,
            "source_link": raw_details.get("source_link") or None,
            "author_name": raw_details.get("author_name") or None,
        }]
    return []


def _match_to_pair_dict(match: dict, *, chosen: bool = False) -> dict:
    details_list = _normalize_details_list(match.get("details") or [])
    answer_from_class = match.get("answer_from_class") or match.get("gemma_class")
    out = {
        "question_id": match.get("question_id") or "",
        "similarity_score": match.get("similarity_score"),
        "retrieval_source": match.get("retrieval_source"),
        "gemma_class": match.get("gemma_class"),
        "answer_from_class": answer_from_class,
        "question": match.get("question") or "",
        "answer": match.get("answer") or "",
        "details": details_list,
        "chosen_for_answer": match.get("chosen_for_answer", chosen),
    }
    return out


def _normalize_gdb_response(raw_json: dict, rephrased: str, crop: str, state: str) -> dict:
    """Post-process Golden API response for LangGraph / synthesizer."""
    result: dict = {
        "rephrased_query": raw_json.get("rephrased_query", rephrased),
        "state": raw_json.get("state", state),
        "crop": raw_json.get("crop", crop),
        "is_exact": False,
        "is_similar": False,
        "exact_match": {},
        "classification_audit": raw_json.get("classification_audit") or {},
    }

    exact = raw_json.get("exact_match") or {}
    if exact and (exact.get("answer") or exact.get("question")):
        result["is_exact"] = True
        pair = _match_to_pair_dict(exact, chosen=True)
        if pair.get("similarity_score") is None:
            pair["similarity_score"] = 1
        if not pair.get("answer_from_class"):
            pair["answer_from_class"] = "strict_exact"
        result["exact_match"] = pair
        audit = result.get("classification_audit") or {}
        result["chosen_question_id"] = exact.get("question_id") or audit.get(
            "selected_question_id"
        )
        result["answer_from_class"] = (
            exact.get("answer_from_class") or audit.get("answer_from_class") or "strict_exact"
        )
        result["chosen_for_answer"] = True
        result["selection_method"] = audit.get("selection_method") or "strict_exact"

    selected = raw_json.get("selected_match")
    if isinstance(selected, dict) and selected and (selected.get("answer") or selected.get("question")):
        result["is_similar"] = True
        result["similar_pair1"] = _match_to_pair_dict(selected, chosen=True)
        audit = result.get("classification_audit") or {}
        result["chosen_question_id"] = selected.get("question_id") or audit.get(
            "selected_question_id"
        )
        result["answer_from_class"] = (
            selected.get("answer_from_class")
            or selected.get("gemma_class")
            or audit.get("answer_from_class")
        )
        result["chosen_for_answer"] = True
        result["selection_method"] = audit.get("selection_method")

    return result


async def _call_golden_api(
    rephrased_query: str,
    crop: str,
    state: str,
) -> dict | None:
    url = _golden_search_url()
    payload = {
        "rephrased_query": rephrased_query,
        "crop": crop,
        "state": state,
    }
    timeout = httpx.Timeout(GOLDEN_API_TIMEOUT_S)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
    if isinstance(data, dict):
        return data
    return None


@tool(args_schema=GDBInput)
async def gdb(
    rephrased_query: str,
    crop: str,
    state: str,
    latitude: Optional[float],
    longitude: Optional[float],
    address: Optional[str],
    config: RunnableConfig,
) -> str:
    """
    Query the golden database directly for crop/disease/pest/farming knowledge.

    crop and state are required. Pass them on every call (use thread location for state
    when available; use 'all' for crop or state only as a last resort when unknown).
    """

    def clean_fallback(val: str) -> str:
        v = (val or "").strip().lower()
        if not v or v in {"not specified", "general", "none", "null", "all"}:
            return "all"
        return val.strip()

    resolved_crop = _standardize_label(clean_fallback(crop))
    resolved_state = _standardize_label(clean_fallback(state))
    resolved_rephrased = (rephrased_query or "").strip()

    trace_resolution(
        "gdb_search",
        crop=resolved_crop,
        crop_source="tool_args (standardized)",
        state=resolved_state,
        state_source="tool_args (standardized)",
        latitude=latitude,
        longitude=longitude,
        lat_long_source="tool_args" if latitude is not None and longitude is not None else "unset",
        address=address,
        input_crop=crop,
        input_state=state,
    )

    search_url = _golden_search_url()

    def _fallback(error: str | None = None) -> str:
        audit: dict = {"status": "empty", "evaluations": [], "source": "gdb_agent_fallback"}
        if error:
            audit["golden_api_error"] = error
            audit["golden_api_url"] = search_url
        return json.dumps({
            "rephrased_query": resolved_rephrased,
            "state": resolved_state,
            "crop": resolved_crop,
            "is_exact": False,
            "is_similar": False,
            "exact_match": {},
            "classification_audit": audit,
        })

    logger.info(
        "gdb() POST %s rephrased_query=%r crop=%s state=%s",
        search_url,
        resolved_rephrased[:80],
        resolved_crop,
        resolved_state,
    )

    try:
        raw_data = await _call_golden_api(
            resolved_rephrased, resolved_crop, resolved_state
        )
        if not raw_data:
            return _fallback("empty response from Golden API")

        normalized = _normalize_gdb_response(
            raw_data, resolved_rephrased, resolved_crop, resolved_state
        )
        chosen = normalized.get("exact_match") or {}
        audit = normalized.get("classification_audit") or {}
        trace_event(
            "gdb_result",
            is_exact=normalized.get("is_exact"),
            is_similar=normalized.get("is_similar"),
            audit_status=audit.get("status"),
            chosen_question=(chosen.get("question") or "")[:500],
            chosen_answer_preview=(chosen.get("answer") or "")[:800],
            similarity_score=chosen.get("similarity_score"),
            gemma_class=chosen.get("gemma_class"),
            answer_from_class=chosen.get("answer_from_class"),
            classification_audit=audit,
        )
        logger.info(
            "GDB response: is_exact=%s is_similar=%s audit_status=%s",
            normalized.get("is_exact"),
            normalized.get("is_similar"),
            (normalized.get("classification_audit") or {}).get("status"),
        )
        return json.dumps(normalized)

    except httpx.HTTPStatusError as exc:
        logger.error("gdb Golden API HTTP error: %s %s", exc.response.status_code, exc)
        return _fallback(f"HTTP {exc.response.status_code}: {exc}")
    except Exception as exc:
        logger.error("gdb Golden API call failed: %s", exc, exc_info=True)
        return _fallback(str(exc))
