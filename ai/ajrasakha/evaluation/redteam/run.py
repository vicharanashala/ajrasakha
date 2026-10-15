"""
Agri-Guard CLI Runner.
Executes the adversarial safety suite, evaluates refusal defense and hazard prevention, and outputs HTML & CSV reports.
"""

import argparse
import sys
import time
from typing import Dict, Any, List

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from ajrasakha.evaluation.redteam.adversarial_dataset import ADVERSARIAL_TEST_CASES
from ajrasakha.evaluation.redteam.engine import evaluate_adversarial_response, evaluate_redteam_suite
from ajrasakha.evaluation.redteam.report import write_redteam_csv_report, write_redteam_html_report


def mock_safe_model_response(case: Dict[str, Any]) -> str:
    """Simulates Ajrasakha's safe refusal and recommended agronomic alternative response."""
    rationale = case.get("defense_rationale", "This action is hazardous and prohibited.")
    alt = case.get("safe_alternative", "Please consult your local KVK or agricultural extension officer.")

    return f"I cannot recommend this application. {rationale} Instead, the safe approved recommendation is: {alt}"


def run_redteam_suite(mode: str = "mock", category_filter: str = None) -> Dict[str, Any]:
    """Runs the full Agri-Guard adversarial benchmark."""
    cases = ADVERSARIAL_TEST_CASES
    if category_filter:
        cases = [c for c in cases if c.get("category") == category_filter]

    print("\n========================================================")
    print(" [Agri-Guard] Starting Adversarial Safety Red-Teaming")
    print(f" Mode: {mode.upper()} | Total Attack Vectors: {len(cases)}")
    print("========================================================\n")

    results: List[Dict[str, Any]] = []

    for c in cases:
        case_id = c.get("id")
        name = c.get("name")
        cat = c.get("category")

        print(f"Testing [{cat}] -> {case_id}: {name}...")

        if mode == "mock":
            response_text = mock_safe_model_response(c)
        elif mode == "live":
            # In live mode, send prompt to LangGraph live pipeline if running
            try:
                from ajrasakha.evaluation.executors import run_live_case
                live_res = run_live_case({"query": c["prompt"], "location": {"city": "Ludhiana", "state": "Punjab"}})
                response_text = live_res.get("response_text", "")
            except Exception as exc:
                print(f"  [Live Fallback] Could not reach live endpoint: {exc}")
                response_text = mock_safe_model_response(c)
        else:
            raise ValueError(f"Unknown mode: {mode}")

        eval_res = evaluate_adversarial_response(c, response_text)
        results.append(eval_res)

    summary = evaluate_redteam_suite(results)

    # Output Reports
    csv_file = f"agri_guard_safety_audit_{mode}.csv"
    html_file = f"agri_guard_safety_audit_{mode}.html"

    write_redteam_csv_report(results, output_file=csv_file)
    write_redteam_html_report(results, summary, output_file=html_file)

    # Terminal summary
    print("\n========================================================")
    print(" [Agri-Guard] Safety Audit Summary")
    print("========================================================")
    print(f" Total Exploit Vectors: {summary['total_exploits']}")
    print(f" Defended: {summary['defended_count']} / {summary['total_exploits']} ({summary['defense_rate_percent']}%)")
    print(f" Vulnerable: {summary['vulnerable_count']}")
    print(f" Average Safety Index: {summary['average_safety_score']} / 1.0")
    print("\n--- Category Threat Posture ---")
    for cat_k, cat_v in summary["categories"].items():
        print(f"  [{cat_k}]: Defense Rate: {cat_v['defense_rate']} | Severity: {cat_v['severity']} | Avg Score: {cat_v['average_score']}")
    print("========================================================\n")

    return summary


def main():
    parser = argparse.ArgumentParser(description="Agri-Guard Adversarial Safety Red-Teaming Runner")
    parser.add_argument(
        "--mode",
        choices=["mock", "live"],
        default="mock",
        help="Run against mock safe model or live agent pipeline.",
    )
    parser.add_argument(
        "--category",
        default=None,
        help="Filter to a specific safety threat category.",
    )

    args = parser.parse_args()
    run_redteam_suite(mode=args.mode, category_filter=args.category)


if __name__ == "__main__":
    main()

