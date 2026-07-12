"""
test_run_ground_truth_end_to_end.py — end-to-end test for the full pipeline.

  load fixture
    → run_ground_truth_eval (evaluate_response_quality + build_summary)
    → storage.save_eval_results (round-trip through DB-API 2.0)
    → storage.get_recent_results (read back)
    → assert every column matches the eval_result that was saved

Uses file-backed sqlite (NOT in-memory) so the save and read paths use
separate connections — the same property the production psycopg2 path
exercises.

This is the single test that proves the PR3 deliverable as a whole works
end-to-end. Each module has its own unit tests; this one verifies they
compose correctly.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest

_AI_ROOT = Path(__file__).resolve().parents[1]
if str(_AI_ROOT) not in sys.path:
    sys.path.insert(0, str(_AI_ROOT))

os.environ.setdefault("EVAL_JUDGE", "mock")


@pytest.fixture
def _fresh_judge_cache():
    """Force-fresh judge cache so cross-test LLM-judge state doesn't leak."""
    from ajrasakha.evaluation import judge as _judge_mod
    _judge_mod._JUDGE_CACHE = None
    yield
    _judge_mod._JUDGE_CACHE = None


@pytest.fixture
def _db_url():
    """File-backed sqlite DB. Each test gets a fresh DB; cleanup on teardown."""
    tmp_db = Path(tempfile.gettempdir()) / "ajrasakha_e2e_test.db"
    if tmp_db.exists():
        tmp_db.unlink()
    yield f"sqlite:///{tmp_db}"
    if tmp_db.exists():
        tmp_db.unlink()


@pytest.fixture
def _fixture_path():
    return _AI_ROOT / "tests" / "fixtures" / "gdb_ground_truth_sample_multidomain.json"


def test_end_to_end(_fresh_judge_cache, _db_url, _fixture_path):
    """Full pipeline: fixture → evaluate → save → read-back → verify columns."""
    from ajrasakha.evaluation.run_ground_truth import run_ground_truth_eval
    from ajrasakha.evaluation.storage import save_eval_results, get_recent_results

    assert _fixture_path.exists(), f"fixture missing: {_fixture_path}"

    # 1. Run the full pipeline. The runner calls save_eval_results
    #    internally; we'll verify that worked by reading the rows back.
    results = run_ground_truth_eval(
        fixture_path=_fixture_path,
        judge="mock",
        db_url=_db_url,
        readback=0,  # we'll read back manually for assertions
    )
    assert len(results) == 6, f"expected 6 results, got {len(results)}"

    # 2. Read back via get_recent_results
    recent = get_recent_results(_db_url, limit=10)
    assert len(recent) == 6, f"expected 6 rows, got {len(recent)}"

    # 3. Assert content of every column for every row
    by_qid = {r["question_id"]: r for r in results}
    assert len(recent) == len(results)

    for row in recent:
        qid = row.get("question_id", "")
        src = by_qid.get(qid)
        assert src is not None, f"row for {qid!r} not found in source results"

        # NB: storage stores REAL as float, so the read-back value comes back
        # as float, not str. parse and compare numerically for the score.
        stored_score = row["answer_relevancy_score"]
        src_score = src["answerrelevancymetric_score"]
        if stored_score is not None and src_score != "":
            assert abs(float(stored_score) - float(src_score)) < 1e-9, (
                f"{qid}: answer_relevancy_score mismatch {stored_score!r} "
                f"vs {src_score!r}"
            )

        # pass/fail and status fields are TEXT — exact string match
        assert row["answer_relevancy_passed"] == str(src["answerrelevancymetric_passed"])
        assert row["faithfulness_status"] == str(src["faithfulnessmetric_passed"])
        assert row["contextual_relevancy_status"] == str(src["contextualrelevancymetric_passed"])

        # gdb_match_score is intentionally NOT in the storage schema — it's
        # covered by the eval pipeline output, not persisted for now.
        assert "gdb_match_score" not in row, (
            f"{qid}: unexpected gdb_match_score column in storage row: {row!r}"
        )

        # id must be an int
        assert isinstance(row["id"], int)
        # created_at must be a non-empty string
        assert isinstance(row["created_at"], str) and row["created_at"]

    # 4. Verify ordering (newest first)
    ids = [row["id"] for row in recent]
    assert ids == sorted(ids, reverse=True), (
        f"rows should be in descending id order, got {ids}"
    )

    # 5. Verify re-run is additive (running save again adds 6 more rows)
    inserted2 = save_eval_results(results, _db_url)
    assert inserted2 == 6, f"second save: expected 6 rows, got {inserted2}"
    recent2 = get_recent_results(_db_url, limit=100)
    assert len(recent2) == 12, f"expected 12 rows total, got {len(recent2)}"

    # 6. Verify get_recent_results limit works
    recent3 = get_recent_results(_db_url, limit=3)
    assert len(recent3) == 3, f"expected 3 rows, got {len(recent3)}"


def test_runner_optional_db_url_backward_compat(_fresh_judge_cache, _fixture_path):
    """
    run_ground_truth_eval with no db_url must still work — storage is
    opt-in. Backwards-compat check; without this, the previous CLI
    behavior would break.
    """
    from ajrasakha.evaluation.run_ground_truth import run_ground_truth_eval
    results = run_ground_truth_eval(
        fixture_path=_fixture_path,
        judge="mock",
        db_url=None,  # the legacy default
        readback=0,
    )
    assert len(results) == 6
