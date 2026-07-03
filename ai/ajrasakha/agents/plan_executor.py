"""Deterministic tool execution from planner flags."""

from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any, NamedTuple, Optional

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langchain_core.runnables import RunnableConfig, patch_config

from ajrasakha.agents.location_context import (
    forward_geocode,
    gps_state_from_location,
    merge_location_dict,
)
from ajrasakha.agents.language import text_matches_user_language
from ajrasakha.agents.config import (
    resolve_message_id,
    resolve_question_source,
    resolve_thread_id,
    resolve_user_id,
)
from ajrasakha.agents.resolution_trace import trace_resolution, trace_thread_location
from ajrasakha.agents.thread_trace import trace_event
from ajrasakha.agents.domains import reviewer_upload_domain
from ajrasakha.agents.state import AjraSakhaState, Location, PlannerPlan
from ajrasakha.agents.retrieval_sanitizer import gdb_has_usable_answers
from ajrasakha.agents.tool_registry import get_location_tool, get_main_tool_node, get_reviewer_tool

logger = logging.getLogger(__name__)

# Set True to run chemical_checker (planner flag + post-gdb regex follow-up batch).
ENABLE_CHEMICAL_CHECKER = False

_SIMILAR_PAIR_KEYS = tuple(f"similar_pair{i}" for i in range(1, 6))
_GDB_EMPTY_SENTINELS = frozenset({"NO_RELEVANT_CONTENT", "[]", "{}"})


def _compute_tools_used(plan: PlannerPlan) -> list[str]:
    """Compute the list of tools used based on plan flags.
    
    Returns a list of tool names that were used to generate the answer.
    For non-agriculture queries, returns an empty list.
    """
    # Non-agriculture queries have no tools used
    if plan.get("is_agriculture_related") is False:
        return []
    
    tools: list[str] = []
    
    # Always include knowledge_base if it's an agriculture query
    if plan.get("knowledge_base"):
        tools.append("knowledge_base")
    
    if plan.get("weather"):
        tools.append("weather")
    
    if plan.get("mandi"):
        tools.append("mandi")
    
    if plan.get("soil"):
        tools.append("soil")
    
    if plan.get("schemes"):
        tools.append("schemes")
    
    if plan.get("chemical_checker"):
        tools.append("chemical_checker")
    
    return tools




def _is_useful_tool_response(message: ToolMessage) -> bool:
    """Check if a tool message contains useful/non-empty data."""
    text = _message_to_text(message)
    if not text:
        return False
    # Check for empty sentinels
    if text.upper() in _GDB_EMPTY_SENTINELS:
        return False
    # Check for truly empty responses
    if text in {"[]", "{}", ""}:
        return False
    return True


def _gdb_has_usable_answer(message: ToolMessage) -> bool:
    """Check if GDB response has is_exact or is_similar set to true."""
    text = _message_to_text(message)
    if not text or text.upper() in _GDB_EMPTY_SENTINELS:
        return False
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            # Check for is_exact or is_similar flags
            is_exact = data.get("is_exact", False)
            is_similar = data.get("is_similar", False)
            return bool(is_exact or is_similar)
    except (json.JSONDecodeError, TypeError):
        pass
    return False


