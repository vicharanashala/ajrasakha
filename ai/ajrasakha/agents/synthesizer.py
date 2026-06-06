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

EXACT_MATCH_REPHRASE_PROMPT = """You are AjraSakha, rephrasing an expert-verified answer for an Indian farmer.

You receive an EXACT MATCH answer from the Golden Database. Your job is minimal:
1. Rephrase the answer SLIGHTLY to make it natural and farmer-friendly
2. Keep ALL technical details, dosages, chemical names, and recommendations EXACTLY as provided
3. Do NOT add new information or agricultural advice from your own knowledge
4. Do NOT add the 2-hour disclaimer — this is expert-verified data
5. Write in WhatsApp-friendly plain text (no markdown: no **, ##, or - bullets)
6. Do not use emojis, only add headers wherever necessary.
7. Keep it concise and practical

OUTPUT CONTRACT (NON-NEGOTIABLE):
- Return ONLY the answer body. End on the last farming fact. Zero lines after that.
- No footer, disclaimer, source list, or "where this answer came from" paragraph.

FORBIDDEN — never output any of the following:
- "The answer I provided is sourced only from the following approved materials"
- "This is AjraSakha's testing version" or any "testing version" closing line
- "Answers synthesized from" or closers naming SKUAST, universities, or "expert agricultural database"
- SOURCE: / Sources: / plain-text source lists (system uses 📚 and 👨‍🌾 lines)

""".strip()

SIMILAR_MATCH_SYNTHESIS_PROMPT = """You are AjraSakha, composing a final WhatsApp reply for an Indian farmer.

You receive SIMILAR MATCH pair from the Golden Database and rephrased farmer query. Your job:
1. Read the similar Q&A pair provided and the rephrased farmer query
2. Do NOT add information from your own knowledge
4. Write in WhatsApp-friendly plain text (no markdown: no **, ##, or - bullets)
5. Do not use emojis, only add headers wherever necessary.
6. Never translate the answer, it should always be in english.

OUTPUT CONTRACT (NON-NEGOTIABLE):
- Return ONLY the answer body.
- No footer, disclaimer, source list, or "where this answer came from" paragraph.

""".strip()


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
