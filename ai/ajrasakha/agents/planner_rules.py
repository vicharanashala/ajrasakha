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
    latest_human_text,
    recent_human_text,
)
from ajrasakha.agents.resolution_trace import trace_resolution
from ajrasakha.agents.state import Location, PlannerEntities, PlannerPlan
from ajrasakha.agents.translation_catalog import (
    get_crop_follow_up,
    get_state_follow_up,
    language_pair_from_plan,
)

_SCHEMES_RE = re.compile(
    r"\b(insurance|insured|pm[\s-]?kisan|pmkisan|subsidy|subsidies|scheme|schemes|"
    r"eligibility|eligible|benefit|benefits|pension|loan|yojana|claim|enrollment|"
    r"government\s+scheme|myscheme)\b",
    re.I,
)

# --- Follow-up detection (heuristic pre-check) ---
# A follow-up is a transformation request on the previous AI answer that does NOT
# need new tool data: language change, format change, detail request, simplification,
# tone change, or rephrase.

_FOLLOW_UP_LANGUAGE_RE = re.compile(
    r"\b("
    r"in\s+(english|hindi|tamil|telugu|kannada|malayalam|marathi|gujarati|bengali|punjabi|odia|urdu|assamese|sanskrit|nepali|konkani|maithili|kashmiri|sindhi|dogri|bodo|manipuri|santali|meitei|meiteilon)"
    r"|(english|hindi|tamil|telugu|kannada|malayalam|marathi|gujarati|bengali|punjabi|odia|urdu)\s*(me|mein|lo|la|il|ki|ke|nu|no|na|nalli|nalli|il|le|te|di|ma|madi|madhyam|madhyama|through|via|using)"
    r"|translate\s*(to|into|mein|me|lo|la)?"
    r"|anuvaad|anuvad|anubhash|bhashantar"
    r"|change\s+(the\s+)?language|another\s+language|other\s+language"
    r"|same\s+(answer|reply|response|info|information)\s+in"
    r")",
    re.I,
)

_FOLLOW_UP_FORMAT_RE = re.compile(
    r"\b("
    r"in\s+(short|brief|shortly|briefly|short\s+form|long\s+form|detail|details|long|short|paragraph|table|bullets?|bullet\s*points?|points?)"
    r"|give\s+(me\s+)?(short|brief|short\s+answer|brief\s+answer|short\s+reply|brief\s+reply|bullets?|bullet\s*points?|points?|summary|details?|long\s+answer|detailed\s+answer)"
    r"|(short|brief|shortly)\s+(me|form|answer|reply|version)"
    r"|(shorten|shorten\s+it|condense|compress|reduce)\s*(it|this|the\s+answer|the\s+reply)?"
    r"|summarize|summarise|summary\s+of\s+(this|that|the\s+answer)"
    r"|convert\s+(to|into)\s+(bullets?|points?|paragraph|table)"
    r"|make\s+(it|this)\s+(a\s+)?(shorter|longer|bullet|paragraph|table)"
    r")",
    re.I,
)

_FOLLOW_UP_DETAIL_RE = re.compile(
    r"\b("
    r"explain\s+(more|in\s+detail|in\s+more\s+detail|further|again|properly)"
    r"|(more|elaborate|elaborated?)\s+(detail|details|information|info|explanation|points?|about)?"
    r"|\belaborate\b"
    r"|in\s+(more|greater)\s+detail"
    r"|tell\s+me\s+more|more\s+about\s+(it|this|that)"
    r"|what\s+else|anything\s+else"
    r")",
    re.I,
)

_FOLLOW_UP_SIMPLIFY_RE = re.compile(
    r"\b("
    r"(simplify|simple|simpler)\s*(it|this|the\s+answer|the\s+reply|words|please)?"
    r"|in\s+simple\s+(words|language|way|terms)"
    r"|easy\s+(words|language|way|terms|explanation)"
    r"|like\s+(a\s+)?(beginner|new\s*farmer|child|kid|student)"
    r")",
    re.I,
)

