"""Final answer synthesis from tool results (no tool binding).

Handles two GDB response modes:
  1. Exact match  → Rephrase answer slightly + append source attribution
  2. Similar match → LLM picks best pairs, synthesizes answer + append sources
In both cases, source name (with link) and author name are MANDATORY in the output.
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
from ajrasakha.agents.language import (
    language_directive_for_synthesis,
    get_localized_sources_header,
    get_localized_source_prefix,
    get_localized_expert_prefix,
)
from ajrasakha.agents.translation_catalog import (
    get_testing_disclaimer,
    get_two_hour_disclaimer,
    language_pair_from_plan,
    synthesis_lang_label,
)
from ajrasakha.agents.memory import load_long_term_summary
from ajrasakha.agents.location_context import main_agent_location_context_message
from ajrasakha.agents.plan_executor import should_expert_queue_reply
from ajrasakha.agents.retrieval_sanitizer import gdb_has_usable_answers
from ajrasakha.agents.prompts import EMPTY_GDB_REPLY, LLM_FALLBACK_MSG, SYNTHESIZER_SYSTEM_PROMPT, WARNING_TEXT
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


def _format_source_attribution(details: dict, lang_label: str = "English") -> str:
    """Format source name (with embedded link) + author name for final output."""
    lines: list[str] = []
    source_name = details.get("source_name")
    source_link = details.get("source_link")
    author_name = details.get("author_name")

    src_prefix = get_localized_source_prefix(lang_label)
    exp_prefix = get_localized_expert_prefix(lang_label)

    if source_name and source_link:
        lines.append(f"{src_prefix} {source_name} ({source_link})")
    elif source_name:
        lines.append(f"{src_prefix} {source_name}")
    elif source_link:
        lines.append(f"{src_prefix} {source_link}")

    if author_name:
        lines.append(f"{exp_prefix} {author_name}")

    return "\n".join(lines)


def _collect_all_sources(gdb_data: dict, lang_label: str = "English") -> str:
    """Collect source attribution from exact match and all similar pairs.

    De-duplicates by (source_name, author_name) to avoid repetition.
    """
    seen: set[tuple] = set()
    attribution_lines: list[str] = []

    def _add_details(details: dict) -> None:
        if not details:
            return
        key = (details.get("source_name"), details.get("author_name"))
        if key in seen:
            return
        seen.add(key)
        line = _format_source_attribution(details, lang_label)
        if line:
            attribution_lines.append(line)

    # Exact match details (only when there is an expert answer to cite)
    exact = gdb_data.get("exact_match") or {}
    if (exact.get("answer") or "").strip():
        _add_details(exact.get("details") or {})

    # Similar pair details (only pairs with non-empty answers — sanitizer-kept content)
    for i in range(1, 6):  # similar_pair1 through similar_pair5
        pair = gdb_data.get(f"similar_pair{i}")
        if (
            pair
            and isinstance(pair, dict)
            and (pair.get("answer") or "").strip()
        ):
            _add_details(pair.get("details") or {})

    if not attribution_lines:
        return ""

    header = get_localized_sources_header(lang_label)
    return header + "\n\n".join(attribution_lines)


def _append_sources_and_warning(answer_text: str, gdb_data: Optional[dict], lang_label: str = "English") -> str:
    """Append source block and mandatory WARNING_TEXT when there is a body and GDB data."""
    body = (answer_text or "").strip()
    if not body:
        return answer_text or ""
    if gdb_data:
        source_block = _collect_all_sources(gdb_data, lang_label)
        if source_block:
            answer_text = f"{answer_text}\n{source_block}"
    warning = get_localized_warning_text(lang_label)
    return f"{answer_text}\n\n{warning}"


async def _empty_gdb_synthesis_result(
    state: AjraSakhaState,
    *,
    plan: dict | None = None,
) -> dict:
    merged_plan = {**(state.get("plan") or {}), **(plan or {})}
    script, vocal = language_pair_from_plan(merged_plan)
    body = get_two_hour_disclaimer(script, vocal)
    warning = get_testing_disclaimer(script, vocal)
    content = f"{body}\n\n{warning}"
    
    out: dict = {
        "messages": [AIMessage(content=content)],
        "location": state.get("location"),
    }
    if plan is not None:
        out["plan"] = plan
    return out


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

LANGUAGE (NON-NEGOTIABLE):
Reply in the EXACT same language as the farmer's query. Translate the expert answer if needed.

DO NOT include source attribution — that will be appended automatically.
DO NOT include any disclaimer about testing version — that will be appended automatically.
""".strip()

