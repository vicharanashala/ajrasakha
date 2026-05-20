"""Planner orchestrator node — structured routing without answering the farmer."""

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
from ajrasakha.agents.language import detect_farmer_language
from ajrasakha.agents.location_context import main_agent_location_context_message
from ajrasakha.agents.planner_rules import (
    apply_planner_completeness_rules,
    format_conversation_for_planner,
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
    }


def _default_plan_for_agriculture() -> PlannerPlan:
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
    }


async def planner_node(
    state: AjraSakhaState,
    config: RunnableConfig,
) -> dict:
    messages = state.get("messages") or []
    human = _last_human_message(messages)
    if human is None:
        return {"plan": _default_plan_for_agriculture()}

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
        }
        return {"plan": plan}

    llm_messages: list[BaseMessage] = [SystemMessage(content=PLANNER_SYSTEM_PROMPT)]
    loc_ctx = main_agent_location_context_message(state.get("location"))
    if loc_ctx:
        llm_messages.append(loc_ctx)
    farmer_lang = detect_farmer_language(user_text)
    conv_block = format_conversation_for_planner(messages) or user_text
    llm_messages.append(
        HumanMessage(
            content=(
                f"Farmer conversation (language: {farmer_lang}):\n{conv_block}\n\n"
                f"Write follow_up_question in {farmer_lang} only when rules require it.\n"
                "Return the routing plan only."
            )
        )
    )

    try:
        llm = ChatAnthropic(model=CLAUDE_MODEL).with_structured_output(PlannerOutput)
        output = await llm.ainvoke(llm_messages, config=config)
        plan = apply_planner_completeness_rules(
            planner_output_to_plan(output),
            messages,
            state.get("location"),
            farmer_language=farmer_lang,
        )
        logger.info(
            "Planner: complete=%s flags=(w=%s m=%s s=%s sch=%s chem=%s kb=%s) missing=%s",
            plan.get("is_complete"),
            plan.get("weather"),
            plan.get("mandi"),
            plan.get("soil"),
            plan.get("schemes"),
            plan.get("chemical_checker"),
            plan.get("knowledge_base"),
            plan.get("missing_info"),
        )
        return {"plan": plan}
    except (asyncio.CancelledError, TimeoutError, APITimeoutError, APIConnectionError) as exc:
        logger.warning("Planner failed (%s: %s) — using default knowledge_base plan", type(exc).__name__, exc)
        return {"plan": _default_plan_for_agriculture()}
    except APIStatusError as exc:
        if exc.status_code >= 500:
            logger.warning("Planner server error %s — using default plan", exc.status_code)
            return {"plan": _default_plan_for_agriculture()}
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
