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

from ajrasakha.agents.config import CLAUDE_MODEL
from ajrasakha.agents.crop_requirement import is_crop_specific_question
from ajrasakha.agents.domains import (
    CROP_ALL_DOMAINS,
    CROP_REQUIRED_DOMAINS,
    apply_tool_flags_from_domain,
    crop_counts_as_resolved,
    normalize_domain,
)
from ajrasakha.agents.language import detect_farmer_language
from ajrasakha.agents.location_context import (
    gps_state_from_location,
    latest_human_text,
    main_agent_location_context_message,
    resolve_state_for_turn,
)
from ajrasakha.agents.plan_executor import ENABLE_CHEMICAL_CHECKER
from ajrasakha.agents.planner_rules import (
    apply_planner_completeness_rules,
    format_conversation_for_planner,
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
    domain: str = Field(
        default="General",
        description="Exactly one value from ALLOWED_DOMAINS in ajrasakha.agents.domains",
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
        description="If the user query is NOT in English, translate it exactly to English. If it is in English, set it to the original query."
    )
    rephrased_query: Optional[str] = Field(
        None,
        description=(
            "English grammatically corrected query (if user's query is in another language, correct the English translation). "
            "ONLY refine spelling, syntax, or grammar errors. Do NOT do any fancy rephrasing or search extensions."
        )
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

    return {
        "domain": normalize_domain(output.domain),
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
    }


def _default_plan_for_agriculture(user_query: Optional[str] = None) -> PlannerPlan:
    return {
        "domain": "General",
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
    }


def _resolve_state_deterministic(
    messages: list[BaseMessage],
    location: Optional[dict],
) -> Optional[str]:
    """Deterministically resolve state: latest message text, then GPS thread location."""
    return resolve_state_for_turn(latest_human_text(messages), location)


async def _apply_domain_and_crop_async(
    plan: PlannerPlan,
    messages: list[BaseMessage],
    *,
    crop_prefilled: Optional[str],
    config: RunnableConfig,
) -> tuple[PlannerPlan, str, bool]:
    """Normalize domain, derive flags, apply CROP_ALL / CROP_REQUIRED crop rules."""
    domain = normalize_domain(plan.get("domain") or "General")
    plan["domain"] = domain

    tool_flags = apply_tool_flags_from_domain(domain)
    plan.update(tool_flags)
    if ENABLE_CHEMICAL_CHECKER and plan.get("chemical_checker", False):
        plan["chemical_checker"] = True
    else:
        plan["chemical_checker"] = False

    entities: PlannerEntities = dict(plan.get("entities") or {})
    user_text = latest_human_text(messages)
    question = plan.get("rephrased_query") or user_text
    original = plan.get("original_query_en") or user_text

    crop_required = False

    if domain in CROP_ALL_DOMAINS:
        entities["crop"] = "all"
        crop_required = False
    elif domain in CROP_REQUIRED_DOMAINS:
        crop = crop_prefilled or resolve_crop_for_turn(messages) or entities.get("crop")
        if crop and crop_counts_as_resolved(crop):
            entities["crop"] = (
                "all" if crop.lower() == "all"
                else crop[0].upper() + crop[1:].lower()
            )
            crop_required = False
        else:
            crop_required = await is_crop_specific_question(
                question, original, domain, config=config
            )
            if not crop_required:
                entities["crop"] = "all"
    else:
        entities["crop"] = "all"
        crop_required = False

    plan["entities"] = entities
    return plan, domain, crop_required


def _check_question_completeness(
    state_resolved: Optional[str],
    crop_resolved: Optional[str],
    crop_required: bool,
    has_gps: bool,
    farmer_language: str = "English",
) -> tuple[bool, list[str], Optional[str]]:
    """Deterministic completeness check following the specified flow."""
    missing: list[str] = []
    follow_up: Optional[str] = None

    has_state = bool(state_resolved) or has_gps
    if not has_state:
        missing.append("location")
        follow_up = (
            "Which state are you in?"
            if farmer_language == "English"
            else "आप किस राज्य में हैं?"
        )
        return False, missing, follow_up

    if crop_required and not crop_counts_as_resolved(crop_resolved):
        missing.append("crop")
        follow_up = (
            "Which crop are you growing?"
            if farmer_language == "English"
            else "आप कौन सी फसल उगा रहे हैं?"
        )
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
        }
        return {"plan": plan}

    location = state.get("location")
    farmer_lang = detect_farmer_language(user_text)

    state_resolved = _resolve_state_deterministic(messages, location)
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
        f"PRE-EXTRACTED ENTITIES (use these, do not override):\n"
        f"- state: {state_resolved or 'NOT RESOLVED'}\n"
        f"- crop: {crop_resolved or 'NOT RESOLVED'}\n"
        f"- has_gps: {has_gps}\n"
    )
    llm_messages.append(
        HumanMessage(
            content=(
                f"{deterministic_context}\n"
                f"Latest farmer message (language: {farmer_lang}):\n{conv_block}\n\n"
                f"Pick `domain` from the allowed list using this latest message only.\n"
                f"Write follow_up_question in {farmer_lang} only when rules require it.\n"
                "Return the routing plan only."
            )
        )
    )

    try:
        llm = ChatAnthropic(model=CLAUDE_MODEL).with_structured_output(PlannerOutput)
        output = await llm.ainvoke(llm_messages, config=config)
        plan = planner_output_to_plan(output)

        entities = plan.get("entities") or {}

        if state_resolved:
            entities["state"] = state_resolved
        elif not entities.get("state"):
            gps_state = gps_state_from_location(location)
            if gps_state:
                entities["state"] = gps_state

        if crop_resolved:
            entities["crop"] = crop_resolved

        plan["entities"] = entities

        plan, domain, crop_required = await _apply_domain_and_crop_async(
            plan,
            messages,
            crop_prefilled=crop_resolved,
            config=config,
        )

        entities = plan.get("entities") or {}
        effective_crop = entities.get("crop")
        final_state = entities.get("state") or state_resolved
        is_complete, missing, follow_up = _check_question_completeness(
            state_resolved=final_state,
            crop_resolved=effective_crop,
            crop_required=crop_required,
            has_gps=has_gps,
            farmer_language=farmer_lang,
        )

        plan["is_complete"] = is_complete
        plan["missing_info"] = missing
        plan["follow_up_question"] = follow_up

        plan = apply_planner_completeness_rules(
            plan,
            messages,
            location,
            farmer_language=farmer_lang,
        )

        if not plan.get("rephrased_query"):
            plan["rephrased_query"] = user_text
        if not plan.get("original_query_en"):
            plan["original_query_en"] = user_text
        plan["knowledge_base"] = True

        logger.info(
            "Planner: complete=%s domain=%s crop_required=%s "
            "state=%s crop=%s "
            "flags=(w=%s m=%s s=%s sch=%s chem=%s kb=%s) "
            "rephrased=%s missing=%s",
            plan.get("is_complete"),
            plan.get("domain"),
            crop_required,
            entities.get("state"),
            entities.get("crop"),
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
    if not question:
        if "location" in missing:
            question = "Which state are you in?"
        elif "crop" in missing:
            question = "Which crop are you growing?"
        else:
            question = "Which state are you in?"
    return {"messages": [AIMessage(content=question)]}


def route_after_planner(state: AjraSakhaState) -> str:
    plan = state.get("plan") or {}
    if not plan.get("is_complete", True):
        return "clarify"
    return "ensure_location"
