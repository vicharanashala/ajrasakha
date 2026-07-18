"""
retrieval_context_extractor — parse GDB retrieval context out of SSE state snapshot.

The LangGraph SSE endpoint at /runs/stream streams incremental AjraSakhaState
JSON blobs (stream_mode="values"). The final `last_values_payload` contains the
complete state["messages"] list, which includes a ToolMessage from the gdb tool
whose content is JSON with the expert answer text.

This module extracts that answer text and packages it as a list[str] suitable
for LLMTestCase.retrieval_context.

Usage:
    from ajrasakha.evaluation.retrieval_context_extractor import extract_retrieval_context
    context = extract_retrieval_context(last_values_payload)  # -> ["answer text..."]
"""

from __future__ import annotations

import json


def extract_retrieval_context(last_values_payload: str) -> list[str]:
    """
    Extract GDB retrieval context from the final SSE state snapshot.

    Walks state["messages"] looking for a ToolMessage with name="gdb", parses
    its content (a JSON string), and returns the answer text from either
    `exact_match.answer` (when is_exact=True) or `similar_pair1.answer` (when
    is_similar=True) as a single-item list.

    Parameters
    ----------
    last_values_payload : str
        The raw JSON string from the final SSE `values` event. Typically
        captured by executors.run_live_case() into last_values_payload.

    Returns
    -------
    list[str]
        Single-item list containing the GDB expert answer text. Empty list
        if no GDB tool message is found, content is unparseable, or neither
        exact_match nor similar_pair1 has an answer.

    Notes
    -----
    This function NEVER raises. Any parse failure returns []. The reasoning:
    retrieval_context capture is an additive improvement to the eval pipeline;
    if it fails, the metric just skips (as it already does), and we don't want
    a faulty extractor to crash a live evaluation run.
    """
    if not last_values_payload:
        return []

    # Step 1: parse the SSE state snapshot
    try:
        state = json.loads(last_values_payload)
    except (json.JSONDecodeError, TypeError):
        return []

    messages = state.get("messages")
    if not isinstance(messages, list):
        return []

    # Step 2: find the GDB ToolMessage
    gdb_content_json = _find_gdb_tool_message(messages)
    if gdb_content_json is None:
        return []

    # Step 3: parse the ToolMessage content (it's a JSON string)
    try:
        gdb_data = json.loads(gdb_content_json)
    except (json.JSONDecodeError, TypeError):
        return []

    if not isinstance(gdb_data, dict):
        return []

    # Step 4: pick the answer text from the right field
    return _extract_answer_text(gdb_data)


def _find_gdb_tool_message(messages: list) -> str | None:
    """
    Walk the messages list looking for a ToolMessage from the gdb tool.

    Tolerates two shapes that show up in real LangGraph state snapshots:
      - LangChain BaseMessage-style: {"type": "tool", "name": "gdb", "content": "..."}
      - LangGraph raw-message-style: {"role": "tool", "name": "gdb", "content": "..."}
    """
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        # Match by name first (most reliable)
        if msg.get("name") == "gdb":
            content = msg.get("content")
            if isinstance(content, str) and content:
                return content
        # Fallback: match by role/type + a content shape that looks like GDB JSON
        role = msg.get("role") or msg.get("type")
        if role in ("tool", "toolmessage"):
            content = msg.get("content")
            if isinstance(content, str) and content and '"exact_match"' in content:
                return content
    return None


def _extract_answer_text(gdb_data: dict) -> list[str]:
    """
    Pick the answer text from the GDB tool's normalized response dict.

    Two possible locations:
      - exact_match.answer     when gdb_data["is_exact"] is True
      - similar_pair1.answer   when gdb_data["is_similar"] is True (fallback)

    Both fields can be absent or empty; either way we return [].
    """
    answer = ""

    if gdb_data.get("is_exact"):
        exact = gdb_data.get("exact_match")
        if isinstance(exact, dict):
            candidate = exact.get("answer")
            if isinstance(candidate, str) and candidate.strip():
                answer = candidate

    if not answer and gdb_data.get("is_similar"):
        similar = gdb_data.get("similar_pair1")
        if isinstance(similar, dict):
            candidate = similar.get("answer")
            if isinstance(candidate, str) and candidate.strip():
                answer = candidate

    return [answer] if answer else []