_FOLLOW_UP_TONE_RE = re.compile(
    r"\b("
    r"(explain\s+)?(like\s+a\s+)?(expert|professional|scientist|professor|teacher|doctor|technical|advanced)"
    r"|in\s+(technical|advanced|expert|simple)\s+(terms|language|way)"
    r"|for\s+(a\s+)?(beginner|new\s*farmer|expert|child|kid|student)"
    r")",
    re.I,
)

_FOLLOW_UP_REPHRASE_RE = re.compile(
    r"\b("
    r"rephrase|reword|rewrite|reframe|say\s+it\s+(again|differently|in\s+another\s+way|simply)"
    r"|(say|tell)\s+(it|this|that)\s+(again|once\s+more|one\s+more\s+time)"
    r"|same\s+(thing|info|information|answer)\s+(but|in)\s+(different|other|simpler)"
    r")",
    re.I,
)


def classify_follow_up_heuristic(text: str) -> Optional[str]:
    """Return follow_up_type if the latest farmer message looks like a transformation
    request on the previous AI answer; None otherwise.

    Order of precedence (most specific first):
      language_change > format_change > detail_request > simplify > tone_change > rephrase
    """
    raw = (text or "").strip()
    if not raw or len(raw) > 200:
        return None
    if _FOLLOW_UP_LANGUAGE_RE.search(raw):
        return "language_change"
    if _FOLLOW_UP_FORMAT_RE.search(raw):
        return "format_change"
    if _FOLLOW_UP_DETAIL_RE.search(raw):
        return "detail_request"
    if _FOLLOW_UP_SIMPLIFY_RE.search(raw):
        return "simplify"
    if _FOLLOW_UP_TONE_RE.search(raw):
        return "tone_change"
    if _FOLLOW_UP_REPHRASE_RE.search(raw):
        return "rephrase"
    return None


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


def format_prev_plan_context(prev_plan: PlannerPlan) -> str:
    """Context from the prior incomplete turn (rephrased query + resolved entities)."""
    if not prev_plan or prev_plan.get("is_complete", True):
        return ""

    lines = [
        "PRIOR TURN CONTEXT (incomplete — merge with current farmer reply in rephrased_query):",
    ]
    rephrased = (prev_plan.get("rephrased_query") or "").strip()
    if rephrased:
        lines.append(f"- previous_rephrased_query: {rephrased}")
    original = (prev_plan.get("original_query_en") or "").strip()
    if original and original != rephrased:
        lines.append(f"- previous_original_query_en: {original}")

    entities = prev_plan.get("entities") or {}
    chemicals = entities.get("chemicals") or []
    if chemicals:
        lines.append(f"- resolved_chemicals (canonical): {', '.join(chemicals)}")
    crop = entities.get("crop")
    if crop and not is_crop_placeholder(crop):
        lines.append(f"- resolved_crop: {crop}")
    state = entities.get("state")
    if state:
        lines.append(f"- resolved_state: {state}")
    district = entities.get("district")
    if district:
        lines.append(f"- resolved_district: {district}")

    domain = prev_plan.get("domain")
    if domain:
        lines.append(f"- domain: {domain}")

    missing = prev_plan.get("missing_info") or []
    if missing:
        lines.append(f"- still_missing: {', '.join(missing)}")

    return "\n".join(lines) + "\n"


def merge_location_clarification_into_query(
    prev_plan: Optional[PlannerPlan],
    location_reply: str,
) -> Optional[str]:
    """Preserve the original query when the farmer answers a location clarify.

    The planner LLM is asked to rephrase the latest turn, but a location reply
    such as ``Delhi`` is not a standalone question. When the prior plan was
    incomplete specifically because location was missing, use its query as the
    stable base and attach the new location deterministically. This prevents
    query loss when the LLM rephrasing varies between turns.
    """
    if not prev_plan or prev_plan.get("is_complete", True):
        return None
    if "location" not in (prev_plan.get("missing_info") or []):
        return None

    base = (
        prev_plan.get("rephrased_query")
        or prev_plan.get("original_query_en")
        or ""
    ).strip()
    if not base:
        return None

    reply = (location_reply or "").strip()
    if not reply:
        return base

    # Avoid duplicating a location if a client retries the same clarification.
    if reply.casefold() in base.casefold():
        return base

    separator = "" if base.endswith((".", "!", "?")) else "."
    return f"{base}{separator} Location: {reply}"


