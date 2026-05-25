"""Post-synthesis: translate answer body to planner vocal/script; append sheet disclaimers."""

from __future__ import annotations

import logging
from typing import Optional

from anthropic import APITimeoutError, APIConnectionError, APIStatusError
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from ajrasakha.agents.answer_quality import strip_warning_disclaimer
from ajrasakha.agents.config import CLAUDE_MODEL
from ajrasakha.agents.retrieval_sanitizer import gdb_has_usable_answers
from ajrasakha.agents.state import AjraSakhaState
from ajrasakha.agents.translation_catalog import (
    get_testing_disclaimer,
    language_pair_from_plan,
    needs_translation,
    synthesis_lang_label,
)

logger = logging.getLogger(__name__)


def _message_to_text(message: BaseMessage) -> str:
    content = message.content
    if content is None:
        return ""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                text = block.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return " ".join(parts).strip()
    return str(content).strip()


def _last_farmer_facing_ai(messages: list[BaseMessage]) -> AIMessage | None:
    for msg in reversed(messages):
        if isinstance(msg, AIMessage) and not getattr(msg, "tool_calls", None):
            return msg
    return None


def _extract_gdb_from_messages(messages: list[BaseMessage]) -> Optional[dict]:
    import json

    from langchain_core.messages import ToolMessage

    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            break
        if isinstance(msg, ToolMessage) and getattr(msg, "name", None) == "gdb":
            text = _message_to_text(msg)
            if text:
                try:
                    data = json.loads(text)
                    if isinstance(data, dict):
                        return data
                except json.JSONDecodeError:
                    pass
    return None


_TRANSLATE_SYSTEM_PROMPT = """You translate agricultural advisories for Indian farmers.

Rules:
- Output ONLY the translated advisory body.
- Preserve numbers, URLs, chemical names, and units exactly.
- Do NOT add disclaimers, sources, footers, or expert-queue messages."""


async def _translate_body(
    body: str,
    vocal_language: str,
    script_language: str,
    config: RunnableConfig,
) -> str:
    text = (body or "").strip()
    if not text:
        return body or ""

    llm = ChatAnthropic(model=CLAUDE_MODEL)
    # Anthropic API requires at least one user message — SystemMessage-only fails with 400.
    response = await llm.ainvoke(
        [
            SystemMessage(content=_TRANSLATE_SYSTEM_PROMPT),
            HumanMessage(
                content=(
                    f"Translate into {vocal_language} using the {script_language} "
                    f"writing system.\n\n{text}"
                )
            ),
        ],
        config=config,
    )
    translated = _message_to_text(response)
    return translated if translated.strip() else text


def _append_sources_and_testing(
    body: str,
    *,
    script_language: str,
    vocal_language: str,
    gdb_data: Optional[dict],
) -> str:
    from ajrasakha.agents.synthesizer import _collect_all_sources

    out = (body or "").strip()
    if not out:
        return out
    lang_label = synthesis_lang_label(script_language, vocal_language)
    if gdb_data and gdb_has_usable_answers(gdb_data):
        source_block = _collect_all_sources(gdb_data, lang_label)
        if source_block:
            out = f"{out}\n{source_block}"
    testing = get_testing_disclaimer(script_language, vocal_language)
    return f"{out}\n\n{testing}"


async def translate_answer_node(
    state: AjraSakhaState,
    config: RunnableConfig,
) -> dict:
    messages = state.get("messages") or []
    plan = state.get("plan") or {}
    script, vocal = language_pair_from_plan(plan)

    final_msg = _last_farmer_facing_ai(messages)
    if final_msg is None:
        return {}

    body = strip_warning_disclaimer(_message_to_text(final_msg))
    if not body.strip():
        return {}

    gdb_data = _extract_gdb_from_messages(messages)

    try:
        if needs_translation(script, vocal):
            logger.info(
                "translate_answer: vocal=%s script=%s (translating body)",
                vocal,
                script,
            )
            body = await _translate_body(body, vocal, script, config)
        else:
            logger.info("translate_answer: English/English — passthrough")

        content = _append_sources_and_testing(
            body,
            script_language=script,
            vocal_language=vocal,
            gdb_data=gdb_data,
        )
        return {
            "messages": [AIMessage(content=content, id=final_msg.id)],
            "location": state.get("location"),
        }
    except (APITimeoutError, APIConnectionError) as exc:
        logger.warning("translate_answer failed (%s) — returning body with sheet footers only", exc)
        content = _append_sources_and_testing(
            body,
            script_language=script,
            vocal_language=vocal,
            gdb_data=gdb_data,
        )
        return {
            "messages": [AIMessage(content=content, id=final_msg.id)],
            "location": state.get("location"),
        }
    except APIStatusError as exc:
        logger.warning(
            "translate_answer API error (%s) — returning untranslated body with sheet footers",
            exc,
        )
        content = _append_sources_and_testing(
            body,
            script_language=script,
            vocal_language=vocal,
            gdb_data=gdb_data,
        )
        return {
            "messages": [AIMessage(content=content, id=final_msg.id)],
            "location": state.get("location"),
        }