def compute_actual_tools_used(messages: list[BaseMessage]) -> list[str]:
    """Compute actual tools_used based on which tools returned useful data.
    
    Only includes tools that actually returned non-empty, useful responses.
    For GDB: only counts if is_exact or is_similar is true.
    """
    tools: list[str] = []
    
    # Find the last human message index to only check current turn
    last_human_idx = -1
    for i in range(len(messages) - 1, -1, -1):
        if isinstance(messages[i], HumanMessage):
            last_human_idx = i
            break
    
    if last_human_idx < 0:
        return []
    
    # Check each tool message after the last human message
    for i in range(last_human_idx + 1, len(messages)):
        msg = messages[i]
        if not isinstance(msg, ToolMessage):
            continue
        
        name = getattr(msg, "name", None) or ""
        
        # Map tool names to our tools_used values
        if name in {"gdb", "golden_db", "gdb_golden_db"}:
            # Only count knowledge_base if GDB has usable answer (is_exact or is_similar)
            if _gdb_has_usable_answer(msg) and "knowledge_base" not in tools:
                tools.append("knowledge_base")
        elif name in {"weather", "weather_server", "weather_weather_server"}:
            if _is_useful_tool_response(msg) and "weather" not in tools:
                tools.append("weather")
        elif name in {"market", "agmarknet", "enam", "market_agmarknet_server", "market_enam_server"}:
            if _is_useful_tool_response(msg) and "mandi" not in tools:
                tools.append("mandi")
        elif name in {"soil", "soil_server", "soil_soil_server"}:
            if _is_useful_tool_response(msg) and "soil" not in tools:
                tools.append("soil")
        elif name in {"schemes", "schemes_govt_schemes"}:
            if _is_useful_tool_response(msg) and "schemes" not in tools:
                tools.append("schemes")
        elif name in {"chemical_checker", "chemical_checker_chemical_checker"}:
            if _is_useful_tool_response(msg) and "chemical_checker" not in tools:
                tools.append("chemical_checker")
    
    return tools



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
    """Disabled — do not reverse-geocode thread GPS into place names."""
    return False
    # if not loc:
    #     return False
    # lat, lon = loc.get("latitude"), loc.get("longitude")
    # if lat is None or lon is None:
    #     return False
    # return not _location_has_place(loc)


_PLACEHOLDER_STATES = frozenset({
    "",
    "not specified",
    "unknown",
    "all",
    "none",
    "general",
})


def _plan_only_location(plan: PlannerPlan) -> dict[str, Any]:
    """Location dict for tool runtime config — plan entities only, no GPS coords."""
    entities = plan.get("entities") or {}
    out: dict[str, Any] = {}
    state = entities.get("state")
    district = entities.get("district")
    if state and str(state).strip().lower() not in _PLACEHOLDER_STATES:
        out["state"] = str(state).strip()
    if district and str(district).strip().lower() not in _PLACEHOLDER_STATES:
        out["city"] = str(district).strip()
    return out


async def _coords_from_plan_entities(
    state_name: str,
    district: str,
) -> tuple[Optional[float], Optional[float], Optional[str]]:
    """Forward-geocode plan state/district — never read lat/lon from thread GPS."""
    if state_name.strip().lower() in _PLACEHOLDER_STATES:
        return None, None, None
    dist: Optional[str] = district
    if not dist or dist.strip().lower() in _PLACEHOLDER_STATES:
        dist = None
    geocode_res = await forward_geocode(state_name, dist)
    if not geocode_res:
        trace_resolution(
            "plan_entities_geocode",
            state=state_name,
            state_source="plan.entities",
            district=district,
            district_source="plan.entities",
            latitude=None,
            longitude=None,
            lat_long_source="geocode_failed",
        )
        return None, None, None
    trace_resolution(
        "plan_entities_geocode",
        state=geocode_res.get("state") or state_name,
        state_source="nominatim_forward_geocode",
        district=geocode_res.get("city") or district,
        district_source="nominatim_forward_geocode",
        latitude=geocode_res.get("latitude"),
        longitude=geocode_res.get("longitude"),
        lat_long_source="nominatim_forward_geocode",
        address=geocode_res.get("address"),
    )
    return (
        geocode_res.get("latitude"),
        geocode_res.get("longitude"),
        geocode_res.get("address"),
    )


def _entity_str(
    plan: PlannerPlan,
    key: str,
    loc: Optional[Location],
    default: str,
    *,
    entity_text: str = "",
) -> str:
    value, _source = _entity_with_source(plan, key, loc, default)
    return value


