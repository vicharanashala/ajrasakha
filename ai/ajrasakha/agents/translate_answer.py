"""Post-synthesis: translate advisory body; append sheet footers (sources, testing)."""

from __future__ import annotations

import logging
from typing import Optional

from anthropic import APITimeoutError, APIConnectionError, APIStatusError
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from ajrasakha.agents.answer_footers import build_expert_queue_content, finalize_synthesis_answer
from ajrasakha.agents.config import TRANSLATE_MODEL
from ajrasakha.agents.state import AjraSakhaState, TRANSLATE_PATH_EMPTY_GDB
from ajrasakha.agents.translation_catalog import language_pair_from_plan, needs_translation

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


_TRANSLATE_SHARED_RULES = """You translate agricultural advisories for Indian farmers.

Rules
- Output ONLY the translated advisory body.
- Preserve numbers, URLs, chemical names, and units exactly.
- Do not add any other text or formatting to the output.
"""

_TRANSLATE_ENGLISH_SCRIPT_RULES = """
Script = English (Latin alphabet — Romanized / Hinglish):
- Write the full reply using the Latin alphabet.
- Use {vocal_language} wording; script is English (Latin letters only).
- Cultivar codes and chemical labels may stay in Latin letters (e.g. PBW 872, Zinc, NPK).
"""

_TRANSLATE_NATIVE_SCRIPT_RULES = """
Script = {script_language} (native writing system — NOT Latin alphabet for body text):
- Translate all sentences into {vocal_language}.
- Every word the farmer reads must use the {script_language} writing system.
- Transliterate every Latin-letter token into {script_language} — do NOT drop or shorten labels.
- Preserve meaning and all named entities; transliterate Latin spellings into the target script.
- Do NOT leave A–Z Latin letters in the body except inside URLs.
- Numbers stay as digits (e.g. 872, 24.4) unless the target script normally uses other numerals for prose.

Transliteration examples (Hindi Devanagari — apply the same idea for other native scripts):
- Zinc → ज़िंक
- PBW → पीबीडब्ल्यू
- PBW 872 → पीबीडब्ल्यू 872
- NPK → एनपीके (transliterate letters; keep the acronym readable in script)

Forbidden:
- Deleting a variety or chemical line because the label was in Latin.
- Copying English paragraphs without translating into {vocal_language}.
"""


def build_translate_system_prompt(script_language: str, vocal_language: str) -> str:
    """Build translate LLM instructions: native script transliterates Latin tokens; English script keeps Latin codes."""
    script = (script_language or "English").strip()
    vocal = (vocal_language or "English").strip()
    base = _TRANSLATE_SHARED_RULES
    if script.lower() == "english":
        return base + _TRANSLATE_ENGLISH_SCRIPT_RULES.format(vocal_language=vocal)
    return base + _TRANSLATE_NATIVE_SCRIPT_RULES.format(
        script_language=script,
        vocal_language=vocal,
    )


async def _translate_body(
    body: str,
    vocal_language: str,
    script_language: str,
    config: RunnableConfig,
) -> str:
    text = (body or "").strip()
    if not text:
        return body or ""

    llm = ChatAnthropic(model=TRANSLATE_MODEL)
    system_prompt = build_translate_system_prompt(script_language, vocal_language)
    response = await llm.ainvoke(
        [
            SystemMessage(content=system_prompt),
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


def _reply_message(
    content: str,
    final_msg: AIMessage | None,
    state: AjraSakhaState,
) -> dict:
    msg_id = final_msg.id if final_msg is not None else None
    return {
        "messages": [AIMessage(content=content, id=msg_id)],
        "location": state.get("location"),
    }


async def translate_answer_node(
    state: AjraSakhaState,
    config: RunnableConfig,
) -> dict:
    messages = state.get("messages") or []
    plan = state.get("plan") or {}
    script, vocal = language_pair_from_plan(plan)

    final_msg = _last_farmer_facing_ai(messages)
    gdb_data = _extract_gdb_from_messages(messages)

    # Path A: empty_gdb_reply only — sheet 2-hour + testing (no translate LLM)
    if plan.get("translate_path") == TRANSLATE_PATH_EMPTY_GDB:
        logger.info(
            "translate_answer: path=empty_gdb — sheet 2-hour + testing (script=%s vocal=%s)",
            script,
            vocal,
        )
        content = build_expert_queue_content(script, vocal)
        return _reply_message(content, final_msg, state)

    # Path B: synthesize — translate body + GDB sources + testing only
    if final_msg is None:
        return {}

    body = _message_to_text(final_msg)
    if not body.strip():
        logger.warning("translate_answer: path=synthesis but empty body — no-op")
        return {}

    try:
        if needs_translation(script, vocal):
            logger.info(
                "translate_answer: path=synthesis — translating body (vocal=%s script=%s)",
                vocal,
                script,
            )
            body = await _translate_body(body, vocal, script, config)
        else:
            logger.info("translate_answer: path=synthesis — English/English passthrough")

        content = finalize_synthesis_answer(
            body,
            script_language=script,
            vocal_language=vocal,
            gdb_data=gdb_data,
        )
        logger.info("translate_answer: path=synthesis — final len=%d", len(content))
        return _reply_message(content, final_msg, state)
    except (APITimeoutError, APIConnectionError) as exc:
        logger.warning("translate_answer failed (%s) — untranslated body + synthesis footers", exc)
        content = finalize_synthesis_answer(
            _message_to_text(final_msg),
            script_language=script,
            vocal_language=vocal,
            gdb_data=gdb_data,
        )
        return _reply_message(content, final_msg, state)
    except APIStatusError as exc:
        logger.warning(
            "translate_answer API error (%s) — untranslated body + synthesis footers",
            exc,
        )
        content = finalize_synthesis_answer(
            _message_to_text(final_msg),
            script_language=script,
            vocal_language=vocal,
            gdb_data=gdb_data,
        )
        return _reply_message(content, final_msg, state)
