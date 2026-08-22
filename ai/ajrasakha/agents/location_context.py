"""Shared thread location helpers for main and sub-agents."""

from __future__ import annotations

import json
import re
from typing import Any, Optional

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from ajrasakha.agents.resolution_trace import trace_resolution

# Canonical state names and common spellings in farmer queries (longest match first).
_STATE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("Andaman and Nicobar Islands", re.compile(r"\bandaman\b", re.I)),
    ("Andhra Pradesh", re.compile(r"\bandhra\s+pradesh\b", re.I)),
    ("Arunachal Pradesh", re.compile(r"\barunachal\b", re.I)),
    ("Dadra and Nagar Haveli and Daman and Diu", re.compile(r"\bdadra\b|\bdaman\s+and\s+diu\b", re.I)),
    ("Himachal Pradesh", re.compile(r"\bhimachal\b", re.I)),
    ("Jammu and Kashmir", re.compile(r"\bjammu\b", re.I)),
    ("Madhya Pradesh", re.compile(r"\bmadhya\s+pradesh\b", re.I)),
    ("Tamil Nadu", re.compile(r"\btamil\s+nadu\b", re.I)),
    ("Uttar Pradesh", re.compile(r"\buttar\s+pradesh\b", re.I)),
    ("West Bengal", re.compile(r"\bwest\s+bengal\b", re.I)),
    ("Assam", re.compile(r"\bassam\b", re.I)),
    ("Bihar", re.compile(r"\bbihar\b", re.I)),
    ("Chhattisgarh", re.compile(r"\bchhattisgarh\b", re.I)),
    ("Goa", re.compile(r"\bgoa\b", re.I)),
    ("Gujarat", re.compile(r"\bgujarat\b", re.I)),
    ("Haryana", re.compile(r"\bharyana\b", re.I)),
    ("Jharkhand", re.compile(r"\bjharkhand\b", re.I)),
    ("Karnataka", re.compile(r"\bkarnataka\b", re.I)),
    ("Kerala", re.compile(r"\b(kerala|kerla|kerela|keral)\b", re.I)),
    ("Maharashtra", re.compile(r"\bmaharashtra\b", re.I)),
    ("Manipur", re.compile(r"\bmanipur\b", re.I)),
    ("Meghalaya", re.compile(r"\bmeghalaya\b", re.I)),
    ("Mizoram", re.compile(r"\bmizoram\b", re.I)),
    ("Nagaland", re.compile(r"\bnagaland\b", re.I)),
    ("Odisha", re.compile(r"\b(odisha|orissa)\b", re.I)),
    ("Punjab", re.compile(r"\bpunjab\b", re.I)),
    ("Rajasthan", re.compile(r"\brajasthan\b", re.I)),
    ("Sikkim", re.compile(r"\bsikkim\b", re.I)),
    ("Telangana", re.compile(r"\btelangana\b", re.I)),
    ("Tripura", re.compile(r"\btripura\b", re.I)),
    ("Uttarakhand", re.compile(r"\b(uttarakhand|uttaranchal)\b", re.I)),
    ("Delhi", re.compile(r"\b(delhi|nct\s+delhi)\b", re.I)),
    ("Ladakh", re.compile(r"\bladakh\b", re.I)),
    ("Puducherry", re.compile(r"\b(puducherry|pondicherry)\b", re.I)),
    ("Chandigarh", re.compile(r"\bchandigarh\b", re.I)),
]

_PLACEHOLDER_LOCATION_VALUES = frozenset({
    "",
    "all",
    "general",
    "not specified",
    "unknown",
    "unspecified",
    "n/a",
})


def resolve_location_field(
    explicit: str | None,
    thread_value: str | None,
    *,
    default: str = "all",
) -> str:
    """Prefer an explicit tool/plan value; fall back to thread GPS location."""
    explicit_norm = (explicit or "").strip()
    if explicit_norm and explicit_norm.lower() not in _PLACEHOLDER_LOCATION_VALUES:
        return explicit_norm
    thread_norm = (thread_value or "").strip()
    if thread_norm and thread_norm.lower() not in _PLACEHOLDER_LOCATION_VALUES:
        return thread_norm
    return default


def extract_state_from_text(text: str) -> Optional[str]:
    """Return canonical Indian state name if mentioned in farmer text."""
    if not text:
        return None
    for name, pattern in _STATE_PATTERNS:
        if pattern.search(text):
            return name
    return None


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


def latest_human_text(messages: list[BaseMessage]) -> str:
    """Text from the most recent farmer message only (no thread history bleed)."""
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            return _message_to_text(msg)
    return ""


def recent_human_text(messages: list[BaseMessage], *, max_turns: int = 3) -> str:
    """Last N farmer lines — for crop carry-over during clarify, not full thread state."""
    lines: list[str] = []
    for msg in messages:
        if isinstance(msg, HumanMessage):
            text = _message_to_text(msg)
            if text:
                lines.append(text)
    if len(lines) > max_turns:
        lines = lines[-max_turns:]
    return " ".join(lines)


