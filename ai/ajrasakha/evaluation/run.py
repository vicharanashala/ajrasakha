import argparse
import logging
import time

from ajrasakha.evaluation.questions import TEST_CASES
from ajrasakha.evaluation.executors import run_mock_case, run_live_case
from ajrasakha.evaluation.tech import evaluate_technical
from ajrasakha.evaluation.failure import classify_failure
from ajrasakha.evaluation.report import write_csv_report
from ajrasakha.evaluation.routing import evaluate_routing
from ajrasakha.evaluation.trace import extract_trace_summary
from ajrasakha.evaluation.tool import evaluate_tools
from ajrasakha.evaluation.summary import build_summary
from ajrasakha.evaluation.triage import triage_result
from ajrasakha.evaluation.nodes import evaluate_nodes
from ajrasakha.evaluation.plan import evaluate_plan
from ajrasakha.evaluation.answer_eval import evaluate_response_quality
from ajrasakha.evaluation.validators.source_check import evaluate_source_attribution
from ajrasakha.evaluation.validators.disclaimer_language import evaluate_disclaimer_language
from ajrasakha.evaluation.langsmith_trace import build_langsmith_trace_url

logger = logging.getLogger(__name__)


def run_case(case: dict, mode: str) -> dict:
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
    langsmith_trace_result = build_langsmith_trace_url(result)
    disclaimer_language_result = evaluate_disclaimer_language(result, case)

    quality_result = evaluate_response_quality(
        result,
        enabled=(mode == "live"),
    )

    combined = {
        **result,
        **technical_result,
        **routing_result,
        **tool_result,
        **trace_result,
        **node_result,
        **plan_result,
        **quality_result,
        **source_result,
        **langsmith_trace_result,
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
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

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
        "--single",
        action="store_true",
        help="Run only the first test case as a single-case smoke test.",
    )

    args = parser.parse_args()

    selected_cases = TEST_CASES

    if args.stable_only:
        selected_cases = [
            case for case in TEST_CASES
            if case.get("stable") is True
        ]

    if args.single and selected_cases:
        selected_cases = [selected_cases[0]]

    results = []
    total_cases = len(selected_cases)

    for idx, case in enumerate(selected_cases):
        case_name = case.get("name")
        print(f"\n=======================================================")
        print(f"Running [{args.mode}] ({idx + 1}/{total_cases}): {case_name}")
        print(f"Query: \"{case.get('query')}\"")
        print(f"=======================================================")

        res = run_case(case, args.mode)
        results.append(res)

        # 10s cooldown between live cases to respect RPM limits across all roles
        if args.mode == "live" and idx < total_cases - 1:
            print("Cooldown: sleeping 10s before next case...")
            time.sleep(10)

    output_file = f"evaluation_report_{args.mode}.csv"
    write_csv_report(results, output_file=output_file)
    summary = build_summary(results)
    print("\nSummary:", summary)


if __name__ == "__main__":
    main()