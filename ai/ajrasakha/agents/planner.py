"""Planner orchestrator node — structured routing without answering the farmer.

Flow:
  1. Take input query
  2. LLM picks domain from domains.py ALLOWED_DOMAINS (latest message)
  3. Derive tool flags from domain; resolve state (latest + GPS)
  4. CROP_ALL_DOMAINS -> crop=all; CROP_REQUIRED -> extract + LLM classifier
  5. Completeness check -> clarify or execute
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Optional

from anthropic import APITimeoutError, APIConnectionError, APIStatusError
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field

from ajrasakha.agents.config import PLANNER_MODEL
from ajrasakha.agents.crop_requirement import is_crop_specific_question
from ajrasakha.agents.domains import (
    CROP_ALL_DOMAINS,
    CROP_REQUIRED_DOMAINS,
    domain_requires_crop,
    apply_tool_flags_from_domains,
    crop_counts_as_resolved,
    is_crop_placeholder,
    normalize_domain,
)
from ajrasakha.agents.language import resolve_planner_language_pair
from ajrasakha.agents.translation_catalog import (
    OFFICIAL_LANGUAGES,
    get_crop_follow_up,
    get_state_follow_up,
    language_pair_from_plan,
)
from ajrasakha.agents.location_context import (
    extract_state_from_text,
    gps_state_from_location,
    latest_human_text,
    main_agent_location_context_message,
)
from ajrasakha.agents.plan_executor import ENABLE_CHEMICAL_CHECKER
from ajrasakha.agents.planner_rules import (
    apply_planner_completeness_rules,
    format_conversation_for_planner,
    merge_entities_from_rephrased_query,
    resolve_crop_for_turn,
)
from ajrasakha.agents.prompts import PLANNER_SYSTEM_PROMPT
from ajrasakha.agents.state import AjraSakhaState, PlannerEntities, PlannerPlan

logger = logging.getLogger(__name__)

_GREETING_RE = re.compile(
    r"^(hi|hello|hey|namaste|namaskar|thanks|thank you|bye|good\s*(morning|evening|night)|"
    r"how are you|kaise ho|kya haal)[\s!.?]*$",
    re.IGNORECASE,
)


class PlannerEntitiesOutput(BaseModel):
    crop: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    chemicals: list[str] = Field(default_factory=list)


class PlannerOutput(BaseModel):
    domains: list[str] = Field(
        default_factory=lambda: ["General"],
        description=(
            "1-3 values from ALLOWED_DOMAINS in ajrasakha.agents.domains "
            "(most relevant first)."
        ),
        min_length=1,
        max_length=3,
    )
    weather: bool = False
    mandi: bool = False
    soil: bool = False
    schemes: bool = False
    chemical_checker: bool = False
    knowledge_base: bool = False
    is_complete: bool = True
    missing_info: list[str] = Field(default_factory=list)
    follow_up_question: Optional[str] = None
    reasoning: Optional[str] = None
    entities: PlannerEntitiesOutput = Field(default_factory=PlannerEntitiesOutput)
    original_query_en: Optional[str] = Field(
        None,
        description=(
            "Literal English translation of the farmer's latest message. If already English, copy verbatim. "
            "Never substitute crop/disease/pest/place names (e.g. keep 'bauna disease', not 'blast disease'). "
            "Transliterate unknown local terms; do not guess standard names."
        ),
    )
    rephrased_query: Optional[str] = Field(
        None,
        description=(
            "Same meaning as original_query_en with ONLY spelling, grammar, or word-order fixes. "
            "Do NOT add facts, swap agricultural terms, or 'improve' disease/pest/crop names. "
            "No search extensions or paraphrase."
        ),
    )
    vocal_language: str = Field(
        default="English",
        description=f"Spoken language the farmer uses. One of: {', '.join(OFFICIAL_LANGUAGES)}",
    )
    script_language: str = Field(
        default="English",
        description=(
            "Writing system / alphabet of the farmer's message. One of OFFICIAL_LANGUAGES. "
            "Latin/Roman letters for any Indian language → English (e.g. Romanized Telugu "
            "'Barli pantalo aafids ni ela...' → script_language=English, vocal_language=Telugu). "
            "Native Unicode script → same language name as vocal (e.g. both Telugu for Telugu script)."
        ),
    )


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


def _last_human_message(messages: list[BaseMessage]) -> HumanMessage | None:
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            return msg
    return None


def is_greeting_message(text: str) -> bool:
    t = (text or "").strip()
    if not t or len(t) > 80:
        return False
    return bool(_GREETING_RE.match(t))


def planner_output_to_plan(output: PlannerOutput) -> PlannerPlan:
    entities: PlannerEntities = {}
    if output.entities.crop:
        entities["crop"] = output.entities.crop
    if output.entities.state:
        entities["state"] = output.entities.state
    if output.entities.district:
        entities["district"] = output.entities.district
    if output.entities.chemicals:
        entities["chemicals"] = list(output.entities.chemicals)

    raw_domains = list(output.domains or []) or ["General"]
    normalized_domains: list[str] = []
    seen: set[str] = set()
    for d in raw_domains:
        nd = normalize_domain(d)
        if nd in seen:
            continue
        seen.add(nd)
        normalized_domains.append(nd)
        if len(normalized_domains) >= 3:
            break
    if not normalized_domains:
        normalized_domains = ["General"]

    return {
        "domain": normalized_domains[0],  # Backward-compatible single-domain view
        "domains": normalized_domains,
        "weather": output.weather,
        "mandi": output.mandi,
        "soil": output.soil,
        "schemes": output.schemes,
        "chemical_checker": output.chemical_checker,
        "knowledge_base": output.knowledge_base,
        "is_complete": output.is_complete,
        "missing_info": list(output.missing_info),
        "follow_up_question": output.follow_up_question,
        "reasoning": output.reasoning,
        "entities": entities,
        "skip_synthesize": False,
        "rephrased_query": output.rephrased_query,
        "original_query_en": output.original_query_en,
        "vocal_language": output.vocal_language,
        "script_language": output.script_language,
        "translate_path": None,
        "expert_queue": False,
    }


def _default_plan_for_agriculture(user_query: Optional[str] = None) -> PlannerPlan:
    return {
        "domain": "General",
        "domains": ["General"],
        "weather": False,
        "mandi": False,
        "soil": False,
        "schemes": False,
        "chemical_checker": False,
        "knowledge_base": True,
        "is_complete": True,
        "missing_info": [],
        "follow_up_question": None,
        "reasoning": "fallback_default",
        "entities": {},
        "skip_synthesize": False,
        "rephrased_query": user_query,
        "original_query_en": user_query,
        "vocal_language": "English",
        "script_language": "English",
        "translate_path": None,
        "expert_queue": False,
    }


def _extract_state_from_history(
    messages: list[BaseMessage],
    max_turns: int = 4,
) -> Optional[str]:
    """Extract state from last N human messages (most recent first).

    Returns state from the FIRST mention found
    when walking backwards from the most recent message.
    """
    human_messages = [msg for msg in messages if isinstance(msg, HumanMessage)]
    recent = human_messages[-max_turns:] if len(human_messages) > max_turns else human_messages
    for msg in reversed(recent):
        text = _message_to_text(msg)
        state = extract_state_from_text(text)
        if state:
            return state
    return None


def _resolve_state_deterministic(
    messages: list[BaseMessage],
    location: Optional[dict],
    prev_entities: Optional[PlannerEntities] = None,
) -> Optional[str]:
    """Deterministically resolve state: prev_entities (previous turns), then latest text, then history, then GPS."""
    # Priority 0: State from previous planner turns (carry-over from clarification)
    if prev_entities and prev_entities.get("state"):
        return prev_entities.get("state")
    # Priority 1: Latest message only
    state_from_latest = extract_state_from_text(latest_human_text(messages))
    if state_from_latest:
        return state_from_latest
    # Priority 2: Conversation history (last 4 human turns)
    state_from_history = _extract_state_from_history(messages, max_turns=4)
    if state_from_history:
        return state_from_history
    # Priority 3: GPS thread location
    return gps_state_from_location(location)


async def _apply_domain_and_crop_async(
    plan: PlannerPlan,
    messages: list[BaseMessage],
    *,
    crop_prefilled: Optional[str],
    config: RunnableConfig,
) -> tuple[PlannerPlan, str, bool]:
    """Normalize domains, derive flags, apply CROP_ALL / CROP_REQUIRED crop rules."""
    domains_raw = plan.get("domains") or [plan.get("domain") or "General"]
    domains: list[str] = []
    seen: set[str] = set()
    for d in domains_raw:
        nd = normalize_domain(d)
        if nd in seen:
            continue
        seen.add(nd)
        domains.append(nd)
        if len(domains) >= 3:
            break
    if not domains:
        domains = ["General"]

    plan["domains"] = domains
    plan["domain"] = domains[0]

    plan.update(apply_tool_flags_from_domains(domains))
    if ENABLE_CHEMICAL_CHECKER and plan.get("chemical_checker", False):
        plan["chemical_checker"] = True
    else:
        plan["chemical_checker"] = False

    entities: PlannerEntities = dict(plan.get("entities") or {})
    user_text = latest_human_text(messages)
    question = plan.get("rephrased_query") or user_text
    original = plan.get("original_query_en") or user_text

    crop_required = False
    crop_required_any = any(domain_requires_crop(d) for d in domains)

    # Always-ask safety rule: if ANY selected domain requires a crop and crop is missing,
    # we must ask for crop (no classifier-based skipping).
    if crop_required_any:
        crop = crop_prefilled or resolve_crop_for_turn(messages) or entities.get("crop")
        if crop and crop_counts_as_resolved(crop) and not is_crop_placeholder(crop):
            entities["crop"] = (
                "all" if crop.lower() == "all"
                else crop[0].upper() + crop[1:].lower()
            )
            crop_required = False
        else:
            crop_required = True
    elif domains[0] in CROP_ALL_DOMAINS:
        entities["crop"] = "all"
        crop_required = False
    else:
        entities["crop"] = "all"
        crop_required = False

    plan["entities"] = entities
    return plan, domains[0], crop_required


def _check_question_completeness(
    state_resolved: Optional[str],
    crop_resolved: Optional[str],
    crop_required: bool,
    has_gps: bool,
    plan: PlannerPlan,
) -> tuple[bool, list[str], Optional[str]]:
    """Deterministic completeness check following the specified flow."""
    script, vocal = language_pair_from_plan(plan)
    missing: list[str] = []
    follow_up: Optional[str] = None

    has_state = bool(state_resolved) or has_gps
    if not has_state:
        missing.append("location")
        follow_up = get_state_follow_up(script, vocal)
        return False, missing, follow_up

    if crop_required and (
        not crop_counts_as_resolved(crop_resolved) or is_crop_placeholder(crop_resolved)
    ):
        missing.append("crop")
        follow_up = get_crop_follow_up(script, vocal)
        return False, missing, follow_up

    return True, [], None


async def planner_node(
    state: AjraSakhaState,
    config: RunnableConfig,
) -> dict:
    messages = state.get("messages") or []
    human = _last_human_message(messages)
    if human is None:
        return {"plan": _default_plan_for_agriculture(None)}

    user_text = _message_to_text(human)
    if is_greeting_message(user_text):
        plan: PlannerPlan = {
            "domain": "General",
            "weather": False,
            "mandi": False,
            "soil": False,
            "schemes": False,
            "chemical_checker": False,
            "knowledge_base": False,
            "is_complete": True,
            "missing_info": [],
            "follow_up_question": None,
            "reasoning": "greeting",
            "entities": {"crop": "all"},
            "skip_synthesize": False,
            "rephrased_query": user_text,
            "original_query_en": user_text,
            "vocal_language": "English",
            "script_language": "English",
            "translate_path": None,
            "expert_queue": False,
        }
        return {"plan": plan}

    location = state.get("location")
    # Extract previous entities BEFORE LLM call so state can be carried forward
    prev_entities: PlannerEntities = dict(state.get("plan", {}).get("entities") or {})

    state_resolved = _resolve_state_deterministic(messages, location, prev_entities)
    crop_resolved = resolve_crop_for_turn(messages)

    has_gps = bool(
        location
        and location.get("latitude") is not None
        and location.get("longitude") is not None
    )

    llm_messages: list[BaseMessage] = [SystemMessage(content=PLANNER_SYSTEM_PROMPT)]
    loc_ctx = main_agent_location_context_message(location)
    if loc_ctx:
        llm_messages.append(loc_ctx)
    conv_block = format_conversation_for_planner(messages) or user_text

    deterministic_context = (
        f"PRE-EXTRACTED HINTS from latest raw message (server will re-merge from rephrased_query):\n"
        f"- state hint: {state_resolved or 'NOT RESOLVED'}\n"
        f"- crop hint: {crop_resolved or 'NOT RESOLVED'}\n"
        f"- has_gps: {has_gps}\n"
    )
    llm_messages.append(
        HumanMessage(
            content=(
                f"{deterministic_context}\n"
                f"Latest farmer message:\n{conv_block}\n\n"
                f"Pick `domain` from the allowed list using this latest message only.\n"
                "Set `vocal_language` and `script_language` from the official language list.\n"
                "Leave `follow_up_question` empty when location/crop is missing — server uses the sheet.\n"
                "Return the routing plan only."
            )
        )
    )

    try:
        llm = ChatAnthropic(model=PLANNER_MODEL).with_structured_output(PlannerOutput)
        output = await llm.ainvoke(llm_messages, config=config)
        plan = planner_output_to_plan(output)

        prev_vocal = plan.get("vocal_language")
        prev_script = plan.get("script_language")
        vocal, script = resolve_planner_language_pair(
            user_text, prev_vocal or "English", prev_script or "English"
        )
        if vocal != prev_vocal or script != prev_script:
            logger.info(
                "Planner language normalized from raw message: (%s, %s) -> (%s, %s)",
                prev_vocal,
                prev_script,
                vocal,
                script,
            )
        plan["vocal_language"] = vocal
        plan["script_language"] = script

        if not plan.get("rephrased_query"):
            plan["rephrased_query"] = user_text
        if not plan.get("original_query_en"):
            plan["original_query_en"] = user_text

        entities = merge_entities_from_rephrased_query(plan, messages, location, prev_entities)
        plan["entities"] = entities

        plan, domain, crop_required = await _apply_domain_and_crop_async(
            plan,
            messages,
            crop_prefilled=entities.get("crop"),
            config=config,
        )

        entities = plan.get("entities") or {}
        effective_crop = entities.get("crop")
        final_state = entities.get("state")
        is_complete, missing, follow_up = _check_question_completeness(
            state_resolved=final_state,
            crop_resolved=effective_crop,
            crop_required=crop_required,
            has_gps=has_gps,
            plan=plan,
        )

        plan["is_complete"] = is_complete
        plan["missing_info"] = missing
        plan["follow_up_question"] = follow_up

        plan = apply_planner_completeness_rules(plan, messages, location, prev_entities)

        plan["knowledge_base"] = True
        plan["soil"] = False

        logger.info(
            "Planner: complete=%s domain=%s crop_required=%s "
            "state=%s crop=%s vocal=%s script=%s "
            "flags=(w=%s m=%s s=%s sch=%s chem=%s kb=%s) "
            "rephrased=%s missing=%s",
            plan.get("is_complete"),
            plan.get("domain"),
            crop_required,
            entities.get("state"),
            entities.get("crop"),
            plan.get("vocal_language"),
            plan.get("script_language"),
            plan.get("weather"),
            plan.get("mandi"),
            plan.get("soil"),
            plan.get("schemes"),
            plan.get("chemical_checker"),
            plan.get("knowledge_base"),
            plan.get("rephrased_query"),
            plan.get("missing_info"),
        )
        return {"plan": plan}
    except (asyncio.CancelledError, TimeoutError, APITimeoutError, APIConnectionError) as exc:
        logger.warning("Planner failed (%s: %s) — using default knowledge_base plan", type(exc).__name__, exc)
        return {"plan": _default_plan_for_agriculture(user_text)}
    except APIStatusError as exc:
        if exc.status_code >= 500:
            logger.warning("Planner server error %s — using default plan", exc.status_code)
            return {"plan": _default_plan_for_agriculture(user_text)}
        raise


def clarify_node(state: AjraSakhaState) -> dict:
    plan = state.get("plan") or {}
    question = (plan.get("follow_up_question") or "").strip()
    missing = plan.get("missing_info") or []
    script, vocal = language_pair_from_plan(plan)
    if not question:
        if "location" in missing:
            question = get_state_follow_up(script, vocal)
        elif "crop" in missing:
            question = get_crop_follow_up(script, vocal)
        else:
            question = get_state_follow_up(script, vocal)
    return {"messages": [AIMessage(content=question)]}


def route_after_planner(state: AjraSakhaState) -> str:
    plan = state.get("plan") or {}
    if not plan.get("is_complete", True):
        return "clarify"
    return "ensure_location"
