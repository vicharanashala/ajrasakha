"""Run the normalized, hierarchical answer-quality pipeline."""

from __future__ import annotations

import json
import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import run_stats
from chem_checker import check_banned_chemicals
from llm_checker import (
    MINIMAX_MODEL,
    apply_context_overrides,
    apply_coverage_overrides,
    detect_question_type,
    run_coverage_checks,
    run_context_checks,
    run_llm_checks,
)
from local_names import find_local_name_records, get_relevant_names
from llm_checker import ANSWER_TEMPLATES
from normalizer import AnswerContext, normalize_answer
from officer_checker import check_officer_name
from result_state import ERROR, FAIL, NOT_EVALUATED, PASS, is_failed, needs_retry
from source_checker import check_sources
from source_fidelity import check_source_fidelity
from uniformity_checker import run_uniformity_checks


PROJECT_DIRECTORY = Path(__file__).resolve().parent.parent
ANSWERS_PATH = PROJECT_DIRECTORY / "data" / "sample_answers.json"
RESULTS_PATH = PROJECT_DIRECTORY / "data" / "results.json"
PIPELINE_VERSION = "v1.2"
REFERENCE_DATA_VERSION = "v1.0"
CHECK_GROUPS = {
    "chemical": (
        "banned_chemical", "restricted_chemical", "uniformity_of_dose",
        "source_fidelity",
    ),
    "source": ("source_present", "page_number_present"),
    "answer_quality": (
        "answer_structure",
        "query_properly_answered",
        "sequence",
        "contextuality",
    ),
    "terminology": (
        "private_product_name",
        "officer_name",
        "local_name_mismatch",
    ),
}


def load_answers(path: Path = ANSWERS_PATH) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as source:
        answers = json.load(source)
    if not isinstance(answers, list):
        raise ValueError(f"Expected a JSON array in {path}")
    return answers


def _is_failed(check: dict[str, Any]) -> bool:
    return is_failed(check)


def _run_parameter_groups(
    context: AnswerContext,
) -> tuple[dict[str, dict[str, Any]], str | None]:
    chemical = check_banned_chemicals(context)
    source = check_sources(context)
    officer = check_officer_name(context)
    # run_llm_checks (2 model calls) and check_source_fidelity (a PDF
    # fetch/parse, plus a model call when a dose is present) don't touch
    # each other's data, but were previously run one after another --
    # for a single answer that's the full latency of both stacked, when
    # they could overlap. Pure concurrency fix, no verdict logic touched.
    with ThreadPoolExecutor(max_workers=2) as pool:
        llm_future = pool.submit(run_llm_checks, context)
        source_fidelity_future = pool.submit(check_source_fidelity, context)
        llm = llm_future.result()
        source_fidelity = source_fidelity_future.result()
    llm_error = llm.pop("_error", None)
    return {
        "chemical": {
            "banned_chemical": chemical["banned_chemical"],
            "restricted_chemical": chemical["restricted_chemical"],
            "source_fidelity": source_fidelity,
        },
        "source": {name: source[name] for name in CHECK_GROUPS["source"]},
        "answer_quality": {
            name: llm[name] for name in CHECK_GROUPS["answer_quality"]
        },
        "terminology": {
            "private_product_name": llm["private_product_name"],
            "officer_name": officer["officer_name"],
            "local_name_mismatch": llm["local_name_mismatch"],
        },
    }, llm_error


def _failed_count(parameters: dict[str, dict[str, Any]]) -> int:
    return sum(
        _is_failed(check)
        for group in parameters.values()
        for check in group.values()
    )


def _overall(
    parameters: dict[str, dict[str, Any]], processing_error: bool = False
) -> str:
    if _failed_count(parameters):
        return FAIL
    if processing_error:
        return NOT_EVALUATED
    return PASS


def _default_workers() -> int:
    try:
        return max(1, int(os.getenv("PIPELINE_WORKERS", "8")))
    except ValueError:
        return 8


def _map_parallel(func, items, max_workers=None, label="processed", progress_every=100):
    """Apply `func` to every item and return results in input order.

    The work is network-bound (LLM calls and document fetches), so plain
    threads give a real speedup without restructuring anything. Progress is
    printed only for large batches so small runs stay quiet.
    """
    workers = max_workers or _default_workers()
    total = len(items)
    show_progress = total >= 200
    done = 0
    lock = threading.Lock()

    def tracked(item):
        nonlocal done
        outcome = func(item)
        with lock:
            done += 1
            if show_progress and done % progress_every == 0:
                print(f"  {label}: {done}/{total}", file=sys.stderr, flush=True)
        return outcome

    if workers <= 1 or total <= 1:
        return [tracked(item) for item in items]
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(tracked, items))


