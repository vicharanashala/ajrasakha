"""
Query Preprocessor Module - Content Moderation and Agriculture Relevance Check

This module performs pre-query checks using MiniMax 2.7:
1. Vulgar/abusive language detection
2. Agriculture relevance classification

These checks happen BEFORE any vector search or Gemma processing,
rejecting inappropriate or off-topic queries early.
"""

import logging
import os
from dataclasses import dataclass
from enum import Enum
from typing import Literal

from dotenv import load_dotenv

log = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# =============================================================================
# Configuration
# =============================================================================

# MiniMax 2.7 configuration (same as agents/config.py)
MINIMAX_BASE_URL = os.getenv(
    "MINIMAX_BASE_URL",
    "http://100.100.108.41:8001/v1/"
)
MINIMAX_API_KEY = os.getenv("MINIMAX_API_KEY", "")
MINIMAX_MODEL = os.getenv("MINIMAX_MODEL", "MiniMaxAI/MiniMax-M2.7")

# Preprocessor settings
PREPROCESS_TIMEOUT_S = int(os.getenv("GOLDEN_PREPROCESS_TIMEOUT_S", "10"))
ALLOW_NON_AGRI = os.getenv("GOLDEN_ALLOW_NON_AGRI", "false").lower() == "true"
BLOCK_VULGAR = os.getenv("GOLDEN_BLOCK_VULGAR", "true").lower() == "true"

# =============================================================================
# Enums and Data Classes
# =============================================================================


class QuerySafety(str, Enum):
    """Safety classification for queries."""
    SAFE = "safe"
    VULGAR = "vulgar"  # Contains vulgar/abusive language
    ABUSIVE = "abusive"  # Contains harassment/threats


class AgricultureRelevance(str, Enum):
    """Agriculture relevance classification."""
    RELATED = "related"  # Agriculture/farming related
    NOT_RELATED = "not_related"  # Not agriculture related


@dataclass
class QueryPreprocessResult:
    """Result of query preprocessing checks."""
    
    # Safety check
    is_safe: bool
    safety_decision: QuerySafety
    safety_reason: str
    
    # Relevance check
    is_agriculture_related: bool
    relevance_decision: AgricultureRelevance
    relevance_reason: str
    
    # Overall can proceed?
    can_proceed: bool
    rejection_reason: str | None  # If not can_proceed, why?
    
    # Metadata
    model_used: str = MINIMAX_MODEL
    processing_time_ms: float = 0.0


# =============================================================================
# Prompts
# =============================================================================

VULGAR_CONTENT_PROMPT = """You are a content safety classifier for an Indian agriculture Q&A bot.

Analyze the following user query and determine if it contains:
1. Vulgar/obscene language (profanity, slurs, explicit sexual content)
2. Abusive/harassing language (threats, personal attacks, hate speech)
3. Spam or promotional content

User Query:
{query}

Respond with ONLY valid JSON (no markdown):
{{"is_safe": true or false, "category": "safe" or "vulgar" or "abusive", "reason": "<brief explanation>"}}
"""


AGRICULTURE_RELEVANCE_PROMPT = """You are an agriculture topic classifier for an Indian farming Q&A bot.

Determine if the query is related to agriculture, farming, or allied activities.

Agriculture-related topics include:
- Crop cultivation (rice, wheat, cotton, vegetables, fruits, etc.)
- Pest and disease management
- Fertilizers and nutrient management
- Soil and irrigation
- Weather and climate for farming
- Market prices for crops
- Animal husbandry and dairy
- Farm equipment and machinery
- Government schemes for farmers
- Agricultural best practices

NOT agriculture-related:
- Sports, politics, entertainment
- General knowledge unrelated to farming
- Personal/domestic topics not related to agriculture

User Query:
{query}

Respond with ONLY valid JSON (no markdown):
{{"is_related": true or false, "category": "related" or "not_related", "reason": "<brief explanation of why>"}}
"""


# =============================================================================
# MiniMax 2.7 Client
# =============================================================================