def format_conversation_for_planner(
    messages: list[BaseMessage],
    *,
    max_farmer_messages: int = 4,
) -> str:
    """Recent farmer lines only — bot replies are omitted so long answers do not
    push earlier farmer messages out of the planner window."""
    lines: list[str] = []
    for msg in messages:
        if isinstance(msg, HumanMessage):
            text = _message_to_text(msg)
            if text:
                lines.append(f"Farmer: {text}")
    if len(lines) > max_farmer_messages:
        lines = lines[-max_farmer_messages:]
    return "\n".join(lines) if lines else latest_human_text(messages)


def format_last_queries_for_rephrasing(
    messages: list[BaseMessage],
    *,
    max_turns: int = 5,
) -> str:
    """Extract only the last N human messages for rephrasing context.
    
    This provides a focused context for the LLM to rephrase the query
    based on recent conversation history, without including bot responses.
    """
    lines: list[str] = []
    for msg in messages:
        if isinstance(msg, HumanMessage):
            text = _message_to_text(msg)
            if text:
                lines.append(text)
    if len(lines) > max_turns:
        lines = lines[-max_turns:]
    return "\n".join(lines) if lines else latest_human_text(messages)


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


def was_crop_clarify_asked(messages: list[BaseMessage]) -> bool:
    """True if the thread already contains a crop clarification question from the bot."""
    for msg in messages:
        if isinstance(msg, AIMessage) and _CROP_CLARIFY_RE.search(_message_to_text(msg)):
            return True
    return False


def has_specific_crop(crop: str | None) -> bool:
    """True when the farmer named a concrete crop (not all/general placeholders)."""
    return crop_counts_as_resolved(crop) and not is_crop_placeholder(crop)


def crop_slot_satisfied(crop: str | None) -> bool:
    """True when a specific crop name is available for a crop-required query."""
    return has_specific_crop(crop)


def should_inherit_crop(
    prev_crop: Optional[str],
    current_crop_mentioned: bool,
    domains: list[str],
) -> bool:
    """Decide whether to inherit crop from previous turn.

    Returns False when:
    - Current query mentions a crop (already handled separately)
    - Domain requires specific crop AND previous crop was 'all' (placeholder)

    This prevents inheriting crop="all" from a non-crop-required domain
    when the new query belongs to a crop-required domain.
    """
    if current_crop_mentioned:
        return False

    canonical_domains = [normalize_domain(d) for d in (domains or [])]
    domain_requires_specific = any(domain_requires_crop(d) for d in canonical_domains)

    if domain_requires_specific and is_crop_placeholder(prev_crop):
        trace_resolution(
            "crop_inheritance_blocked",
            reason="domain_requires_crop_but_prev_was_all",
            prev_crop=prev_crop,
            domains=domains,
        )
        return False

    return True


def apply_crop_one_shot_fallback(
    messages: list[BaseMessage],
    entities: PlannerEntities,
    domains: list[str],
) -> PlannerEntities:
    """After one crop clarify, default missing crop to all instead of asking again.
    
    Note: For crop-required domains, we do NOT apply this fallback. The crop should
    remain cleared so the completeness check asks the user for their crop.
    """
    canonical = [normalize_domain(d) for d in (domains or [])] or ["General"]
    # Don't apply "all" fallback for crop-required domains - let completeness check ask
    if any(domain_requires_crop(d) for d in canonical):
        return entities
    crop = entities.get("crop")
    if has_specific_crop(crop):
        return entities
    if was_crop_clarify_asked(messages) and not has_specific_crop(crop):
        out = dict(entities)
        out["crop"] = "all"
        trace_resolution(
            "crop_one_shot_fallback",
            crop="all",
            crop_source="one_shot_clarify_exhausted",
            domains=domains,
        )
        return out
    return entities


