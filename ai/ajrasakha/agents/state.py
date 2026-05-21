"""Shared graph state types for AjraSakha."""

from __future__ import annotations

from typing import Annotated, Any, Optional

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

from ajrasakha.agents.location_context import merge_location_dict


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


class PlannerPlan(TypedDict, total=False):
    weather: bool
    mandi: bool
    soil: bool
    schemes: bool
    chemical_checker: bool
    knowledge_base: bool
    is_complete: bool
    missing_info: list[str]
    follow_up_question: Optional[str]
    reasoning: Optional[str]
    entities: PlannerEntities
    skip_synthesize: bool
    rephrased_query: Optional[str]
    original_query_en: Optional[str]
    gdb_has_data: bool  # True when GDB returned exact or similar matches


def merge_plan(
    left: Optional[PlannerPlan],
    right: Optional[PlannerPlan],
) -> Optional[PlannerPlan]:
    if right is None:
        return left
    if left is None:
        return right
    return {**left, **right}


def replace_sanitizer_audit(
    left: Optional[RetrievalSanitizerAudit],
    right: Optional[RetrievalSanitizerAudit],
) -> Optional[RetrievalSanitizerAudit]:
    """Per-turn sanitizer report for LangGraph Studio (shown at state root)."""
    if right is None:
        return left
    return right


class AjraSakhaState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    location: Annotated[Optional[Location], merge_location_dict]
    plan: Annotated[Optional[PlannerPlan], merge_plan]
    sanitizer_audit: Annotated[Optional[RetrievalSanitizerAudit], replace_sanitizer_audit]
