"""
GDB Match Score: how closely does the bot's answer match the
expert-validated answer stored in the Golden Dataset for that query
(applies to semantic-search / GDB-routed questions).

Ground truth resolution order for a test case:
  1. `case["expected_answer"]` if set -- a pinned ground truth, useful for
     locking a regression test to a known-good expert answer even if the
     GDB entry later changes.
  2. Otherwise, if `case["fetch_gdb_ground_truth"]` is truthy, fetch the
     current expert-validated answer live from the Golden Dataset using
     the same `gdb_search` the production bot uses -- so the baseline
     always compares against the up-to-date GDB, not a stale copy.
  3. Otherwise, this metric is not applicable to the case (returns score=None).
"""
from __future__ import annotations

import asyncio
import os

from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCase

try:
    from deepeval.test_case import SingleTurnParams as _EvalParams
except ImportError:  # older deepeval versions
    from deepeval.test_case import LLMTestCaseParams as _EvalParams

from ajrasakha.evaluation.deepeval_metrics import get_judge_model

DEFAULT_THRESHOLD = float(os.getenv("GDB_MATCH_THRESHOLD", "0.7"))


def build_gdb_match_metric(threshold: float = DEFAULT_THRESHOLD) -> GEval:
    return GEval(
        name="GDBMatchScore",
        criteria=(
            "Determine how closely the ACTUAL_OUTPUT matches the meaning of "
            "the EXPECTED_OUTPUT, which is an expert-validated answer from "
            "the Golden Dataset (GDB) for the same farmer question. Score "
            "high only if the actual output conveys the same recommendation, "
            "facts, and any numbers/units the expected output contains. "
            "Wording, language, and length may differ."
        ),
        evaluation_params=[
            _EvalParams.INPUT,
            _EvalParams.ACTUAL_OUTPUT,
            _EvalParams.EXPECTED_OUTPUT,
        ],
        threshold=threshold,
        model=get_judge_model(),
    )


async def fetch_gdb_ground_truth(query: str, crop: str = "all", state: str = "all") -> str | None:
    """Fetches the current expert-validated answer for `query` straight from
    the Golden Dataset, reusing the same search path the production bot
    calls (`ajrasakha.tools.golden.golden_search.gdb_search`)."""
    try:
        from ajrasakha.tools.golden.golden_search import gdb_search
    except Exception:
        return None

    try:
        result = await gdb_search(rephrased_query=query, crop=crop, state=state)
    except Exception:
        return None

    match = (result or {}).get("selected_match") or (result or {}).get("exact_match")
    if not match:
        return None

    return match.get("answer_text") or match.get("answer")


def _run_async(coro):
    try:
        return asyncio.run(coro)
    except RuntimeError:
        # We're already inside a running event loop (e.g. under
        # pytest-asyncio); spin up a fresh loop for this one-off call.
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(coro)
        finally:
            loop.close()


def resolve_expected_answer(case: dict) -> str | None:
    if case.get("expected_answer"):
        return case["expected_answer"]

    if not case.get("fetch_gdb_ground_truth"):
        return None

    location = case.get("location") or {}
    crop = (case.get("expected_plan") or {}).get("crop", "all")
    state = location.get("state", "all")

    return _run_async(fetch_gdb_ground_truth(case.get("query", ""), crop=crop, state=state))


def evaluate_gdb_match(query: str, answer: str, expected_answer: str | None) -> dict:
    if not expected_answer:
        return {
            "score": None,
            "passed": None,
            "reason": "no_gdb_ground_truth_for_this_case",
        }

    if not answer or not str(answer).strip():
        return {"score": 0.0, "passed": False, "reason": "answer_missing"}

    test_case = LLMTestCase(
        input=query,
        actual_output=answer,
        expected_output=expected_answer,
    )

    metric = build_gdb_match_metric()

    try:
        metric.measure(test_case)
        passed = (
            bool(metric.is_successful())
            if hasattr(metric, "is_successful")
            else metric.score >= metric.threshold
        )
        return {"score": metric.score, "passed": passed, "reason": metric.reason}
    except Exception as exc:
        return {"score": None, "passed": False, "reason": str(exc)}
