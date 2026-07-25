"""LLM-based answer relevance checker for dynamic + static queries.

This module checks if the generated answer adequately addresses the user's question,
especially for cases where weather/mandi data alone is insufficient (e.g., user asks
"What crops are best for current weather" but only receives weather data).
"""

from __future__ import annotations

import logging
from typing import Optional

from ajrasakha.agents.config import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from ajrasakha.agents.config import PLANNER_MODEL
from ajrasakha.agents.llm_trace import trace_llm_request, trace_llm_response

logger = logging.getLogger(__name__)

# Prompt for relevance checking
RELEVANCE_CHECK_PROMPT = """You are an agricultural query relevance checker. Your task is to determine if the generated answer adequately addresses the user's original question.

## User's Original Question:
{rephrased_query}

## Generated Answer:
{answer}

## Analysis Guidelines:
1. If the user asked for crop recommendations, pest advice, fertilizer suggestions, or general agricultural guidance based on weather/market data, but the answer only contains raw weather/market data without addressing the actual question → INSUFFICIENT
2. If the answer directly addresses what the user asked for → SUFFICIENT
3. If the answer is just weather data (temperature, rainfall, etc.) and the question was about something more (like "what to plant", "is it good for wheat", etc.) → INSUFFICIENT
4. If the answer is just mandi prices and the question was about something more → INSUFFICIENT
5. If the answer provides the specific information requested → SUFFICIENT

## Examples:
- Q: "What crops are best for current weather in Pathankot?" A: "Temperature: 25°C, Humidity: 60%" → INSUFFICIENT
- Q: "What is the price of wheat in Ludhiana?" A: "Wheat modal price in Ludhiana mandi is ₹2,150/quintal" → SUFFICIENT
- Q: "Should I spray pesticide today?" A: "No rain expected for 3 days, temperature 30°C" → INSUFFICIENT (doesn't address the pesticide question)

Return your analysis in JSON format."""


class RelevanceCheckOutput(BaseModel):
    is_sufficient: bool = Field(
        description="True if the answer adequately addresses the user's question, False if it's just partial data (weather/mandi only)"
    )
    reason: str = Field(
        description="Brief explanation of why the answer is sufficient or insufficient"
    )
    missing_aspects: list[str] = Field(
        default_factory=list,
        description="List of aspects from the question that are not addressed in the answer"
    )


async def check_answer_relevance(
    rephrased_query: str,
    answer: str,
    model: str = PLANNER_MODEL,
) -> RelevanceCheckOutput:
    """
    Check if the generated answer adequately addresses the user's question.
    
    Args:
        rephrased_query: The user's question (rephrased by planner)
        answer: The generated answer being sent to the user
        model: LLM model to use for checking
        
    Returns:
        RelevanceCheckOutput with is_sufficient flag and reason
    """
    if not rephrased_query or not rephrased_query.strip():
        logger.warning("check_answer_relevance: empty rephrased_query, defaulting to sufficient")
        return RelevanceCheckOutput(is_sufficient=True, reason="No query provided")
    
    if not answer or not answer.strip():
        logger.warning("check_answer_relevance: empty answer, defaulting to insufficient")
        return RelevanceCheckOutput(
            is_sufficient=False,
            reason="No answer generated",
            missing_aspects=["Complete answer"]
        )
    
    # Quick heuristic check first - if answer is very short and query is complex, likely insufficient
    query_words = len(rephrased_query.split())
    answer_words = len(answer.split())
    
    # If query has many words (complex question) but answer is very short, likely insufficient
    if query_words > 5 and answer_words < 20:
        logger.info(
            f"check_answer_relevance: heuristic trigger - query_words={query_words}, answer_words={answer_words}"
        )
        return RelevanceCheckOutput(
            is_sufficient=False,
            reason=f"Answer too short ({answer_words} words) for complex question ({query_words} words)",
            missing_aspects=["Detailed answer"]
        )
    
    # Use LLM for detailed analysis
    prompt = RELEVANCE_CHECK_PROMPT.format(
        rephrased_query=rephrased_query,
        answer=answer[:2000]  # Limit answer length for prompt
    )
    
    messages = [
        SystemMessage(content="You are a helpful agricultural assistant that analyzes query-answer relevance. Always respond with valid JSON."),
        HumanMessage(content=prompt)
    ]
    
    try:
        trace_llm_request(
            "answer_relevance_checker",
            model=model,
            messages=messages,
            rephrased_query=rephrased_query,
            answer_preview=answer[:200],
        )
        
        llm = ChatAnthropic(model=model).with_structured_output(RelevanceCheckOutput)
        result = await llm.ainvoke(messages)
        
        trace_llm_response(
            "answer_relevance_checker",
            output=result,
            is_sufficient=result.is_sufficient,
            reason=result.reason,
        )
        
        logger.info(
            f"check_answer_relevance: is_sufficient={result.is_sufficient}, reason={result.reason}"
        )
        return result
        
    except Exception as e:
        logger.warning(f"check_answer_relevance: LLM call failed ({e}), defaulting to sufficient")
        return RelevanceCheckOutput(
            is_sufficient=True,
            reason=f"LLM check failed: {type(e).__name__}"
        )


def should_add_disclaimer(relevance_result: RelevanceCheckOutput) -> bool:
    """
    Determine if the 2-hour disclaimer should be added based on relevance check.
    
    Returns True if:
    - The answer is insufficient (doesn't address the full question)
    - The answer is just weather/mandi data without addressing the actual query intent
    """
    return not relevance_result.is_sufficient