def _entity_with_source(
    plan: PlannerPlan,
    key: str,
    loc: Optional[Location],
    default: str,
) -> tuple[str, str]:
    entities = plan.get("entities") or {}
    loc = loc or {}

    if key in {"state", "district"}:
        if key in entities:
            val = entities.get(key)
            if val is not None and str(val).strip() != "":
                return str(val).strip(), f"plan.entities.{key}"

    val = entities.get(key) if isinstance(entities, dict) else None
    if val and str(val).strip():
        return str(val).strip(), f"plan.entities.{key}"

    # Do not fall back to thread GPS / reverse-geocoded place names for state or
    # district — only plan.entities (farmer text, LLM, clarify carry-over).
    # if key in {"state", "district"}:
    #     if loc.get(key) and str(loc[key]).strip():
    #         return str(loc[key]).strip(), f"location.{key}"

    return default, "default"


class ResolvedToolEntities(NamedTuple):
    state: str
    district: str
    crop: str
    domains: list[str]
    state_source: str
    district_source: str
    crop_source: str
    domain_source: str


def _resolve_reviewer_location(
    plan: PlannerPlan,
    loc: Optional[Location],
    *,
    stage: str,
) -> ResolvedToolEntities:
    """Resolve state, district, crop, domain for reviewer/specialist tool calls."""
    trace_thread_location(
        f"{stage}_input",
        loc,
        plan_entities=plan.get("entities") or {},
        note="thread GPS place names are NOT used for reviewer/specialist tools",
    )

    if plan.get("is_greeting") or plan.get("reasoning") == "greeting":
        trace_resolution(
            stage,
            state="Not specified",
            state_source="greeting (no location)",
            district="all",
            district_source="greeting (no location)",
            crop="all",
            crop_source="greeting_short_circuit",
            domain="General",
            domain_source="greeting_short_circuit",
        )
        return ResolvedToolEntities(
            state="Not specified",
            district="all",
            crop="all",
            domains=[reviewer_upload_domain("General")],
            state_source="greeting (no location)",
            district_source="greeting (no location)",
            crop_source="greeting_short_circuit",
            domain_source="greeting_short_circuit",
        )

    loc = loc or {}
    state_name, state_source = _entity_with_source(plan, "state", loc, "Not specified")
    district, district_source = _entity_with_source(plan, "district", loc, "all")

    # Do not infer district from GPS reverse-geocoded city — plan.entities only.
    # if district in {"", "Not specified", "unknown"} and has_gps_coordinates(loc) and loc.get("city"):
    #     district = str(loc["city"])
    #     district_source = "location.city (gps_reverse_geocode)"
    if district in {"", "Not specified", "unknown"} and state_name.lower() not in {
        "",
        "not specified",
        "unknown",
        "all",
        "none",
    }:
        district = "all"
        district_source = "default_all_when_state_known"

    crop, crop_source = _entity_with_source(plan, "crop", loc, "General")
    # Get all domains from plan, not just the first one
    domains_list = plan.get("domains") or [plan.get("domain") or "General"]
    # Normalize each domain for reviewer upload and deduplicate while preserving order
    seen = set()
    domains = []
    for d in domains_list:
        normalized = reviewer_upload_domain(d)
        if normalized not in seen:
            seen.add(normalized)
            domains.append(normalized)
    domain_source = "plan.domains (all)"

    trace_resolution(
        stage,
        state=state_name,
        state_source=state_source,
        district=district,
        district_source=district_source,
        crop=crop,
        crop_source=crop_source,
        domain=domains,
        domain_source=domain_source,
        latitude=None,
        longitude=None,
        lat_long_source="unset (GPS disabled; geocode from plan.entities later)",
    )
    return ResolvedToolEntities(
        state=state_name,
        district=district,
        crop=crop,
        domains=domains,
        state_source=state_source,
        district_source=district_source,
        crop_source=crop_source,
        domain_source=domain_source,
    )