def has_gps_coordinates(location: Optional[dict[str, Any]]) -> bool:
    if not location:
        return False
    return location.get("latitude") is not None and location.get("longitude") is not None


def gps_state_from_location(location: Optional[dict[str, Any]]) -> Optional[str]:
    """State from thread GPS reverse-geocode only (not from old query text)."""
    if not has_gps_coordinates(location):
        return None
    if not location:
        return None
    state_val = location.get("state")
    if state_val is None:
        return None
    normalized = str(state_val).strip()
    if normalized.lower() in {"", "unknown", "not specified", "all", "none"}:
        return None
    return normalized


def resolve_state_for_turn(
    latest_text: str,
    location: Optional[dict[str, Any]],
) -> Optional[str]:
    """Current message state first, then GPS-resolved thread state — never old messages."""
    state_from_text = extract_state_from_text(latest_text)
    if state_from_text:
        trace_resolution(
            "state_for_turn",
            state=state_from_text,
            state_source="latest_message_text",
        )
        return state_from_text
    # Do not fall back to thread GPS for state — farmer text / plan entities only.
    # gps_state = gps_state_from_location(location)
    # if gps_state:
    #     trace_resolution(
    #         "state_for_turn",
    #         state=gps_state,
    #         state_source="location.state (thread_gps)",
    #     )
    #     return gps_state
    trace_resolution(
        "state_for_turn",
        state=None,
        state_source="unresolved (GPS fallback disabled)",
    )
    return None


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
    if patch:
        trace_resolution(
            "location_information_tool",
            state=patch.get("state"),
            state_source="reverse_geocode",
            district=patch.get("city"),
            district_source="reverse_geocode",
            latitude=base.get("latitude"),
            longitude=base.get("longitude"),
            lat_long_source="thread_location",
            address=patch.get("address"),
        )
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


async def forward_geocode(state: Optional[str], district: Optional[str] = None) -> Optional[dict[str, Any]]:
    """Forward geocode state and district to latitude/longitude using OpenStreetMap Nominatim."""
    import logging
    import httpx

    logger = logging.getLogger(__name__)

    if not state and not district:
        return None

    trace_resolution(
        "forward_geocode_request",
        state=state,
        state_source="caller_input",
        district=district,
        district_source="caller_input",
    )
        
    url = "https://nominatim.openstreetmap.org/search"
    # Try structured query first since it is more reliable
    params = {
        "country": "India",
        "format": "json",
        "limit": 1,
        "addressdetails": 1
    }
    if state:
        params["state"] = state
    if district:
        params["county"] = district
        
    headers = {
        "User-Agent": "AjraSakha-Agent/1.0"
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, headers=headers, timeout=10.0)
            response.raise_for_status()
            data = response.json()
            if data and isinstance(data, list) and len(data) > 0:
                item = data[0]
                lat = float(item["lat"])
                lon = float(item["lon"])
                display_name = item.get("display_name")
                resolved_state = item.get("address", {}).get("state") or state
                result = {
                    "latitude": lat,
                    "longitude": lon,
                    "state": resolved_state,
                    "city": district or item.get("name"),
                    "address": display_name
                }
                trace_resolution(
                    "forward_geocode_result",
                    state=resolved_state,
                    state_source="nominatim_structured",
                    district=result["city"],
                    district_source="nominatim_structured",
                    latitude=lat,
                    longitude=lon,
                    lat_long_source="nominatim_structured",
                    address=display_name,
                )
                return result
    except Exception as e:
        logger.error("Structured forward geocoding failed: %s", e)
        
    # Fallback to general query string if structured query failed (e.g. for spelling variants)
    query_parts = []
    if district:
        query_parts.append(district)
    if state:
        query_parts.append(state)
    query_parts.append("India")
    q = ", ".join(query_parts)
    
    params = {
        "q": q,
        "format": "json",
        "limit": 1,
        "addressdetails": 1
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, headers=headers, timeout=10.0)
            response.raise_for_status()
            data = response.json()
            if data and isinstance(data, list) and len(data) > 0:
                item = data[0]
                lat = float(item["lat"])
                lon = float(item["lon"])
                display_name = item.get("display_name")
                resolved_state = item.get("address", {}).get("state") or state
                result = {
                    "latitude": lat,
                    "longitude": lon,
                    "state": resolved_state,
                    "city": district or item.get("name"),
                    "address": display_name
                }
                trace_resolution(
                    "forward_geocode_result",
                    state=resolved_state,
                    state_source="nominatim_fallback_query",
                    district=result["city"],
                    district_source="nominatim_fallback_query",
                    latitude=lat,
                    longitude=lon,
                    lat_long_source="nominatim_fallback_query",
                    address=display_name,
                )
                return result
    except Exception as e:
        logger.error("Fallback forward geocoding failed: %s", e)

    trace_resolution(
        "forward_geocode_result",
        state=state,
        state_source="failed",
        district=district,
        district_source="failed",
    )
    return None