def resolve_crop_for_turn(messages: list[BaseMessage]) -> Optional[str]:
    """Crop from latest message, or last few human lines only during crop clarify."""
    if is_crop_clarify_turn(messages):
        text = recent_human_text(messages, max_turns=3)
    else:
        text = latest_human_text(messages)
    crop = extract_crop_from_text(text)
    if crop:
        resolved = crop[0].upper() + crop[1:].lower()
        source = "recent_human_text" if is_crop_clarify_turn(messages) else "latest_human_text"
        trace_resolution(
            "crop_from_text",
            crop=resolved,
            crop_source=source,
            text_preview=text[:120] if text else None,
        )
        return resolved
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
    prev_entities: Optional[PlannerEntities] = None,
    *,
    stored_location: Optional[dict[str, str]] = None,
    sources_out: Optional[dict[str, str | None]] = None,
) -> PlannerEntities:
    """Resolve state/crop/district from farmer text, LLM entities, stored profile, or clarify carry-over.

    State/district never come from device coordinates — only from rephrased query text,
    LLM entity fields, stored user location, or ``prev_entities`` during clarification.
    """
    # Start with previous entities, override with new plan entities
    merged: PlannerEntities = {**(prev_entities or {}), **dict(plan.get("entities") or {})}
    text = entity_text_from_plan(plan, messages)

    # --- Crop Resolution ---
    crop_source: str | None = None
    domains = list(plan.get("domains") or [normalize_domain(plan.get("domain") or "General")])
    current_crop_mentioned = False

    if is_crop_clarify_turn(messages):
        turn_crop = extract_crop_from_text(text)
        if turn_crop:
            crop_source = "rephrased_query_text (crop_clarify_turn)"
            current_crop_mentioned = True
        else:
            turn_crop = resolve_crop_for_turn(messages)
            if turn_crop:
                crop_source = "recent_human_text (crop_clarify_turn)"
                current_crop_mentioned = True
    else:
        turn_crop = extract_crop_from_text(text)
        if turn_crop:
            crop_source = "rephrased_query_text"
            current_crop_mentioned = True

    if turn_crop:
        merged["crop"] = turn_crop[0].upper() + turn_crop[1:].lower()
    elif merged.get("crop"):
        prev_crop = merged.get("crop")
        # Check if we should inherit crop from previous turn
        # Block inheritance when domain requires crop but previous was "all"
        if should_inherit_crop(prev_crop, current_crop_mentioned, domains):
            if not is_crop_placeholder(prev_crop):
                c = str(prev_crop)
                merged["crop"] = c[0].upper() + c[1:].lower()
                crop_source = crop_source or "prev_entities.crop (inherited)"
        else:
            # Clear the crop so completeness check will ask for it
            merged.pop("crop", None)
            crop_source = "cleared (domain_requires_crop_but_prev_was_all)"

    # --- Non-agriculture: force crop to "all" ---
    if plan.get("is_agriculture_related") is False:
        merged["crop"] = "all"
        crop_source = "non_agriculture_forced_all"

    # --- State/District Resolution (farmer text + LLM entities + clarify carry-over) ---
    state_from_text = extract_state_from_text(text)
    llm_state = plan.get("entities", {}).get("state")
    llm_district = plan.get("entities", {}).get("district")

    extracted_state = state_from_text or llm_state
    extracted_district = llm_district
    state_source: str | None = None
    district_source: str | None = None

    if extracted_state and extracted_district:
        merged["state"] = extracted_state
        merged["district"] = extracted_district
        state_source = "rephrased_query_text" if state_from_text else "plan.entities.state (llm)"
        district_source = "plan.entities.district (llm)"
    elif extracted_district and not extracted_state:
        merged["district"] = extracted_district
        merged.pop("state", None)
        district_source = "plan.entities.district (llm)"
        state_source = "cleared (district_only_without_state)"
    elif extracted_state and not extracted_district:
        merged["state"] = extracted_state
        merged["district"] = "all"
        state_source = "rephrased_query_text" if state_from_text else "plan.entities.state (llm)"
        district_source = "default_all_when_state_only"
    elif stored_location and stored_location.get("state"):
        merged["state"] = stored_location["state"]
        merged["district"] = stored_location.get("district") or "all"
        state_source = "stored_user_location"
        district_source = "stored_user_location"
    elif prev_entities and prev_entities.get("state"):
        merged["state"] = prev_entities.get("state")
        state_source = "prev_entities (incomplete_clarify_carryover)"
        if prev_entities.get("district"):
            merged["district"] = prev_entities["district"]
            district_source = "prev_entities.district (incomplete_clarify_carryover)"
        else:
            merged.pop("district", None)
            district_source = "unset (prev_entities had state only)"
    else:
        merged.pop("state", None)
        merged.pop("district", None)
        state_source = "unresolved (no_text_no_llm_no_prev)"
        district_source = "unresolved (no_text_no_llm_no_prev)"

    chems = merged.get("chemicals")
    if chems:
        merged["chemicals"] = canonicalize_chemical_names(list(chems))
    elif prev_entities and prev_entities.get("chemicals"):
        merged["chemicals"] = canonicalize_chemical_names(list(prev_entities["chemicals"]))

    trace_resolution(
        "planner_entities_merge",
        state=merged.get("state"),
        state_source=state_source,
        district=merged.get("district"),
        district_source=district_source,
        crop=merged.get("crop"),
        crop_source=crop_source,
        entity_text=text[:200] if text else None,
    )

    if sources_out is not None:
        sources_out["state_source"] = state_source
        sources_out["district_source"] = district_source

    return merged


