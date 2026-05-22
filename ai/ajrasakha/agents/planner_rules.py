"""Deterministic planner completeness — limits clarify loops."""

from __future__ import annotations

import re
from typing import Optional

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

from ajrasakha.agents.domains import (
    crop_counts_as_resolved,
    domain_requires_crop,
    is_crop_placeholder,
    normalize_domain,
)
from ajrasakha.agents.location_context import (
    extract_state_from_text,
    gps_state_from_location,
    has_gps_coordinates,
    latest_human_text,
    recent_human_text,
)
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
_CROP_CLARIFY_RE = re.compile(
    r"which crop|what crop|कौन सी फसल|कौनसी फसल",
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
    """Latest farmer message only — domain must not bleed from older thread topics."""
    return latest_human_text(messages)


def is_crop_clarify_turn(messages: list[BaseMessage]) -> bool:
    """True when the farmer's latest reply follows an AI crop clarify question."""
    last_human_idx: int | None = None
    for i in range(len(messages) - 1, -1, -1):
        if isinstance(messages[i], HumanMessage):
            last_human_idx = i
            break
    if last_human_idx is None or last_human_idx == 0:
        return False
    prev = messages[last_human_idx - 1]
    if isinstance(prev, AIMessage):
        return bool(_CROP_CLARIFY_RE.search(_message_to_text(prev)))
    return False


def resolve_crop_for_turn(messages: list[BaseMessage]) -> Optional[str]:
    """Crop from latest message, or last few human lines only during crop clarify."""
    if is_crop_clarify_turn(messages):
        text = recent_human_text(messages, max_turns=3)
    else:
        text = latest_human_text(messages)
    crop = extract_crop_from_text(text)
    if crop:
        return crop[0].upper() + crop[1:].lower()
    return None


def extract_crop_from_text(text: str) -> Optional[str]:
    if not text:
        return None
    for name, pattern in _CROP_PATTERNS:
        if pattern.search(text):
            return name
    return None


def entity_text_from_plan(plan: PlannerPlan, messages: list[BaseMessage]) -> str:
    """English text used for state/crop extraction — rephrased query first."""
    text = (plan.get("rephrased_query") or plan.get("original_query_en") or "").strip()
    return text or latest_human_text(messages)


def merge_entities_from_rephrased_query(
    plan: PlannerPlan,
    messages: list[BaseMessage],
    location: Optional[Location],
) -> PlannerEntities:
    """Resolve state/crop/district from rephrased English, not raw regional text."""
    merged: PlannerEntities = dict(plan.get("entities") or {})
    text = entity_text_from_plan(plan, messages)
    has_gps = has_gps_coordinates(location)

    if is_crop_clarify_turn(messages):
        turn_crop = extract_crop_from_text(text) or resolve_crop_for_turn(messages)
    else:
        turn_crop = extract_crop_from_text(text)
    if turn_crop:
        merged["crop"] = turn_crop[0].upper() + turn_crop[1:].lower()
    elif merged.get("crop") and not is_crop_placeholder(merged.get("crop")):
        c = str(merged["crop"])
        merged["crop"] = c[0].upper() + c[1:].lower()

    state = extract_state_from_text(text) or gps_state_from_location(location)
    if state:
        merged["state"] = state

    district = merged.get("district")
    if not district and has_gps and location and location.get("city"):
        merged["district"] = str(location["city"])
    elif not district and merged.get("state"):
        merged["district"] = "all"
    return merged


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
    plan: PlannerPlan,
    messages: list[BaseMessage],
    location: Optional[Location],
) -> PlannerEntities:
    return merge_entities_from_rephrased_query(plan, messages, location)


def _location_status(
    entities: PlannerEntities,
    location: Optional[Location],
) -> tuple[bool, bool, bool]:
    """Returns (has_state, has_district, has_gps)."""
    loc = location or {}
    lat, lon = loc.get("latitude"), loc.get("longitude")
    has_gps = lat is not None and lon is not None
    has_state = bool(entities.get("state") or (has_gps and loc.get("state")))
    has_district = bool(entities.get("district") or (has_gps and loc.get("city")))
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


def _finalize_location_and_crop_completeness(
    out: PlannerPlan,
    *,
    entities: PlannerEntities,
    domain: str,
    has_state: bool,
    has_gps: bool,
    farmer_language: str,
) -> PlannerPlan:
    """Single completeness pass: state (or GPS) required; district defaults to all."""
    crop = entities.get("crop")
    domain = normalize_domain(domain)
    needs_crop = domain_requires_crop(domain) and not crop_counts_as_resolved(crop)

    if not has_state and not has_gps:
        out["is_complete"] = False
        out["missing_info"] = ["location"]
        out["follow_up_question"] = (
            "Which state are you in?"
            if farmer_language == "English"
            else "आप किस राज्य में हैं?"
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
    return out


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
    latest = latest_human_text(messages)
    entities = _merge_entities(out, messages, location)
    out["entities"] = entities

    has_state, _, has_gps = _location_status(entities, location)
    domain = normalize_domain(out.get("domain") or "General")

    if is_schemes_intent(latest) and domain in {
        "Government Schemes",
        "Financial & Institutional Services",
        "Crop Insurance",
        "General",
    }:
        out["schemes"] = True
        out["knowledge_base"] = False

    if not out.get("is_complete", True):
        llm_follow_up = (out.get("follow_up_question") or "").strip()
        if _is_bad_follow_up(llm_follow_up):
            missing = out.get("missing_info") or []
            if "crop" in missing:
                out["follow_up_question"] = (
                    "Which crop are you growing?"
                    if farmer_language == "English"
                    else "आप कौन सी फसल उगा रहे हैं?"
                )
            elif "location" in missing:
                out["follow_up_question"] = (
                    "Which state are you in?"
                    if farmer_language == "English"
                    else "आप किस राज्य में हैं?"
                )

    out = _finalize_location_and_crop_completeness(
        out,
        entities=entities,
        domain=domain,
        has_state=has_state,
        has_gps=has_gps,
        farmer_language=farmer_language,
    )

    out["reasoning"] = (out.get("reasoning") or "") + f"; domain={domain}"
    return out

