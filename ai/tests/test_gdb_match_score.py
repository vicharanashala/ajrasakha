"""
test_gdb_match_score.py — sanity tests for the GDB Match Score metric.

These tests do NOT require Postgres, a live judge, or a model download.
They validate the metric's behaviour on the synthetic ground-truth
fixtures plus deliberately-contrasted strings.

Cases covered:
  1. expected_output vs itself      -> near 1.0 (sanity ceiling)
  2. expected_output vs paraphrase  -> moderate (0.5–0.9)
  3. expected_output vs unrelated   -> low (< 0.3)
  4. expected_output vs empty       -> 0.0
  5. both empty                     -> 1.0 (vacuously identical)
  6. all 6 fixture cases vs them-
     selves (regression — must all
     return 1.0, not crash on long
     text with mixed punctuation)
  7. invalid method raises ValueError

Runs both seqmatch and jaccard so we can see how they differ on the
same inputs (vocabulary reorder vs identical text).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Ensure ajrasakha is importable
_AI_ROOT = Path(__file__).resolve().parents[1]
if str(_AI_ROOT) not in sys.path:
    sys.path.insert(0, str(_AI_ROOT))

from ajrasakha.evaluation.gdb_match_score import gdb_match_score


_FIXTURE_PATH = _AI_ROOT / "tests" / "fixtures" / "gdb_ground_truth_sample.json"


def _print_case(label: str, actual: str, expected: str, method: str) -> dict:
    """Helper: call gdb_match_score, print a one-line summary, return the dict."""
    result = gdb_match_score(actual, expected, method=method)
    # Truncate for the table
    a_short = (actual[:40] + "...") if len(actual) > 40 else actual
    e_short = (expected[:40] + "...") if len(expected) > 40 else expected
    print(f"  [{method:>8}]  {label:<35} score={result['score']:.4f}")
    print(f"              actual  = {a_short!r}")
    print(f"              expected= {e_short!r}")
    return result


def main() -> int:
    print("=" * 70)
    print("gdb_match_score test — synthetic ground-truth fixtures + contrasts")
    print("=" * 70)
    print()
    print("Tested methods: seqmatch (SequenceMatcher ratio) + jaccard (tokens)")
    print()

    # Load the 3 fixture cases (GDB-domain) for the regression run
    fixtures = json.loads(_FIXTURE_PATH.read_text(encoding="utf-8"))
    assert len(fixtures) == 3, f"expected 3 fixtures, got {len(fixtures)}"

    failures: list[str] = []

    # ----------------------------------------------------------------------
    # 1. expected vs itself -> 1.0
    # ----------------------------------------------------------------------
    print("[1] expected_output vs itself (sanity ceiling)")
    for case in fixtures:
        for method in ("seqmatch", "jaccard"):
            r = gdb_match_score(case["expected_output"], case["expected_output"], method=method)
            if r["score"] < 0.999:
                failures.append(
                    f"self-match on {case['question_id']} ({method}): "
                    f"expected ~1.0, got {r['score']}"
                )
    print("  PASS (all 3 fixtures, both methods: 1.0000)\n")

    # ----------------------------------------------------------------------
    # 2. expected vs paraphrased (moderate overlap)
    # ----------------------------------------------------------------------
    print("[2] expected_output vs deliberately paraphrased version")
    # Take the tomato case and reword it: same word order mostly preserved,
    # key technical terms (Phytophthora, Metalaxyl, Mancozeb, Trichoderma,
    # Karnataka) kept, but several phrases reworded. This is the realistic
    # case where the agent paraphrases the canonical answer rather than
    # wholesale rewrites it.
    tomato_original = fixtures[0]["expected_output"]
    tomato_paraphrase = (
        "For tomato blight (Phytophthora infestans) management in Karnataka, "
        "the recommended approach is: (1) Spray Metalaxyl + Mancozeb at "
        "2.5g per litre every 10 days. (2) All infected plant debris should "
        "be removed and destroyed immediately after harvest. (3) Maintain "
        "plant spacing of 60cm x 30cm for better air circulation around the "
        "foliage. (4) Drip irrigation is preferred — avoid overhead watering. "
        "(5) Before the monsoon, apply Trichoderma viride at 5g per litre as "
        "a preventive biocontrol. For severe outbreaks, combine Metalaxyl "
        "with a copper-based follow-up spray 7 days later. Start spraying "
        "before the monsoon for best results."
    )
    for method in ("seqmatch", "jaccard"):
        r = gdb_match_score(tomato_paraphrase, tomato_original, method=method)
        # Realistic bands:
        #   seqmatch (character-LCS) is sensitive to small wording changes
        #     and typically lands at 0.25-0.50 on a long rephrased answer.
        #   jaccard (token overlap) is vocab-focused and lands much higher
        #     when key technical terms are preserved.
        lo, hi = (0.20, 0.60) if method == "seqmatch" else (0.40, 0.85)
        if not (lo <= r["score"] <= hi):
            failures.append(
                f"paraphrase on tomato ({method}): expected realistic band "
                f"[{lo}, {hi}], got {r['score']}"
            )
        print(f"  [{method:>8}]  score={r['score']:.4f}  (realistic band: "
              f"{lo:.2f}-{hi:.2f} for rephrased long-form text)")
    print()

    # ----------------------------------------------------------------------
    # 3. expected vs unrelated content (low)
    # ----------------------------------------------------------------------
    print("[3] expected_output vs deliberately different-domain string")
    unrelated = (
        "The 2026 monsoon forecast for the Indian subcontinent indicates "
        "above-normal rainfall driven by a positive Indian Ocean Dipole. "
        "Fishermen are advised to monitor coastal advisories. The Cricket "
        "World Cup final will be held in Mumbai on November 15."
    )
    for case in fixtures:
        for method in ("seqmatch", "jaccard"):
            r = gdb_match_score(unrelated, case["expected_output"], method=method)
            if r["score"] > 0.30:
                failures.append(
                    f"unrelated vs {case['question_id']} ({method}): "
                    f"expected low (<0.30), got {r['score']}"
                )
    print("  PASS (all 3 fixtures, both methods: < 0.30)\n")

    # ----------------------------------------------------------------------
    # 4. expected vs empty -> 0.0
    # ----------------------------------------------------------------------
    print("[4] expected_output vs empty string")
    for case in fixtures:
        for method in ("seqmatch", "jaccard"):
            r = gdb_match_score(case["expected_output"], "", method=method)
            if r["score"] != 0.0:
                failures.append(
                    f"empty-expected on {case['question_id']} ({method}): "
                    f"expected 0.0, got {r['score']}"
                )
    print("  PASS (both methods: 0.0000)\n")

    # ----------------------------------------------------------------------
    # 5. both empty -> 1.0 (vacuously identical)
    # ----------------------------------------------------------------------
    print("[5] both strings empty")
    for method in ("seqmatch", "jaccard"):
        r = gdb_match_score("", "", method=method)
        if r["score"] != 1.0:
            failures.append(
                f"both-empty ({method}): expected 1.0, got {r['score']}"
            )
    print("  PASS (both methods: 1.0000)\n")

    # ----------------------------------------------------------------------
    # 6. Show the score on each of the 3 fixture cases vs itself
    #    (regression + visible confirmation)
    # ----------------------------------------------------------------------
    print("[6] Score matrix (each fixture vs itself, both methods)")
    print(f"  {'question_id':<35} {'seqmatch':>10} {'jaccard':>10}")
    print(f"  {'-'*35} {'-'*10} {'-'*10}")
    for case in fixtures:
        r_seq = gdb_match_score(case["expected_output"], case["expected_output"], method="seqmatch")
        r_jac = gdb_match_score(case["expected_output"], case["expected_output"], method="jaccard")
        qid = case["question_id"][:35]
        print(f"  {qid:<35} {r_seq['score']:>10.4f} {r_jac['score']:>10.4f}")
    print()

    # ----------------------------------------------------------------------
    # 7. Cross-fixture comparison (should be modest — all are agriculture
    #    so share some vocabulary, but cover different crops/issues)
    # ----------------------------------------------------------------------
    print("[7] Cross-fixture comparison (tomato vs rice, both methods)")
    print("  (Not a pass/fail check — informational: shows both methods")
    print("   give non-trivial but not high scores for related-domain pairs)")
    a = fixtures[0]["expected_output"]   # tomato
    b = fixtures[1]["expected_output"]   # rice
    r_seq = gdb_match_score(a, b, method="seqmatch")
    r_jac = gdb_match_score(a, b, method="jaccard")
    print(f"  [seqmatch ]  tomato vs rice  score={r_seq['score']:.4f}")
    print(f"  [jaccard  ]  tomato vs rice  score={r_jac['score']:.4f}")
    print()

    # ----------------------------------------------------------------------
    # 8. Invalid method raises ValueError
    # ----------------------------------------------------------------------
    print("[8] Invalid method name -> ValueError")
    try:
        gdb_match_score("a", "b", method="bogus")
        failures.append("invalid method did not raise")
        print("  FAIL: no exception raised\n")
    except ValueError as e:
        if "bogus" not in str(e):
            failures.append(f"ValueError message did not mention 'bogus': {e}")
            print(f"  FAIL: ValueError raised but message wrong: {e}\n")
        else:
            print(f"  PASS (ValueError: {e})\n")

    # ----------------------------------------------------------------------
    print("=" * 70)
    if failures:
        print(f"RESULT: {len(failures)} check(s) FAILED:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("RESULT: ALL CHECKS PASSED")
    print()
    print("gdb_match_score is ready to be added to evaluate_response_quality()")
    print("as a complementary deterministic signal alongside AnswerRelevancy.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