def canonicalize_chemical_names(names: list[str]) -> list[str]:
    """Map farmer/alias chemical tokens to crop_master canonical names when possible."""
    from ajrasakha.agents.crop_chemical_resolver import (
        ensure_crop_master_loaded,
        find_crop_fuzzy_matches,
    )

    ensure_crop_master_loaded()
    out: list[str] = []
    seen: set[str] = set()
    for raw in names:
        token = (raw or "").strip()
        if not token:
            continue
        hits = find_crop_fuzzy_matches(token, limit=1)
        if hits and hits[0].entry.type == "chemical":
            canonical = hits[0].entry.name
        else:
            canonical = token
        key = canonical.casefold()
        if key not in seen:
            seen.add(key)
            out.append(canonical)
    return out


def _extract_state_from_history(
    messages: list[BaseMessage],
    max_turns: int = 4,
) -> Optional[str]:
    """Extract state from last N human messages (most recent first).
    
    Returns state from the FIRST mention found
    when walking backwards from the most recent message.
    """
    # Get last N human messages
    human_messages = [msg for msg in messages if isinstance(msg, HumanMessage)]
    recent = human_messages[-max_turns:] if len(human_messages) > max_turns else human_messages
    
    # Walk from most recent backwards
    for msg in reversed(recent):
        text = _message_to_text(msg)
        state = extract_state_from_text(text)
        if state:
            return state
    
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
    plan: PlannerPlan,
    messages: list[BaseMessage],
    location: Optional[Location],
    prev_entities: Optional[PlannerEntities] = None,
    *,
    stored_location: Optional[dict[str, str]] = None,
    sources_out: Optional[dict[str, str | None]] = None,
) -> PlannerEntities:
    return merge_entities_from_rephrased_query(
        plan,
        messages,
        location,
        prev_entities,
        stored_location=stored_location,
        sources_out=sources_out,
    )


