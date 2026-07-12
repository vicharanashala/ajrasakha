"""
test_gdb_match_score_discrimination.py — proves gdb_match_score discriminates
between correct and deliberately wrong answers.

MOTIVATION
----------
The ground-truth runner feeds response_text == expected_output (circular
smoke-run by design), so all scores are 1.0 there. That proves the WIRING
(metric appears, runs, aggregates) but not DISCRIMINATION.

This test isolates the discrimination property:
  - For the same question, a correct answer should score HIGH (1.0 on self-match).
  - For the same question, a deliberately wrong answer (wrong crop, wrong dosage,
    wrong region) should score MEANINGFULLY LOWER.
  - The integration through evaluate_response_quality should produce a non-1.0
    gdb_match_score when response_text is the wrong answer.

WHAT THIS IS NOT
----------------
Not a measure of absolute correctness. gdb_match_score is character/token
similarity, not semantic judgment. A wrong answer that happens to share
vocabulary (e.g. wrong dosage of the same chemical) will score higher than
a wrong answer that mentions an entirely different crop. That's expected
and consistent with the metric's design.

Run:
    cd ai && EVAL_JUDGE=mock python tests/test_gdb_match_score_discrimination.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# Ensure ajrasakha is importable
_AI_ROOT = Path(__file__).resolve().parents[1]
if str(_AI_ROOT) not in sys.path:
    sys.path.insert(0, str(_AI_ROOT))

# Ensure MockJudge is used for evaluate_response_quality
os.environ.setdefault("EVAL_JUDGE", "mock")

from ajrasakha.evaluation.gdb_match_score import gdb_match_score
from ajrasakha.evaluation.answer_eval import evaluate_response_quality


_FIXTURE_PATH = _AI_ROOT / "tests" / "fixtures" / "gdb_ground_truth_discrimination.json"


def main() -> int:
    print("=" * 75)
    print("gdb_match_score discrimination test")
    print("=" * 75)
    print()
    print("Fixture: gdb_ground_truth_discrimination.json (3 cases)")
    print("Methods: seqmatch (character LCS) + jaccard (token overlap)")
    print()

    cases = json.loads(_FIXTURE_PATH.read_text(encoding="utf-8"))
    assert len(cases) == 3, f"expected 3 cases, got {len(cases)}"
    for case in cases:
        for required in ("question_id", "input", "expected_output", "deliberately_wrong_answer"):
            assert required in case, f"case missing field: {required}"

    print(f"Loaded {len(cases)} discrimination cases")
    print()

    failures: list[str] = []

    # ======================================================================
    # Part 1: per-case discrimination via gdb_match_score() direct calls
    # ======================================================================
    print("─" * 75)
    print("Part 1: Direct gdb_match_score calls (both methods)")
    print("─" * 75)
    print()
    header = f"  {'question_id':<35} {'method':>8} {'self':>8} {'wrong':>8} {'delta':>8} {'drop%':>7}"
    print(header)
    print("  " + "-" * (len(header) - 2))

    for case in cases:
        qid = case["question_id"][:35]
        expected = case["expected_output"]
        wrong = case["deliberately_wrong_answer"]

        for method in ("seqmatch", "jaccard"):
            self_score = gdb_match_score(expected, expected, method=method)["score"]
            wrong_score = gdb_match_score(wrong, expected, method=method)["score"]
            delta = self_score - wrong_score
            drop_pct = (delta / self_score * 100) if self_score > 0 else 0.0

            print(f"  {qid:<35} {method:>8} {self_score:>8.4f} {wrong_score:>8.4f} "
                  f"{delta:>8.4f} {drop_pct:>6.1f}%")

            # ASSERTIONS:
            # 1. Self-match must be 1.0 (sanity)
            if self_score < 0.999:
                failures.append(f"{qid} {method}: self-match should be 1.0, got {self_score}")

            # 2. Wrong-answer score must be LOWER than self-match
            if wrong_score >= self_score:
                failures.append(
                    f"{qid} {method}: wrong-answer score {wrong_score} should be "
                    f"strictly lower than self-match {self_score}"
                )

            # 3. Wrong-answer score must be MEANINGFULLY lower (< 0.7) for at
            #    least one of the two methods. seqmatch on long answers can
            #    land in the 0.30–0.60 band even on rephrased (correct) text
            #    (see test_gdb_match_score.py for the realistic band); we
            #    demand that a deliberately wrong answer clear the 0.7 bar in
            #    at least jaccard (vocabulary-aware).
            if method == "jaccard" and wrong_score >= 0.7:
                failures.append(
                    f"{qid} jaccard: wrong-answer score {wrong_score} should be "
                    f"< 0.7 (meaningfully lower), got {wrong_score}"
                )
    print()

    # ======================================================================
    # Part 2: integration through evaluate_response_quality
    # ======================================================================
    print("─" * 75)
    print("Part 2: Integration through evaluate_response_quality")
    print("─" * 75)
    print()
    print(f"  {'question_id':<35} {'response_text':>16} {'gdb_match_score':>16} {'gdb_match_method':>17}")
    print("  " + "-" * 88)

    for case in cases:
        qid = case["question_id"][:35]
        expected = case["expected_output"]
        wrong = case["deliberately_wrong_answer"]

        # (a) Self-match via evaluate_response_quality
        r_self = evaluate_response_quality(
            {
                "query": case["input"],
                "response_text": expected,
                "expected_output": expected,
            },
            enabled=True,
        )
        # (b) Wrong-answer via evaluate_response_quality
        r_wrong = evaluate_response_quality(
            {
                "query": case["input"],
                "response_text": wrong,
                "expected_output": expected,
            },
            enabled=True,
        )

        # Compact the response_text label: "correct" or "wrong"
        for label, r in (("correct", r_self), ("wrong  ", r_wrong)):
            gm_score = r["gdb_match_score_score"]
            gm_meth = r["gdb_match_score_method"]
            print(f"  {qid:<35} {label:>16} {gm_score:>16} {gm_meth:>17}")

            # The wrong answer must NOT score 1.0
            if label.strip() == "wrong" and gm_score == "1.0":
                failures.append(
                    f"{qid}: wrong-answer produced gdb_match_score=1.0 — "
                    f"metric is NOT discriminating (got {gm_score})"
                )

            # The wrong answer must NOT carry method='not_applicable' (we DID
            # pass expected_output, so it should run)
            if label.strip() == "wrong" and gm_meth == "not_applicable":
                failures.append(
                    f"{qid}: wrong-answer produced method='not_applicable' "
                    f"but expected_output was provided — should have run"
                )

        # Assert wrong score < self score (the property the runner's circular
        # design can't show)
        if r_wrong["gdb_match_score_score"] >= r_self["gdb_match_score_score"]:
            failures.append(
                f"{qid}: evaluate_response_quality wrong ({r_wrong['gdb_match_score_score']}) "
                f"should be < self ({r_self['gdb_match_score_score']})"
            )

    print()

    # ======================================================================
    # Summary
    # ======================================================================
    print("=" * 75)
    if failures:
        print(f"RESULT: {len(failures)} check(s) FAILED:")
        for f in failures:
            print(f"  - {f}")
        return 1

    print("RESULT: ALL DISCRIMINATION CHECKS PASSED")
    print()
    print("Confirmed: gdb_match_score correctly distinguishes a correct answer")
    print("from a plausible-sounding but factually wrong answer — both via direct")
    print("calls to gdb_match_score() and via evaluate_response_quality() with")
    print("expected_output provided.")
    return 0


if __name__ == "__main__":
    sys.exit(main())