def _get_minimax_client():
    """Get MiniMax 2.7 ChatOpenAI client."""
    try:
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=MINIMAX_MODEL,
            base_url=MINIMAX_BASE_URL,
            api_key=MINIMAX_API_KEY,
            timeout=PREPROCESS_TIMEOUT_S,
            temperature=0.1,  # Low temperature for classification
        )
    except ImportError:
        log.error("langchain_openai not installed. Run: pip install langchain-openai")
        return None


async def _call_minimax(prompt: str) -> str:
    """Call MiniMax 2.7 and return content."""
    client = _get_minimax_client()
    if client is None:
        raise RuntimeError("MiniMax client not available")
    
    response = await client.ainvoke(prompt)
    return response.content


def _parse_json_response(content: str) -> dict:
    """Parse JSON from LLM response, handling common issues."""
    import json
    import re
    
    # Remove markdown code blocks if present
    content = re.sub(r'```json\s*', '', content)
    content = re.sub(r'```\s*', '', content)
    content = content.strip()
    
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        # Try to extract JSON object
        match = re.search(r'\{[^}]+\}', content, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
        raise ValueError(f"Could not parse JSON: {content[:100]}")


# =============================================================================
# Safety Check Functions
# =============================================================================


async def check_query_safety(query: str) -> dict:
    """
    Check if query contains vulgar, abusive, or inappropriate content.
    
    Uses MiniMax 2.7 for fast classification.
    
    Args:
        query: User's input query
        
    Returns:
        dict with keys: is_safe, category, reason
    """
    if not BLOCK_VULGAR:
        return {
            "is_safe": True,
            "category": "safe",
            "reason": "Vulgar check disabled by configuration"
        }
    
    try:
        prompt = VULGAR_CONTENT_PROMPT.format(query=query.strip())
        content = await _call_minimax(prompt)
        result = _parse_json_response(content)
        
        is_safe = result.get("is_safe", result.get("category") == "safe")
        category = result.get("category", "safe")
        reason = result.get("reason", "No reason provided")
        
        log.info(
            "query safety check: query='%s' safe=%s category=%s reason=%s",
            query[:50],
            is_safe,
            category,
            reason[:80]
        )
        
        return {
            "is_safe": bool(is_safe),
            "category": category,
            "reason": reason
        }
        
    except Exception as exc:
        log.warning(
            "query safety check failed: %s: %s — defaulting to safe",
            type(exc).__name__,
            exc
        )
        # Fail open (allow) if check fails - don't block legitimate queries
        return {
            "is_safe": True,
            "category": "safe",
            "reason": f"Safety check error - allowed: {type(exc).__name__}"
        }


# =============================================================================
# Agriculture Relevance Check
# =============================================================================


async def check_agriculture_relevance(query: str) -> dict:
    """
    Check if query is agriculture/farming related.
    
    Uses MiniMax 2.7 for fast classification.
    
    Args:
        query: User's input query
        
    Returns:
        dict with keys: is_related, category, reason
    """
    if ALLOW_NON_AGRI:
        return {
            "is_related": True,
            "category": "related",
            "reason": "Non-agri queries allowed by configuration"
        }
    
    try:
        prompt = AGRICULTURE_RELEVANCE_PROMPT.format(query=query.strip())
        content = await _call_minimax(prompt)
        result = _parse_json_response(content)
        
        is_related = result.get("is_related", result.get("category") == "related")
        category = result.get("category", "related")
        reason = result.get("reason", "No reason provided")
        
        log.info(
            "query relevance check: query='%s' related=%s category=%s reason=%s",
            query[:50],
            is_related,
            category,
            reason[:80]
        )
        
        return {
            "is_related": bool(is_related),
            "category": category,
            "reason": reason
        }
        
    except Exception as exc:
        log.warning(
            "query relevance check failed: %s: %s — defaulting to related",
            type(exc).__name__,
            exc
        )
        # Fail open (allow) if check fails - don't block legitimate agri queries
        return {
            "is_related": True,
            "category": "related",
            "reason": f"Relevance check error - allowed: {type(exc).__name__}"
        }


# =============================================================================
# Main Preprocessor
# =============================================================================


async def preprocess_query(query: str) -> QueryPreprocessResult:
    """
    Run all pre-query checks on user input.
    
    Performs:
    1. Content safety check (vulgar/abusive)
    2. Agriculture relevance check
    
    Returns:
        QueryPreprocessResult with all decisions
    """
    import time
    start_time = time.time()
    
    log.info("preprocessing query: %s", query[:100])
    
    # Run both checks in parallel
    import asyncio
    
    safety_task = check_query_safety(query)
    relevance_task = check_agriculture_relevance(query)
    
    safety_result, relevance_result = await asyncio.gather(
        safety_task,
        relevance_task,
        return_exceptions=True
    )
    
    # Handle exceptions from gather
    if isinstance(safety_result, Exception):
        log.warning("safety check exception: %s", safety_result)
        safety_result = {
            "is_safe": True,
            "category": "safe",
            "reason": f"Error - allowed: {type(safety_result).__name__}"
        }
    
    if isinstance(relevance_result, Exception):
        log.warning("relevance check exception: %s", relevance_result)
        relevance_result = {
            "is_related": True,
            "category": "related",
            "reason": f"Error - allowed: {type(relevance_result).__name__}"
        }
    
    # Determine if can proceed
    can_proceed = True
    rejection_reason = None
    
    if not safety_result["is_safe"]:
        can_proceed = False
        rejection_reason = (
            f"Your query contains inappropriate content ({safety_result['category']}). "
            "Please rephrase your question politely."
        )
    elif not relevance_result["is_related"]:
        can_proceed = False
        rejection_reason = (
            f"Your query appears to be about '{relevance_result['reason'][:50]}' "
            "which is not related to agriculture or farming. "
            "Please ask a question about crops, livestock, or other farming topics."
        )
    
    processing_time_ms = (time.time() - start_time) * 1000
    
    result = QueryPreprocessResult(
        is_safe=safety_result["is_safe"],
        safety_decision=QuerySafety(safety_result["category"]),
        safety_reason=safety_result["reason"],
        
        is_agriculture_related=relevance_result["is_related"],
        relevance_decision=AgricultureRelevance(relevance_result["category"]),
        relevance_reason=relevance_result["reason"],
        
        can_proceed=can_proceed,
        rejection_reason=rejection_reason,
        
        model_used=MINIMAX_MODEL,
        processing_time_ms=round(processing_time_ms, 2)
    )
    
    log.info(
        "query preprocessor: query='%s' safe=%s related=%s proceed=%s time=%.2fms",
        query[:50],
        result.is_safe,
        result.is_agriculture_related,
        result.can_proceed,
        processing_time_ms
    )
    
    return result


# =============================================================================
# Convenience Functions
# =============================================================================


async def quick_check(query: str) -> tuple[bool, str | None]:
    """
    Quick check if query can proceed.
    
    Args:
        query: User input
        
    Returns:
        Tuple of (can_proceed, rejection_reason)
        If can_proceed is False, rejection_reason explains why
    """
    result = await preprocess_query(query)
    return result.can_proceed, result.rejection_reason


def is_safe_sync(query: str) -> bool:
    """
    Synchronous quick check for safety (non-async).
    
    Note: This is a simple keyword check, not LLM-powered.
    For production, use preprocess_query() instead.
    
    Args:
        query: User input
        
    Returns:
        True if query appears safe, False otherwise
    """
    # Basic keyword check (very simple, not ML-based)
    # This is just a fallback for non-async contexts
    vulgar_keywords = [
        # Add common Hindi/English vulgar terms here
        # This is intentionally incomplete
    ]
    
    query_lower = query.lower()
    for keyword in vulgar_keywords:
        if keyword in query_lower:
            return False
    
    return True