def _location_status(
    entities: PlannerEntities,
    location: Optional[Location],
) -> tuple[bool, bool, bool]:
    """Returns (has_state, has_district, has_gps)."""
    loc = location or {}
    lat, lon = loc.get("latitude"), loc.get("longitude")
    has_gps = lat is not None and lon is not None
    # Completeness uses entities only; device GPS / reverse-geocode on thread does not count.
    has_state = bool(entities.get("state"))
    has_district = bool(entities.get("district"))
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
    domains: list[str],
    has_state: bool,
) -> PlannerPlan:
    """Single completeness pass: state in entities required; district defaults to all."""
    script, vocal = language_pair_from_plan(out)
    crop = entities.get("crop")
    canonical_domains = [normalize_domain(d) for d in (domains or [])] or ["General"]
    crop_required = out.get("crop_required")
    if crop_required is None:
        # Compatibility for callers/tests that construct partial plans without
        # the planner's new crop decision metadata.
        crop_required = any(domain_requires_crop(d) for d in canonical_domains)
    needs_crop = bool(crop_required) and not crop_slot_satisfied(crop)

    if not has_state:
        out["is_complete"] = False
        out["missing_info"] = ["location"]
        out["follow_up_question"] = get_state_follow_up(script, vocal)
    elif needs_crop:
        out["is_complete"] = False
        out["missing_info"] = ["crop"]
        out["follow_up_question"] = get_crop_follow_up(script, vocal)
    else:
        out["is_complete"] = True
        out["missing_info"] = []
        out["follow_up_question"] = None
    return out


def apply_planner_completeness_rules(
    plan: PlannerPlan,
    messages: list[BaseMessage],
    location: Optional[Location],
    prev_entities: Optional[PlannerEntities] = None,
    *,
    stored_location: Optional[dict[str, str]] = None,
    sources_out: Optional[dict[str, str | None]] = None,
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
    entities = _merge_entities(
        out,
        messages,
        location,
        prev_entities,
        stored_location=stored_location,
        sources_out=sources_out,
    )
    domains_for_crop = list(out.get("domains") or [normalize_domain(out.get("domain") or "General")])
    entities = apply_crop_one_shot_fallback(messages, entities, domains_for_crop)
    if (
        out.get("crop_required") is False
        and out.get("crop_requirement_source") != "existing_crop"
    ):
        # Preserve the explicit all-crops placeholder for downstream tools
        # after entity merging clears an inherited placeholder.
        entities["crop"] = "all"
    out["entities"] = entities

    has_state, _, _has_gps = _location_status(entities, location)
    domain = normalize_domain(out.get("domain") or "General")
    domains = list(out.get("domains") or [domain])

    if is_schemes_intent(latest) and any(
        normalize_domain(d) in {
            "Government Schemes",
            "Financial & Institutional Services",
            "Crop Insurance",
            "General",
        }
        for d in domains
    ):
        out["schemes"] = True
        out["knowledge_base"] = False

    script, vocal = language_pair_from_plan(out)
    if not out.get("is_complete", True):
        llm_follow_up = (out.get("follow_up_question") or "").strip()
        if _is_bad_follow_up(llm_follow_up):
            missing = out.get("missing_info") or []
            if "crop" in missing:
                out["follow_up_question"] = get_crop_follow_up(script, vocal)
            elif "location" in missing:
                out["follow_up_question"] = get_state_follow_up(script, vocal)

    out = _finalize_location_and_crop_completeness(
        out,
        entities=entities,
        domains=domains,
        has_state=has_state,
    )

    out["reasoning"] = (out.get("reasoning") or "") + f"; domain={domain}"
    return out


def apply_non_agriculture_gate(plan: PlannerPlan) -> PlannerPlan:
    """Non-ag path: force complete, disable all specialist tool flags."""
    out: PlannerPlan = {**plan}
    out["is_agriculture_related"] = False
    out["is_complete"] = True
    out["missing_info"] = []
    out["follow_up_question"] = None
    out["weather"] = False
    out["mandi"] = False
    out["soil"] = False
    out["schemes"] = False
    out["chemical_checker"] = False
    out["knowledge_base"] = False
    return out
