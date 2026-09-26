import argparse
import os

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

    # NOTE: previously this called evaluate_response_quality(result, enabled=...)
    # without `case`, so the function had no access to expected_answer /
    # expected_crop / expected_treatment / expected_region and could never
    # do more than a stub. Domain is also carried through here so it lands
    # in the CSV/Postgres for per-domain dashboard breakdowns.
    quality_result = evaluate_response_quality(
        result,
        case,
        enabled=(mode == "live"),
    )

    combined = {
        **result,
        "domain": case.get("domain", ""),
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

    parser.add_argument(
        "--store-postgres",
        action="store_true",
        default=None,
        help="Persist results to Postgres. Defaults to on when "
        "EVAL_POSTGRES_URL is set and mode=live.",
    )

    args = parser.parse_args()

    selected_cases = TEST_CASES

    if args.stable_only:
        selected_cases = [
            case for case in TEST_CASES
            if case.get("stable") is True
        ]

    results = []

    for case in selected_cases:
        print(f"Running [{args.mode}]: {case.get('name')}")
        results.append(run_case(case, args.mode))

    output_file = f"evaluation_report_{args.mode}.csv"
    write_csv_report(results, output_file=output_file)
    summary = build_summary(results)
    print("Summary:", summary)

    should_store = args.store_postgres
    if should_store is None:
        should_store = args.mode == "live" and bool(os.getenv("EVAL_POSTGRES_URL"))

    if should_store:
        try:
            from ajrasakha.evaluation.storage import save_results_to_postgres

            run_id = save_results_to_postgres(results, mode=args.mode)
            print(f"Stored evaluation scores in Postgres (run_id={run_id})")
        except Exception as exc:
            # Never fail the stable suite because the dashboard DB is down.
            print(f"Warning: could not store scores in Postgres: {exc}")


if __name__ == "__main__":
    main()
