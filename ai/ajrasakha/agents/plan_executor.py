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
    forward_geocode,
)
from ajrasakha.agents.language import text_matches_user_language
from ajrasakha.agents.config import resolve_question_source, resolve_thread_id
from ajrasakha.agents.domains import reviewer_upload_domain
from ajrasakha.agents.state import AjraSakhaState, Location, PlannerPlan
from ajrasakha.agents.retrieval_sanitizer import gdb_has_usable_answers
from ajrasakha.agents.tool_registry import get_location_tool, get_main_tool_node, get_reviewer_tool

logger = logging.getLogger(__name__)

# Set True to run chemical_checker (planner flag + post-gdb regex follow-up batch).
ENABLE_CHEMICAL_CHECKER = False

_SIMILAR_PAIR_KEYS = tuple(f"similar_pair{i}" for i in range(1, 6))
_GDB_EMPTY_SENTINELS = frozenset({"NO_RELEVANT_CONTENT", "[]", "{}"})

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
    entity_text: str = "",
) -> str:
    entities = plan.get("entities") or {}
    val = entities.get(key) if isinstance(entities, dict) else None
    if val:
        return str(val).strip()
    if key == "state" and entity_text:
        extracted = extract_state_from_text(entity_text)
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
    return reviewer_upload_domain(plan.get("domain") or "General")


