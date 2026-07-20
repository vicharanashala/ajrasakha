"""Shared graph state types for AjraSakha."""

from __future__ import annotations

from typing import Annotated, Any, Optional

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

from ajrasakha.agents.location_context import merge_location_dict
from ajrasakha.agents.resolution_trace import trace_resolution


class Location(TypedDict, total=False):
    latitude: Optional[float]
    longitude: Optional[float]
    city: Optional[str]
    state: Optional[str]
    address: Optional[str]


class PlannerEntities(TypedDict, total=False):
    crop: Optional[str]
    state: Optional[str]
    district: Optional[str]
    chemicals: list[str]


class RetrievalSanitizerEvaluation(TypedDict, total=False):
    pair_key: str
    retrieved_question: str
    retrieved_answer: str
    relevance_score: Optional[float]
    reason: str
    action: str  # "kept" | "dropped" | "kept_fail_open"


class RetrievalSanitizerAudit(TypedDict, total=False):
    status: str  # filtered | skipped | noop
    skip_reason: str
    threshold: float
    farmer_query_original: str
    farmer_query_rephrased: str
    pairs_evaluated: int
    pairs_kept: int
    pairs_dropped: int
    evaluations: list[RetrievalSanitizerEvaluation]
    llm_parse_ok: bool


class GoldenClassificationEvaluation(TypedDict, total=False):
    question_id: str
    similarity_score: Optional[float]
    retrieved_question: str
    classification: str
    reason: str
    llm_parse_ok: bool
    action: str


class GoldenRetrievalAudit(TypedDict, total=False):
    status: str  # exact_bypass | selected | empty
    model: str
    evaluations: list[GoldenClassificationEvaluation]
    selected_question_id: Optional[str]
    selection_rule: str


class PlannerPlan(TypedDict, total=False):
    domain: Optional[str]
    domains: list[str]  # Canonical domains, ordered (max ~3)
    weather: bool
    mandi: bool
    soil: bool
    schemes: bool
    chemical_checker: bool
    knowledge_base: bool
    is_agriculture_related: bool
    is_greeting: bool
    is_complete: bool
    missing_info: list[str]
    follow_up_question: Optional[str]
    reasoning: Optional[str]
    entities: PlannerEntities
    skip_synthesize: bool
    rephrased_query: Optional[str]
    original_query_en: Optional[str]
    gdb_has_data: bool  # True when GDB returned exact or similar matches
    vocal_language: Optional[str]  # Spoken language from planner (OFFICIAL_LANGUAGES)
    script_language: Optional[str]  # Writing system from planner; use English for Latin/Roman
    farmer_language: Optional[str]  # Deprecated: use vocal_language + script_language
    translate_path: Optional[str]  # "empty_gdb" when from empty_gdb_reply; else synthesis path
    expert_queue: Optional[bool]  # Deprecated; use translate_path
    tools_used: list[str]  # List of tools used to generate answer (e.g. ["knowledge_base", "weather", "mandi"])


TRANSLATE_PATH_EMPTY_GDB = "empty_gdb"


def merge_plan(
    left: Optional[PlannerPlan],
    right: Optional[PlannerPlan],
) -> Optional[PlannerPlan]:
    if right is None:
        return left
    if left is None:
        return right
    # Planner sets ``reasoning`` every turn — treat as a full replacement so stale
    # checkpoint entities (e.g. GPS-derived state) do not leak via shallow merge.
    if right.get("reasoning") is not None:
        trace_resolution(
            "plan_replaced",
            old_entities=left.get("entities"),
            new_entities=right.get("entities"),
            plan_reasoning=right.get("reasoning"),
            is_greeting=right.get("is_greeting"),
            note="new planner turn replaces prior plan entirely",
        )
        return right
    merged = {**left, **right}
    trace_resolution(
        "plan_patched",
        old_entities=left.get("entities"),
        new_entities=merged.get("entities"),
        patched_keys=sorted(k for k in right if k != "entities"),
        note="partial plan update — entities kept from left unless right sets entities",
    )
    return merged


def replace_sanitizer_audit(
    left: Optional[RetrievalSanitizerAudit],
    right: Optional[RetrievalSanitizerAudit],
) -> Optional[RetrievalSanitizerAudit]:
    """Per-turn sanitizer report for LangGraph Studio (shown at state root)."""
    if right is None:
        return left
    return right


def replace_golden_retrieval_audit(
    left: Optional[GoldenRetrievalAudit],
    right: Optional[GoldenRetrievalAudit],
) -> Optional[GoldenRetrievalAudit]:
    """Per-turn Gemma classification audit from Golden API (curl /threads/.../state)."""
    if right is None:
        return left
    return right


class AjraSakhaState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    location: Annotated[Optional[Location], merge_location_dict]
    plan: Annotated[Optional[PlannerPlan], merge_plan]
    sanitizer_audit: Annotated[Optional[RetrievalSanitizerAudit], replace_sanitizer_audit]
    golden_retrieval_audit: Annotated[Optional[GoldenRetrievalAudit], replace_golden_retrieval_audit]
    short_answer: Optional[str]
    full_answer: Optional[str]
    answer_shortening_status: Optional[str]