def _check_one(raw_answer: dict[str, Any]) -> dict[str, Any]:
    answer_id = str(raw_answer.get("answer_id") or "")
    result: dict[str, Any] = {
        "answer_id": answer_id,
        "parameters": {},
        "failed_check_count": 0,
        "overall": NOT_EVALUATED,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "pipeline_version": PIPELINE_VERSION,
        "reference_data_version": REFERENCE_DATA_VERSION,
        "model": MINIMAX_MODEL,
        "status": "PENDING",
    }
    try:
        result["status"] = "PROCESSING"
        context = normalize_answer(raw_answer)
        parameters, llm_error = _run_parameter_groups(context)
        failed_check_count = _failed_count(parameters)
        result.update(
            {
                "parameters": parameters,
                "failed_check_count": failed_check_count,
                "overall": _overall(parameters, processing_error=bool(llm_error)),
                "checked_at": datetime.now(timezone.utc).isoformat(),
                "status": "FAILED" if llm_error else "COMPLETED",
            }
        )
        if llm_error:
            result["error"] = {"detail": llm_error}
    except Exception as exc:  # Isolate any checker failure to this answer.
        result.update(
            {
                "overall": NOT_EVALUATED,
                "checked_at": datetime.now(timezone.utc).isoformat(),
                "status": "FAILED",
                "error": {"detail": f"{type(exc).__name__}: {exc}"},
            }
        )
    return result


def _apply_uniformity(results: list[dict[str, Any]], answers: list[dict[str, Any]]) -> None:
    """Uniformity compares doses across the whole batch, so it can only run
    once every independent answer check has finished (and must be redone
    whenever a retry changes an answer)."""
    uniformity_results = run_uniformity_checks(answers)
    for result in results:
        if not result.get("parameters"):
            continue
        uniformity = uniformity_results.get(result["answer_id"], {}).get("uniformity_of_dose")
        if uniformity is None:
            continue
        result["parameters"]["chemical"]["uniformity_of_dose"] = uniformity
        result["failed_check_count"] = _failed_count(result["parameters"])
        result["overall"] = _overall(result["parameters"], processing_error="error" in result)


def run_checks(answers: list[dict[str, Any]], max_workers: int | None = None) -> list[dict[str, Any]]:
    results = _map_parallel(_check_one, answers, max_workers, "checked")
    _apply_uniformity(results, answers)
    return results


_COVERAGE_NAMES = ("answer_structure", "sequence", "query_properly_answered")
_CONTEXT_NAMES = ("contextuality", "private_product_name", "local_name_mismatch")


def _find_check(result: dict[str, Any], check_name: str) -> dict[str, Any] | None:
    for group in result.get("parameters", {}).values():
        if check_name in group:
            return group[check_name]
    return None


def _retry_pieces(result: dict[str, Any]) -> set[str]:
    """Which independently-retriable pieces of this answer are worth
    re-attempting: the coverage LLM call, the context LLM call, and/or
    source_fidelity -- each only if something in it has ERROR or DEFERRED
    execution state. Deterministic checks never need this; they never
    produce those states.
    """
    pieces = set()
    if any(needs_retry(_find_check(result, name) or {}) for name in _COVERAGE_NAMES):
        pieces.add("coverage")
    if any(needs_retry(_find_check(result, name) or {}) for name in _CONTEXT_NAMES):
        pieces.add("context")
    if needs_retry(_find_check(result, "source_fidelity") or {}):
        pieces.add("source_fidelity")
    return pieces


