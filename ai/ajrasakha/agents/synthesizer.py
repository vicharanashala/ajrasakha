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
from ajrasakha.agents.language import detect_farmer_language, language_directive_for_synthesis
from ajrasakha.agents.memory import load_long_term_summary
from ajrasakha.agents.location_context import main_agent_location_context_message
from ajrasakha.agents.plan_executor import should_expert_queue_reply
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


def _format_source_attribution(details: dict) -> str:
    """Format source name (with embedded link) + author name for final output.

    Output format (WhatsApp-friendly, no markdown):
    📚 Source: Source Name (link)
    👨‍🌾 Agri Expert: Author Name
    """
    lines: list[str] = []
    source_name = details.get("source_name")
    source_link = details.get("source_link")
    author_name = details.get("author_name")

    if source_name and source_link:
        lines.append(f"📚 Source: {source_name} ({source_link})")
    elif source_name:
        lines.append(f"📚 Source: {source_name}")
    elif source_link:
        lines.append(f"📚 Source: {source_link}")

    if author_name:
        lines.append(f"👨‍🌾 Agri Expert: {author_name}")

    return "\n".join(lines)


def _collect_all_sources(gdb_data: dict) -> str:
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
        line = _format_source_attribution(details)
        if line:
            attribution_lines.append(line)

    # Exact match details
    exact = gdb_data.get("exact_match") or {}
    if exact:
        _add_details(exact.get("details") or {})

    # Similar pair details
    for i in range(1, 6):  # similar_pair1 through similar_pair5
        pair = gdb_data.get(f"similar_pair{i}")
        if pair and isinstance(pair, dict):
            _add_details(pair.get("details") or {})

    if not attribution_lines:
        return ""

    header = "\nThe answer I provided is sourced only from the following approved materials.\n"
    return header + "\n\n".join(attribution_lines)


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
6. Use professional emojis for section headers
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
7. Use professional emojis for section headers
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

    if should_expert_queue_reply(state):
        logger.info("GDB empty with no specialist tools — returning expert-queue canned reply")
        return {
            "messages": [AIMessage(content=EMPTY_GDB_REPLY)],
            "location": state.get("location"),
        }

    user_text = _message_to_text(human)
    output_lang = detect_farmer_language(user_text)
    long_term_summary = await load_long_term_summary(store, config)
    summary_context = (
        f"Long-term memory:\n{long_term_summary}"
        if long_term_summary
        else "Long-term memory: none"
    )

    # Parse GDB response to determine exact vs similar
    gdb_data = _extract_gdb_from_messages(messages)
    is_exact = gdb_data.get("is_exact", False) if gdb_data else False
    is_similar = gdb_data.get("is_similar", False) if gdb_data else False
    gdb_has_data = is_exact or is_similar

    plan = state.get("plan") or {}

    if is_exact:
        # ── EXACT MATCH: Rephrase only ────────────────────────────────
        exact = gdb_data.get("exact_match") or {}
        exact_answer = exact.get("answer", "")
        exact_question = exact.get("question", "")

        llm_messages: list[BaseMessage] = [
            SystemMessage(content=EXACT_MATCH_REPHRASE_PROMPT),
            SystemMessage(content=language_directive_for_synthesis(user_text)),
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
                    f"Farmer's question (language: {output_lang}):\n{user_text}\n\n"
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

            # Append source attribution
            source_block = _collect_all_sources(gdb_data)
            if source_block:
                answer_text = f"{answer_text}\n{source_block}"

            # Append mandatory testing disclaimer (without 2-hour part)
            answer_text = f"{answer_text}\n\n{WARNING_TEXT}"

            logger.info("Exact match synthesis complete (len=%d)", len(answer_text))
            return {
                "messages": [AIMessage(content=answer_text)],
                "location": state.get("location"),
                "plan": {**plan, "gdb_has_data": True},
            }
        except (asyncio.CancelledError, TimeoutError, APITimeoutError, APIConnectionError) as exc:
            logger.warning("Exact match synthesizer failed (%s: %s)", type(exc).__name__, exc)
            # Fall back: use exact answer as-is + sources
            answer_text = exact_answer
            source_block = _collect_all_sources(gdb_data)
            if source_block:
                answer_text = f"{answer_text}\n{source_block}"
            answer_text = f"{answer_text}\n\n{WARNING_TEXT}"
            return {
                "messages": [AIMessage(content=answer_text)],
                "location": state.get("location"),
                "plan": {**plan, "gdb_has_data": True},
            }
        except APIStatusError as exc:
            if exc.status_code >= 500:
                answer_text = exact_answer
                source_block = _collect_all_sources(gdb_data)
                if source_block:
                    answer_text = f"{answer_text}\n{source_block}"
                answer_text = f"{answer_text}\n\n{WARNING_TEXT}"
                return {
                    "messages": [AIMessage(content=answer_text)],
                    "location": state.get("location"),
                    "plan": {**plan, "gdb_has_data": True},
                }
            raise

    elif is_similar:
        # ── SIMILAR MATCH: Full synthesis ─────────────────────────────
        llm_messages: list[BaseMessage] = [
            SystemMessage(content=SIMILAR_MATCH_SYNTHESIS_PROMPT),
            SystemMessage(content=language_directive_for_synthesis(user_text)),
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

        llm_messages.append(
            HumanMessage(
                content=(
                    f"{_SYNTHESIS_BODY_ONLY_REMINDER}\n\n"
                    f"Farmer's question (language: {output_lang}):\n{user_text}\n\n"
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

            # Append source attribution
            source_block = _collect_all_sources(gdb_data)
            if source_block:
                answer_text = f"{answer_text}\n{source_block}"

            # Append mandatory testing disclaimer (without 2-hour part)
            answer_text = f"{answer_text}\n\n{WARNING_TEXT}"

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
        # ── No GDB data: Full synthesis with all tools (original behavior) ──
        tool_block = _format_tool_results_for_synthesizer(messages)

        llm_messages: list[BaseMessage] = [
            SystemMessage(content=SYNTHESIZER_SYSTEM_PROMPT),
            SystemMessage(content=language_directive_for_synthesis(user_text)),
            SystemMessage(content=summary_context),
            SystemMessage(content=f"Mandatory disclaimer to append when required:\n{WARNING_TEXT}"),
        ]
        loc_ctx = main_agent_location_context_message(state.get("location"))
        if loc_ctx:
            llm_messages.append(loc_ctx)
        llm_messages.append(
            HumanMessage(
                content=(
                    f"Farmer message (detected language: {output_lang}):\n{user_text}"
                )
            )
        )
        llm_messages.append(HumanMessage(content=f"Tool results:\n{tool_block}"))

        try:
            llm = ChatAnthropic(model=CLAUDE_MODEL)
            response = await llm.ainvoke(llm_messages, config=config)
            return {"messages": [response], "location": state.get("location")}
        except (asyncio.CancelledError, TimeoutError, APITimeoutError, APIConnectionError) as exc:
            logger.warning("Synthesizer failed (%s: %s)", type(exc).__name__, exc)
            return {"messages": [AIMessage(content=LLM_FALLBACK_MSG)], "location": state.get("location")}
        except APIStatusError as exc:
            if exc.status_code >= 500:
                return {"messages": [AIMessage(content=LLM_FALLBACK_MSG)], "location": state.get("location")}
            raise
