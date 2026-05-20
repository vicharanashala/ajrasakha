"""Deterministic planner completeness — limits clarify loops."""

from __future__ import annotations

import re
from typing import Optional

from langchain_core.messages import BaseMessage, HumanMessage

from ajrasakha.agents.domains import domain_requires_crop
from ajrasakha.agents.location_context import extract_state_from_text
from ajrasakha.agents.state import Location, PlannerEntities, PlannerPlan

_SCHEMES_RE = re.compile(
    r"\b(insurance|insured|pm[\s-]?kisan|pmkisan|subsidy|subsidies|scheme|schemes|"
    r"eligibility|eligible|benefit|benefits|pension|loan|yojana|claim|enrollment|"
    r"government\s+scheme|myscheme)\b",
    re.I,
)
_CROP_INSURANCE_RE = re.compile(
    r"\b(crop\s+insurance|fasal\s+bima|pmfby|insurance\s+for\s+(?:my\s+)?crop)\b",
    re.I,
)
_PM_KISAN_RE = re.compile(r"\b(pm[\s-]?kisan|pmkisan)\b", re.I)
_META_CLARIFY_RE = re.compile(
    r"what would you like to know|something else|are you asking about|"
    r"which type of|cultivation practices, pest|checking eligibility for\?",
    re.I,
)

_CROP_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("cotton", re.compile(r"\bcotton\b", re.I)),
    ("paddy", re.compile(r"\b(paddy|rice)\b", re.I)),
    ("wheat", re.compile(r"\bwheat\b", re.I)),
    ("maize", re.compile(r"\b(maize|corn)\b", re.I)),
    ("tomato", re.compile(r"\btomato\b", re.I)),
    ("onion", re.compile(r"\bonion\b", re.I)),
    ("chilli", re.compile(r"\b(chilli|chili|mirch)\b", re.I)),
    ("potato", re.compile(r"\bpotato\b", re.I)),
    ("sugarcane", re.compile(r"\bsugarcane\b", re.I)),
    ("soybean", re.compile(r"\bsoybean\b", re.I)),
    ("groundnut", re.compile(r"\b(groundnut|peanut)\b", re.I)),
    ("mustard", re.compile(r"\bmustard\b", re.I)),
    ("sunflower", re.compile(r"\bsunflower\b", re.I)),
    ("banana", re.compile(r"\bbanana\b", re.I)),
    ("mango", re.compile(r"\bmango\b", re.I)),
]


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


def conversation_text_from_messages(messages: list[BaseMessage], *, max_turns: int = 12) -> str:
    """All farmer text in the thread (for entity carry-over across clarify turns)."""
    lines: list[str] = []
    for msg in messages:
        if isinstance(msg, HumanMessage):
            text = _message_to_text(msg)
            if text:
                lines.append(text)
    if len(lines) > max_turns:
        lines = lines[-max_turns:]
    return "\n".join(lines)


def format_conversation_for_planner(messages: list[BaseMessage]) -> str:
    human_lines: list[str] = []
    for msg in messages:
        if isinstance(msg, HumanMessage):
            text = _message_to_text(msg)
            if text:
                human_lines.append(text)
    if len(human_lines) > 8:
        human_lines = human_lines[-8:]
    if not human_lines:
        return ""
    if len(human_lines) == 1:
        return human_lines[0]
    numbered = "\n".join(f"{i}. {t}" for i, t in enumerate(human_lines, 1))
    return f"Conversation so far:\n{numbered}\n\nLatest message: {human_lines[-1]}"


def extract_crop_from_text(text: str) -> Optional[str]:
    if not text:
        return None
    for name, pattern in _CROP_PATTERNS:
        if pattern.search(text):
            return name
    return None


def is_schemes_intent(text: str) -> bool:
    return bool(_SCHEMES_RE.search(text or ""))


def infer_domain_for_plan(plan: PlannerPlan, conversation_text: str) -> str:
    text = conversation_text or ""
    if plan.get("weather"):
        return "Weather"
    if plan.get("mandi"):
        return "Market Prices"
    if plan.get("soil"):
        return "Soil Health Card"
    if plan.get("schemes") or is_schemes_intent(text):
        if _PM_KISAN_RE.search(text):
            return "Financial & Institutional Services"
        if _CROP_INSURANCE_RE.search(text) or re.search(r"\binsurance\b", text, re.I):
            return "Crop Insurance"
        return "Government Schemes"
    if plan.get("knowledge_base"):
        return "Plant Protection"
    return "General"