SIMILAR_MATCH_SYNTHESIS_PROMPT = """You are AjraSakha, composing a final WhatsApp reply for an Indian farmer.

You receive SIMILAR MATCH pairs from the Golden Database. Your job:
1. Read ALL the similar Q&A pairs provided
2. Select the most relevant pairs that directly address the farmer's question
3. Synthesize a comprehensive answer using ONLY the selected pair answers
4. Do NOT add information from your own knowledge
5. Do NOT add the 2-hour disclaimer — this is from the expert database
6. Write in WhatsApp-friendly plain text (no markdown: no **, ##, or - bullets)
7. Do not use emojis, only add headers wherever necessary.
8. Keep it concise, practical, and farmer-friendly

OUTPUT CONTRACT (NON-NEGOTIABLE):
- Return ONLY the answer body. End on the last farming fact. Zero lines after that.
- No footer, disclaimer, source list, or "where this answer came from" paragraph.


FORBIDDEN — never output any of the following:
- "The answer I provided is sourced only from the following approved materials"
- "This is AjraSakha's testing version" or any "testing version" closing line
- "Answers synthesized from" or closers naming SKUAST, universities, or "expert agricultural database"
- SOURCE: / Sources: / plain-text source lists (system uses 📚 and 👨‍🌾 lines)

LANGUAGE (NON-NEGOTIABLE):
Reply in the EXACT same language as the farmer's query. Translate the expert data if needed.

You will also receive other tool results (weather, market, soil, schemes) if available.
Incorporate those tool results into your synthesis as well.

DO NOT include source attribution — that will be appended automatically.
DO NOT include any disclaimer about testing version — that will be appended automatically.
""".strip()


# ── Formatting helpers ────────────────────────────────────────────────────


def _format_gdb_json(text: str) -> str:
    """Format GDB JSON for the synthesizer's consumption."""
    try:
        data = json.loads(text)
        if not isinstance(data, dict):
            return text

        lines = []
        lines.append(f"Original Farmer Query: {data.get('original_query', 'Not specified')}")
        lines.append(f"Rephrased Query: {data.get('rephrased_query', 'Not specified')}")
        lines.append(f"Location State Filter: {data.get('state', 'all')}")
        lines.append(f"Crop Filter: {data.get('crop', 'all')}")
        lines.append(f"Is Exact Match: {data.get('is_exact', False)}")
        lines.append(f"Is Similar Match: {data.get('is_similar', False)}")

        exact = data.get("exact_match") or {}
        if exact and exact.get("answer"):
            lines.append("\n=== EXACT MATCH FROM DATABASE ===")
            lines.append(f"Question: {exact.get('question')}")
            lines.append(f"Answer: {exact.get('answer')}")
            details = exact.get("details") or {}
            if details:
                lines.append(f" - Author/Expert: {details.get('author_name') or 'Unknown'}")
                lines.append(f" - Source: {details.get('source_name') or 'Database Document'}")
                lines.append(f" - Link: {details.get('source_link') or 'None'}")

        # Similar pairs
        has_similar = False
        for i in range(1, 6):
            pair = data.get(f"similar_pair{i}")
            if pair and isinstance(pair, dict) and pair.get("answer"):
                if not has_similar:
                    lines.append("\n=== SIMILAR MATCHES FROM DATABASE ===")
                    has_similar = True
                lines.append(f"\nMatch Pair {i}:")
                lines.append(f" Question: {pair.get('question')}")
                lines.append(f" Answer: {pair.get('answer')}")
                details = pair.get("details") or {}
                if details:
                    lines.append(f"  - Author/Expert: {details.get('author_name') or 'Unknown'}")
                    lines.append(f"  - Source: {details.get('source_name') or 'Database Document'}")
                    lines.append(f"  - Link: {details.get('source_link') or 'None'}")

        if not exact and not has_similar:
            lines.append("\nNo relevant database matches found.")

        return "\n".join(lines)
    except Exception:
        return text


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
    """Collect all tool outputs since the farmer's latest message (this turn)."""
    last_human_idx = -1
    for i in range(len(messages) - 1, -1, -1):
        if isinstance(messages[i], HumanMessage):
            last_human_idx = i
            break
    if last_human_idx < 0:
        return "(No tool results)"

    blocks: list[str] = []
    for msg in messages[last_human_idx + 1:]:
        if isinstance(msg, ToolMessage):
            name = getattr(msg, "name", "tool")
            text = _message_to_text(msg)
            if text:
                if name == "gdb":
                    formatted_text = _format_gdb_json(text)
                else:
                    formatted_text = text
                blocks.append(f"### {name}\n{formatted_text}")
    return "\n\n".join(blocks) if blocks else "(No tool results)"


