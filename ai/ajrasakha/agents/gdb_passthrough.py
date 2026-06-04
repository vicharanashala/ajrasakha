"""Pass Golden DB expert answer to translate_answer without synthesizer LLM rephrase."""

from __future__ import annotations

import logging

from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableConfig

from ajrasakha.agents.retrieval_sanitizer import gdb_has_usable_answers
from ajrasakha.agents.state import AjraSakhaState
from ajrasakha.agents.synthesizer import (
    _defer_empty_gdb_to_translate,
    _extract_gdb_from_messages,
    _format_non_gdb_tool_results,
)

logger = logging.getLogger(__name__)


def _gdb_answer_body(gdb_data: dict) -> str:
    if gdb_data.get("is_exact"):
        exact = gdb_data.get("exact_match") or {}
        return (exact.get("answer") or "").strip()
    pair = gdb_data.get("similar_pair1") or {}
    return (pair.get("answer") or "").strip()


async def gdb_passthrough_node(
    state: AjraSakhaState,
    config: RunnableConfig,
) -> dict:
    """Use GDB exact/similar expert text as-is; translate_answer adds sources + disclaimer."""
    messages = state.get("messages") or []
    plan = state.get("plan") or {}
    gdb_data = _extract_gdb_from_messages(messages)

    if not gdb_data or not gdb_has_usable_answers(gdb_data):
        logger.info("gdb_passthrough: no usable GDB — deferring to empty_gdb path")
        return _defer_empty_gdb_to_translate(state, plan=plan)

    body = _gdb_answer_body(gdb_data)
    if not body:
        logger.info("gdb_passthrough: empty answer text — deferring to empty_gdb path")
        return _defer_empty_gdb_to_translate(state, plan=plan)

    # RAG path: if specialist tools also ran, legacy synthesize sent expert-queue
    if not gdb_data.get("is_exact"):
        other_tools = _format_non_gdb_tool_results(messages)
        if other_tools.strip():
            logger.info(
                "gdb_passthrough: similar GDB + specialist tools — expert-queue (no GDB body)"
            )
            return _defer_empty_gdb_to_translate(state, plan={**plan, "gdb_has_data": False})

    logger.info(
        "gdb_passthrough: using GDB %s answer (len=%d), skipping synthesizer",
        "exact" if gdb_data.get("is_exact") else "similar",
        len(body),
    )
    return {
        "messages": [AIMessage(content=body)],
        "location": state.get("location"),
        "plan": {**plan, "gdb_has_data": True},
    }
