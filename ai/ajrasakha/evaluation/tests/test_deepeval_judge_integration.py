"""Opt-in integration test: makes REAL judge calls and spends money.

Runs only when RUN_JUDGE_INTEGRATION=1 and the judge is configured in
ai/.env (or the environment). Plain `pytest` skips it.
"""

import os

import pytest

# Imported first: this loads ai/.env, so the key is visible to the checks below.
import ajrasakha.evaluation.deepeval_metrics as dm
from ajrasakha.evaluation.questions import TEST_CASES

METRICS = [
    "AnswerRelevancyMetric",
    "FaithfulnessMetric",
    "ContextualRelevancyMetric",
]


def test_deepeval_judge_integration():
    if os.getenv("RUN_JUDGE_INTEGRATION") != "1":
        pytest.skip("Set RUN_JUDGE_INTEGRATION=1 to run this test (it spends money).")

    dm.get_judge_model.cache_clear()

    try:
        config = dm.load_judge_config()
    except dm.JudgeSetupError as exc:
        pytest.skip(f"Judge not configured: {exc}")

    # Label only: never print the key, the base URL or the config object.
    print(f"\nJudge: {config.provider}:{config.model}")

    question = "What is the current price of paddy in Mandya?"
    answer = "Paddy in Mandya is around Rs 2,300 per quintal at the mandi."
    context = ["[daily_price] Mandya paddy modal price is Rs 2,300 per quintal."]

    results = dm.evaluate_answer_with_deepeval(question, answer, context)

    for metric in METRICS:
        entry = results.get(metric, {})
        score = entry.get("score")
        reason = entry.get("reason")
        print(f"{metric}: {score}")

        assert score is not None, f"{metric} returned no score. Reason: {reason}"
        assert isinstance(score, (int, float)) and 0 <= score <= 1, (
            f"{metric} score {score!r} is out of range"
        )
        assert isinstance(reason, str) and reason.strip(), f"{metric} reason is empty"


# --- GDB Match: agreement with the synthetic reference ----------------------
#
# WARNING: this test makes REAL judge calls and spends money. Each
# evaluate_answer_with_deepeval call runs the three existing metrics plus GDB
# Match, so the two calls below are roughly eight judge calls.
#
# The reference used here is the *synthetic, manually written* expected_answer
# for `gdb_question_1` (source: `synthetic_manual`). It is NOT an ACE GDB
# answer and it has not been expert-validated. This test only checks agreement
# with that synthetic reference; it does not calibrate or assert a pass
# threshold.

# A faithful paraphrase: keeps the reference's main agricultural guidance
# (transplanting, puddling/nursery, suitable variety, water management, weed /
# pest / disease monitoring, soil-test-based fertilizer, mature harvest).
FAITHFUL_PARAPHRASE = (
    "Paddy is grown in Punjab mostly by transplanting. Puddle the field, grow "
    "healthy seedlings in a nursery, then transplant young seedlings into the "
    "main field at the recommended spacing. Pick a variety that suits the "
    "season and the area. Keep the field moist or flooded according to the crop "
    "stage, and manage weeds, insect pests and diseases through regular "
    "monitoring and local extension advice. Apply fertilizer based on a soil "
    "test and the crop stage instead of a fixed blanket dose. Harvest once the "
    "crop matures and the grains are ready."
)

# A contradictory answer: wrong crop establishment method (dry direct seeding
# with no puddling or nursery), no water management, no fertilizer or soil-test
# guidance, and an early harvest.
CONTRADICTORY_ANSWER = (
    "Paddy in Punjab should be sown dry and directly on upland soil, with no "
    "puddling and no nursery. Seedlings and transplanting are unnecessary. Do "
    "not bother with irrigation or keeping the field flooded at any stage. Skip "
    "fertilizer and soil testing completely. Harvest very early, as soon as the "
    "first green grains appear, well before the crop matures."
)


def test_gdb_match_integration():
    if os.getenv("RUN_JUDGE_INTEGRATION") != "1":
        pytest.skip("Set RUN_JUDGE_INTEGRATION=1 to run this test (it spends money).")

    dm.get_judge_model.cache_clear()

    try:
        config = dm.load_judge_config()
    except dm.JudgeSetupError as exc:
        pytest.skip(f"Judge not configured: {exc}")

    # Label only: never print the key, the base URL or the config object.
    print(f"\nJudge: {config.provider}:{config.model}")

    case = next(c for c in TEST_CASES if c["name"] == "gdb_question_1")
    reference = case["expected_answer"]
    print(f"Reference: synthetic reference (not ACE GDB) for {case['name']}")
    assert reference.strip(), "gdb_question_1 has no synthetic reference to compare against."

    query = case["query"]
    context = [reference]

    faithful = dm.evaluate_answer_with_deepeval(
        query, FAITHFUL_PARAPHRASE, context, expected_output=reference
    )["GDBMatchMetric"]
    contradictory = dm.evaluate_answer_with_deepeval(
        query, CONTRADICTORY_ANSWER, context, expected_output=reference
    )["GDBMatchMetric"]

    print(f"GDBMatchMetric (faithful): {faithful.get('score')}")
    print(f"GDBMatchMetric (contradictory): {contradictory.get('score')}")

    for label, entry in (("faithful", faithful), ("contradictory", contradictory)):
        score = entry.get("score")
        reason = entry.get("reason")

        assert isinstance(score, (int, float)) and 0 <= score <= 1, (
            f"GDB match {label} score {score!r} is not numeric in [0, 1]"
        )
        assert isinstance(reason, str) and reason.strip(), (
            f"GDB match {label} reason is empty"
        )
        # No threshold has been calibrated for GDB Match in v1.
        assert entry.get("passed") is None, (
            f"GDB match {label} passed should be None, got {entry.get('passed')!r}"
        )

    assert faithful["score"] > contradictory["score"], (
        "the faithful paraphrase should agree with the synthetic reference more "
        f"than the contradictory answer ({faithful['score']} vs "
        f"{contradictory['score']})"
    )
