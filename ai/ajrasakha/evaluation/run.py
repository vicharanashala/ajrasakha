import argparse

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
from ajrasakha.evaluation.language_matrix import write_language_quality_matrix
from ajrasakha.evaluation.multilingual_cases import MULTILINGUAL_TEST_CASES
from ajrasakha.evaluation.validators.language_quality import evaluate_language_quality


def run_case(case: dict, mode: str, multilingual: bool = False) -> dict:
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
    language_quality_result = (
        evaluate_language_quality(result, case)
        if multilingual
        else {}
    )

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
        **language_quality_result,
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
    parser.add_argument(
        "--multilingual",
        action="store_true",
        help="Run multilingual language-quality cases.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Run only the first N selected cases. Useful for quick smoke checks.",
    )

    args = parser.parse_args()

    selected_cases = MULTILINGUAL_TEST_CASES if args.multilingual else TEST_CASES

    if args.stable_only:
        selected_cases = [
            case for case in selected_cases
            if case.get("stable") is True
        ]

    if args.limit is not None:
        selected_cases = selected_cases[: args.limit]

    results = []

    for case in selected_cases:
        print(f"Running [{args.mode}]: {case.get('name')}")
        results.append(run_case(case, args.mode, multilingual=args.multilingual))

    output_prefix = "multilingual_evaluation_report" if args.multilingual else "evaluation_report"
    output_file = f"{output_prefix}_{args.mode}.csv"
    write_csv_report(results, output_file=output_file)
    if args.multilingual:
        write_language_quality_matrix(
            results,
            output_file=f"language_quality_matrix_{args.mode}.csv",
        )
    summary = build_summary(results)
    print("Summary:", summary)


if __name__ == "__main__":
    main()
