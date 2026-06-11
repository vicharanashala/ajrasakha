"""LLM crop requirement classifier (crop_specific vs general)."""

from __future__ import annotations

import logging
import re
from typing import Optional

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from ajrasakha.agents.config import CROP_CLASSIFY_MODEL
from ajrasakha.agents.llm_trace import trace_llm_request, trace_llm_response

logger = logging.getLogger(__name__)

from ajrasakha.agents.prompts import CROP_CLASSIFICATION_SYSTEM_PROMPT


def parse_crop_classification(raw_output: str) -> bool:
    """
    Parse LLM output.
    Returns True if crop-specific (crop required), False if general.
    Unknown values fail open to general (False).
    """
    cleaned = (raw_output or "").strip().lower()
    if not cleaned:
        return False

    if re.search(r"\bcrop[_\s-]?specific\b", cleaned) or cleaned in {
        "yes",
        "true",
        "1",
        "crop_specific",
    }:
        return True

    if re.search(r"\bgeneral\b", cleaned) or cleaned in {"no", "false", "0"}:
        return False

    return False


async def is_crop_specific_question(
    question: str,
    original_question: str,
    domain: str,
    *,
    config: Optional[RunnableConfig] = None,
) -> bool:
    """
    Returns True if crop is required; False if general (crop=all ok).
    On LLM failure, fails open to False (general).
    """
    try:
        llm_messages = [
            SystemMessage(content=CROP_CLASSIFICATION_SYSTEM_PROMPT),
            HumanMessage(
                content=(
                    f"Domain: {domain}\n"
                    f"Question: {question}\n"
                    f"Original question: {original_question}\n\n"
                    "Return only crop_specific or general."
                )
            ),
        ]
        trace_llm_request(
            "crop_classifier",
            model=CROP_CLASSIFY_MODEL,
            messages=llm_messages,
            domain=domain,
        )
        llm = ChatAnthropic(model=CROP_CLASSIFY_MODEL, max_tokens=16, temperature=0)
        response = await llm.ainvoke(llm_messages, config=config)
        raw = response.content if isinstance(response.content, str) else str(response.content)
        crop_specific = parse_crop_classification(raw)
        trace_llm_response(
            "crop_classifier",
            output=raw,
            crop_specific=crop_specific,
            domain=domain,
        )
        return crop_specific
    except Exception as exc:
        logger.warning(
            "Crop requirement classifier failed (fail-open to general): %s",
            exc,
        )
        return False
