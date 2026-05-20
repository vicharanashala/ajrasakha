"""Final answer synthesis from tool results (no tool binding)."""

from __future__ import annotations

import asyncio
import logging

from anthropic import APITimeoutError, APIConnectionError, APIStatusError
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.store.base import BaseStore

from ajrasakha.agents.config import CLAUDE_MODEL
from ajrasakha.agents.language import detect_farmer_language, language_directive_for_synthesis
from ajrasakha.agents.memory import load_long_term_summary
from ajrasakha.agents.location_context import main_agent_location_context_message
from ajrasakha.agents.prompts import LLM_FALLBACK_MSG, SYNTHESIZER_SYSTEM_PROMPT, WARNING_TEXT
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


def _format_gdb_json(text: str) -> str:
    import json
    try:
        data = json.loads(text)
        if not isinstance(data, dict):
            return text
        
        lines = []
        lines.append(f"Original Farmer Query: {data.get('original_query', 'Not specified')}")
        lines.append(f"Rephrased Query: {data.get('rephrased_query', 'Not specified')}")
        lines.append(f"Location State Filter: {data.get('state', 'all')}")
        lines.append(f"Crop Filter: {data.get('crop', 'all')}")
        
        exact = data.get("exact_match") or {}
        if exact:
            lines.append("\n=== STRICT EXACT MATCH FROM DATABASE ===")
            lines.append(f"Question: {exact.get('question')}")
            lines.append(f"Answer: {exact.get('answer')}")
            details = exact.get("details") or []
            if details:
                lines.append("Sources:")
                for d in details:
                    lines.append(f" - Author/Expert: {d.get('author_name') or 'Unknown'}")
                    lines.append(f" - Source: {d.get('source_name') or 'Database Document'}")
                    lines.append(f" - Link: {d.get('source_link') or 'None'}")
        
        similar = data.get("similar_match") or {}
        if similar:
            lines.append("\n=== SIMILAR MATCHES FROM DATABASE ===")
            for key in sorted(similar.keys(), key=lambda x: int(''.join(filter(str.isdigit, x)) or 0)):
                pair = similar[key]
                lines.append(f"\nMatch Pair ({key}):")
                lines.append(f" Question: {pair.get('question')}")
                lines.append(f" Answer: {pair.get('answer')}")
                details = pair.get("details") or []
                if details:
                    lines.append(" Sources:")
                    for d in details:
                        lines.append(f"  - Author/Expert: {d.get('author_name') or 'Unknown'}")
                        lines.append(f"  - Source: {d.get('source_name') or 'Database Document'}")
                        lines.append(f"  - Link: {d.get('source_link') or 'None'}")
                        
        if not exact and not similar:
            lines.append("\nNo relevant database matches found.")
            
        return "\n".join(lines)
    except Exception:
        return text


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
    for msg in messages[last_human_idx + 1 :]:
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
    tool_block = _format_tool_results_for_synthesizer(messages)
    output_lang = detect_farmer_language(user_text)
    long_term_summary = await load_long_term_summary(store, config)
    summary_context = (
        f"Long-term memory:\n{long_term_summary}"
        if long_term_summary
        else "Long-term memory: none"
    )

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
