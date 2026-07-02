"""DEPRECATED — synthesizer LLM is not wired in the planner graph.

Answer bodies are assembled in assemble_answer_body.py and translated in
translate_answer.py. This module re-exports helpers for legacy tests only.
"""

from __future__ import annotations

import logging

from langchain_core.messages import BaseMessage
from langchain_core.runnables import RunnableConfig

from ajrasakha.agents.answer_body import (
    defer_empty_gdb_to_translate as _defer_empty_gdb_to_translate,
    extract_gdb_from_messages as _extract_gdb_from_messages,
    format_non_gdb_tool_results as _format_non_gdb_tool_results,
    message_to_text as _message_to_text,
)
from ajrasakha.agents.state import AjraSakhaState

logger = logging.getLogger(__name__)

# Legacy prompt constants — kept for test_synthesizer_prompts contract tests only.
_SYNTHESIS_BODY_ONLY_REMINDER = (
    "Rephrase/synthesize the answer body only. "
    "Do not add sources, disclaimers, or footers — the system appends those."
)

from ajrasakha.agents.prompts import EXACT_MATCH_REPHRASE_PROMPT, SIMILAR_MATCH_SYNTHESIS_PROMPT


def _format_tool_results_for_synthesizer(messages: list[BaseMessage]) -> str:
    block = _format_non_gdb_tool_results(messages)
    return block if block.strip() else "(No tool results)"


async def synthesize_node(
    state: AjraSakhaState,
    config: RunnableConfig,
    **kwargs,
) -> dict:
    """Not used — planner graph routes to assemble_answer_body instead."""
    raise RuntimeError(
        "synthesize_node is deprecated and not wired in the planner graph; "
        "use assemble_answer_body_node → translate_answer_node"
    )
