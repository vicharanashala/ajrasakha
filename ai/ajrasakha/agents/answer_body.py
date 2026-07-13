"""Deterministic answer body assembly helpers (GDB + specialist tools, no LLM)."""

from __future__ import annotations

import json
from typing import Optional

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage

from ajrasakha.agents.location_context import is_location_information_tool_name
from ajrasakha.agents.state import AjraSakhaState, TRANSLATE_PATH_EMPTY_GDB
from ajrasakha.agents.tool_output_formatters import format_tool_output


def message_to_text(message: BaseMessage) -> str:
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


def parse_gdb_response(text: str) -> Optional[dict]:
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except (json.JSONDecodeError, TypeError):
        pass
    return None


def extract_gdb_from_messages(messages: list[BaseMessage]) -> Optional[dict]:
    """Find and parse the GDB tool message from the current turn."""
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            break
        if isinstance(msg, ToolMessage) and getattr(msg, "name", None) == "gdb":
            text = message_to_text(msg)
            if text:
                return parse_gdb_response(text)
    return None


def gdb_answer_body(gdb_data: dict) -> str:
    if gdb_data.get("is_exact"):
        exact = gdb_data.get("exact_match") or {}
        return (exact.get("answer") or "").strip()
    pair = gdb_data.get("similar_pair1") or {}
    return (pair.get("answer") or "").strip()


def format_non_gdb_tool_results(messages: list[BaseMessage]) -> str:
    """Collect specialist tool outputs for the current turn (weather, market, soil, etc.).

    Skips GDB, reviewer upload, and location_information_tool.
    """
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
            if (
                name == "gdb"
                or name == "upload_question_to_reviewer_system"
                or is_location_information_tool_name(name)
            ):
                continue
            text = message_to_text(msg)
            if text:
                formatted = format_tool_output(name, text)
                if formatted.strip():
                    blocks.append(formatted)
    return "\n\n".join(blocks)


def defer_empty_gdb_to_translate(
    state: AjraSakhaState,
    *,
    plan: dict | None = None,
) -> dict:
    """Empty body + translate_path so translate_answer adds catalog footers."""
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
