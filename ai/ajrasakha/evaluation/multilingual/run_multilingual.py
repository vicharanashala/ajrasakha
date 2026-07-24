"""CLI entry point for the AjraSakha Multilingual Testing Suite.

Usage
-----
# Mock mode (CI-safe, no credentials needed):
uv run python -m ajrasakha.evaluation.multilingual.run_multilingual --mode mock

# Live mode (requires LIVE_API_URL and ASSISTANT_ID in environment):
uv run python -m ajrasakha.evaluation.multilingual.run_multilingual --mode live

# Stable cases only (excludes weather/market scenarios):
uv run python -m ajrasakha.evaluation.multilingual.run_multilingual --mode mock --stable-only

# Specific languages:
uv run python -m ajrasakha.evaluation.multilingual.run_multilingual --mode mock --languages EN HI

# Specific scenarios:
uv run python -m ajrasakha.evaluation.multilingual.run_multilingual --mode mock --scenarios S01 S02

Architecture
-----------
- Mock mode: uses deterministic fixture responses (no API calls).
- Live mode: calls the existing run_live_case() executor for each case.
- All validators are deterministic and run in both modes.
- DeepEval evaluators are skipped (not called) — they remain opt-in via
  the existing evaluation/deepeval_metrics.py if needed in future.
- Outputs: CSV (flat rows), Language Quality Matrix CSV, HTML report.

Security
--------
- Does not print, log, or write any secrets or credentials.
- Does not write responses to files in live mode beyond the CSV report.
- Reports are named with mode and timestamp to avoid overwriting.
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
import time
from datetime import datetime
from pathlib import Path

# Allow running from ai/ directory
_AI_ROOT = Path(__file__).resolve().parents[4]
if str(_AI_ROOT) not in sys.path:
    sys.path.insert(0, str(_AI_ROOT))

from dotenv import load_dotenv
load_dotenv()

from ajrasakha.evaluation.multilingual.case_generator import generate_cases
from ajrasakha.evaluation.multilingual.case_schema import CaseResult, CaseStatus
from ajrasakha.evaluation.multilingual.fixtures.mock_responses import (
    build_mock_response,
    build_blocked_response,
)
from ajrasakha.evaluation.multilingual.validators.language_match import validate_language_match
from ajrasakha.evaluation.multilingual.validators.disclaimer_check import validate_disclaimer
from ajrasakha.evaluation.multilingual.validators.lang_switch import validate_lang_switch
from ajrasakha.evaluation.multilingual.validators.terminology import validate_terminology
from ajrasakha.evaluation.multilingual.validators.deepeval_multilingual import evaluate_deepeval
from ajrasakha.evaluation.multilingual.reporters.matrix import (
    build_matrix,
    matrix_summary,
    write_matrix_csv,
)
from ajrasakha.evaluation.multilingual.reporters.recommendations import (
    generate_recommendations,
    format_recommendations_text,
)
from ajrasakha.evaluation.multilingual.reporters.html_report import write_html_report

# Existing evaluators (reused, not duplicated)
from ajrasakha.evaluation.executors import run_live_case
from ajrasakha.evaluation.validators.source_check import evaluate_source_attribution
from ajrasakha.evaluation.routing import evaluate_routing
from ajrasakha.evaluation.plan import evaluate_plan
from ajrasakha.evaluation.tech import evaluate_technical


def _run_single_case(case, mode: str) -> CaseResult:
    """Execute one multilingual case and return a populated CaseResult."""
    result = CaseResult(case=case)

    # ── Early exit: missing translation sentinel ─────────────────────────────────
    # The case generator sets query to "MISSING_TRANSLATION" when no Indic
    # translation is present in the data artifact. We must NOT run this case
    # against the live system or treat it as a language failure.
    if case.query_translation_source == "missing_translation":
        result.status = CaseStatus.SKIPPED_MISSING_TRANSLATION
        result.error = (
            f"No {case.expected_vocal} translation present in data artifact for "
            f"scenario {case.scenario_id}. Case excluded from quality matrix denominator."
        )
        return result

    try:
        # ── Step 1: Get raw response ──────────────────────────────────────
        if mode == "mock":
            raw = build_mock_response(case)
        elif mode == "live":
            live_api = os.getenv("LIVE_API_URL", "")
            if not live_api:
                raw = build_blocked_response(case, reason="LIVE_API_URL not configured")
                result.status = CaseStatus.BLOCKED
                result.error = "LIVE_API_URL not configured"
                return result
            raw = run_live_case(case.to_legacy_dict())
        else:
            raise ValueError(f"Unsupported mode: {mode}")

        # ── Step 2: Extract basics ────────────────────────────────────────
        result.http_status = raw.get("http_status")
        result.graph_status = raw.get("graph_status", "")
        result.latency_seconds = raw.get("latency_seconds", 0.0)
        result.error = raw.get("error", "")
        result.response_text = raw.get("response_text", "")

        graph_ok = result.graph_status == "success"
        http_ok = result.http_status == 200

        if result.graph_status == "blocked":
            result.status = CaseStatus.BLOCKED
            return result

        # ── Step 3: Technical check ───────────────────────────────────────
        tech = evaluate_technical(raw, case.to_legacy_dict())
        if not tech.get("technical_pass", False) and mode == "live":
            result.status = CaseStatus.ERROR
            return result

        # ── Step 4: Routing check ─────────────────────────────────────────
        routing = evaluate_routing(raw, case.to_legacy_dict())
        result.routing_pass = routing.get("routing_pass")

        # ── Step 5: Plan check ────────────────────────────────────────────
        plan = evaluate_plan(raw, case.to_legacy_dict())
        result.plan_pass = plan.get("plan_pass")
        result.plan_reason = plan.get("plan_reason", "")

        # ── Step 6: Source attribution ────────────────────────────────────
        src = evaluate_source_attribution(raw, case.to_legacy_dict())
        result.source_attribution_pass = src.get("source_attribution_pass", True)
        result.source_attribution_reason = src.get("source_attribution_reason", "")

        # ── Step 7: Language match (deterministic) ─────────────────────────
        lang = validate_language_match(result.response_text, case)
        result.language_pass = lang.get("language_pass", False)
        result.language_reason = lang.get("language_reason", "")

        # ── Step 8: Disclaimer check (deterministic) ──────────────────────
        disc = validate_disclaimer(result.response_text, case)
        result.disclaimer_pass = disc.get("disclaimer_pass", False)
        result.disclaimer_reason = disc.get("disclaimer_reason", "")
        result.testing_disclaimer_present = disc.get("testing_disclaimer_present")
        result.testing_disclaimer_at_bottom = disc.get("testing_disclaimer_at_bottom")
        result.two_hr_disclaimer_present = disc.get("two_hr_disclaimer_present")

        # ── Step 9: Language switch check (deterministic) ─────────────────
        sw = validate_lang_switch(result.response_text, case)
        result.lang_switch_detected = sw.get("lang_switch_detected", False)
        result.lang_switch_reason = sw.get("lang_switch_reason", "")

        # ── Step 10: Terminology check (deterministic) ────────────────────
        term = validate_terminology(result.response_text, case)
        result.terminology_pass = term.get("terminology_pass", True)
        result.terminology_reason = term.get("terminology_reason", "")

        # ── Step 11: DeepEval LLM judge (opt-in, credential-gated) ──────────
        # evaluate_deepeval() returns SKIPPED when the env flag is absent,
        # and BLOCKED when credentials are missing. Neither outcome fails
        # the test case — they are purely informational.
        deepeval = evaluate_deepeval(
            query=case.query,
            response_text=result.response_text,
        )
        result.deepeval_status = deepeval.get("deepeval_status", "SKIPPED")
        result.deepeval_answer_relevancy = deepeval.get("deepeval_answer_relevancy")
        result.deepeval_faithfulness = deepeval.get("deepeval_faithfulness")
        result.deepeval_reason = deepeval.get("deepeval_reason", "")

        # ── Step 12: Compute overall status ───────────────────────────────
        result.translation_review_status = case.translation_review_status

        all_pass = (
            (not result.language_pass is False)
            and (not result.disclaimer_pass is False)
            and (not result.lang_switch_detected)
            and (not result.terminology_pass is False)
        )

        if mode == "live" and not http_ok:
            result.status = CaseStatus.ERROR
        elif result.language_pass is False:
            result.status = CaseStatus.FAIL
        elif result.disclaimer_pass is False:
            result.status = CaseStatus.FAIL
        elif result.lang_switch_detected:
            result.status = CaseStatus.FAIL
        elif result.terminology_pass is False:
            result.status = CaseStatus.FAIL
        else:
            result.status = CaseStatus.PASS

    except Exception as exc:
        result.status = CaseStatus.ERROR
        result.error = repr(exc)[:500]

    return result


def write_csv_results(results: list[CaseResult], output_path: Path) -> None:
    """Write flat results CSV."""
    if not results:
        print("No results to write.")
        return
    output_path.parent.mkdir(parents=True, exist_ok=True)
    rows = [r.to_row() for r in results]
    fields = list(rows[0].keys())
    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Results CSV written to: {output_path.resolve()}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="AjraSakha Cross-lingual & Multilingual Testing Suite"
    )
    parser.add_argument(
        "--mode",
        choices=["mock", "live"],
        default="mock",
        help="Execution mode. Use 'mock' for CI; 'live' requires API credentials.",
    )
    parser.add_argument(
        "--stable-only",
        action="store_true",
        help="Run only stable cases (exclude weather/market dynamic scenarios).",
    )
    parser.add_argument(
        "--languages",
        nargs="*",
        metavar="CODE",
        help="Filter to specific language codes, e.g. --languages EN HI KN",
    )
    parser.add_argument(
        "--scenarios",
        nargs="*",
        metavar="ID",
        help="Filter to specific scenario IDs, e.g. --scenarios S01 S02",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("multilingual_reports"),
        help="Directory for output reports (default: multilingual_reports/)",
    )

    args = parser.parse_args()

    # ── Generate cases ────────────────────────────────────────────────────
    cases = generate_cases(
        scenario_ids=args.scenarios,
        language_codes=args.languages,
        stable_only=args.stable_only,
    )
    print(f"\nAjraSakha Multilingual Testing Suite — {args.mode.upper()} mode")
    print(f"Running {len(cases)} cases ({args.mode})")
    print("-" * 60)

    # ── Execute ───────────────────────────────────────────────────────────
    results: list[CaseResult] = []
    for i, case in enumerate(cases, 1):
        print(f"[{i:3d}/{len(cases)}] {case.case_id} ({case.expected_vocal})", end=" ... ")
        start = time.monotonic()
        r = _run_single_case(case, args.mode)
        elapsed = time.monotonic() - start
        print(f"{r.status.value} ({elapsed:.2f}s)")
        results.append(r)

    # ── Reports ───────────────────────────────────────────────────────────
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = args.output_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    # Flat CSV
    csv_path = out_dir / f"multilingual_results_{args.mode}_{ts}.csv"
    write_csv_results(results, csv_path)

    # Language Quality Matrix
    matrix = build_matrix(results)
    summary = matrix_summary(matrix)
    matrix_path = out_dir / f"multilingual_matrix_{args.mode}_{ts}.csv"
    write_matrix_csv(matrix, matrix_path, results=results)

    # Recommendations
    recs = generate_recommendations(results, summary)
    print(format_recommendations_text(recs))

    # HTML
    html_path = out_dir / f"multilingual_report_{args.mode}_{ts}.html"
    write_html_report(results, matrix, summary, recs, html_path, mode=args.mode)

    # ── Summary ───────────────────────────────────────────────────────────
    total = len(results)
    passed = sum(1 for r in results if r.status == CaseStatus.PASS)
    failed = sum(1 for r in results if r.status == CaseStatus.FAIL)
    errors = sum(1 for r in results if r.status == CaseStatus.ERROR)
    blocked = sum(1 for r in results if r.status == CaseStatus.BLOCKED)

    print("\n" + "=" * 60)
    print(f"MULTILINGUAL SUITE SUMMARY — {args.mode.upper()}")
    print(f"  Total:   {total}")
    print(f"  PASS:    {passed}")
    print(f"  FAIL:    {failed}")
    print(f"  ERROR:   {errors}")
    print(f"  BLOCKED: {blocked}")
    print(f"  Pass rate: {summary.get('pass_rate', 0):.1%}")
    print(f"  Worst language: {summary.get('worst_language', 'N/A')}")
    print(f"  Worst scenario: {summary.get('worst_scenario', 'N/A')}")
    print("=" * 60)

    # Exit code: non-zero if any FAIL or ERROR
    if failed > 0 or errors > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
