"""Assemble farmer answer body from GDB or specialist tools (no LLM); then translate_answer."""

from __future__ import annotations

import logging

from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableConfig

from ajrasakha.agents.answer_body import (
    defer_empty_gdb_to_translate,
    extract_gdb_from_messages,
    format_non_gdb_tool_results,
    gdb_answer_body,
)
from ajrasakha.agents.plan_executor import (
    _gdb_has_usable_data,
    _turn_has_specialist_tool_message,
)
from ajrasakha.agents.retrieval_sanitizer import gdb_has_usable_answers
from ajrasakha.agents.state import AjraSakhaState

logger = logging.getLogger(__name__)


async def assemble_answer_body_node(
    state: AjraSakhaState,
    config: RunnableConfig,
) -> dict:
    """Build AIMessage body from GDB expert text or formatted tool output; no synthesizer LLM."""
    messages = state.get("messages") or []
    plan = state.get("plan") or {}

    has_gdb = _gdb_has_usable_data(messages)
    has_specialist = _turn_has_specialist_tool_message(messages)

    if has_gdb and has_specialist:
        logger.info(
            "assemble_answer_body: GDB + specialist tools — expert-queue (no body)"
        )
        return defer_empty_gdb_to_translate(state, plan={**plan, "gdb_has_data": False})

    if has_gdb:
        gdb_data = extract_gdb_from_messages(messages)
        if not gdb_data or not gdb_has_usable_answers(gdb_data):
            logger.info("assemble_answer_body: no usable GDB — empty_gdb path")
            return defer_empty_gdb_to_translate(state, plan=plan)

        body = gdb_answer_body(gdb_data)
        if not body:
            logger.info("assemble_answer_body: empty GDB answer — empty_gdb path")
            return defer_empty_gdb_to_translate(state, plan=plan)

        logger.info(
            "assemble_answer_body: GDB %s answer (len=%d)",
            "exact" if gdb_data.get("is_exact") else "similar",
            len(body),
        )
        return {
            "messages": [AIMessage(content=body)],
            "location": state.get("location"),
            "plan": {**plan, "gdb_has_data": True},
        }

    if has_specialist:
        tool_block = format_non_gdb_tool_results(messages)
        if not tool_block.strip():
            logger.info("assemble_answer_body: specialist tools empty — empty_gdb path")
            return defer_empty_gdb_to_translate(state, plan=plan)

        logger.info("assemble_answer_body: specialist tool body (len=%d)", len(tool_block))
        return {
            "messages": [AIMessage(content=tool_block)],
            "location": state.get("location"),
            "plan": {**plan, "gdb_has_data": False},
        }

    logger.info("assemble_answer_body: no GDB or specialist content — empty_gdb path")
    return defer_empty_gdb_to_translate(state, plan=plan)