def _apply_reviewer_identity_args(
    reviewer_args: dict[str, Any],
    *,
    question_source: str | None,
    thread_id: str | None = None,
    user_id: str | None = None,
    message_id: str | None = None,
) -> None:
    if thread_id and str(thread_id).strip():
        reviewer_args["thread_id"] = str(thread_id).strip()

    src = (question_source or "").strip().upper()
    if src != "AJRASAKHA":
        return

    missing: list[str] = []
    if user_id and str(user_id).strip():
        reviewer_args["user_id"] = str(user_id).strip()
    else:
        missing.append("user_id")
    if message_id and str(message_id).strip():
        reviewer_args["message_id"] = str(message_id).strip()
    else:
        missing.append("message_id")
    if missing:
        logger.warning(
            "AJRASAKHA reviewer upload missing identity fields: %s",
            ", ".join(missing),
        )


def build_reviewer_upload_calls(
    plan: PlannerPlan,
    user_query: str,
    location: Optional[Location],
    *,
    location_tool_name: str,
    reviewer_tool_name: str,
    question_source: str | None = None,
    thread_id: str | None = None,
    user_id: str | None = None,
    message_id: str | None = None,
    resolved: ResolvedToolEntities | None = None,
) -> list[dict[str, Any]]:
    """Location resolve (if needed) + upload_question_to_reviewer_system only."""
    if not (question_source and str(question_source).strip()):
        question_source = resolve_question_source(None)

    calls: list[dict[str, Any]] = []
    loc = location or {}
    if resolved is None:
        resolved = _resolve_reviewer_location(plan, loc, stage="reviewer_upload")
    state_name = resolved.state
    district = resolved.district
    crop = resolved.crop
    domains = resolved.domains
    reviewer_question = (plan.get("rephrased_query") or "").strip() or user_query

    # Do not call location_information_tool with thread GPS coordinates.
    # if _needs_location_resolve(loc):
    #     calls.append({
    #         "name": location_tool_name,
    #         "args": {"latitude": loc["latitude"], "longitude": loc["longitude"]},
    #         ...
    #     })

    if question_source and str(question_source).strip():
        # Compute tools_used based on plan flags
        tools_used = _compute_tools_used(plan)
        reviewer_args: dict[str, Any] = {
            "question": reviewer_question,
            "state_name": state_name,
            "crop": crop,
            "details": {
                "state": state_name,
                "district": district,
                "crop": crop,
                "season": "General",
                "domain": domains,
                "tools_used": tools_used,
            },
            "source": str(question_source).strip(),
        }
        _apply_reviewer_identity_args(
            reviewer_args,
            question_source=question_source,
            thread_id=thread_id,
            user_id=user_id,
            message_id=message_id,
        )
        trace_resolution(
            "reviewer_upload_args",
            state=state_name,
            state_source=resolved.state_source,
            district=district,
            district_source=resolved.district_source,
            crop=crop,
            crop_source=resolved.crop_source,
            domain=domains,
            domain_source=resolved.domain_source,
            question=reviewer_question[:200],
            reviewer_args=reviewer_args,
        )
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
    return calls


