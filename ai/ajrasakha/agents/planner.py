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
from langchain_core.runnables import RunnableConfig, patch_config
from pydantic import BaseModel, Field

from ajrasakha.agents.config import PLANNER_MODEL
from ajrasakha.agents.thread_logging import (
    begin_conversation_turn,
    end_conversation_turn,
)
from ajrasakha.agents.crop_chemical_resolver import format_planner_crop_hints
from ajrasakha.agents.thread_trace import trace_event
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
from ajrasakha.agents.language import _llm_detect_language, detect_script_language, resolve_planner_language_pair
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
)
from ajrasakha.agents.plan_executor import ENABLE_CHEMICAL_CHECKER
from ajrasakha.agents.llm_trace import trace_llm_request, trace_llm_response
from ajrasakha.agents.resolution_trace import trace_resolution, trace_thread_location
from ajrasakha.agents.planner_rules import (
    apply_crop_one_shot_fallback,
    apply_non_agriculture_gate,
    apply_planner_completeness_rules,
    crop_slot_satisfied,
    format_conversation_for_planner,
    format_last_queries_for_rephrasing,
    format_prev_plan_context,
    merge_entities_from_rephrased_query,
    resolve_crop_for_turn,
    was_crop_clarify_asked,
)
from ajrasakha.agents.prompts import PLANNER_SYSTEM_PROMPT
from ajrasakha.agents.state import AjraSakhaState, PlannerEntities, PlannerPlan

logger = logging.getLogger(__name__)

