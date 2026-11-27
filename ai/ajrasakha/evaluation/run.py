import argparse
from datetime import datetime, timezone
from uuid import uuid4

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
from ajrasakha.evaluation.deepeval_metrics import (
    JudgeSetupError,
    get_judge_model,
)
from ajrasakha.evaluation.validators.source_check import evaluate_source_attribution
from ajrasakha.evaluation.validators.disclaimer_language import evaluate_disclaimer_language
from ajrasakha.evaluation.langsmith_trace import build_langsmith_trace_url


def run_case(
    case: dict,
    mode: str,
    *,
    answer_quality: bool | None = None,
) -> dict:
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

    quality_enabled = (
        (mode == "live") if answer_quality is None else answer_quality
    )
    quality_result = evaluate_response_quality(
        result,
        case,
        enabled=quality_enabled,
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

    parser.add_argument(
        "--skip-answer-quality",
        action="store_true",
        help=(
            "Skip LLM answer-quality evaluation and run deterministic checks "
            "only. The judge configuration is not required."
        ),
    )

    args = parser.parse_args()

    # LLM quality evaluation needs a usable judge before any case is sent or a
    # report is written. Deterministic-only runs never read judge configuration.
    answer_quality = args.mode == "live" and not args.skip_answer_quality
    if answer_quality:
        try:
            get_judge_model()
        except JudgeSetupError as exc:
            print(f"Answer quality judge is not configured: {exc}")
            print(
                "Fix ai/.env, run with --mode mock, or pass "
                "--skip-answer-quality."
            )
            raise SystemExit(2)

    selected_cases = TEST_CASES

    if args.stable_only:
        selected_cases = [
            case for case in TEST_CASES
            if case.get("stable") is True
        ]

    run_metadata = {
        "run_id": str(uuid4()),
        "run_started_at": datetime.now(timezone.utc).isoformat(),
        "stable_only": args.stable_only,
        "selected_case_count": len(selected_cases),
    }
    results = []

    for case in selected_cases:
        print(f"Running [{args.mode}]: {case.get('name')}")
        results.append(
            run_case(case, args.mode, answer_quality=answer_quality)
        )

    output_file = f"evaluation_report_{args.mode}.csv"
    write_csv_report(
        results,
        output_file=output_file,
        evaluation_mode=args.mode,
        run_metadata=run_metadata,
    )
    summary = build_summary(
        results,
        evaluation_mode=args.mode,
        run_metadata=run_metadata,
    )
    print("Summary:", summary)


if __name__ == "__main__":
    main()