def _merge_entities(
    plan_entities: PlannerEntities,
    conversation_text: str,
    location: Optional[Location],
) -> PlannerEntities:
    merged: PlannerEntities = dict(plan_entities or {})
    conv = conversation_text or ""

    crop = merged.get("crop") or extract_crop_from_text(conv)
    if crop:
        merged["crop"] = crop[0].upper() + crop[1:].lower()

    state = merged.get("state") or extract_state_from_text(conv)
    if not state and location:
        state = location.get("state")
    if state:
        merged["state"] = state

    district = merged.get("district")
    if not district and location and location.get("city"):
        merged["district"] = str(location["city"])
    return merged


def _location_status(
    entities: PlannerEntities,
    location: Optional[Location],
) -> tuple[bool, bool, bool]:
    """Returns (has_state, has_district, has_gps)."""
    loc = location or {}
    has_state = bool(entities.get("state") or loc.get("state"))
    has_district = bool(entities.get("district") or loc.get("city"))
    lat, lon = loc.get("latitude"), loc.get("longitude")
    has_gps = lat is not None and lon is not None
    return has_state, has_district, has_gps


def _is_bad_follow_up(question: Optional[str]) -> bool:
    if not question:
        return False
    q = question.strip()
    if _META_CLARIFY_RE.search(q):
        return True
    if q.count("?") > 1:
        return True
    if len(q) > 220:
        return True
    return False


def apply_planner_completeness_rules(
    plan: PlannerPlan,
    messages: list[BaseMessage],
    location: Optional[Location],
    *,
    farmer_language: str = "English",
) -> PlannerPlan:
    """Post-process planner output: merge entities, enforce scheme overrides.

    Note: The primary completeness check (state + crop availability) is done
    deterministically in planner_node BEFORE this function is called.
    This function handles:
      1. Entity merge (carry forward from conversation + location)
      2. Scheme intent override (schemes=True, knowledge_base=False)
      3. Domain annotation in reasoning
      4. If planner already set is_complete=False, respect that decision
      5. Only override to is_complete=False if rules find something new missing
    """
    out: PlannerPlan = dict(plan)
    conv = conversation_text_from_messages(messages)
    entities = _merge_entities(out.get("entities") or {}, conv, location)
    out["entities"] = entities

    has_state, has_district, has_gps = _location_status(entities, location)
    domain = infer_domain_for_plan(out, conv)
    schemes = bool(out.get("schemes")) or is_schemes_intent(conv)

    if schemes:
        out["schemes"] = True
        out["knowledge_base"] = False

    # If planner already marked incomplete, don't override to complete
    if not out.get("is_complete", True):
        # Validate the follow-up question isn't a bad one
        llm_follow_up = (out.get("follow_up_question") or "").strip()
        if _is_bad_follow_up(llm_follow_up):
            # Replace with a deterministic follow-up based on missing_info
            missing = out.get("missing_info") or []
            if "crop" in missing:
                out["follow_up_question"] = (
                    "Which crop are you growing?"
                    if farmer_language == "English"
                    else "आप कौन सी फसल उगा रहे हैं?"
                )
            elif "location" in missing:
                out["follow_up_question"] = (
                    "Which state and district are you in?"
                    if farmer_language == "English"
                    else "आप किस राज्य और जिले में हैं?"
                )
            elif "district" in missing:
                state_name = entities.get("state") or "your state"
                out["follow_up_question"] = (
                    f"Which district in {state_name}?"
                    if farmer_language == "English"
                    else f"{state_name} में आप किस जिले में हैं?"
                )
    else:
        # Planner said complete — do a safety check for crop requirement
        crop = entities.get("crop")
        needs_crop = domain_requires_crop(domain) and not crop

        if not has_state and not has_gps:
            out["is_complete"] = False
            out["missing_info"] = ["location"]
            out["follow_up_question"] = (
                "Which state and district are you in?"
                if farmer_language == "English"
                else "आप किस राज्य और जिले में हैं?"
            )
        elif needs_crop:
            out["is_complete"] = False
            out["missing_info"] = ["crop"]
            out["follow_up_question"] = (
                "Which crop are you growing?"
                if farmer_language == "English"
                else "आप कौन सी फसल उगा रहे हैं?"
            )
        else:
            out["is_complete"] = True
            out["missing_info"] = []
            out["follow_up_question"] = None

    out["reasoning"] = (out.get("reasoning") or "") + f"; domain={domain}"
    return out

