"""Deterministic tool execution from planner flags."""

from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any, Optional

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langchain_core.runnables import RunnableConfig, patch_config

from ajrasakha.agents.location_context import (
    extract_location_updates_from_new_tool_messages,
    extract_state_from_text,
    gps_state_from_location,
    has_gps_coordinates,
    merge_location_dict,
)
from ajrasakha.agents.language import text_matches_user_language
from ajrasakha.agents.state import AjraSakhaState, Location, PlannerPlan
from ajrasakha.agents.tool_registry import get_location_tool, get_main_tool_node, get_reviewer_tool

logger = logging.getLogger(__name__)

_CHEMICAL_NAME_RE = re.compile(
    r"\b(monocrotophos|chlorpyrifos|endosulfan|carbofuran|paraquat|"
    r"glyphosate|imidacloprid|thiamethoxam|mancozeb|carbendazim|"
    r"urea|dap|npk|2,4-d|atrazine)\b",
    re.IGNORECASE,
)


def _new_tool_call_id() -> str:
    return f"call_{uuid.uuid4().hex[:24]}"


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


def _last_human_text(messages: list[BaseMessage]) -> str:
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            return _message_to_text(msg)
    return ""


def _location_has_place(loc: Optional[Location]) -> bool:
    if not loc:
        return False
    return bool(loc.get("state") or loc.get("city"))


def _needs_location_resolve(loc: Optional[Location]) -> bool:
    if not loc:
        return False
    lat, lon = loc.get("latitude"), loc.get("longitude")
    if lat is None or lon is None:
        return False
    return not _location_has_place(loc)


def _entity_str(
    plan: PlannerPlan,
    key: str,
    loc: Optional[Location],
    default: str,
    *,
    user_query: str = "",
) -> str:
    entities = plan.get("entities") or {}
    val = entities.get(key) if isinstance(entities, dict) else None
    if val:
        return str(val).strip()
    if key == "state" and user_query:
        extracted = extract_state_from_text(user_query)
        if extracted:
            return extracted
    if loc:
        if key == "state":
            gps_state = gps_state_from_location(loc)
            if gps_state:
                return gps_state
        elif key == "district" and has_gps_coordinates(loc) and loc.get("city"):
            return str(loc["city"]).strip()
        elif loc.get(key):
            return str(loc[key]).strip()
    return default


def _reviewer_domain(plan: PlannerPlan) -> str:
    if plan.get("weather"):
        return "Weather"
    if plan.get("mandi"):
        return "Market Prices"
    if plan.get("soil"):
        return "Soil Health"
    if plan.get("schemes"):
        return "Government Schemes"
    if plan.get("knowledge_base"):
        return "Crop Protection"
    return "General"


