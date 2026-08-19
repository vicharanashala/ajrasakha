"""LLM-based query refinement: extract core farming question by removing crop/state names."""

from __future__ import annotations

import json
import logging
import os
import re

import httpx
from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv()

log = logging.getLogger(__name__)

QUERY_REFINEMENT_MODEL = os.getenv("QUERY_REFINEMENT_MODEL", "google/gemma-4-26B-A4B-it")
QUERY_REFINEMENT_BASE_URL = os.getenv("QUERY_REFINEMENT_BASE_URL", "http://100.100.108.44:8013/v1")
QUERY_REFINEMENT_TIMEOUT_S = float(os.getenv("QUERY_REFINEMENT_TIMEOUT_S", "30"))


class QueryRefinementResult(BaseModel):
    refined_query: str
    removed_entities: list[str]


QUERY_REFINEMENT_PROMPT = """You are an expert at extracting the core farming question by removing crop and state names.

The farmer will ask questions that include location (state/district) and crop names. Since we filter by these parameters separately in our database queries, we need to remove them to find better matches.

Original farmer query:
{original_query}

Context:
- Crop: {crop}
- State: {state}

Your task:
1. Identify and remove the crop name and state/location name from the query
2. Return only the core farming question without these entity-specific terms
3. Keep disease, pest, fertilizer, practice, and general agricultural terms

Examples:
Input: "What is the best pesticide for brown spot disease in paddy in Punjab?"
Output: "what is the best pesticide for brown spot disease"
Removed: paddy, Punjab

Input: "How to treat leaf folder in rice fields of Andhra Pradesh?"
Output: "how to treat leaf folder"
Removed: rice, Andhra Pradesh

Input: "Best fertilizer for wheat cultivation in Uttar Pradesh?"
Output: "best fertilizer for wheat cultivation"
Removed: wheat, Uttar Pradesh

Input: "When to sow soybean in Madhya Pradesh?"
Output: "when to sow soybean"
Removed: soybean, Madhya Pradesh

Reply with JSON only, no markdown:
{{"refined_query": "<core farming question>", "removed_entities": ["<crop>", "<state>"]}}
"""


def _strip_json_fence(text: str) -> str:
    stripped = (text or "").strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.IGNORECASE)
        stripped = re.sub(r"\s*```$", "", stripped)
    return stripped.strip()


async def _call_refinement_llm(prompt: str) -> str:
    url = f"{QUERY_REFINEMENT_BASE_URL.rstrip('/')}/chat/completions"
    payload = {
        "model": QUERY_REFINEMENT_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.0,
        "max_tokens": 200,
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=QUERY_REFINEMENT_TIMEOUT_S,
        )
        response.raise_for_status()
        result = response.json()
    return result["choices"][0]["message"]["content"]


def _parse_refinement_response(content: str, original_query: str) -> QueryRefinementResult:
    """Parse LLM response for query refinement."""
    text = _strip_json_fence(content)
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            refined = (data.get("refined_query") or "").strip()
            removed = data.get("removed_entities") or []
            if refined:
                return QueryRefinementResult(
                    refined_query=refined,
                    removed_entities=removed if isinstance(removed, list) else [],
                )
    except json.JSONDecodeError:
        pass

    # Fallback: return original query if parsing fails
    log.warning("query refinement: unparseable response %r — using original", content[:200])
    return QueryRefinementResult(
        refined_query=original_query,
        removed_entities=[],
    )


async def refine_query_to_core_farming_question(
    original_query: str,
    crop: str = "all",
    state: str = "all",
) -> QueryRefinementResult:
    """
    Use LLM to extract the core farming question by removing crop/state names.
    
    Since we filter by crop and state separately in database queries,
    this removes those entities to find better semantic matches.
    
    Args:
        original_query: The farmer's query (after rephrasing)
        crop: The crop extracted from the query
        state: The state/location extracted from the query
        
    Returns:
        QueryRefinementResult with refined_query and removed_entities
    """
    query = (original_query or "").strip()
    if not query:
        return QueryRefinementResult(
            refined_query="",
            removed_entities=[],
        )

    prompt = QUERY_REFINEMENT_PROMPT.format(
        original_query=query,
        crop=(crop or "all").strip() or "all",
        state=(state or "all").strip() or "all",
    )

    try:
        content = await _call_refinement_llm(prompt)
        result = _parse_refinement_response(content, query)
        log.info(
            "query_refinement: original=%r refined=%r removed=%s",
            query[:80],
            result.refined_query[:80],
            result.removed_entities,
        )
        return result
    except Exception as exc:
        log.warning(
            "query refinement failed: %s: %s — using original query",
            type(exc).__name__,
            exc,
        )
        return QueryRefinementResult(
            refined_query=query,
            removed_entities=[],
        )