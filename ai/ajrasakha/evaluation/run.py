import argparse

from ajrasakha.agents.tests.questions import TEST_CASES
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
    node_result = evaluate_nodes(result, case)
    plan_result = evaluate_plan(result, case)
    quality_result = evaluate_response_quality(result)

    combined = {
        **result,
        **technical_result,
        **routing_result,
        **tool_result,
        **trace_result,
        **node_result,
        **plan_result,
        **quality_result, 
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
    args = parser.parse_args()

    results = []

    for case in TEST_CASES:
        print(f"Running [{args.mode}]: {case.get('name')}")
        results.append(run_case(case, args.mode))

    output_file = f"evaluation_report_{args.mode}.csv"
    write_csv_report(results, output_file=output_file)
    summary = build_summary(results)
    print("Summary:", summary)


if __name__ == "__main__":
    main() 