"""Evidence-based recommendation generator.

Analyzes the Language Quality Matrix summary and CaseResult list to
produce prioritized, actionable recommendations. All recommendations are
derived from actual test evidence — no fabricated scores.

Recommendation categories:
  CRITICAL   Systemic failure (>50% FAIL/ERROR in a language or domain)
  HIGH       Notable failure rate (>20% FAIL/ERROR)
  MEDIUM     Isolated failures worth investigating
  INFO       Informational observations (e.g. pending review status)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from ajrasakha.evaluation.multilingual.case_schema import CaseResult, CaseStatus


Priority = Literal["CRITICAL", "HIGH", "MEDIUM", "INFO"]


@dataclass
class Recommendation:
    priority: Priority
    category: str
    finding: str
    recommendation: str
    evidence: str  # Brief evidence from test data (no fabrication)


def generate_recommendations(
    results: list[CaseResult],
    summary: dict,
) -> list[Recommendation]:
    """Analyze results and produce an evidence-based recommendation list.

    Never fabricates scores or invents failures. Only reports what the
    test data shows.
    """
    recs: list[Recommendation] = []

    # ── 1. Translation review pending ─────────────────────────────────────
    pending = [r for r in results if r.case.translation_review_status == "pending"]
    if pending:
        recs.append(Recommendation(
            priority="HIGH",
            category="Translation Review",
            finding=f"{len(pending)} cases have translation_review_status='pending'",
            recommendation=(
                "Assign agri-team reviewers to validate disclaimer and terminology "
                "translations for each of the 6 target languages. "
                "Update case.translation_reviewer and case.translation_review_status "
                "upon sign-off."
            ),
            evidence=f"{len(pending)}/{len(results)} cases pending review",
        ))

    # ── 2. Per-language pass rate ──────────────────────────────────────────
    per_lang = summary.get("per_language", {})
    for lang_code, stats in per_lang.items():
        total = stats.get("total", 0)
        passes = stats.get("pass", 0)
        rate = stats.get("rate", 1.0)
        fail_rate = 1.0 - rate

        if total == 0:
            continue

        if fail_rate > 0.50:
            recs.append(Recommendation(
                priority="CRITICAL",
                category="Language Quality",
                finding=(
                    f"Language {lang_code}: {passes}/{total} pass "
                    f"({rate:.0%} pass rate) — CRITICAL failure rate"
                ),
                recommendation=(
                    f"Investigate all FAIL/ERROR cases for {lang_code}. "
                    "Check translation catalog entries, script pattern detection, "
                    "and disclaimer placement for this language."
                ),
                evidence=f"{lang_code}: {passes} PASS / {total} eligible",
            ))
        elif fail_rate > 0.20:
            recs.append(Recommendation(
                priority="HIGH",
                category="Language Quality",
                finding=(
                    f"Language {lang_code}: {passes}/{total} pass "
                    f"({rate:.0%} pass rate)"
                ),
                recommendation=(
                    f"Review FAIL cases for {lang_code}. "
                    "Focus on disclaimer validation and language detection."
                ),
                evidence=f"{lang_code}: {passes} PASS / {total} eligible",
            ))
        elif fail_rate > 0.0:
            recs.append(Recommendation(
                priority="MEDIUM",
                category="Language Quality",
                finding=(
                    f"Language {lang_code}: {passes}/{total} pass "
                    f"({rate:.0%} pass rate) — some failures"
                ),
                recommendation=(
                    f"Investigate specific FAIL cases for {lang_code}."
                ),
                evidence=f"{lang_code}: {passes} PASS / {total} eligible",
            ))

    # ── 3. Disclaimer failures ─────────────────────────────────────────────
    disclaimer_fails = [
        r for r in results
        if r.disclaimer_pass is False
    ]
    if disclaimer_fails:
        lang_counts: dict[str, int] = {}
        for r in disclaimer_fails:
            lang_counts[r.case.language_code] = lang_counts.get(r.case.language_code, 0) + 1

        affected_langs = sorted(lang_counts, key=lambda k: -lang_counts[k])
        recs.append(Recommendation(
            priority="HIGH" if len(disclaimer_fails) > 3 else "MEDIUM",
            category="Disclaimer Validation",
            finding=(
                f"{len(disclaimer_fails)} cases failed disclaimer checks "
                f"(languages: {', '.join(affected_langs)})"
            ),
            recommendation=(
                "Verify that the translation catalog entries for "
                "testing_disclaimer and two_hour_disclaimer exactly match "
                "what the agent appends to responses. "
                "Ensure agent uses catalog strings, not hardcoded English."
            ),
            evidence=(
                f"Disclaimer fails: {', '.join(f'{k}={v}' for k, v in lang_counts.items())}"
            ),
        ))

    # ── 4. Language switch detections ─────────────────────────────────────
    switch_detections = [
        r for r in results
        if r.lang_switch_detected is True
    ]
    if switch_detections:
        recs.append(Recommendation(
            priority="HIGH",
            category="Language Consistency",
            finding=(
                f"{len(switch_detections)} cases show potential mid-answer "
                "language switching"
            ),
            recommendation=(
                "Review cases with lang_switch_detected=True. "
                "Check whether the translate_answer node is applying correctly. "
                "Verify that tool output formatters localize crop names and terms."
            ),
            evidence=(
                f"Affected cases: "
                f"{', '.join(r.case.case_id for r in switch_detections[:5])}"
                f"{'...' if len(switch_detections) > 5 else ''}"
            ),
        ))

    # ── 5. BLOCKED cases ──────────────────────────────────────────────────
    blocked = [r for r in results if r.status == CaseStatus.BLOCKED]
    if blocked:
        recs.append(Recommendation(
            priority="INFO",
            category="Configuration",
            finding=f"{len(blocked)} cases are BLOCKED (API not configured)",
            recommendation=(
                "Set LIVE_API_URL and ASSISTANT_ID environment variables "
                "and run with --mode live to execute these cases."
            ),
            evidence=f"{len(blocked)} BLOCKED out of {len(results)} total",
        ))

    # ── 6. ERROR cases ────────────────────────────────────────────────────
    errors = [r for r in results if r.status == CaseStatus.ERROR]
    if errors:
        recs.append(Recommendation(
            priority="HIGH",
            category="Test Stability",
            finding=f"{len(errors)} cases produced ERROR status",
            recommendation=(
                "Inspect error fields in the CSV report. "
                "Common causes: import errors, network timeouts, malformed responses."
            ),
            evidence=(
                f"First error: {errors[0].error[:200] if errors else 'n/a'}"
            ),
        ))

    # ── 7. Overall summary ────────────────────────────────────────────────
    total = summary.get("total_cases", 0)
    passed = summary.get("pass_count", 0)
    pass_rate = summary.get("pass_rate", 0.0)

    if total > 0:
        recs.append(Recommendation(
            priority="INFO",
            category="Overall",
            finding=f"Overall pass rate: {passed}/{total} ({pass_rate:.0%})",
            recommendation=(
                "Track this metric across runs. "
                "A baseline pass rate in mock mode should be 100% (all fixtures pass). "
                "Live mode pass rate reflects real agent quality."
            ),
            evidence=f"total={total}, pass={passed}, rate={pass_rate:.2%}",
        ))

    # Sort by priority
    _priority_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "INFO": 3}
    recs.sort(key=lambda r: _priority_order.get(r.priority, 99))

    return recs


def format_recommendations_text(recs: list[Recommendation]) -> str:
    """Format recommendations as plain text for console output."""
    lines = ["=" * 72, "MULTILINGUAL TESTING RECOMMENDATIONS", "=" * 72]
    for i, rec in enumerate(recs, 1):
        lines.append(f"\n[{rec.priority}] {i}. {rec.category}")
        lines.append(f"  Finding:        {rec.finding}")
        lines.append(f"  Recommendation: {rec.recommendation}")
        lines.append(f"  Evidence:       {rec.evidence}")
    lines.append("=" * 72)
    return "\n".join(lines)
