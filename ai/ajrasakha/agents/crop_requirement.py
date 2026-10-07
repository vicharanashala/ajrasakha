"""LLM classifier for whether a crop input is required for a question."""

from __future__ import annotations

import logging
import re
from typing import Literal, Optional

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from ajrasakha.agents.config import CROP_CLASSIFY_MODEL, get_minimax_chat_model
from ajrasakha.agents.llm_trace import trace_llm_request, trace_llm_response

logger = logging.getLogger(__name__)

from ajrasakha.agents.prompts import CROP_CLASSIFICATION_SYSTEM_PROMPT


CropRequirementDecision = Literal[
    "input_crop_required",
    "crop_output_requested",
    "crop_not_required",
]


def _fallback_decision(
    fallback: CropRequirementDecision | bool,
) -> CropRequirementDecision:
    """Normalize the legacy boolean fallback to the three-way decision."""
    if fallback is True:
        return "input_crop_required"
    if fallback is False:
        return "crop_not_required"
    return fallback


def parse_crop_classification(
    raw_output: str,
    fallback: CropRequirementDecision | bool = False,
) -> CropRequirementDecision:
    """
    Parse the LLM's three-way crop decision.

    ``bool`` fallbacks are accepted for compatibility with the previous
    binary classifier: True means an input crop is required and False means
    a crop is not required.
    """
    cleaned = (raw_output or "").strip().lower()
    if not cleaned:
        return _fallback_decision(fallback)

    if re.search(r"\binput[_\s-]?crop[_\s-]?required\b", cleaned):
        return "input_crop_required"
    if re.search(r"\bcrop[_\s-]?output[_\s-]?requested\b", cleaned):
        return "crop_output_requested"
    if re.search(r"\bcrop[_\s-]?not[_\s-]?required\b", cleaned):
        return "crop_not_required"

    if re.search(r"\bcrop[_\s-]?specific\b", cleaned) or cleaned in {
        "yes",
        "true",
        "1",
        "crop_specific",
    }:
        return "input_crop_required"

    if re.search(r"\bgeneral\b", cleaned) or cleaned in {"no", "false", "0"}:
        return "crop_not_required"

    return _fallback_decision(fallback)


async def is_crop_specific_question(
    question: str,
    original_question: str,
    domain: str,
    *,
    config: Optional[RunnableConfig] = None,
    domain_description: str = "",
    domain_remarks: str = "",
    additional_remarks: str = "",
    default_crop_required: bool = False,
    llm=None,
    model_name: str | None = None,
) -> CropRequirementDecision:
    """
    Classify whether the farmer must provide a crop input.

    On LLM failure or an unrecognised response, use the domain's majority
    guidance as the fallback.
    """
    try:
        llm_messages = [
            SystemMessage(content=CROP_CLASSIFICATION_SYSTEM_PROMPT),
            HumanMessage(
                content=(
                    f"Domain: {domain}\n"
                    f"Domain description: {domain_description}\n"
                    f"Domain remarks: {domain_remarks}\n"
                    f"Additional domain remarks: {additional_remarks}\n"
                    f"Default based on majority guidance: "
                    f"{('input_crop_required' if default_crop_required else 'crop_not_required')}\n"
                    f"Question: {question}\n"
                    f"Original question: {original_question}\n\n"
                    "Return only input_crop_required, crop_output_requested, or crop_not_required."
                )
            ),
        ]
        trace_llm_request(
            "crop_classifier",
            model=model_name or CROP_CLASSIFY_MODEL,
            messages=llm_messages,
            domain=domain,
        )
        if llm is None:
            llm = get_minimax_chat_model(max_tokens=16, temperature=0)
        response = await llm.ainvoke(llm_messages, config=config)
        raw = response.content if isinstance(response.content, str) else str(response.content)
        decision = parse_crop_classification(raw, fallback=default_crop_required)
        trace_llm_response(
            "crop_classifier",
            output=raw,
            crop_decision=decision,
            domain=domain,
        )
        return decision
    except Exception as exc:
        logger.warning(
            "Crop requirement classifier failed (using majority fallback=%s): %s",
            default_crop_required,
            exc,
        )
        return _fallback_decision(default_crop_required)
