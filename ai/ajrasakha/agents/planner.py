"""Planner orchestrator node — structured routing without answering the farmer.

Flow:
  1. Take input query
  2. Check domain (via LLM classification)
  3. Check state (from query text first, then from lat/long)
  4. Check crop (from query text)
  5. Lookup table: is crop required for this domain?
     - crop_required=True  AND crop available   → pass
     - crop_required=True  AND crop unavailable  → ask user for crop
     - crop_required=False                       → crop = "All"
  6. State resolution:
     - state in query   → state = query_state
     - state not in query → state = from lat/long
  7. Completeness check:
     - state=True AND crop_required=True  AND crop=True  → is_question_complete=True
     - state=True AND crop_required=True  AND crop=False → is_question_complete=False
  8. If is_question_complete=True → determine tools to call
  9. Final output to main agent:
     {original_query, rephrased_query, state, crop, tools: [list]}
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
from ajrasakha.agents.domains import domain_requires_crop, ALLOWED_DOMAINS
from ajrasakha.agents.language import detect_farmer_language
from ajrasakha.agents.location_context import (
    extract_state_from_text,
    main_agent_location_context_message,
)
from ajrasakha.agents.planner_rules import (
    apply_planner_completeness_rules,
    extract_crop_from_text,
    format_conversation_for_planner,
    infer_domain_for_plan,
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


def _all_human_text(messages: list[BaseMessage]) -> str:
    """Concatenate all human messages for entity extraction across turns."""
    parts = []
    for msg in messages:
        if isinstance(msg, HumanMessage):
            t = _message_to_text(msg)
            if t:
                parts.append(t)
    return " ".join(parts)


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
    """Deterministically resolve state: first from query text, then from lat/long location.

    This is the core change — NO LLM is used for state resolution.
    Priority:
      1. State mentioned in query text (any human message in conversation)
      2. State from GPS-resolved location (thread location state)
    """
    # 1. Check all human messages for state mention
    all_text = _all_human_text(messages)
    state_from_text = extract_state_from_text(all_text)
    if state_from_text:
        return state_from_text

    # 2. Fall back to thread location (resolved from lat/long)
    if location and location.get("state"):
        state_val = str(location["state"]).strip()
        if state_val.lower() not in {"", "unknown", "not specified", "all", "none"}:
            return state_val

    return None


def _resolve_crop_deterministic(
    messages: list[BaseMessage],
) -> Optional[str]:
    """Deterministically resolve crop from conversation text. No LLM."""
    all_text = _all_human_text(messages)
    crop = extract_crop_from_text(all_text)
    if crop:
        return crop[0].upper() + crop[1:].lower()
    return None


def _check_question_completeness(
    state_resolved: Optional[str],
    crop_resolved: Optional[str],
    crop_required: bool,
    has_gps: bool,
    farmer_language: str = "English",
) -> tuple[bool, list[str], Optional[str]]:
    """Deterministic completeness check following the specified flow.

    Returns (is_complete, missing_info, follow_up_question).

    Logic:
      - State must be known (from text or GPS)
      - If crop_required and crop not available → incomplete, ask for crop
      - If crop_required=False → crop = "All" (handled by caller)
    """
    missing: list[str] = []
    follow_up: Optional[str] = None

    # State check: either from text or GPS must be available
    has_state = bool(state_resolved) or has_gps
    if not has_state:
        missing.append("location")
        follow_up = (
            "Which state and district are you in?"
            if farmer_language == "English"
            else "आप किस राज्य और जिले में हैं?"
        )
        return False, missing, follow_up

    # Crop check: only when domain requires it
    if crop_required and not crop_resolved:
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
            "entities": {},
            "skip_synthesize": False,
            "rephrased_query": user_text,
            "original_query_en": user_text,
        }
        return {"plan": plan}

    # ── Step 1: Deterministic entity extraction (NO LLM for state/crop) ────
    location = state.get("location")
    farmer_lang = detect_farmer_language(user_text)

    # Resolve state: text first, then GPS location
    state_resolved = _resolve_state_deterministic(messages, location)

    # Resolve crop: from conversation text
    crop_resolved = _resolve_crop_deterministic(messages)

    # Check if GPS exists on thread
    has_gps = bool(
        location
        and location.get("latitude") is not None
        and location.get("longitude") is not None
    )

    # ── Step 2: Use LLM ONLY for domain/tool classification + translation ──
    llm_messages: list[BaseMessage] = [SystemMessage(content=PLANNER_SYSTEM_PROMPT)]
    loc_ctx = main_agent_location_context_message(location)
    if loc_ctx:
        llm_messages.append(loc_ctx)
    conv_block = format_conversation_for_planner(messages) or user_text

    # Inject deterministically extracted entities so the LLM doesn't
    # re-derive them (and potentially get them wrong)
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
                f"Farmer conversation (language: {farmer_lang}):\n{conv_block}\n\n"
                f"Write follow_up_question in {farmer_lang} only when rules require it.\n"
                "Return the routing plan only."
            )
        )
    )

    try:
        llm = ChatAnthropic(model=CLAUDE_MODEL).with_structured_output(PlannerOutput)
        output = await llm.ainvoke(llm_messages, config=config)
        plan = planner_output_to_plan(output)

        # ── Step 3: Override LLM entities with deterministic values ─────
        entities = plan.get("entities") or {}

        # State: deterministic resolution takes priority
        if state_resolved:
            entities["state"] = state_resolved
        elif not entities.get("state") and location and location.get("state"):
            loc_state = str(location["state"]).strip()
            if loc_state.lower() not in {"", "unknown", "not specified", "all", "none"}:
                entities["state"] = loc_state

        # Crop: deterministic extraction takes priority
        if crop_resolved:
            entities["crop"] = crop_resolved

        plan["entities"] = entities

        # ── Step 4: Determine domain and crop requirement ──────────────
        from ajrasakha.agents.planner_rules import conversation_text_from_messages
        conv_text = conversation_text_from_messages(messages)
        domain = infer_domain_for_plan(plan, conv_text)
        crop_required = domain_requires_crop(domain)

        # If crop is NOT required for this domain, set crop = "All"
        effective_crop = entities.get("crop")
        if not crop_required:
            effective_crop = "All"
            entities["crop"] = "All"
            plan["entities"] = entities

        # ── Step 5: Deterministic completeness check ───────────────────
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

        # Apply remaining post-processing rules (schemes override, etc.)
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

        logger.info(
            "Planner: complete=%s domain=%s crop_required=%s "
            "state=%s crop=%s "
            "flags=(w=%s m=%s s=%s sch=%s chem=%s kb=%s) "
            "rephrased=%s missing=%s",
            plan.get("is_complete"),
            domain,
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
        if "district" in missing:
            question = "Which district are you in?"
        elif "location" in missing:
            question = "Which state and district are you in?"
        elif "crop" in missing:
            question = "Which crop are you growing?"
        else:
            question = "Which state and district are you in?"
    return {"messages": [AIMessage(content=question)]}


def route_after_planner(state: AjraSakhaState) -> str:
    plan = state.get("plan") or {}
    if not plan.get("is_complete", True):
        return "clarify"
    return "ensure_location"
