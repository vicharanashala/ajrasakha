"""Final answer synthesis from tool results (no tool binding).

Outputs English advisory body only. Sources, author lines, and disclaimers are
appended in translate_answer via answer_footers.py.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional

from anthropic import APITimeoutError, APIConnectionError, APIStatusError
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.store.base import BaseStore

from ajrasakha.agents.config import CLAUDE_MODEL
from ajrasakha.agents.language import language_directive_for_synthesis
from ajrasakha.agents.translation_catalog import language_pair_from_plan, synthesis_lang_label
from ajrasakha.agents.memory import load_long_term_summary
from ajrasakha.agents.location_context import main_agent_location_context_message
from ajrasakha.agents.state import TRANSLATE_PATH_EMPTY_GDB
from ajrasakha.agents.retrieval_sanitizer import gdb_has_usable_answers
from ajrasakha.agents.prompts import EMPTY_GDB_REPLY, LLM_FALLBACK_MSG, SYNTHESIZER_SYSTEM_PROMPT
from ajrasakha.agents.state import AjraSakhaState

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


# ── GDB response parsing helpers ──────────────────────────────────────────


def _parse_gdb_response(text: str) -> Optional[dict]:
    """Parse GDB tool response into a dict, returning None on failure."""
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except (json.JSONDecodeError, TypeError):
        pass
    return None


def _extract_gdb_from_messages(messages: list[BaseMessage]) -> Optional[dict]:
    """Find and parse the GDB tool message from the current turn."""
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            break
        if isinstance(msg, ToolMessage) and getattr(msg, "name", None) == "gdb":
            text = _message_to_text(msg)
            if text:
                return _parse_gdb_response(text)
    return None


def _defer_empty_gdb_to_translate(
    state: AjraSakhaState,
    *,
    plan: dict | None = None,
) -> dict:
    """Defensive: empty body + translate_path so translate_answer adds sheet footers."""
    merged_plan = {
        **(state.get("plan") or {}),
        **(plan or {}),
        "translate_path": TRANSLATE_PATH_EMPTY_GDB,
        "expert_queue": False,
    }
    return {
        "messages": [AIMessage(content="")],
        "location": state.get("location"),
        "plan": merged_plan,
    }


# ── Synthesizer prompts for exact vs similar ──────────────────────────────

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
# # 1. Read ALL the similar Q&A pairs provided

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

# ── Formatting helpers ────────────────────────────────────────────────────


def _format_non_gdb_tool_results(messages: list[BaseMessage]) -> str:
    """Collect non-GDB tool outputs for the synthesizer."""
    last_human_idx = -1
    for i in range(len(messages) - 1, -1, -1):
        if isinstance(messages[i], HumanMessage):
            last_human_idx = i
            break
    if last_human_idx < 0:
        return ""

    blocks: list[str] = []
    for msg in messages[last_human_idx + 1:]:
        if isinstance(msg, ToolMessage):
            name = getattr(msg, "name", "tool")
            if name == "gdb":
                continue  # Handled separately
            text = _message_to_text(msg)
            if text:
                blocks.append(f"### {name}\n{text}")
    return "\n\n".join(blocks)


def _format_tool_results_for_synthesizer(messages: list[BaseMessage]) -> str:
    """Specialist tool outputs only (GDB omitted — footers/sources in translate_answer)."""
    block = _format_non_gdb_tool_results(messages)
    return block if block.strip() else "(No tool results)"


async def _synthesize_from_specialist_tools(
    state: AjraSakhaState,
    config: RunnableConfig,
    *,
    user_text: str,
    vocal_language: str,
    script_language: str,
    # summary_context: str,
    messages: list[BaseMessage],
) -> dict:
    """Synthesize from weather/market/soil/schemes tools when GDB has no usable answer."""
    logger.info("Synthesizing from specialist tool results (GDB empty or rejected)")
    tool_block = _format_tool_results_for_synthesizer(messages)
    llm_messages: list[BaseMessage] = [
        SystemMessage(content=SYNTHESIZER_SYSTEM_PROMPT),
        SystemMessage(content=language_directive_for_synthesis(vocal_language, script_language)),
        # SystemMessage(content=summary_context),
    ]
    loc_ctx = main_agent_location_context_message(state.get("location"))
    if loc_ctx:
        llm_messages.append(loc_ctx)
    llm_messages.append(
        HumanMessage(
            content=(
                f"Farmer message (vocal={vocal_language}, script={script_language}):\n"
                f"{user_text}"
            )
        )
    )
    llm_messages.append(HumanMessage(content=f"Tool results:\n{tool_block}"))

    try:
        llm = ChatAnthropic(model=CLAUDE_MODEL)
        response = await llm.ainvoke(llm_messages, config=config)
        answer_text = _message_to_text(response)
        logger.info("Tool-only synthesis complete (len=%d)", len(answer_text))
        return {
            "messages": [AIMessage(content=answer_text)],
            "location": state.get("location"),
        }
    except (asyncio.CancelledError, TimeoutError, APITimeoutError, APIConnectionError) as exc:
        logger.warning("Synthesizer failed (%s: %s)", type(exc).__name__, exc)
        return {"messages": [AIMessage(content=LLM_FALLBACK_MSG)], "location": state.get("location")}
    except APIStatusError as exc:
        if exc.status_code >= 500:
            return {"messages": [AIMessage(content=LLM_FALLBACK_MSG)], "location": state.get("location")}
        raise


# ── Main synthesize node ─────────────────────────────────────────────────


async def synthesize_node(
    state: AjraSakhaState,
    config: RunnableConfig,
    *,
    store: BaseStore | None = None,
) -> dict:
    messages = state.get("messages") or []
    human: HumanMessage | None = None
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            human = msg
            break

    if human is None:
        return {}

    user_text = _message_to_text(human)
    plan = state.get("plan") or {}
    script_lang, vocal_lang = language_pair_from_plan(plan)

    logger.info(
        "synthesize_node: vocal=%s script=%s user_text=%s",
        vocal_lang,
        script_lang,
        repr(user_text[:80]),
    )
    long_term_summary = await load_long_term_summary(store, config)
    # summary_context = (
    #     f"Long-term memory:\n{long_term_summary}"
    #     if long_term_summary
    #     else "Long-term memory: none"
    # )

    # Parse GDB response to determine exact vs similar
    gdb_data = _extract_gdb_from_messages(messages)
    other_tools = _format_non_gdb_tool_results(messages)
    lang_label = synthesis_lang_label(script_lang, vocal_lang)

    if gdb_data and gdb_has_usable_answers(gdb_data):
        exact = gdb_data.get("exact_match") or {}
        is_exact = gdb_data.get("is_exact", False) and bool(
            (exact.get("answer") or "").strip()
        )

    if gdb_data and gdb_has_usable_answers(gdb_data) and is_exact:
        # ── EXACT MATCH: Rephrase only ────────────────────────────────
        exact = gdb_data.get("exact_match") or {}
        exact_answer = exact.get("answer", "")
        exact_question = exact.get("question", "")

        llm_messages: list[BaseMessage] = [
            SystemMessage(content=EXACT_MATCH_REPHRASE_PROMPT),
            SystemMessage(content=language_directive_for_synthesis(vocal_lang, script_lang))
            # SystemMessage(content=summary_context),
        ]
        loc_ctx = main_agent_location_context_message(state.get("location"))
        if loc_ctx:
            llm_messages.append(loc_ctx)

        # Include other tool results if available
        other_tools = _format_non_gdb_tool_results(messages)
        other_tools_section = f"\n\nOther tool results:\n{other_tools}" if other_tools else ""

        llm_messages.append(
            HumanMessage(
                content=(
                    f"{_SYNTHESIS_BODY_ONLY_REMINDER}\n\n"
                    f"Farmer's question (vocal={vocal_lang}, script={script_lang}):\n{user_text}\n\n"
                    f"EXACT MATCH from Golden Database:\n"
                    f"Matched Question: {exact_question}\n"
                    f"Expert Answer: {exact_answer}"
                    f"{other_tools_section}"
                )
            )
        )

        try:
            llm = ChatAnthropic(model=CLAUDE_MODEL)
            response = await llm.ainvoke(llm_messages, config=config)
            answer_text = _message_to_text(response)
            if not (answer_text or "").strip():
                logger.info("Exact match LLM returned empty body — expert-queue canned reply")
                return _defer_empty_gdb_to_translate(state, plan={**plan, "gdb_has_data": False})

            logger.info("Exact match synthesis complete (len=%d)", len(answer_text))
            return {
                "messages": [AIMessage(content=answer_text)],
                "location": state.get("location"),
                "plan": {**plan, "gdb_has_data": True},
            }
        except (asyncio.CancelledError, TimeoutError, APITimeoutError, APIConnectionError) as exc:
            logger.warning("Exact match synthesizer failed (%s: %s)", type(exc).__name__, exc)
            # Fall back: use exact answer as-is (sources appended in translate_answer)
            return {
                "messages": [AIMessage(content=exact_answer)],
                "location": state.get("location"),
                "plan": {**plan, "gdb_has_data": True},
            }
        except APIStatusError as exc:
            if exc.status_code >= 500:
                answer_text = exact_answer
                return {
                    "messages": [AIMessage(content=answer_text)],
                    "location": state.get("location"),
                    "plan": {**plan, "gdb_has_data": True},
                }
            raise

    elif gdb_data and gdb_has_usable_answers(gdb_data):
        # ── SIMILAR MATCH: Full synthesis ─────────────────────────────
        llm_messages: list[BaseMessage] = [
            SystemMessage(content=SIMILAR_MATCH_SYNTHESIS_PROMPT),
            SystemMessage(content=language_directive_for_synthesis(vocal_lang, script_lang))
            # SystemMessage(content=summary_context),
        ]
        loc_ctx = main_agent_location_context_message(state.get("location"))
        if loc_ctx:
            llm_messages.append(loc_ctx)

        # Format similar pairs for LLM
        pairs_text = ""
        for i in range(1, 6):
            pair = gdb_data.get(f"similar_pair{i}")
            if pair and isinstance(pair, dict) and pair.get("answer"):
                pairs_text += (
                    f"\nPair {i}:\n"
                    f"  Question: {pair.get('question', '')}\n"
                    f"  Answer: {pair.get('answer', '')}\n"
                )

        # Include other tool results
        other_tools = _format_non_gdb_tool_results(messages)
        other_tools_section = f"\n\nOther tool results:\n{other_tools}" if other_tools else ""

        if not pairs_text.strip():
            if other_tools.strip():
                logger.info(
                    "GDB pairs empty after sanitizer — synthesizing from specialist tools"
                )
                return await _synthesize_from_specialist_tools(
                    state,
                    config,
                    user_text=user_text,
                    vocal_language=vocal_lang,
                    script_language=script_lang,
                    # summary_context=summary_context,
                    messages=messages,
                )
            logger.info(
                "Similar match path has no pair answers and no specialist tools — expert-queue"
            )
            return _defer_empty_gdb_to_translate(state, plan=plan)

        llm_messages.append(
            HumanMessage(
                content=(
                    f"{_SYNTHESIS_BODY_ONLY_REMINDER}\n\n"
                    f"Farmer's question (vocal={vocal_lang}, script={script_lang}):\n{user_text}\n\n"
                    f"SIMILAR MATCHES from Golden Database:\n{pairs_text}"
                    f"{other_tools_section}\n\n"
                    f"Select the most relevant pairs and synthesize a comprehensive answer."
                )
            )
        )

        try:
            llm = ChatAnthropic(model=CLAUDE_MODEL)
            response = await llm.ainvoke(llm_messages, config=config)
            answer_text = _message_to_text(response)
            if not (answer_text or "").strip():
                logger.info("Similar match LLM returned empty body — expert-queue canned reply")
                return _defer_empty_gdb_to_translate(state, plan={**plan, "gdb_has_data": False})

            logger.info("Similar match synthesis complete (len=%d)", len(answer_text))
            return {
                "messages": [AIMessage(content=answer_text)],
                "location": state.get("location"),
                "plan": {**plan, "gdb_has_data": True},
            }
        except (asyncio.CancelledError, TimeoutError, APITimeoutError, APIConnectionError) as exc:
            logger.warning("Similar match synthesizer failed (%s: %s)", type(exc).__name__, exc)
            return {
                "messages": [AIMessage(content=LLM_FALLBACK_MSG)],
                "location": state.get("location"),
            }
        except APIStatusError as exc:
            if exc.status_code >= 500:
                return {
                    "messages": [AIMessage(content=LLM_FALLBACK_MSG)],
                    "location": state.get("location"),
                }
            raise

    else:
        # GDB missing or empty/rejected — use specialist tools if any
        if other_tools.strip():
            return await _synthesize_from_specialist_tools(
                state,
                config,
                user_text=user_text,
                vocal_language=vocal_lang,
                script_language=script_lang,
                # summary_context=summary_context,
                messages=messages,
            )
        logger.info("No usable GDB and no specialist tools — returning expert-queue canned reply")
        return _defer_empty_gdb_to_translate(state, plan=plan)
