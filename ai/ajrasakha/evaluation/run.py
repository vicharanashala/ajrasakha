import argparse

from ajrasakha.evaluation.questions import TEST_CASES
from ajrasakha.evaluation.multilingual_questions import MULTILINGUAL_TEST_CASES
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
from ajrasakha.evaluation.language_matrix import build_language_quality_matrix


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
    trace_result = build_langsmith_trace_url(result)
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

    args = parser.parse_args()

    selected_cases = TEST_CASES + MULTILINGUAL_TEST_CASES

    if args.stable_only:
        selected_cases = [
            case for case in selected_cases
            if case.get("stable") is True
        ]

    results = []

    for case in selected_cases:
        print(f"Running [{args.mode}]: {case.get('name')}")
        results.append(run_case(case, args.mode))

    output_file = f"evaluation_report_{args.mode}.csv"
    write_csv_report(results, output_file=output_file)
    summary = build_summary(results)

    print("\nSummary")
    print("-" * 40)

    for key, value in summary.items():
        print(f"{key:20}: {value}")

    matrix = build_language_quality_matrix(results)

    matrix_file = f"evaluation_language_matrix_{args.mode}.csv"

    from ajrasakha.evaluation.language_matrix import write_language_matrix_csv

    write_language_matrix_csv(matrix, matrix_file)

    print(f"\nLanguage Quality Matrix written to: {matrix_file}")

    print("\nLanguage Quality Matrix")
    print("-" * 100)

    print(
        f"{'Domain':25}"
        f"{'Language':12}"
        f"{'Cases':8}"
        f"{'Technical':18}"
        f"{'Routing':18}"
        f"{'Tools'}"
    )

    print("-" * 100)

    for row in matrix:
        print(
        f"{row['domain']:25}"
        f"{row['language']:12}"
        f"{row['total_cases']:<8}"
        + f"{row['technical_passed']}/{row['total_cases']} ({row['technical_pass_rate']}%)".ljust(18)
        + f"{row['routing_passed']}/{row['total_cases']} ({row['routing_pass_rate']}%)".ljust(18)
        + f"{row['tool_passed']}/{row['total_cases']} ({row['tool_pass_rate']}%)"
    )

if __name__ == "__main__":
    main()