def retry_failed(
    existing_results: list[dict[str, Any]],
    all_answers: list[dict[str, Any]],
    max_workers: int | None = None,
) -> list[dict[str, Any]]:
    """Re-run only what's actually worth re-attempting, at the granularity
    of individual checks, not whole answers.

    A full MiniMax run can take a long time, and this proxy fails a real
    fraction of individual calls. Re-running an entire answer wastes every
    check that already succeeded on it -- if only the context group errored
    while coverage and every deterministic check already completed, only
    the context group gets re-attempted here, nothing else. An answer that
    failed before any check ran at all (parameters entirely empty) falls
    back to a full re-attempt, since there is nothing narrower to retry.
    """
    answers_by_id = {str(a.get("answer_id") or ""): a for a in all_answers}

    def retry_one(result: dict[str, Any]) -> dict[str, Any]:
        raw_answer = answers_by_id.get(result["answer_id"])
        if raw_answer is None:
            return result

        if not result.get("parameters"):
            if result.get("status") == "FAILED":
                return _check_one(raw_answer)
            return result

        pieces = _retry_pieces(result)
        if not pieces:
            return result

        context = normalize_answer(raw_answer)
        question_type = detect_question_type(context["question_text"])

        if "coverage" in pieces:
            answer_template = ANSWER_TEMPLATES.get(question_type) if question_type else ANSWER_TEMPLATES.get("general")
            coverage = run_coverage_checks(
                context["question_text"], context["answer_text"],
                context["crop"], context["state"], question_type, answer_template,
            )
            coverage = apply_coverage_overrides(
                coverage, question_type, context["answer_text"]
            )
            for name, check in coverage.items():
                result["parameters"]["answer_quality"][name] = check

        if "context" in pieces:
            local_names = get_relevant_names(
                context["state"], context["crop"], question_type or ""
            )
            used_local_names = find_local_name_records(context["answer_text"])
            context_result = run_context_checks(
                context["question_text"], context["answer_text"],
                context["crop"], context["state"], local_names, used_local_names,
            )
            if not needs_retry(context_result["contextuality"]):
                context_result = apply_context_overrides(
                    context_result, local_names, used_local_names,
                    context["crop"], context["answer_text"],
                )
            result["parameters"]["answer_quality"]["contextuality"] = context_result["contextuality"]
            result["parameters"]["terminology"]["private_product_name"] = context_result["private_product_name"]
            result["parameters"]["terminology"]["local_name_mismatch"] = context_result["local_name_mismatch"]

        if "source_fidelity" in pieces:
            result["parameters"]["chemical"]["source_fidelity"] = check_source_fidelity(context)

        still_erroring = any(
            _find_check(result, name).get("execution") == "ERROR"
            for name in (*_COVERAGE_NAMES, *_CONTEXT_NAMES, "source_fidelity")
            if _find_check(result, name)
        )
        result["status"] = "FAILED" if still_erroring else "COMPLETED"
        result.pop("error", None)
        if still_erroring:
            result["error"] = {"detail": "One or more checks still could not be evaluated after retry"}
        result["failed_check_count"] = _failed_count(result["parameters"])
        result["overall"] = _overall(result["parameters"], processing_error=still_erroring)
        return result

    merged = _map_parallel(retry_one, existing_results, max_workers, "retried")
    # Any retry can change a cross-answer dose comparison, so redo it.
    _apply_uniformity(merged, all_answers)
    return merged


def _needs_retry_any(result: dict[str, Any]) -> bool:
    if not result.get("parameters"):
        return result.get("status") == "FAILED"
    return bool(_retry_pieces(result))


def run_until_complete(
    answers: list[dict[str, Any]],
    max_workers: int | None = None,
    retry_rounds: int | None = None,
    checkpoint_path: Path | None = None,
    chunk_size: int = 500,
) -> list[dict[str, Any]]:
    """Run every answer, then keep retrying whatever failed on infrastructure
    (model-call errors) until nothing is left or the round limit is hit.

    With a checkpoint path, results are saved after every chunk and an
    interrupted run resumes from the file instead of starting over. Resume
    matches on answer_id, so ids must be unique in that mode.
    """
    if retry_rounds is None:
        try:
            retry_rounds = int(os.getenv("PIPELINE_RETRY_ROUNDS", "5"))
        except ValueError:
            retry_rounds = 5

    if checkpoint_path is None:
        results = run_checks(answers, max_workers)
    else:
        done: dict[str, dict[str, Any]] = {}
        if checkpoint_path.exists():
            for saved in json.loads(checkpoint_path.read_text(encoding="utf-8")):
                done[saved["answer_id"]] = saved
            print(f"resuming: {len(done)} answers already in checkpoint", file=sys.stderr)
        pending = [a for a in answers if str(a.get("answer_id") or "") not in done]
        for start in range(0, len(pending), chunk_size):
            chunk = pending[start:start + chunk_size]
            for fresh in _map_parallel(_check_one, chunk, max_workers, "checked"):
                done[fresh["answer_id"]] = fresh
            checkpoint_path.write_text(
                json.dumps(list(done.values()), ensure_ascii=False), encoding="utf-8"
            )
        results = [done[str(a.get("answer_id") or "")] for a in answers]
        _apply_uniformity(results, answers)

    for attempt in range(1, retry_rounds + 1):
        pending_count = sum(_needs_retry_any(r) for r in results)
        if not pending_count:
            break
        print(f"retry round {attempt}: {pending_count} answer(s) still need a retry", file=sys.stderr, flush=True)
        results = retry_failed(results, answers, max_workers)
        if checkpoint_path is not None:
            checkpoint_path.write_text(json.dumps(results, ensure_ascii=False), encoding="utf-8")
    return results