async def _synthesize_from_specialist_tools(
    state: AjraSakhaState,
    config: RunnableConfig,
    *,
    user_text: str,
    vocal_language: str,
    script_language: str,
    summary_context: str,
    messages: list[BaseMessage],
) -> dict:
    """Synthesize from weather/market/soil/schemes tools when GDB has no usable answer."""
    logger.info("Synthesizing from specialist tool results (GDB empty or rejected)")
    tool_block = _format_tool_results_for_synthesizer(messages)
    llm_messages: list[BaseMessage] = [
        SystemMessage(content=SYNTHESIZER_SYSTEM_PROMPT),
        SystemMessage(content=language_directive_for_synthesis(vocal_language, script_language)),
        SystemMessage(content=summary_context),
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

    if should_expert_queue_reply(state):
        logger.info("GDB empty with no specialist tools — returning expert-queue canned reply")
        return await _empty_gdb_synthesis_result(state, plan=plan)

    logger.info(
        "synthesize_node: vocal=%s script=%s user_text=%s",
        vocal_lang,
        script_lang,
        repr(user_text[:80]),
    )
    long_term_summary = await load_long_term_summary(store, config)
    summary_context = (
        f"Long-term memory:\n{long_term_summary}"
        if long_term_summary
        else "Long-term memory: none"
    )

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
            SystemMessage(content=language_directive_for_synthesis(vocal_lang, script_lang)),
            SystemMessage(content=summary_context),
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
                return await _empty_gdb_synthesis_result(state, plan={**plan, "gdb_has_data": False})

            logger.info("Exact match synthesis complete (len=%d)", len(answer_text))
            return {
                "messages": [AIMessage(content=answer_text)],
                "location": state.get("location"),
                "plan": {**plan, "gdb_has_data": True},
            }
        except (asyncio.CancelledError, TimeoutError, APITimeoutError, APIConnectionError) as exc:
            logger.warning("Exact match synthesizer failed (%s: %s)", type(exc).__name__, exc)
            # Fall back: use exact answer as-is + sources
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
            SystemMessage(content=language_directive_for_synthesis(vocal_lang, script_lang)),
            SystemMessage(content=summary_context),
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
                    summary_context=summary_context,
                    messages=messages,
                )
            logger.info(
                "Similar match path has no pair answers and no specialist tools — expert-queue"
            )
            return await _empty_gdb_synthesis_result(state, plan=plan)

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
                return await _empty_gdb_synthesis_result(state, plan={**plan, "gdb_has_data": False})

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
                summary_context=summary_context,
                messages=messages,
            )
        logger.info("No usable GDB and no specialist tools — returning expert-queue canned reply")
        return await _empty_gdb_synthesis_result(state, plan=plan)