async def build_tool_calls_from_plan(
    plan: PlannerPlan,
    user_query: str,
    location: Optional[Location],
    *,
    location_tool_name: str,
    reviewer_tool_name: str,
    extra_chemicals: Optional[list[str]] = None,
) -> list[dict[str, Any]]:
    """Build LangChain tool_call dicts for one parallel batch."""
    calls: list[dict[str, Any]] = []
    loc = location or {}
    entities = plan.get("entities") or {}
    state_name = _entity_str(plan, "state", loc, "Not specified", user_query=user_query)
    district = _entity_str(plan, "district", loc, "all", user_query=user_query)
    if district in {"", "Not specified", "unknown"} and has_gps_coordinates(loc) and loc.get("city"):
        district = str(loc["city"])
    elif district in {"", "Not specified", "unknown"} and state_name.lower() not in {
        "",
        "not specified",
        "unknown",
        "all",
        "none",
    }:
        district = "all"
    crop = _entity_str(plan, "crop", loc, "General", user_query=user_query)
    domain = _reviewer_domain(plan)

    if _needs_location_resolve(loc):
        calls.append({
            "name": location_tool_name,
            "args": {"latitude": loc["latitude"], "longitude": loc["longitude"]},
            "id": _new_tool_call_id(),
            "type": "tool_call",
        })

    calls.append({
        "name": reviewer_tool_name,
        "args": {
            "question": user_query,
            "state_name": state_name,
            "crop": crop,
            "details": {
                "state": state_name,
                "district": district,
                "crop": crop,
                "season": "General",
                "domain": domain,
            },
        },
        "id": _new_tool_call_id(),
        "type": "tool_call",
    })

    lat = loc.get("latitude")
    lon = loc.get("longitude")
    addr = loc.get("address")

    if plan.get("weather"):
        calls.append({
            "name": "weather",
            "args": {
                "query": user_query,
                "latitude": lat,
                "longitude": lon,
                "address": addr,
            },
            "id": _new_tool_call_id(),
            "type": "tool_call",
        })

    if plan.get("mandi"):
        calls.append({
            "name": "market",
            "args": {
                "query": user_query,
                "state": state_name if state_name != "Not specified" else "all",
                "district": district if district != "Not specified" else "all",
                "crop": crop if crop != "General" else "all",
                "date": None,
            },
            "id": _new_tool_call_id(),
            "type": "tool_call",
        })

    if plan.get("soil"):
        calls.append({
            "name": "soil",
            "args": {
                "query": user_query,
                "address": addr or district,
                "state": state_name,
                "district": district,
                "crop": crop,
                "n": 0.0,
                "p": 0.0,
                "k": 0.0,
                "oc": 0.0,
            },
            "id": _new_tool_call_id(),
            "type": "tool_call",
        })

    if plan.get("schemes"):
        calls.append({
            "name": "schemes",
            "args": {
                "query": user_query,
                "state": state_name if state_name != "Not specified" else "All",
                "gender": None,
                "age": None,
                "caste": None,
                "residence": None,
                "occupation": "Farmer",
                "benefit_type": None,
                "is_bpl": False,
                "is_minority": False,
                "is_differently_abled": False,
            },
            "id": _new_tool_call_id(),
            "type": "tool_call",
        })

    if plan.get("knowledge_base"):
        gdb_query = plan.get("original_query_en") or user_query
        rephrased = plan.get("rephrased_query") or gdb_query
        resolved_crop = "all" if crop.lower() in {"general", "not specified", "none", "null", "all"} else crop
        resolved_state = "all" if state_name.lower() in {"general", "not specified", "none", "null", "all"} else state_name
        calls.append({
            "name": "gdb",
            "args": {
                "query": gdb_query,
                "crop": resolved_crop,
                "state": resolved_state,
                "rephrased_query": rephrased,
                "latitude": lat,
                "longitude": lon,
                "address": addr,
            },
            "id": _new_tool_call_id(),
            "type": "tool_call",
        })

    chemicals: list[str] = []
    if isinstance(entities, dict):
        chemicals.extend(entities.get("chemicals") or [])
    if extra_chemicals:
        chemicals.extend(extra_chemicals)
    chemicals = list(dict.fromkeys(c for c in chemicals if c))

    if plan.get("chemical_checker") and chemicals:
        calls.append({
            "name": "chemical_checker",
            "args": {
                "query": user_query,
                "chemicals": chemicals,
                "crop": crop if crop != "General" else "all",
                "state": state_name if state_name != "Not specified" else "all",
            },
            "id": _new_tool_call_id(),
            "type": "tool_call",
        })

    return calls


def extract_chemicals_from_text(text: str) -> list[str]:
    if not text:
        return []
    found = _CHEMICAL_NAME_RE.findall(text)
    return list(dict.fromkeys(f.title() if f.lower() == "urea" else f for f in found))


def extract_chemicals_from_tool_messages(messages: list[BaseMessage]) -> list[str]:
    names: list[str] = []
    for msg in messages:
        if not isinstance(msg, ToolMessage):
            continue
        if getattr(msg, "name", None) == "gdb":
            names.extend(extract_chemicals_from_text(_message_to_text(msg)))
    return list(dict.fromkeys(names))


def reviewer_direct_answer(tool_messages: list[BaseMessage]) -> Optional[str]:
    for msg in tool_messages:
        name = getattr(msg, "name", "") or ""
        if "upload_question" not in name.lower():
            continue
        raw = _message_to_text(msg)
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        answer = data.get("answer_text") or data.get("answer")
        if isinstance(answer, str) and len(answer.strip()) > 20:
            return answer.strip()
    return None


