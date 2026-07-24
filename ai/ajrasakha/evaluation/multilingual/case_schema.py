"""Case schema for the AjraSakha Multilingual Testing Suite.

v2 — Step 007/008/010/011/012/013 additions
- domain_group: "weather" | "pest" | "schemes" | "soil" | "market"
- disclaimer_mode: "required" | "forbidden" | "optional"
- query_translation_source: "data_artifact" | "en_fallback"
- expected_gdb_no_match: bool — True for scenarios expected to return no GDB result
- expected_gdb_id: Optional[str] = None — real GDB fingerprint when available (BLOCKED if None)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class CaseStatus(str, Enum):
    """Outcome vocabulary — every result MUST use exactly one of these."""
    PASS = "PASS"
    FAIL = "FAIL"
    ERROR = "ERROR"
    BLOCKED = "BLOCKED"
    SKIPPED = "SKIPPED"


@dataclass
class TerminologyAssertion:
    """A single agri-term expected in the response (case-insensitive substring)."""
    term: str
    description: str  # Human-readable explanation for the report
    # If True, the term must be absent (banned term check)
    must_be_absent: bool = False


@dataclass(frozen=True)
class MultilingualCase:
    """One executable test case — generated deterministically from scenario × language.

    Field contract
    --------------
    case_id             Stable ID, e.g. "ML-S01-EN". Never changes once set.
    scenario_id         Parent canonical scenario, e.g. "S01".
    language_code       Two-letter code, e.g. "HI", "KN", "EN".
    domain              Canonical domain from domains.py ALLOWED_DOMAINS.
    domain_group        "weather" | "pest" | "schemes" | "soil" | "market"
    query               The query string sent to the agent (English for mock mode).
    query_translation_source "data_artifact" | "en_fallback"
    location            Optional location dict passed to the agent.
    expected_script     Script name matching SCRIPT_PATTERNS keys.
    expected_vocal      Vocal language name matching translation catalog.
    expected_catalog_script  Script column value in the catalog (e.g. "Devanagari").
    expected_tools      Tool names the planner must invoke.
    expected_nodes      LangGraph node names expected in the trace.
    expected_plan       Dict of plan keys → expected values.
    disclaimer_mode     "required" | "forbidden" | "optional"
    disclaimer_2hr_required  Whether a 2-hour disclaimer must appear.
    expected_testing_disclaimer  Exact string from catalog (populated at generation).
    expected_2hr_disclaimer      Exact string from catalog (populated at generation).
    expected_gdb_no_match    True if GDB expected to return no result
    terminology_assertions  Agri terms to assert in response.
    stable              False if response contains live dynamic data (weather/market).
    translation_review_status  "draft_pending_agri_validation" until validated.
    translation_reviewer       Name/ID of human reviewer (null until validated).
    provenance          Metadata: how this case was generated.
    expected_gdb_id     Real GDB fingerprint; None = BLOCKED (no fingerprint yet).
    """

    case_id: str
    scenario_id: str
    language_code: str
    domain: str
    domain_group: str
    query: str
    query_translation_source: str
    location: Optional[dict]
    expected_script: str
    expected_vocal: str
    expected_catalog_script: str
    expected_tools: tuple[str, ...]
    expected_nodes: tuple[str, ...]
    expected_plan: dict
    disclaimer_mode: str
    disclaimer_2hr_required: bool
    expected_testing_disclaimer: str
    expected_2hr_disclaimer: str
    expected_gdb_no_match: bool
    terminology_assertions: tuple[TerminologyAssertion, ...]
    stable: bool
    translation_review_status: str = "draft_pending_agri_validation"
    translation_reviewer: Optional[str] = None
    provenance: dict = field(default_factory=dict)
    expected_gdb_id: Optional[str] = None

    def to_legacy_dict(self) -> dict:
        """Convert to the dict format expected by the existing run_case() evaluators."""
        return {
            "name": self.case_id,
            "query": self.query,
            "location": self.location,
            "expected_domain": self.domain,
            "expected_tools": list(self.expected_tools),
            "expected_nodes": list(self.expected_nodes),
            "expected_plan": self.expected_plan,
            "stable": self.stable,
            # Disclaimer fields consumed by evaluate_disclaimer_language()
            "expected_testing_disclaimer": self.expected_testing_disclaimer,
            "expected_2hr_disclaimer": self.expected_2hr_disclaimer,
            "expect_2hr_disclaimer": self.disclaimer_2hr_required,
            "two_hour_disclaimer": self.expected_2hr_disclaimer,
            "testing_disclaimer": self.expected_testing_disclaimer,
            "vocal_language": self.expected_vocal,
            # Multilingual-specific metadata
            "language_code": self.language_code,
            "scenario_id": self.scenario_id,
            "expected_script": self.expected_script,
            "translation_review_status": self.translation_review_status,
            "translation_reviewer": self.translation_reviewer,
        }


@dataclass
class CaseResult:
    """Full evaluation result for one MultilingualCase."""
    case: MultilingualCase

    # ── technical ──────────────────────────────────────────────────────────
    status: CaseStatus = CaseStatus.BLOCKED
    http_status: Optional[int] = None
    graph_status: str = ""
    latency_seconds: float = 0.0
    error: str = ""

    # ── routing / plan ─────────────────────────────────────────────────────
    routing_pass: Optional[bool] = None
    plan_pass: Optional[bool] = None
    plan_reason: str = ""

    # ── language ───────────────────────────────────────────────────────────
    language_pass: Optional[bool] = None
    language_reason: str = ""

    # ── disclaimer ─────────────────────────────────────────────────────────
    testing_disclaimer_present: Optional[bool] = None
    testing_disclaimer_at_bottom: Optional[bool] = None
    two_hr_disclaimer_present: Optional[bool] = None
    two_hr_disclaimer_forbidden_violated: Optional[bool] = None
    disclaimer_pass: Optional[bool] = None
    disclaimer_reason: str = ""

    # ── language switch ────────────────────────────────────────────────────
    lang_switch_detected: Optional[bool] = None
    lang_switch_reason: str = ""

    # ── terminology ────────────────────────────────────────────────────────
    terminology_pass: Optional[bool] = None
    terminology_reason: str = ""

    # ── source attribution ─────────────────────────────────────────────────
    source_attribution_pass: Optional[bool] = None
    source_attribution_reason: str = ""

    # ── translation review ─────────────────────────────────────────────────
    translation_review_status: str = "draft_pending_agri_validation"

    # ── raw response ───────────────────────────────────────────────────────
    response_text: str = ""

    def to_row(self) -> dict:
        """Flatten to a CSV/report row."""
        c = self.case
        return {
            "case_id": c.case_id,
            "scenario_id": c.scenario_id,
            "language_code": c.language_code,
            "domain": c.domain,
            "query": c.query,
            "expected_vocal": c.expected_vocal,
            "expected_script": c.expected_script,
            "stable": c.stable,
            "translation_review_status": c.translation_review_status,
            "translation_reviewer": c.translation_reviewer or "",
            # results
            "status": self.status.value,
            "http_status": self.http_status or "",
            "graph_status": self.graph_status,
            "latency_seconds": self.latency_seconds,
            "error": self.error[:300] if self.error else "",
            "routing_pass": _fmt(self.routing_pass),
            "plan_pass": _fmt(self.plan_pass),
            "plan_reason": self.plan_reason,
            "language_pass": _fmt(self.language_pass),
            "language_reason": self.language_reason,
            "testing_disclaimer_present": _fmt(self.testing_disclaimer_present),
            "testing_disclaimer_at_bottom": _fmt(self.testing_disclaimer_at_bottom),
            "two_hr_disclaimer_present": _fmt(self.two_hr_disclaimer_present),
            "disclaimer_pass": _fmt(self.disclaimer_pass),
            "disclaimer_reason": self.disclaimer_reason,
            "lang_switch_detected": _fmt(self.lang_switch_detected),
            "lang_switch_reason": self.lang_switch_reason,
            "terminology_pass": _fmt(self.terminology_pass),
            "terminology_reason": self.terminology_reason,
            "source_attribution_pass": _fmt(self.source_attribution_pass),
            "source_attribution_reason": self.source_attribution_reason,
            "response_text": self.response_text[:300] if self.response_text else "",
        }


def _fmt(v: Optional[bool]) -> str:
    if v is None:
        return ""
    return "True" if v else "False"