_GREETING_RE = re.compile(
    r"^(hi|hello|hey|namaste|namaskar|namaskaram|vanakkam|pranam|ram\s*ram|radhe\s*radhe|sat\s*sri\s*akal|sasriakal|kem\s*cho|khamma\s*ghani|jai\s*hind|jai\s*shri\s*ram|thanks|thank you|bye|good\s*(morning|evening|night)|"
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
    is_greeting: bool = Field(
        default=False,
        description="True if the farmer's message is ONLY a greeting, salutation, or courtesy (like hi, hello, namaste, ram ram, sat sri akal, thanks, bye). False if there is any agricultural query or farming context."
    )
    weather: bool = False
    mandi: bool = False
    soil: bool = False
    schemes: bool = False
    chemical_checker: bool = False
    knowledge_base: bool = False
    is_agriculture_related: bool = Field(
        default=True,
        description=(
            "False when the farmer's primary intent is NOT agriculture/farming "
            "(e.g. making money, buying a bike, personal finance). "
            "False even if weather or schemes are mentioned in passing alongside off-topic goals. "
            "True for weather, mandi, crop/pest/fertilizer, soil, and farming government schemes."
        ),
    )
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


def _compute_tools_used_from_output(output: PlannerOutput) -> list[str]:
    """Compute tools_used list from PlannerOutput flags."""
    if output.is_agriculture_related is False:
        return []
    
    tools: list[str] = []
    if output.knowledge_base:
        tools.append("knowledge_base")
    if output.weather:
        tools.append("weather")
    if output.mandi:
        tools.append("mandi")
    if output.soil:
        tools.append("soil")
    if output.schemes:
        tools.append("schemes")
    if output.chemical_checker:
        tools.append("chemical_checker")
    
    return tools


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
        "is_agriculture_related": output.is_agriculture_related,
        "is_greeting": output.is_greeting,
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
        "tools_used": _compute_tools_used_from_output(output),
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
        "is_agriculture_related": True,
        "is_greeting": False,
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
        "tools_used": ["knowledge_base"],
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


def _planner_invoke_config(config: RunnableConfig) -> RunnableConfig:
    """Strip thread location from config so the planner LLM never sees coordinates."""
    configurable = dict((config.get("configurable") or {}))
    configurable.pop("location", None)
    return patch_config(config, configurable=configurable)


def _resolve_state_deterministic(
    messages: list[BaseMessage],
    location: Optional[dict],
    prev_entities: Optional[PlannerEntities] = None,
) -> Optional[str]:
    """Deterministically resolve state from latest text or previous turn (do NOT fallback to GPS here)."""
    # Priority 0: State from latest message text (explicit mention in current query)
    latest_text = latest_human_text(messages)
    state_from_latest = extract_state_from_text(latest_text)
    if state_from_latest:
        trace_resolution(
            "planner_state_hint",
            state=state_from_latest,
            state_source="latest_message_text (regex)",
            text_preview=latest_text[:120] if latest_text else None,
        )
        return state_from_latest
    # Priority 1: State from previous turn (thread carry-over - always check this)
    if prev_entities and prev_entities.get("state"):
        state = prev_entities.get("state")
        trace_resolution(
            "planner_state_hint",
            state=state,
            state_source="prev_entities (thread_carryover)",
        )
        return state
    trace_resolution(
        "planner_state_hint",
        state=None,
        state_source="unresolved (no_current_text_no_prev_entities; GPS not used here)",
    )
    return None


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

    entities = apply_crop_one_shot_fallback(messages, entities, domains)

    crop_required = False
    crop_required_any = any(domain_requires_crop(d) for d in domains)

    # Crop-required domains: ask once, then fall back to crop=all if still unresolved.
    if crop_required_any:
        crop = crop_prefilled or resolve_crop_for_turn(messages) or entities.get("crop")
        if crop_slot_satisfied(crop):
            if crop and str(crop).strip().lower() == "all":
                entities["crop"] = "all"
            elif crop and not is_crop_placeholder(crop):
                entities["crop"] = crop[0].upper() + crop[1:].lower()
            crop_required = False
        elif not was_crop_clarify_asked(messages):
            crop_required = True
        else:
            entities["crop"] = "all"
            crop_required = False
    elif domains[0] in CROP_ALL_DOMAINS:
        entities["crop"] = "all"
        crop_required = False
    else:
        entities["crop"] = "all"
        crop_required = False

    plan["entities"] = entities
    crop_source = "domain_crop_all" if domains[0] in CROP_ALL_DOMAINS else (
        "crop_required_resolved" if not crop_required else "crop_required_pending"
    )
    if entities.get("crop") == "all" and crop_required is False:
        crop_source = (
            "domain_crop_all"
            if domains[0] in CROP_ALL_DOMAINS
            else "one_shot_fallback_or_default_all"
        )
    trace_resolution(
        "planner_domain_crop",
        domain=domains[0],
        domain_source="plan.domains[0] (normalized)",
        crop=entities.get("crop"),
        crop_source=crop_source,
        crop_required=crop_required,
        domains=domains,
    )
    return plan, domains[0], crop_required


def _check_question_completeness(
    state_resolved: Optional[str],
    crop_resolved: Optional[str],
    crop_required: bool,
    plan: PlannerPlan,
) -> tuple[bool, list[str], Optional[str]]:
    """Deterministic completeness check — state from text/entities only, not device GPS."""
    script, vocal = language_pair_from_plan(plan)
    missing: list[str] = []
    follow_up: Optional[str] = None
    has_state = bool(state_resolved)
    if not has_state:
        missing.append("location")
        follow_up = get_state_follow_up(script, vocal)
        trace_resolution(
            "planner_completeness",
            state=None,
            state_source="missing — will clarify",
            crop=crop_resolved,
            crop_source="entities" if crop_resolved else "unset",
            is_complete=False,
        )
        return False, missing, follow_up

    if crop_required and not crop_slot_satisfied(crop_resolved):
        missing.append("crop")
        follow_up = get_crop_follow_up(script, vocal)
        trace_resolution(
            "planner_completeness",
            state=state_resolved,
            state_source="entities",
            crop=crop_resolved,
            crop_source="missing — will clarify",
            is_complete=False,
        )
        return False, missing, follow_up

    trace_resolution(
        "planner_completeness",
        state=state_resolved,
        state_source="entities",
        crop=crop_resolved,
        crop_source="entities" if crop_resolved else "unset",
        is_complete=True,
    )
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
    begin_conversation_turn(user_text)

    if is_greeting_message(user_text):
        prev_plan = state.get("plan") or {}
        prev_entities: PlannerEntities = dict(prev_plan.get("entities") or {})
        greeting_entities: PlannerEntities = {"crop": "all"}
        for key in ("state", "district"):
            if prev_entities.get(key):
                greeting_entities[key] = prev_entities[key]

        plan: PlannerPlan = {
            "domain": "General",
            "weather": False,
            "mandi": False,
            "soil": False,
            "schemes": False,
            "chemical_checker": False,
            "knowledge_base": False,
            "is_agriculture_related": False,
            "is_greeting": True,
            "is_complete": True,
            "missing_info": [],
            "follow_up_question": None,
            "reasoning": "greeting",
            "entities": greeting_entities,
            "skip_synthesize": False,
            "rephrased_query": user_text,
            "original_query_en": user_text,
            "vocal_language": "English",
            "script_language": "English",
            "translate_path": None,
            "expert_queue": False,
            "tools_used": [],
        }
        trace_thread_location(
            "planner_greeting_input",
            state.get("location"),
            plan_entities=plan.get("entities"),
            note="greeting short-circuit — thread GPS ignored for upload/tools",
        )
        trace_resolution(
            "planner_greeting",
            crop="all",
            crop_source="greeting_short_circuit",
            state=None,
            state_source="not_resolved (greeting skips entity merge; GPS not used)",
            district=None,
            district_source="not_resolved (greeting skips entity merge; GPS not used)",
            domain="General",
            domain_source="greeting_short_circuit",
        )
        return {"plan": plan}

    location = state.get("location")
    # Extract previous entities BEFORE LLM call so state can be carried forward
    prev_plan = state.get("plan") or {}
    # Always carry forward entities from previous turn for thread-level state persistence
    prev_entities: PlannerEntities = {}
    if prev_plan:
        prev_entities = dict(prev_plan.get("entities") or {})

    trace_thread_location(
        "planner_input",
        location,
        plan_entities=prev_entities or None,
        prev_plan_reasoning=prev_plan.get("reasoning"),
        prev_plan_complete=prev_plan.get("is_complete"),
    )

    state_resolved = _resolve_state_deterministic(messages, location, prev_entities)
    crop_resolved = resolve_crop_for_turn(messages)

    llm_messages: list[BaseMessage] = [SystemMessage(content=PLANNER_SYSTEM_PROMPT)]
    conv_block = format_conversation_for_planner(messages) or user_text
    rephrasing_context = format_last_queries_for_rephrasing(messages)

    crop_hints = format_planner_crop_hints(user_text)
    prev_plan_context = format_prev_plan_context(prev_plan)
    trace_event(
        "crop_fuzzy_hints",
        user_text=user_text,
        hints=crop_hints or "(no fuzzy crop alias matches above 80%)",
    )
    deterministic_context = (
        f"PRE-EXTRACTED HINTS from latest raw message (server will re-merge from rephrased_query):\n"
        f"- state hint: {state_resolved or 'NOT RESOLVED'}\n"
        f"- crop hint: {crop_resolved or 'NOT RESOLVED'}\n"
    )
    if prev_plan_context:
        deterministic_context = f"{deterministic_context}\n{prev_plan_context}"
    if crop_hints:
        deterministic_context = f"{deterministic_context}\n{crop_hints}\n"
    human_content = (
        f"{deterministic_context}\n"
        f"Current farmer message (route using this):\n{user_text}\n\n"
        f"Recent farmer messages in thread:\n{conv_block}\n\n"
        f"--- LAST 5 QUERIES FOR REPHRASING (use ONLY for original_query_en and rephrased_query) ---\n"
        f"{rephrasing_context}\n"
        f"--- END REPHRASING CONTEXT ---\n\n"
        f"Pick `domain` from the allowed list using the current farmer message only.\n"
        "Set `vocal_language` and `script_language` from the official language list.\n"
        "Leave `follow_up_question` empty when location/crop is missing — server uses the sheet.\n"
        "Return the routing plan only."
    )
    llm_messages.append(HumanMessage(content=human_content))
    trace_llm_request(
        "planner",
        model=PLANNER_MODEL,
        messages=llm_messages,
        state_hint=state_resolved,
        crop_hint=crop_resolved,
        prev_plan_context=prev_plan_context or None,
    )

    try:
        llm = ChatAnthropic(model=PLANNER_MODEL).with_structured_output(PlannerOutput)
        output = await llm.ainvoke(llm_messages, config=_planner_invoke_config(config))
        trace_llm_response(
            "planner",
            output=output,
            reasoning=output.reasoning,
            domains=output.domains,
            is_agriculture_related=output.is_agriculture_related,
            is_greeting=output.is_greeting,
            is_complete=output.is_complete,
            missing_info=output.missing_info,
            vocal_language=output.vocal_language,
            script_language=output.script_language,
        )
        plan = planner_output_to_plan(output)

        # Use LLM-based language detection for vocal_language to avoid incorrect inference from state/crop names
        detected_vocal = _llm_detect_language(user_text)
        vocal = _coerce_official_language(detected_vocal) or "English"
        
        # Use Unicode-based script detection for script_language
        detected_script = detect_script_language(user_text)
        
        if vocal != plan.get("vocal_language"):
            logger.info(
                "Planner vocal_language corrected via LLM detection: prev_vocal=%s -> detected_vocal=%s",
                plan.get("vocal_language"),
                vocal,
            )
        plan["vocal_language"] = vocal
        plan["script_language"] = detected_script

        if not plan.get("rephrased_query"):
            plan["rephrased_query"] = user_text
        if not plan.get("original_query_en"):
            plan["original_query_en"] = user_text

        configurable = config.get("configurable") or {}
        user_id = configurable.get("user_id") or configurable.get("phone_number")
        location_sources: dict[str, str | None] = {}
        trace_event(
            "planner_user_location_lookup",
            user_id=user_id,
            configurable_user_id=(config.get("configurable") or {}).get("user_id"),
        )
        entities = merge_entities_from_rephrased_query(
            plan,
            messages,
            location,
            prev_entities,
            sources_out=location_sources,
        )
        plan["entities"] = entities
        trace_event("planner_entities_merged", entities=entities)

        if not plan.get("is_agriculture_related", True):
            plan = apply_non_agriculture_gate(plan)
            logger.info(
                "Planner: non-agriculture query — upload_reviewer_only path "
                "rephrased=%s domains=%s",
                plan.get("rephrased_query"),
                plan.get("domains"),
            )
            return {"plan": plan}

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
            plan=plan,
        )

        if plan.get("is_greeting"):
            is_complete = True
            missing = []
            follow_up = None

        plan["is_complete"] = is_complete
        plan["missing_info"] = missing
        plan["follow_up_question"] = follow_up

        plan = apply_planner_completeness_rules(
            plan,
            messages,
            location,
            prev_entities,
            sources_out=location_sources,
        )

        trace_event(
            "planner_final_plan",
            plan={
                k: plan.get(k)
                for k in (
                    "domain",
                    "domains",
                    "is_complete",
                    "missing_info",
                    "entities",
                    "rephrased_query",
                    "original_query_en",
                    "reasoning",
                    "weather",
                    "mandi",
                    "soil",
                    "schemes",
                    "chemical_checker",
                    "knowledge_base",
                    "vocal_language",
                    "script_language",
                )
            },
        )

        if plan.get("is_greeting"):
            plan["knowledge_base"] = False
            plan["soil"] = False
            plan["weather"] = False
            plan["mandi"] = False
            plan["schemes"] = False
            plan["chemical_checker"] = False
        else:
            plan["knowledge_base"] = True
            plan["soil"] = False
            plan["schemes"] = False

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
    end_conversation_turn(question, outcome="clarify")
    return {"messages": [AIMessage(content=question)]}


def route_after_planner(state: AjraSakhaState) -> str:
    plan = state.get("plan") or {}
    if not plan.get("is_complete", True):
        return "clarify"
    return "ensure_location"


def route_after_ensure_location(state: AjraSakhaState) -> str:
    plan = state.get("plan") or {}
    is_greeting = plan.get("is_greeting") or plan.get("reasoning") == "greeting"
    if plan.get("is_agriculture_related") is False and not is_greeting:
        return "upload_reviewer_only"
    return "execute_plan"


def _coerce_official_language(name: str) -> str | None:
    """Case-insensitive match against OFFICIAL_LANGUAGES; None if unknown."""
    raw = (name or "").strip()
    if not raw:
        return None
    lower = raw.lower()
    for lang in OFFICIAL_LANGUAGES:
        if lang.lower() == lower:
            return lang
    return None
