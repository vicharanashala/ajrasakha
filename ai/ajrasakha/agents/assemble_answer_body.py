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
from ajrasakha.agents.llm_trace import trace_llm_request, trace_llm_response
from ajrasakha.agents.thread_trace import trace_event
from ajrasakha.agents.plan_executor import (
    _gdb_has_usable_data,
    _turn_has_specialist_tool_message,
)
from ajrasakha.agents.retrieval_sanitizer import gdb_has_usable_answers
from ajrasakha.agents.state import AjraSakhaState
from ajrasakha.agents.language import language_directive_for_synthesis
from ajrasakha.agents.translation_catalog import language_pair_from_plan
from ajrasakha.agents.config import SYNTHESIZE_MODEL
from ajrasakha.agents.prompts import GREETING_SYNTHESIS_PROMPT
from langchain_anthropic import ChatAnthropic
from anthropic import APITimeoutError, APIConnectionError, APIStatusError
from langchain_core.messages import SystemMessage, HumanMessage, BaseMessage
import asyncio

logger = logging.getLogger(__name__)


async def assemble_answer_body_node(
    state: AjraSakhaState,
    config: RunnableConfig,
) -> dict:
    """Build AIMessage body from GDB expert text or formatted tool output; no synthesizer LLM."""
    messages = state.get("messages") or []
    plan = state.get("plan") or {}

    if plan.get("is_greeting") or plan.get("reasoning") == "greeting":
        # Synthesize a simple greeting
        script_lang, vocal_lang = language_pair_from_plan(plan)
        human = None
        for msg in reversed(messages):
            if isinstance(msg, HumanMessage):
                human = msg
                break
        user_text = ""
        if human is not None:
            content = human.content
            if isinstance(content, str):
                user_text = content.strip()
            elif isinstance(content, list):
                parts = []
                for block in content:
                    if isinstance(block, str):
                        parts.append(block)
                    elif isinstance(block, dict):
                        text = block.get("text")
                        if isinstance(text, str):
                            parts.append(text)
                user_text = " ".join(parts).strip()
            else:
                user_text = str(content).strip()

        llm_messages: list[BaseMessage] = [
            SystemMessage(content=GREETING_SYNTHESIS_PROMPT),
            SystemMessage(content=language_directive_for_synthesis(vocal_lang, script_lang)),
            HumanMessage(content=f"Farmer's greeting (vocal={vocal_lang}, script={script_lang}):\n{user_text}")
        ]
        try:
            trace_llm_request(
                "greeting_synthesis",
                model=SYNTHESIZE_MODEL,
                messages=llm_messages,
                vocal_language=vocal_lang,
                script_language=script_lang,
            )
            llm = ChatAnthropic(model=SYNTHESIZE_MODEL)
            response = await llm.ainvoke(llm_messages, config=config)

            # Simple content extraction
            content = response.content
            answer_text = ""
            if isinstance(content, str):
                answer_text = content.strip()
            elif isinstance(content, list):
                parts = []
                for block in content:
                    if isinstance(block, str):
                        parts.append(block)
                    elif isinstance(block, dict):
                        text = block.get("text")
                        if isinstance(text, str):
                            parts.append(text)
                answer_text = " ".join(parts).strip()
            else:
                answer_text = str(content).strip()
                
            trace_llm_response(
                "greeting_synthesis",
                output=answer_text,
                vocal_language=vocal_lang,
                script_language=script_lang,
            )
            logger.info("Greeting synthesis complete (len=%d)", len(answer_text))
            return {
                "messages": [AIMessage(content=answer_text)],
                "location": state.get("location"),
                "plan": {**plan, "gdb_has_data": False, "translate_path": None},
            }
        except Exception as exc:
            logger.warning("Greeting synthesizer failed: %s", exc)
            return defer_empty_gdb_to_translate(state, plan=plan)

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

        trace_event(
            "assemble_answer_body_gdb",
            is_exact=gdb_data.get("is_exact"),
            is_similar=gdb_data.get("is_similar"),
            body_preview=body[:1500],
            body_len=len(body),
        )
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