async def build_tool_calls_from_plan(
    plan: PlannerPlan,
    user_query: str,
    location: Optional[Location],
    *,
    location_tool_name: str,
    reviewer_tool_name: str,
    question_source: str | None = None,
    thread_id: str | None = None,
    extra_chemicals: Optional[list[str]] = None,
) -> list[dict[str, Any]]:
    """Build LangChain tool_call dicts for one parallel batch."""
    if not (question_source and str(question_source).strip()):
        question_source = resolve_question_source(None)

    calls: list[dict[str, Any]] = []
    loc = location or {}
    entities = plan.get("entities") or {}
    entity_text = (plan.get("rephrased_query") or "").strip() or user_query
    state_name = _entity_str(plan, "state", loc, "Not specified", entity_text=entity_text)
    district = _entity_str(plan, "district", loc, "all", entity_text=entity_text)
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
    crop = _entity_str(plan, "crop", loc, "General", entity_text=entity_text)
    domain = _reviewer_domain(plan)
    reviewer_question = (plan.get("rephrased_query") or "").strip() or user_query

    if _needs_location_resolve(loc):
        calls.append({
            "name": location_tool_name,
            "args": {"latitude": loc["latitude"], "longitude": loc["longitude"]},
            "id": _new_tool_call_id(),
            "type": "tool_call",
        })

    if question_source and str(question_source).strip():
        reviewer_args: dict[str, Any] = {
            "question": reviewer_question,
            "state_name": state_name,
            "crop": crop,
            "details": {
                "state": state_name,
                "district": district,
                "crop": crop,
                "season": "General",
                "domain": domain,
            },
            "source": str(question_source).strip(),
        }
        if thread_id and str(thread_id).strip():
            reviewer_args["thread_id"] = str(thread_id).strip()
        calls.append({
            "name": reviewer_tool_name,
            "args": reviewer_args,
            "id": _new_tool_call_id(),
            "type": "tool_call",
        })
    else:
        logger.warning(
            "Skipping %s: configurable.question_source not set",
            reviewer_tool_name,
        )

    lat = loc.get("latitude")
    lon = loc.get("longitude")
    addr = loc.get("address")

    # Transient / Query-Specific Location resolving (e.g. Varanasi vs. Faridabad)
    is_custom_location = False
    home_state = gps_state_from_location(loc) or loc.get("state")
    home_city = loc.get("city")
    
    curr_state_ent = entities.get("state")
    curr_dist_ent = entities.get("district")
    
    if (lat is not None and lon is not None) or (home_state or home_city):
        if curr_state_ent and home_state and curr_state_ent.strip().lower() != home_state.strip().lower():
            is_custom_location = True
        elif curr_dist_ent and home_city and curr_dist_ent.strip().lower() != home_city.strip().lower() and curr_dist_ent.strip().lower() != "all":
            is_custom_location = True
            
    if is_custom_location:
        logger.info("build_tool_calls_from_plan: Geocoding custom transient location state=%s district=%s", state_name, district)
        custom_res = await forward_geocode(state_name, district if district != "all" else None)
        if custom_res:
            lat = custom_res.get("latitude")
            lon = custom_res.get("longitude")
            addr = custom_res.get("address")

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
        rephrased = (
            (plan.get("rephrased_query") or "").strip()
            or (plan.get("original_query_en") or "").strip()
            or user_query
        )
        resolved_crop = "all" if crop.lower() in {"general", "not specified", "none", "null", "all"} else crop
        resolved_state = "all" if state_name.lower() in {"general", "not specified", "none", "null", "all"} else state_name
        calls.append({
            "name": "gdb",
            "args": {
                "rephrased_query": rephrased,
                "crop": resolved_crop,
                "state": resolved_state,
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

    if ENABLE_CHEMICAL_CHECKER and plan.get("chemical_checker") and chemicals:
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
    """Resolve GPS to state/district when coordinates exist but place names do not, OR geocode state/district when coordinates do not exist."""
    loc = state.get("location") or {}
    plan = state.get("plan") or {}
    entities = plan.get("entities") or {}

    # Scenario 1: Coordinates exist but place names do not (Reverse Geocoding)
    if _needs_location_resolve(loc):
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

    # Scenario 2: Coordinates are missing, but state/district exist in plan entities (Home Location registration)
    lat = loc.get("latitude")
    lon = loc.get("longitude")
    state_resolved = entities.get("state")
    district_resolved = entities.get("district")

    if (lat is None or lon is None) and (state_resolved or district_resolved):
        logger.info("ensure_location_node: Geocoding home location for state=%s district=%s", state_resolved, district_resolved)
        geocode_res = await forward_geocode(state_resolved, district_resolved)
        if geocode_res:
            merged_loc = merge_location_dict(loc, geocode_res)
            return {"location": merged_loc}

    return {}


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
    question_source = resolve_question_source(config)
    thread_id = resolve_thread_id(config)
    tool_calls = await build_tool_calls_from_plan(
        plan,
        user_query,
        loc,
        location_tool_name=location_tool.name,
        reviewer_tool_name=reviewer_tool.name,
        question_source=question_source,
        thread_id=thread_id,
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
    if (
        ENABLE_CHEMICAL_CHECKER
        and extra_chems
        and plan.get("knowledge_base")
        and not plan.get("chemical_checker")
    ):
        second_calls = await build_tool_calls_from_plan(
            {**plan, "chemical_checker": True},
            user_query,
            merged_loc,
            location_tool_name=location_tool.name,
            reviewer_tool_name=reviewer_tool.name,
            question_source=question_source,
            thread_id=thread_id,
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
            out = {
                "messages": [ai_msg] + (result.get("messages") or []) + [ai2] + new_msgs,
                "location": merged_loc,
            }
            audit = _golden_audit_from_messages(out["messages"])
            if audit:
                out["golden_retrieval_audit"] = audit
            return out

    out: dict = {"messages": [ai_msg] + new_msgs, "location": merged_loc}
    audit = _golden_audit_from_messages(out["messages"])
    if audit:
        out["golden_retrieval_audit"] = audit
    return out


def _golden_audit_from_messages(messages: list[BaseMessage]) -> Optional[dict]:
    data = _latest_turn_gdb_payload(messages)
    if not data:
        return None
    audit = data.get("classification_audit")
    if isinstance(audit, dict):
        return audit
    return None


def _latest_turn_gdb_payload(messages: list[BaseMessage]) -> Optional[dict]:
    """Parse gdb ToolMessage JSON from the current turn (after last HumanMessage)."""
    last_human_idx = -1
    for i in range(len(messages) - 1, -1, -1):
        if isinstance(messages[i], HumanMessage):
            last_human_idx = i
            break
    if last_human_idx < 0:
        return None
    for i in range(len(messages) - 1, last_human_idx, -1):
        msg = messages[i]
        if isinstance(msg, ToolMessage) and getattr(msg, "name", None) == "gdb":
            text = _message_to_text(msg)
            if not text or text.upper() in _GDB_EMPTY_SENTINELS:
                return None
            try:
                data = json.loads(text)
                if isinstance(data, dict):
                    return data
            except (json.JSONDecodeError, TypeError):
                return None
    return None


def _gdb_has_usable_data(messages: list[BaseMessage]) -> bool:
    """True when GDB has an exact or similar pair with a non-empty expert answer."""
    data = _latest_turn_gdb_payload(messages)
    if not data:
        return False
    return gdb_has_usable_answers(data)


_SPECIALIST_TOOL_NAMES = frozenset({"weather", "market", "soil", "schemes", "chemical_checker"})


def _turn_has_specialist_tool_message(messages: list[BaseMessage]) -> bool:
    """True when a specialist ToolMessage exists in the current turn."""
    last_human_idx = -1
    for i in range(len(messages) - 1, -1, -1):
        if isinstance(messages[i], HumanMessage):
            last_human_idx = i
            break
    if last_human_idx < 0:
        return False
    for i in range(len(messages) - 1, last_human_idx, -1):
        msg = messages[i]
        if isinstance(msg, ToolMessage):
            name = getattr(msg, "name", None) or ""
            if name in _SPECIALIST_TOOL_NAMES and _message_to_text(msg):
                return True
    return False


def should_expert_queue_reply(state: AjraSakhaState) -> bool:
    """GDB empty after retrieval + no non-empty specialist ToolMessage this turn."""
    messages = state.get("messages") or []
    has_specialist_content = _turn_has_specialist_tool_message(messages)
    return not _gdb_has_usable_data(messages) and not has_specialist_content


def route_after_execute(state: AjraSakhaState) -> str:
    plan = state.get("plan") or {}
    if plan.get("skip_synthesize"):
        return "end"
    if should_expert_queue_reply(state):
        return "empty_gdb_reply"
    messages = state.get("messages") or []
    if _gdb_has_usable_data(messages):
        return "gdb_passthrough"
    if _turn_has_specialist_tool_message(messages):
        return "synthesize"
    return "empty_gdb_reply"