async def ensure_location_node(
    state: AjraSakhaState,
    config: RunnableConfig,
) -> dict:
    """Resolve GPS to state/district when coordinates exist but place names do not."""
    loc = state.get("location")
    if not _needs_location_resolve(loc):
        return {}

    location_tool = await get_location_tool()
    tool_node = await get_main_tool_node()
    ai_msg = AIMessage(
        content="",
        tool_calls=[{
            "name": location_tool.name,
            "args": {"latitude": loc["latitude"], "longitude": loc["longitude"]},
            "id": _new_tool_call_id(),
            "type": "tool_call",
        }],
    )
    exec_state = {**state, "messages": list(state.get("messages") or []) + [ai_msg]}
    merged_configurable = dict((config.get("configurable") or {}))
    merged_configurable["location"] = loc
    enriched = patch_config(config, configurable=merged_configurable)
    result = await tool_node.ainvoke(exec_state, config=enriched)
    new_msgs = result.get("messages") or []
    updates = extract_location_updates_from_new_tool_messages(new_msgs, loc)
    merged_loc = merge_location_dict(loc, updates) if updates else loc
    return {"messages": new_msgs, "location": merged_loc}


async def execute_plan_node(
    state: AjraSakhaState,
    config: RunnableConfig,
) -> dict:
    plan = state.get("plan")
    if not plan or not plan.get("is_complete", True):
        return {}

    messages = state.get("messages") or []
    user_query = _last_human_text(messages)
    loc = state.get("location")

    location_tool = await get_location_tool()
    reviewer_tool = await get_reviewer_tool()
    tool_calls = await build_tool_calls_from_plan(
        plan,
        user_query,
        loc,
        location_tool_name=location_tool.name,
        reviewer_tool_name=reviewer_tool.name,
    )
    if not tool_calls:
        return {}

    tool_node = await get_main_tool_node()
    ai_msg = AIMessage(content="", tool_calls=tool_calls)
    exec_state = {**state, "messages": list(messages) + [ai_msg]}

    merged_configurable = dict((config.get("configurable") or {}))
    merged_configurable["location"] = loc
    enriched = patch_config(config, configurable=merged_configurable)

    result = await tool_node.ainvoke(exec_state, config=enriched)
    new_msgs = result.get("messages") or []
    merged_loc = result.get("location") or loc

    direct = reviewer_direct_answer(new_msgs)
    if direct and text_matches_user_language(direct, user_query):
        logger.info("Reviewer returned direct answer_text — skipping synthesize")
        return {
            "messages": [AIMessage(content=direct)],
            "location": merged_loc,
            "plan": {**plan, "skip_synthesize": True},
        }
    if direct:
        logger.info(
            "Reviewer answer language does not match farmer message — running synthesize to translate"
        )

    extra_chems = extract_chemicals_from_tool_messages(new_msgs)
    if extra_chems and plan.get("knowledge_base") and not plan.get("chemical_checker"):
        second_calls = await build_tool_calls_from_plan(
            {**plan, "chemical_checker": True},
            user_query,
            merged_loc,
            location_tool_name=location_tool.name,
            reviewer_tool_name=reviewer_tool.name,
            extra_chemicals=extra_chems,
        )
        chem_only = [c for c in second_calls if c.get("name") == "chemical_checker"]
        if chem_only:
            ai2 = AIMessage(content="", tool_calls=chem_only)
            exec2 = {**state, "messages": list(messages) + [ai_msg] + new_msgs + [ai2]}
            enriched2 = patch_config(enriched, configurable={**merged_configurable, "location": merged_loc})
            result2 = await tool_node.ainvoke(exec2, config=enriched2)
            new_msgs = (result2.get("messages") or [])[-len(chem_only):]
            merged_loc = result2.get("location") or merged_loc
            return {"messages": [ai_msg] + (result.get("messages") or []) + [ai2] + new_msgs, "location": merged_loc}

    return {"messages": [ai_msg] + new_msgs, "location": merged_loc}


def route_after_execute(state: AjraSakhaState) -> str:
    plan = state.get("plan") or {}
    if plan.get("skip_synthesize"):
        return "end"
    messages = state.get("messages") or []
    for msg in reversed(messages):
        if isinstance(msg, AIMessage):
            break
        if isinstance(msg, ToolMessage) and getattr(msg, "name", None) == "gdb":
            text = _message_to_text(msg)
            if not text or text.upper() == "NO_RELEVANT_CONTENT" or text in {"[]", "{}"}:
                return "empty_gdb_reply"
            try:
                data = json.loads(text)
                if isinstance(data, dict):
                    is_exact = data.get("is_exact", False)
                    is_similar = data.get("is_similar", False)
                    # If neither exact nor similar match, it's empty
                    if not is_exact and not is_similar:
                        # Also check legacy format
                        exact = data.get("exact_match") or {}
                        similar = data.get("similar_match") or {}
                        if not exact and not similar:
                            return "empty_gdb_reply"
            except Exception:
                pass
    return "synthesize"