async def build_specialist_tool_calls_from_plan(
    plan: PlannerPlan,
    user_query: str,
    location: Optional[Location],
    *,
    extra_chemicals: Optional[list[str]] = None,
    out_transient_location: Optional[dict[str, Any]] = None,
) -> tuple[list[dict[str, Any]], ResolvedToolEntities]:
    """Build LangChain tool_call dicts for specialist tools ONLY (no reviewer upload).
    
    Returns tuple of (tool_calls, resolved_entities) so caller can use resolved values.
    """
    calls: list[dict[str, Any]] = []
    loc = location or {}
    entities = plan.get("entities") or {}
    trace_thread_location(
        "build_specialist_tool_calls_input",
        loc,
        plan_entities=entities,
        note="building specialist tool calls only (no reviewer upload)",
    )
    resolved = _resolve_reviewer_location(plan, loc, stage="specialist_tool_batch")
    state_name = resolved.state
    district = resolved.district
    crop = resolved.crop

    # Lat/lon only from forward-geocoding plan.entities — never thread GPS.
    lat: Optional[float] = None
    lon: Optional[float] = None
    addr: Optional[str] = None
    needs_coords = bool(
        plan.get("weather") or plan.get("knowledge_base") or plan.get("soil")
    )
    if needs_coords and state_name.strip().lower() not in _PLACEHOLDER_STATES:
        lat, lon, addr = await _coords_from_plan_entities(state_name, district)
        if out_transient_location is not None and lat is not None and lon is not None:
            out_transient_location["state"] = state_name
            out_transient_location["city"] = district if district != "all" else None
            out_transient_location["latitude"] = lat
            out_transient_location["longitude"] = lon
            out_transient_location["address"] = addr

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
        state_to_geocode = curr_state_ent if curr_state_ent and curr_state_ent.strip().lower() not in {"all", "not specified", "unknown"} else None
        dist_to_geocode = district if district and district.strip().lower() not in {"all", "not specified", "unknown"} else None

        logger.info("build_specialist_tool_calls_from_plan: Geocoding custom transient location state=%s district=%s", state_to_geocode, dist_to_geocode)
        if out_transient_location is not None:
            out_transient_location["state"] = state_to_geocode
            out_transient_location["city"] = dist_to_geocode

        custom_res = await forward_geocode(state_to_geocode, dist_to_geocode)
        if custom_res:
            lat = custom_res.get("latitude")
            lon = custom_res.get("longitude")
            addr = custom_res.get("address")

            resolved_state = custom_res.get("state")
            if resolved_state:
                state_name = resolved_state

            if out_transient_location is not None:
                out_transient_location["state"] = state_name
                out_transient_location["latitude"] = lat
                out_transient_location["longitude"] = lon
                out_transient_location["address"] = addr
        else:
            lat = None
            lon = None
            addr = dist_to_geocode if dist_to_geocode else state_to_geocode

    trace_resolution(
        "specialist_tools_location",
        state=state_name,
        state_source="final_for_specialist_tools",
        district=district,
        district_source="final_for_specialist_tools",
        crop=crop,
        crop_source="final_for_specialist_tools",
        latitude=lat,
        longitude=lon,
        lat_long_source="nominatim_forward_geocode" if lat is not None else "unset",
        address=addr,
    )

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

    trace_resolution(
        "specialist_tool_args",
        specialist_calls=[{"name": c.get("name"), "args": c.get("args")} for c in calls],
        state=state_name,
        state_source=resolved.state_source,
        district=district,
        district_source=resolved.district_source,
        latitude=lat,
        longitude=lon,
        lat_long_source="nominatim_forward_geocode" if lat is not None else "unset",
    )

    return calls, resolved


