import argparse
import time
import uuid

from ajrasakha.evaluation.questions import TEST_CASES
from ajrasakha.evaluation.executors import run_mock_case, run_live_case
from ajrasakha.evaluation.tech import evaluate_technical
from ajrasakha.evaluation.failure import classify_failure
from ajrasakha.evaluation.report import write_csv_report
from ajrasakha.evaluation.routing import evaluate_routing
from ajrasakha.evaluation.trace import extract_trace_summary
from ajrasakha.evaluation.tool import evaluate_tools
from ajrasakha.evaluation.summary import build_summary, log_evaluation_to_postgres
from ajrasakha.evaluation.triage import triage_result
from ajrasakha.evaluation.nodes import evaluate_nodes
from ajrasakha.evaluation.plan import evaluate_plan
from ajrasakha.evaluation.answer_eval import evaluate_response_quality
from ajrasakha.evaluation.validators.source_check import evaluate_source_attribution
from ajrasakha.evaluation.validators.disclaimer_language import evaluate_disclaimer_language
from ajrasakha.evaluation.langsmith_trace import build_langsmith_trace_url
from ajrasakha.evaluation.html_report import write_html_dashboard


def run_case(case: dict, mode: str, eval_answers: bool = True) -> dict:
    if mode == "mock":
        result = run_mock_case(case)
    elif mode == "live":
        result = run_live_case(case)
    else:
        raise ValueError(f"Unsupported mode: {mode}")

    technical_result = evaluate_technical(result, case)
    routing_result = evaluate_routing(result, case)
    trace_result = extract_trace_summary(result)
    tool_result = evaluate_tools(result, case)
    source_result = evaluate_source_attribution(result, case)
    node_result = evaluate_nodes(result, case)
    plan_result = evaluate_plan(result, case)
    trace_result = build_langsmith_trace_url(result)
    disclaimer_language_result = evaluate_disclaimer_language(result, case)

    quality_result = evaluate_response_quality(
        result,
        case=case,
        enabled=eval_answers,
        mock=(mode == "mock"),
    )

    combined = {
        **result,
        "domain": case.get("domain", "gdb_queries"),
        "expected_output": case.get("expected_output", ""),
        **technical_result,
        **routing_result,
        **tool_result,
        **trace_result,
        **node_result,
        **plan_result,
        **quality_result,
        **source_result,
        **trace_result,
        **disclaimer_language_result,
    }

    failure_result = classify_failure(combined)
    triage_output = triage_result({**combined, **failure_result})

    final_result = {
        **combined,
        **failure_result,
        **triage_output,
    }

    final_result.pop("trace", None)

    return final_result


def main():
    start_time = time.time()
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--mode",
        choices=["mock", "live"],
        default="mock",
        help="Run evaluation in mock mode or live mode.",
    )

    parser.add_argument(
        "--stable-only",
        action="store_true",
        help="Run only stable test cases.",
    )

    parser.add_argument(
        "--eval-answers",
        action="store_true",
        default=True,
        help="Run DeepEval answer evaluation (Relevance, Faithfulness, GDB Match, Agricultural Correctness).",
    )

    parser.add_argument(
        "--no-eval-answers",
        dest="eval_answers",
        action="store_false",
        help="Disable DeepEval answer evaluation.",
    )

    parser.add_argument(
        "--db-log",
        action="store_true",
        default=True,
        help="Log evaluation run and domain scores to PostgreSQL.",
    )

    args = parser.parse_args()

    selected_cases = TEST_CASES

    if args.stable_only:
        selected_cases = [
            case for case in TEST_CASES
            if case.get("stable") is True
        ]

    results = []
    run_id = f"eval-run-{uuid.uuid4().hex[:12]}"

    print(f"\n========================================================")
    print(f" Starting Evaluation Suite [{run_id}] | Mode: {args.mode}")
    print(f" DeepEval Quality Metrics Enabled: {args.eval_answers}")
    print(f" Total Cases: {len(selected_cases)} | Stable Only: {args.stable_only}")
    print(f"========================================================\n")

    for case in selected_cases:
        print(f"Running [{args.mode}] [{case.get('domain', 'general')}]: {case.get('name')}")
        res = run_case(case, args.mode, eval_answers=args.eval_answers)
        results.append(res)

    output_file = f"evaluation_report_{args.mode}.csv"
    output_html_file = f"evaluation_dashboard_{args.mode}.html"
    write_csv_report(results, output_file=output_file)

    duration = round(time.time() - start_time, 2)
    summary = build_summary(results)
    write_html_dashboard(results, summary, output_file=output_html_file, run_id=run_id, mode=args.mode)

    print("\n========================================================")
    print(" Evaluation Run Summary")
    print("========================================================")
    print(f" Total Cases: {summary.get('total_cases')}")
    print(f" Technical Passed: {summary.get('technical_passed')}")
    print(f" Quality Passed: {summary.get('quality_passed')}")
    print(f" Duration: {duration}s")
    print("\n--- 6-Domain Breakdown ---")
    for d, d_stats in summary.get("domain_breakdown", {}).items():
        print(f"  [{d.upper()}]: Pass Rate: {d_stats['pass_rate']} | Rel: {d_stats['avg_relevance']} | Faith: {d_stats['avg_faithfulness']} | GDB: {d_stats['avg_gdb_match']} | Agri: {d_stats['avg_agri_correctness']} | Overall: {d_stats['overall_domain_score']}")
    print("========================================================\n")

    if args.db_log:
        log_evaluation_to_postgres(run_id, results, summary, duration=duration)


if __name__ == "__main__":
    main()
