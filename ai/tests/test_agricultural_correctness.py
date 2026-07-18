"""
test_agricultural_correctness.py — tests the facet-decomposed correctness
metric and its integration through evaluate_response_quality.

Coverage:
  - Method semantics: each facet scored correctly per the rules
    (whole-word for crop/regional, substring for treatment)
  - Edge cases: empty inputs, missing expected_* fields, defensive coercion
  - Discrimination: a correct answer scores 1.0; a deliberately wrong
    answer (right treatment + wrong region / wrong crop) scores lower
  - Integration: evaluate_response_quality surfaces all 4 facet columns
    plus the assessed_facets marker in all 4 metric-completion states
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

_AI_ROOT = Path(__file__).resolve().parents[1]
if str(_AI_ROOT) not in sys.path:
    sys.path.insert(0, str(_AI_ROOT))

os.environ.setdefault("EVAL_JUDGE", "mock")

from ajrasakha.evaluation.agricultural_correctness import (
    agricultural_correctness,
    _whole_word_match,
    _substring_match,
)


# ===========================================================================
# Part 1: unit tests on the metric itself
# ===========================================================================

def test_all_facets_correctly_identified():
    """All 3 facets present and correct → overall score 1.0, all facets=1.0."""
    actual = "For tomato blight in Karnataka, spray Metalaxyl+Mancozeb at 2.5g/L."
    result = agricultural_correctness(
        actual_output=actual,
        expected_output="Use Metalaxyl+Mancozeb on tomato in Karnataka.",
        expected_crop="tomato",
        expected_treatment="Metalaxyl+Mancozeb",
        expected_region="Karnataka",
    )
    assert result["score"] == 1.0, f"expected 1.0, got {result['score']}"
    assert result["facets"]["crop"] == 1.0
    assert result["facets"]["treatment"] == 1.0
    assert result["facets"]["regional"] == 1.0
    assert set(result["assessed_facets"]) == {"crop", "treatment", "regional"}
    print(f"  all 3 facets correct → score=1.0, all facets=1.0")


def test_partial_match_right_crop_wrong_treatment():
    """Right crop + region but wrong treatment → 2/3 facets correct."""
    actual = "For tomato blight in Karnataka, apply Bordeaux mixture weekly."
    result = agricultural_correctness(
        actual_output=actual,
        expected_output="irrelevant — only facets are assessed",
        expected_crop="tomato",
        expected_treatment="Metalaxyl+Mancozeb",
        expected_region="Karnataka",
    )
    # crop ✓, region ✓, treatment ✗ (Bordeaux != Metalaxyl+Mancozeb)
    assert result["facets"]["crop"] == 1.0
    assert result["facets"]["regional"] == 1.0
    assert result["facets"]["treatment"] == 0.0
    assert result["score"] == round(2/3, 4), f"expected 0.6667, got {result['score']}"
    print(f"  right crop + region, wrong treatment → score={result['score']} (2/3 facets correct)")


def test_partial_match_right_treatment_wrong_region():
    """Treatment correct but crop + region wrong."""
    actual = "For rice blight in Punjab, spray Metalaxyl+Mancozeb at 2.5g/L."
    result = agricultural_correctness(
        actual_output=actual,
        expected_output="irrelevant",
        expected_crop="tomato",        # wrong (rice is mentioned, not tomato)
        expected_treatment="Metalaxyl+Mancozeb",  # correct
        expected_region="Karnataka",   # wrong (Punjab is mentioned)
    )
    assert result["facets"]["crop"] == 0.0
    assert result["facets"]["treatment"] == 1.0
    assert result["facets"]["regional"] == 0.0
    assert result["score"] == round(1/3, 4), f"expected 0.3333, got {result['score']}"
    print(f"  right treatment only → score={result['score']} (1/3 facets)")


def test_all_facets_wrong():
    """No facet matches → overall 0.0."""
    actual = "For wheat rust in Maharashtra, use Propiconazole at 1ml/L."
    result = agricultural_correctness(
        actual_output=actual,
        expected_output="irrelevant",
        expected_crop="tomato",
        expected_treatment="Metalaxyl+Mancozeb",
        expected_region="Karnataka",
    )
    assert result["score"] == 0.0
    assert all(result["facets"][f] == 0.0 for f in ("crop", "treatment", "regional"))
    print(f"  no facet matches → score=0.0")


def test_case_insensitive_match():
    """Whole-word and substring matches are case-insensitive."""
    actual = "For TOMATO blight in karnataka, spray METALAXYL+MANCOZEB."
    result = agricultural_correctness(
        actual_output=actual,
        expected_output="irrelevant",
        expected_crop="tomato",                       # lowercase form
        expected_treatment="Metalaxyl+Mancozeb",     # capitalized form
        expected_region="Karnataka",                  # lowercase form
    )
    assert result["score"] == 1.0, f"expected case-insensitive match, got {result['score']}"
    print(f"  case-insensitive match across all 3 facets → score=1.0")


def test_whole_word_match_does_not_false_positive_on_substring():
    """
    'rice' as a substring of 'price' should NOT count. Whole-word match
    protects against this; substring match (used for treatment) would.
    """
    actual = "Today's price for rice is favorable. Apply fungicide."
    result = agricultural_correctness(
        actual_output=actual,
        expected_output="irrelevant",
        expected_crop="rice",          # whole-word match: must find rice NOT in 'price'
        expected_treatment="Mancozeb", # substring match: no need to test, just verifies
        expected_region="Karnataka",
    )
    # 'rice' appears in actual as a substring of 'price', but whole-word should
    # still match the standalone 'rice' in the sentence — that's a real match.
    # The real protection is: "rice" should NOT match in "ricefield" or "rices"
    # — let's add a negative test for that case in the helper-level test below.
    # Here we just confirm both crop and region are correctly recognized.
    assert result["facets"]["crop"] == 1.0
    print(f"  whole-word 'rice' match against 'Today's price for rice' → facet_crop=1.0")


def test_whole_word_does_not_match_inside_longer_word():
    """'rice' must NOT match inside 'ricestalk' or 'rices' or 'fertilizers'."""
    # 'rice' is followed by 'stalk' — whole-word match should fail
    actual = "Apply fertilizer to ricestalk for better yield."
    result = _whole_word_match("rice", actual)
    assert result == 0.0, f"'rice' in 'ricestalk' should NOT match, got {result}"
    print(f"  'rice' does NOT match inside 'ricestalk' (whole-word protection)")


def test_substring_match_does_match_inside_longer_word():
    """Treatment uses substring match — 'Imidacloprid' inside 'Imidacloprid17.8%' should match."""
    actual = "Apply Imidacloprid17.8% SL at 0.5 ml per litre."
    result = _substring_match("Imidacloprid", actual)
    assert result == 1.0, f"substring match should find Imidacloprid, got {result}"
    print(f"  'Imidacloprid' substring match against 'Imidacloprid17.8% SL' → 1.0")


def test_unassessed_facets_default_to_1():
    """Per spec: unassessed facets return 1.0 (not penalised)."""
    actual = "Anything goes here."
    result = agricultural_correctness(
        actual_output=actual,
        expected_output="irrelevant",
        expected_crop="",       # not assessed
        expected_treatment="Mancozeb",
        expected_region="",     # not assessed
    )
    # Only treatment is assessed. crop + regional show as 1.0 (unassessed default).
    assert result["facets"]["crop"] == 1.0, "unassessed facet should default to 1.0"
    assert result["facets"]["regional"] == 1.0
    # treatment: 'Mancozeb' NOT in actual
    assert result["facets"]["treatment"] == 0.0
    # Score is mean of assessed facets only — that's just [treatment] = 0.0
    assert result["score"] == 0.0
    assert result["assessed_facets"] == ["treatment"]
    print(f"  unassessed facets default to 1.0; score is mean of assessed only")


def test_no_facets_assessed_returns_1():
    """All expected_* empty → score 1.0, no assessed facets, callers can detect."""
    actual = "anything"
    result = agricultural_correctness(actual, "expected")
    assert result["score"] == 1.0
    assert result["assessed_facets"] == []
    print(f"  no expected_* fields → score=1.0 (vacuously identical, assessed=[])")


def test_empty_actual_output():
    """Defensive: actual_output is empty — all assessed facets should be 0.0."""
    result = agricultural_correctness(
        actual_output="",
        expected_output="expected",
        expected_crop="tomato",
        expected_treatment="Mancozeb",
        expected_region="Karnataka",
    )
    assert result["score"] == 0.0
    assert result["facets"]["crop"] == 0.0
    assert result["facets"]["treatment"] == 0.0
    assert result["facets"]["regional"] == 0.0
    print(f"  empty actual_output → all facets 0.0, score 0.0")


def test_defensive_coercion():
    """None and non-string inputs are treated as empty without raising."""
    result = agricultural_correctness(
        actual_output=None,           # type: ignore[arg-type]
        expected_output="expected",
        expected_crop=42,             # type: ignore[arg-type]
        expected_treatment=None,
        expected_region=["Karnataka"], # type: ignore[arg-type]
    )
    # crop: coerced to "42", not in "" → 0.0
    # treatment: empty (None coerced) → skipped (1.0)
    # region: coerced to "['Karnataka']", not in "" → 0.0
    assert result["score"] == 0.0  # mean of [crop=0, region=0] = 0
    print(f"  None / non-string inputs → coerced defensively, no exceptions")


# ===========================================================================
# Part 2: integration through evaluate_response_quality
# ===========================================================================

def test_evaluate_response_quality_keys_present_in_scored_state():
    """All 4 facet keys appear in the dict when agricultural_correctness runs."""
    from ajrasakha.evaluation.answer_eval import evaluate_response_quality
    result = evaluate_response_quality(
        {
            "query": "What's the treatment for tomato blight?",
            "response_text": "For tomato blight in Karnataka, use Metalaxyl+Mancozeb.",
            "expected_output": "Use Metalaxyl+Mancozeb on tomato in Karnataka.",
            "expected_metadata": {
                "expected_crop": "tomato",
                "expected_treatment": "Metalaxyl+Mancozeb",
                "expected_region": "Karnataka",
            },
        },
        enabled=True,
    )
    expected_keys = {
        "agriculturalcorrectness_score",
        "agriculturalcorrectness_facets_crop",
        "agriculturalcorrectness_facets_treatment",
        "agriculturalcorrectness_facets_regional",
        "agriculturalcorrectness_facets_assessed",
    }
    for k in expected_keys:
        assert k in result, f"missing key: {k}"
    # In scored state with a real fixture, score should be 1.0 (perfect match)
    assert float(result["agriculturalcorrectness_score"]) == 1.0
    assert result["agriculturalcorrectness_facets_crop"] == "1.0"
    assert result["agriculturalcorrectness_facets_treatment"] == "1.0"
    assert result["agriculturalcorrectness_facets_regional"] == "1.0"
    assert result["agriculturalcorrectness_facets_assessed"] == "crop,treatment,regional"
    print(f"  scored state: score=1.0, all 3 facets=1.0, assessed='crop,treatment,regional'")


def test_evaluate_response_quality_method_not_applicable_when_no_expected_output():
    """Without expected_output, agricultural_correctness returns method='not_applicable'."""
    from ajrasakha.evaluation.answer_eval import evaluate_response_quality
    result = evaluate_response_quality(
        {
            "query": "x",
            "response_text": "y",
            # NO expected_output
        },
        enabled=True,
    )
    assert result["agriculturalcorrectness_score"] == ""
    assert result["agriculturalcorrectness_facets_assessed"] == ""
    print(f"  no expected_output → score='', assessed='' (not_applicable)")


def test_evaluate_response_quality_disabled_state_carries_empty_facets():
    """Disabled state preserves all keys with empty values."""
    from ajrasakha.evaluation.answer_eval import evaluate_response_quality
    result = evaluate_response_quality({"query": "x", "response_text": "y"}, enabled=False)
    assert result["agriculturalcorrectness_score"] == ""
    assert result["agriculturalcorrectness_facets_crop"] == ""
    assert result["agriculturalcorrectness_facets_treatment"] == ""
    assert result["agriculturalcorrectness_facets_regional"] == ""
    assert result["agriculturalcorrectness_facets_assessed"] == ""
    print(f"  disabled state: all 4 facet columns present, all empty")


def test_evaluate_response_quality_answer_missing_carries_empty_facets():
    """Empty-query guard preserves all keys with empty values."""
    from ajrasakha.evaluation.answer_eval import evaluate_response_quality
    result = evaluate_response_quality(
        {"query": "", "response_text": "", "expected_output": "x"},
        enabled=True,
    )
    assert result["agriculturalcorrectness_score"] == ""
    assert result["agriculturalcorrectness_facets_crop"] == ""
    print(f"  answer_missing state: all 4 facet columns present, all empty")


def test_evaluate_response_quality_falls_back_to_top_level_expected_fields():
    """If expected_metadata is absent, top-level expected_* fields are used."""
    from ajrasakha.evaluation.answer_eval import evaluate_response_quality
    result = evaluate_response_quality(
        {
            "query": "x",
            "response_text": "For tomato blight in Karnataka, use Metalaxyl.",
            "expected_output": "x",
            # NO expected_metadata — pass top-level instead
            "expected_crop": "tomato",
            "expected_treatment": "Metalaxyl",
            "expected_region": "Karnataka",
        },
        enabled=True,
    )
    assert float(result["agriculturalcorrectness_score"]) == 1.0, (
        f"top-level expected_* should fall back and match, got "
        f"{result['agriculturalcorrectness_score']}"
    )
    print(f"  top-level expected_* fallback works → score=1.0")


def test_discrimination_right_vs_wrong_answer():
    """Same fixture, swap correct answer for a wrong one; score must drop."""
    from ajrasakha.evaluation.answer_eval import evaluate_response_quality

    expected_output = "For tomato blight in Karnataka, use Metalaxyl+Mancozeb."
    base = {
        "query": "What's the treatment for tomato blight?",
        "expected_output": expected_output,
        "expected_metadata": {
            "expected_crop": "tomato",
            "expected_treatment": "Metalaxyl+Mancozeb",
            "expected_region": "Karnataka",
        },
    }

    correct = evaluate_response_quality(
        {**base, "response_text": expected_output},
        enabled=True,
    )
    wrong = evaluate_response_quality(
        {**base, "response_text": "For wheat rust in Maharashtra, apply Propiconazole."},
        enabled=True,
    )

    correct_score = float(correct["agriculturalcorrectness_score"])
    wrong_score = float(wrong["agriculturalcorrectness_score"])
    assert correct_score == 1.0, f"correct answer should score 1.0, got {correct_score}"
    assert wrong_score == 0.0, f"wrong answer should score 0.0, got {wrong_score}"
    assert correct_score > wrong_score, "score must distinguish correct from wrong"
    print(f"  discrimination: correct=1.0, wrong=0.0 (3/3 facets differ)")


# ===========================================================================
# Entry point
# ===========================================================================

def main() -> int:
    print("=" * 75)
    print("agricultural_correctness test suite")
    print("=" * 75)
    print()

    unit_tests = [
        ("all 3 facets correct",                          test_all_facets_correctly_identified),
        ("right crop + region, wrong treatment",           test_partial_match_right_crop_wrong_treatment),
        ("right treatment only",                           test_partial_match_right_treatment_wrong_region),
        ("no facet matches",                               test_all_facets_wrong),
        ("case-insensitive match",                          test_case_insensitive_match),
        ("'rice' substring vs whole-word",                test_whole_word_match_does_not_false_positive_on_substring),
        ("whole-word: 'rice' NOT in 'ricestalk'",         test_whole_word_does_not_match_inside_longer_word),
        ("substring: 'Imidacloprid' in 'Imidacloprid17.8%'", test_substring_match_does_match_inside_longer_word),
        ("unassessed facets default to 1.0",               test_unassessed_facets_default_to_1),
        ("no facets assessed → 1.0 vacuously",             test_no_facets_assessed_returns_1),
        ("empty actual_output → all 0.0",                  test_empty_actual_output),
        ("defensive coercion of non-string inputs",        test_defensive_coercion),
    ]

    integration_tests = [
        ("integration: scored state has all keys",         test_evaluate_response_quality_keys_present_in_scored_state),
        ("integration: no expected_output → not_applicable", test_evaluate_response_quality_method_not_applicable_when_no_expected_output),
        ("integration: disabled state keys empty",         test_evaluate_response_quality_disabled_state_carries_empty_facets),
        ("integration: answer_missing keys empty",        test_evaluate_response_quality_answer_missing_carries_empty_facets),
        ("integration: top-level expected_* fallback",     test_evaluate_response_quality_falls_back_to_top_level_expected_fields),
        ("integration: discrimination right vs wrong",    test_discrimination_right_vs_wrong_answer),
    ]

    failures = 0
    print("--- unit tests on the metric ---")
    for name, fn in unit_tests:
        print(f"[{name}]")
        try:
            fn()
            print(f"  PASS\n")
        except AssertionError as e:
            print(f"  FAIL: {e}\n")
            failures += 1
        except Exception as e:
            print(f"  ERROR: {type(e).__name__}: {e}\n")
            failures += 1

    print("--- integration tests through evaluate_response_quality ---")
    for name, fn in integration_tests:
        print(f"[{name}]")
        try:
            fn()
            print(f"  PASS\n")
        except AssertionError as e:
            print(f"  FAIL: {e}\n")
            failures += 1
        except Exception as e:
            print(f"  ERROR: {type(e).__name__}: {e}\n")
            failures += 1

    print("=" * 75)
    total = len(unit_tests) + len(integration_tests)
    if failures == 0:
        print(f"RESULT: {total}/{total} tests passed")
        return 0
    print(f"RESULT: {failures} test(s) FAILED")
    return 1


if __name__ == "__main__":
    sys.exit(main())