async def build_reviewer_upload_with_tools_used(
    plan: PlannerPlan,
    user_query: str,
    location: Optional[Location],
    tools_used: list[str],
    *,
    question_source: str | None = None,
    thread_id: str | None = None,
    user_id: str | None = None,
    message_id: str | None = None,
    resolved: ResolvedToolEntities | None = None,
) -> list[dict[str, Any]]:
    """Build reviewer upload call with computed tools_used."""
    location_tool = await get_location_tool()
    reviewer_tool = await get_reviewer_tool()
    if not question_source:
        question_source = resolve_question_source(None)
    
    loc = location or {}
    if resolved is None:
        resolved = _resolve_reviewer_location(plan, loc, stage="reviewer_upload_with_tools_used")
    
    state_name = resolved.state
    district = resolved.district
    crop = resolved.crop
    domains = resolved.domains
    reviewer_question = (plan.get("rephrased_query") or "").strip() or user_query

    if not (question_source and str(question_source).strip()):
        return []

    reviewer_args: dict[str, Any] = {
        "question": reviewer_question,
        "state_name": state_name,
        "crop": crop,
        "details": {
            "state": state_name,
            "district": district,
            "crop": crop,
            "season": "General",
            "domain": domains,
            "tools_used": tools_used,
        },
        "source": str(question_source).strip(),
    }
    _apply_reviewer_identity_args(
        reviewer_args,
        question_source=question_source,
        thread_id=thread_id,
        user_id=user_id,
        message_id=message_id,
    )

    trace_resolution(
        "reviewer_upload_with_tools_used",
        state=state_name,
        state_source=resolved.state_source,
        district=district,
        district_source=resolved.district_source,
        crop=crop,
        crop_source=resolved.crop_source,
        domain=domains,
        domain_source=resolved.domain_source,
        tools_used=tools_used,
        question=reviewer_question[:200],
    )
    
    return [{
        "name": reviewer_tool.name,
        "args": reviewer_args,
        "id": _new_tool_call_id(),
        "type": "tool_call",
    }]


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

    trace_thread_location(
        "ensure_location_input",
        loc,
        plan_entities=entities,
        note="reverse-geocode from GPS disabled; forward-geocode only when plan.entities has state/district",
    )

    # Scenario 1 (disabled): do not reverse-geocode thread GPS.
    # if _needs_location_resolve(loc): ...

    # Forward-geocode plan.entities when state/district are known (never use thread GPS).
    state_resolved = entities.get("state")
    district_resolved = entities.get("district")

    if state_resolved and state_resolved.strip().lower() in {"all", "not specified", "unknown", "general", "none"}:
        state_resolved = None
    if district_resolved and district_resolved.strip().lower() in {"all", "not specified", "unknown", "general", "none"}:
        district_resolved = None

    if state_resolved or district_resolved:
        logger.info(
            "ensure_location_node: Geocoding home location for state=%s district=%s",
            state_resolved,
            district_resolved,
        )
        trace_resolution(
            "ensure_location_forward_geocode",
            state=state_resolved,
            state_source="plan.entities.state",
            district=district_resolved,
            district_source="plan.entities.district",
            latitude=None,
            longitude=None,
            lat_long_source="forward_geocode_pending (GPS not used)",
        )
        geocode_res = await forward_geocode(state_resolved, district_resolved)
        if geocode_res:
            # Merge geocode result; do not retain client GPS coords on thread location.
            base = {k: v for k, v in (loc or {}).items() if k not in ("latitude", "longitude")}
            merged_loc = merge_location_dict(base, geocode_res)
            trace_resolution(
                "ensure_location_forward_geocode_result",
                state=merged_loc.get("state"),
                state_source="nominatim_forward_geocode",
                district=merged_loc.get("city"),
                district_source="nominatim_forward_geocode",
                latitude=merged_loc.get("latitude"),
                longitude=merged_loc.get("longitude"),
                lat_long_source="nominatim_forward_geocode",
                address=merged_loc.get("address"),
            )
            return {"location": merged_loc}
        trace_resolution(
            "ensure_location_forward_geocode_result",
            state=state_resolved,
            state_source="geocode_failed",
            district=district_resolved,
            district_source="geocode_failed",
        )
        return {}

    trace_resolution(
        "ensure_location_skip",
        note="no forward-geocode — plan.entities missing state and district",
    )
    return {}