def _iter_checks(result: dict[str, Any]):
    for group_name, group in result.get("parameters", {}).items():
        for check_name, check in group.items():
            yield group_name, check_name, check


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    args = sys.argv[1:]

    def _int_flag(name: str) -> int | None:
        if name in args and args.index(name) + 1 < len(args):
            return int(args[args.index(name) + 1])
        return None

    workers = _int_flag("--workers")
    retry_rounds = _int_flag("--retry-rounds")

    answers = load_answers()
    if "--retry-failed" in args:
        if not RESULTS_PATH.exists():
            print(f"No existing results at {RESULTS_PATH}; run without --retry-failed first.")
            return
        existing_results = json.loads(RESULTS_PATH.read_text(encoding="utf-8"))
        failed_count = sum(_needs_retry_any(r) for r in existing_results)
        if not failed_count:
            print("No failed answers to retry; results.json is already complete.")
            return
        print(f"Retrying {failed_count} previously failed answer(s)...")
        results = retry_failed(existing_results, answers, workers)
    else:
        # Large runs save a checkpoint after every 500 answers, so an
        # interruption resumes instead of restarting; it is removed once the
        # final results file has been written.
        checkpoint = RESULTS_PATH.with_suffix(".partial.json") if len(answers) > 500 else None
        results = run_until_complete(
            answers, max_workers=workers, retry_rounds=retry_rounds, checkpoint_path=checkpoint
        )

    with RESULTS_PATH.open("w", encoding="utf-8") as destination:
        json.dump(results, destination, indent=2, ensure_ascii=False)
        destination.write("\n")
    partial = RESULTS_PATH.with_suffix(".partial.json")
    if partial.exists():
        partial.unlink()

    for result in results:
        print(f"Answer ID: {result['answer_id']}")
        print(f"Status: {result['status']}")
        for group_name, check_name, check in _iter_checks(result):
            if check.get("status") == NOT_EVALUATED:
                state = NOT_EVALUATED
            else:
                state = check.get("status", NOT_EVALUATED)
            detail = check.get("detail")
            print(
                f"- {group_name}.{check_name}: {state}"
                f"{f' - {detail}' if detail else ''}"
            )
        if "error" in result:
            print(f"Error: {result['error']['detail']}")
        print(f"Failed check count: {result['failed_check_count']}")
        print(f"Overall: {result['overall']}")
        print("-------------")

    completed = sum(result["status"] == "COMPLETED" for result in results)
    passed = sum(result["overall"] == PASS for result in results)
    failed = sum(result["overall"] == FAIL for result in results)
    not_evaluated = sum(result["overall"] == NOT_EVALUATED for result in results)
    print(f"Total: {len(results)}")
    print(f"Completed: {completed}")
    print(f"Pipeline failed: {len(results) - completed}")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"Not evaluated: {not_evaluated}")
    print("Per check failure count:")
    for group_name, check_names in CHECK_GROUPS.items():
        for check_name in check_names:
            count = sum(
                _is_failed(result["parameters"][group_name][check_name])
                for result in results
                if check_name in result.get("parameters", {}).get(group_name, {})
            )
            print(f"- {check_name}: {count}")

    # Real LLM call reliability, not just check outcomes -- an ERROR
    # execution state only ever comes from an exhausted-retries LLM call
    # failure (result_state.error_result()), never from a normal verdict.
    # Previously this was only visible by spot-checking individual
    # results; surfacing it in every run's summary means a bad batch is
    # noticed immediately instead of discovered later by accident.
    llm_backed_checks = 0
    llm_errored_checks = 0
    for result in results:
        for _, check_name, check in _iter_checks(result):
            if check_name in (*_COVERAGE_NAMES, *_CONTEXT_NAMES, "source_fidelity"):
                llm_backed_checks += 1
                if check.get("execution") == ERROR:
                    llm_errored_checks += 1
    if llm_backed_checks:
        error_rate = llm_errored_checks / llm_backed_checks
        print(
            f"LLM call error rate: {llm_errored_checks}/{llm_backed_checks} "
            f"({error_rate:.0%}) checks"
        )
        if error_rate > 0.10:
            print(
                "WARNING: LLM call error rate exceeds 10% for this run -- "
                "consider re-running --retry-failed, or investigating "
                "whether the LLM proxy is degraded."
            )
    for line in run_stats.summary_lines():
        print(line)


if __name__ == "__main__":
    main()
