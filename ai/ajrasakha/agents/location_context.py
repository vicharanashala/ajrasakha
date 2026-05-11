"""Shared thread location helpers for main and sub-agents."""

from __future__ import annotations

import json
from typing import Any, Optional

from langchain_core.messages import SystemMessage
from langchain_core.runnables import RunnableConfig


def merge_location_dict(
    left: Optional[dict[str, Any]],
    right: Optional[dict[str, Any]],
) -> Optional[dict[str, Any]]:
    """Merge partial location updates into thread state (right overrides with non-None values)."""
    if right is None:
        return left
    if left is None:
        return {k: v for k, v in right.items() if v is not None}
    out = dict(left)
    for k, v in right.items():
        if v is not None:
            out[k] = v
    return out


def _coerce_tool_content_to_str(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text", "")))
            elif isinstance(block, str):
                parts.append(block)
        return "\n".join(parts)
    return str(content)


def updates_from_location_information_tool(
    tool_content: Any,
    prev: Optional[dict[str, Any]],
) -> Optional[dict[str, Any]]:
    """Parse location_information_tool MCP JSON into fields stored on AjraSakhaState.location."""
    raw = _coerce_tool_content_to_str(tool_content).strip()
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    if data.get("status") == "error":
        return None

    city = data.get("city")
    state = data.get("state")
    country = data.get("country")
    display_name = data.get("display_name")
    address = display_name
    if address is None and any(x is not None for x in (city, state, country)):
        address = ", ".join(str(x) for x in (city, state, country) if x)

    patch: dict[str, Any] = {}
    if city is not None:
        patch["city"] = city
    if state is not None:
        patch["state"] = state
    if address is not None:
        patch["address"] = address

    base = dict(prev or {})
    patch = merge_location_dict(base, patch)
    return patch if patch else None


def is_location_information_tool_name(name: str) -> bool:
    n = (name or "").lower()
    return "location_information" in n or n.endswith("location_information_tool")


def merge_location_from_ai_tool_calls(
    last_ai_message: Any,
    prev_location: Optional[dict[str, Any]],
) -> Optional[dict[str, Any]]:
    """Copy latitude/longitude from a pending location_information_tool call into thread location."""
    calls = getattr(last_ai_message, "tool_calls", None) or []
    patch: dict[str, Any] = {}
    for tc in calls:
        name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", "")
        if not is_location_information_tool_name(str(name)):
            continue
        args = tc.get("args") if isinstance(tc, dict) else getattr(tc, "args", {}) or {}
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except json.JSONDecodeError:
                args = {}
        if not isinstance(args, dict):
            continue
        lat, lon = args.get("latitude"), args.get("longitude")
        if lat is not None:
            patch["latitude"] = lat
        if lon is not None:
            patch["longitude"] = lon
    if not patch:
        return None
    return merge_location_dict(prev_location, patch)


def extract_location_updates_from_new_tool_messages(
    new_messages: list[Any],
    prev_location: Optional[dict[str, Any]],
) -> Optional[dict[str, Any]]:
    """Scan ToolMessages from a ToolNode result for location_information_tool outputs."""
    merged = dict(prev_location or {})
    changed = False
    for msg in new_messages:
        name = getattr(msg, "name", None) or ""
        if not is_location_information_tool_name(str(name)):
            continue
        updates = updates_from_location_information_tool(getattr(msg, "content", None), merged)
        if updates:
            merged = merge_location_dict(merged, updates) or merged
            changed = True
    return merged if changed else None


def thread_location_system_block(config: RunnableConfig) -> str:
    """Text appended like a system prompt so sub-agents always see thread GPS / resolved place."""
    loc = (config.get("configurable") or {}).get("location") or {}
    lat = loc.get("latitude")
    lon = loc.get("longitude")
    city = loc.get("city")
    state = loc.get("state")
    address = loc.get("address")

    lines = [
        "THREAD LOCATION (from conversation state — use for tool calls and grounding; do not invent GPS):",
        f"- Latitude: {lat if lat is not None else 'not set'}",
        f"- Longitude: {lon if lon is not None else 'not set'}",
        f"- City / town: {city or 'unknown'}",
        f"- State: {state or 'unknown'}",
        f"- Address / label: {address or 'unknown'}",
    ]
    return "\n".join(lines)


def sub_agent_system_prompt_with_thread_location(
    base_system_prompt: str, config: RunnableConfig
) -> str:
    """Build one system string for a sub-agent: static prompt + thread location from ``config``.

    Use with ``create_agent(..., system_prompt=None)`` and a single leading
    ``SystemMessage(content=...)`` per invoke so Anthropic never sees two system blocks
    (compiled ``system_prompt`` plus a separate location ``SystemMessage``).
    """
    base = (base_system_prompt or "").strip()
    loc = thread_location_system_block(config).strip()
    if not loc:
        return base
    if not base:
        return loc
    return f"{base}\n\n{loc}"


def thread_location_system_message(config: RunnableConfig) -> SystemMessage:
    return SystemMessage(content=thread_location_system_block(config))


def main_agent_location_context_message(location: Optional[dict[str, Any]]) -> Optional[SystemMessage]:
    """Optional system reminder for the orchestrator when coordinates or resolved place exist."""
    if not location:
        return None
    lat = location.get("latitude")
    lon = location.get("longitude")
    if lat is None and lon is None and not any(location.get(k) for k in ("city", "state", "address")):
        return None
    cfg: RunnableConfig = {"configurable": {"location": location}}
    text = (
        "THREAD LOCATION STATE (client GPS is persisted here):\n"
        + thread_location_system_block(cfg)
        + "\n\nWhen latitude and longitude are set, you MUST call location_information_tool first "
        "on this turn (before any other tool) except for pure greetings listed in the skip list."
    )
    return SystemMessage(content=text)