async def upload_reviewer_only_node(
    state: AjraSakhaState,
    config: RunnableConfig,
) -> dict:
    """Non-ag path: reviewer upload only; ignore answer_text (empty_gdb follows)."""
    plan = state.get("plan")
    if not plan or not plan.get("is_complete", True):
        return {}
    if plan.get("is_agriculture_related") is not False:
        logger.warning("upload_reviewer_only_node called but is_agriculture_related is not false")
        return {}

    messages = state.get("messages") or []
    user_query = _last_human_text(messages)
    loc = state.get("location")

    location_tool = await get_location_tool()
    reviewer_tool = await get_reviewer_tool()
    question_source = resolve_question_source(config)
    thread_id = resolve_thread_id(config)
    user_id = resolve_user_id(config)
    message_id = resolve_message_id(config)
    tool_calls = build_reviewer_upload_calls(
        plan,
        user_query,
        loc,
        location_tool_name=location_tool.name,
        reviewer_tool_name=reviewer_tool.name,
        question_source=question_source,
        thread_id=thread_id,
        user_id=user_id,
        message_id=message_id,
    )
    if not tool_calls:
        return {}

    tool_node = await get_main_tool_node()
    ai_msg = AIMessage(content="", tool_calls=tool_calls)
    exec_state = {**state, "messages": list(messages) + [ai_msg]}
    merged_configurable = dict((config.get("configurable") or {}))
    merged_configurable["location"] = _plan_only_location(plan)
    enriched = patch_config(config, configurable=merged_configurable)

    result = await tool_node.ainvoke(exec_state, config=enriched)
    new_msgs = result.get("messages") or []
    merged_loc = result.get("location") or loc

    logger.info(
        "upload_reviewer_only: uploaded non-ag query (reviewer cache ignored)"
    )
    return {"messages": [ai_msg] + new_msgs, "location": merged_loc}


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

    trace_thread_location(
        "execute_plan_input",
        loc,
        plan_entities=plan.get("entities") or {},
        is_greeting=plan.get("is_greeting"),
        plan_reasoning=plan.get("reasoning"),
    )

    location_tool = await get_location_tool()
    reviewer_tool = await get_reviewer_tool()
    question_source = resolve_question_source(config)
    thread_id = resolve_thread_id(config)
    user_id = resolve_user_id(config)
    message_id = resolve_message_id(config)
    
    # Step 1: Build and execute SPECIALIST tools ONLY (no reviewer upload)
    # This allows us to compute actual tools_used after seeing responses
    transient_loc: dict[str, Any] = {}
    specialist_calls, resolved = await build_specialist_tool_calls_from_plan(
        plan,
        user_query,
        loc,
        out_transient_location=transient_loc,
    )
    
    if not specialist_calls:
        # No specialist tools needed, but still upload to reviewer with empty tools_used
        reviewer_calls = await build_reviewer_upload_with_tools_used(
            plan,
            user_query,
            loc,
            tools_used=[],
            question_source=question_source,
            thread_id=thread_id,
            user_id=user_id,
            message_id=message_id,
            resolved=resolved,
        )
        if reviewer_calls:
            tool_node = await get_main_tool_node()
            ai_msg = AIMessage(content="", tool_calls=reviewer_calls)
            exec_state = {**state, "messages": list(messages) + [ai_msg]}
            merged_configurable = dict((config.get("configurable") or {}))
            merged_configurable["location"] = _plan_only_location(plan)
            enriched = patch_config(config, configurable=merged_configurable)
            result = await tool_node.ainvoke(exec_state, config=enriched)
            return {"messages": [ai_msg] + (result.get("messages") or []), "location": result.get("location") or loc}
        return {}

    trace_event(
        "execute_plan_specialist_calls",
        tools=[{"name": tc.get("name"), "args": tc.get("args")} for tc in specialist_calls],
    )

    tool_node = await get_main_tool_node()
    ai_msg = AIMessage(content="", tool_calls=specialist_calls)
    exec_state = {**state, "messages": list(messages) + [ai_msg]}

    merged_configurable = dict((config.get("configurable") or {}))
    merged_configurable["location"] = (
        transient_loc if transient_loc else _plan_only_location(plan)
    )
    enriched = patch_config(config, configurable=merged_configurable)

    result = await tool_node.ainvoke(exec_state, config=enriched)
    specialist_results = result.get("messages") or []
    merged_loc = result.get("location") or loc

    # Step 2: Compute ACTUAL tools_used based on which tools returned useful data
    all_messages = list(messages) + [ai_msg] + specialist_results
    actual_tools_used = compute_actual_tools_used(all_messages)
    
    logger.info("execute_plan_node: computed actual tools_used=%s", actual_tools_used)

    # Step 3: Upload to reviewer with actual tools_used
    reviewer_calls = await build_reviewer_upload_with_tools_used(
        plan,
        user_query,
        merged_loc,
        tools_used=actual_tools_used,
        question_source=question_source,
        thread_id=thread_id,
        user_id=user_id,
        message_id=message_id,
        resolved=resolved,
    )
    
    if reviewer_calls:
        ai_reviewer = AIMessage(content="", tool_calls=reviewer_calls)
        exec_state2 = {**state, "messages": list(all_messages) + [ai_reviewer]}
        enriched2 = patch_config(config, configurable=merged_configurable)
        result2 = await tool_node.ainvoke(exec_state2, config=enriched2)
        reviewer_results = result2.get("messages") or []
        merged_loc = result2.get("location") or merged_loc
        
        # Check for direct answer from reviewer
        direct = reviewer_direct_answer(reviewer_results)
        if direct and text_matches_user_language(direct, user_query):
            logger.info("Reviewer returned direct answer_text — reviewer direct → translate")
            return {
                "messages": [AIMessage(content=direct)],
                "location": merged_loc,
                "plan": {**plan, "skip_synthesize": True},
            }
        if direct:
            logger.info("Reviewer answer language does not match farmer message — assemble/translate path")
        
        # Combine all messages
        new_msgs = specialist_results + [ai_reviewer] + reviewer_results
    else:
        new_msgs = specialist_results

    # Check for chemical checker follow-up
    extra_chems = extract_chemicals_from_tool_messages(specialist_results)
    if (
        ENABLE_CHEMICAL_CHECKER
        and extra_chems
        and plan.get("knowledge_base")
        and not plan.get("chemical_checker")
    ):
        transient_loc2: dict[str, Any] = {}
        second_calls, _ = await build_specialist_tool_calls_from_plan(
            {**plan, "chemical_checker": True},
            user_query,
            merged_loc,
            extra_chemicals=extra_chems,
            out_transient_location=transient_loc2,
        )
        chem_only = [c for c in second_calls if c.get("name") == "chemical_checker"]
        if chem_only:
            ai2 = AIMessage(content="", tool_calls=chem_only)
            exec2 = {**state, "messages": list(messages) + [ai_msg] + specialist_results + [ai_reviewer if reviewer_calls else None] + [ai2]}
            exec2["messages"] = [m for m in exec2["messages"] if m is not None]
            loc_for_enriched2 = (
                transient_loc2 if transient_loc2 else _plan_only_location(plan)
            )
            enriched2 = patch_config(enriched, configurable={**merged_configurable, "location": loc_for_enriched2})
            result2 = await tool_node.ainvoke(exec2, config=enriched2)
            new_msgs = (result2.get("messages") or [])[-len(chem_only):]
            merged_loc = result2.get("location") or merged_loc
            out = {
                "messages": [ai_msg] + specialist_results + [ai_reviewer if reviewer_calls else None] + [ai2] + new_msgs,
                "location": merged_loc,
            }
            out["messages"] = [m for m in out["messages"] if m is not None]
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
    plan = state.get("plan") or {}
    if plan.get("is_greeting") or plan.get("reasoning") == "greeting":
        return False
        
    messages = state.get("messages") or []
    has_specialist_content = _turn_has_specialist_tool_message(messages)
    return not _gdb_has_usable_data(messages) and not has_specialist_content


def route_after_execute(state: AjraSakhaState) -> str:
    plan = state.get("plan") or {}
    if plan.get("skip_synthesize"):
        return "translate_answer"
    if plan.get("is_greeting") or plan.get("reasoning") == "greeting":
        return "assemble_answer_body"
    messages = state.get("messages") or []
    if _gdb_has_usable_data(messages) and _turn_has_specialist_tool_message(messages):
        return "empty_gdb_reply"
    if should_expert_queue_reply(state):
        return "empty_gdb_reply"
    if _gdb_has_usable_data(messages) or _turn_has_specialist_tool_message(messages):
        return "assemble_answer_body"
    return "empty_gdb_reply"

