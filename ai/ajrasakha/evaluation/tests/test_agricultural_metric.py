"""Pure tests for the agricultural expectation builder.

No DeepEval import, no network, no judge. These tests pin the exact contract
consumed by the DeepEval metric added in a later step:

    {
        "crop": str | None,
        "crop_aliases": list[str],
        "state": str | None,
        "city": str | None,
        "cultivation_guidance_reference": str | None,
        "cultivation_guidance_reference_source": str | None,
        "applicable": {"crop": bool, "region": bool, "cultivation_guidance": bool},
    }

The builder must never infer expectations from query text, case names or city
names, and must never mutate the input case.
"""

from copy import deepcopy

import pytest
from deepeval.models import DeepEvalBaseLLM

from ajrasakha.evaluation import deepeval_metrics as dm
from ajrasakha.evaluation.agricultural_metric import build_agricultural_expectations
from ajrasakha.evaluation.agricultural_scoring import (
    _dimension_anchor,
    _expectation_text,
    evaluate_agricultural_accuracy,
)
from ajrasakha.evaluation.questions import TEST_CASES


CONTRACT_KEYS = {
    "crop",
    "crop_aliases",
    "state",
    "city",
    "cultivation_guidance_reference",
    "cultivation_guidance_reference_source",
    "applicable",
}

APPLICABLE_KEYS = {"crop", "region", "cultivation_guidance"}


def base_case(**overrides):
    """A minimal case with all three dimensions potentially applicable."""
    case = {
        "name": "case_x",
        "query": "What is the price of wheat in Sirsa mandi?",
        "expected_domain": "Market Prices",
        "expected_plan": {"crop": "Wheat"},
        "location": {"city": "Sirsa", "state": "Haryana"},
    }
    case.update(overrides)
    return case


def expectations_for(**overrides):
    return build_agricultural_expectations(base_case(**overrides))


def get_case(name):
    for case in TEST_CASES:
        if case["name"] == name:
            return case
    raise AssertionError(f"missing test case: {name}")


# --- 1/2. Crop extraction and contract shape -------------------------------


def test_crop_from_expected_plan():
    result = expectations_for()
    assert result["crop"] == "Wheat"
    assert result["crop_aliases"] == ["Wheat"]
    assert result["applicable"]["crop"] is True


def test_contract_key_set_is_exact():
    result = expectations_for()
    assert set(result) == CONTRACT_KEYS
    assert set(result["applicable"]) == APPLICABLE_KEYS


# --- 3/4/5. Crop inapplicability -------------------------------------------


def test_missing_expected_plan_makes_crop_not_applicable():
    case = base_case()
    del case["expected_plan"]
    result = build_agricultural_expectations(case)
    assert result["crop"] is None
    assert result["crop_aliases"] == []
    assert result["applicable"]["crop"] is False


def test_none_or_non_dict_expected_plan_makes_crop_not_applicable():
    for plan in (None, [], "Wheat", 3):
        result = expectations_for(expected_plan=plan)
        assert result["crop"] is None
        assert result["crop_aliases"] == []
        assert result["applicable"]["crop"] is False


def test_missing_crop_key_makes_crop_not_applicable():
    result = expectations_for(expected_plan={"mandi": True})
    assert result["crop"] is None
    assert result["crop_aliases"] == []
    assert result["applicable"]["crop"] is False


def test_empty_or_whitespace_crop_makes_crop_not_applicable():
    for crop in ("", "   ", "\t\n"):
        result = expectations_for(expected_plan={"crop": crop})
        assert result["crop"] is None
        assert result["crop_aliases"] == []
        assert result["applicable"]["crop"] is False


def test_all_crop_is_not_applicable_case_insensitive():
    for crop in ("all", "All", " ALL ", "aLl"):
        result = expectations_for(expected_plan={"crop": crop})
        assert result["crop"] is None
        assert result["crop_aliases"] == []
        assert result["applicable"]["crop"] is False


def test_non_string_crop_makes_crop_not_applicable():
    for crop in (None, 5, ["Paddy"], {"name": "Paddy"}):
        result = expectations_for(expected_plan={"crop": crop})
        assert result["crop"] is None
        assert result["crop_aliases"] == []
        assert result["applicable"]["crop"] is False


# --- 6/7. Paddy / Rice aliases ---------------------------------------------


def test_paddy_expands_to_rice_alias():
    result = expectations_for(expected_plan={"crop": "Paddy"})
    assert result["crop"] == "Paddy"
    assert result["crop_aliases"] == ["Paddy", "Rice"]
    assert result["applicable"]["crop"] is True


def test_rice_expands_to_paddy_alias():
    result = expectations_for(expected_plan={"crop": "Rice"})
    assert result["crop"] == "Rice"
    assert result["crop_aliases"] == ["Rice", "Paddy"]
    assert result["applicable"]["crop"] is True


def test_case_variants_keep_spelling_but_resolve_aliases():
    lowercase = expectations_for(expected_plan={"crop": "paddy"})
    assert lowercase["crop"] == "paddy"
    assert lowercase["crop_aliases"] == ["Paddy", "Rice"]

    uppercase = expectations_for(expected_plan={"crop": "RICE"})
    assert uppercase["crop"] == "RICE"
    assert uppercase["crop_aliases"] == ["Rice", "Paddy"]


def test_other_crop_gets_no_invented_alias():
    result = expectations_for(expected_plan={"crop": "Wheat"})
    assert result["crop"] == "Wheat"
    assert result["crop_aliases"] == ["Wheat"]


def test_crop_is_stripped_but_spelling_preserved():
    result = expectations_for(expected_plan={"crop": "  Paddy  "})
    assert result["crop"] == "Paddy"
    assert result["crop_aliases"] == ["Paddy", "Rice"]


# --- 8/9/10. Region ---------------------------------------------------------


def test_region_from_state_and_city():
    result = expectations_for()
    assert result["state"] == "Haryana"
    assert result["city"] == "Sirsa"
    assert result["applicable"]["region"] is True


def test_state_only_location_is_applicable_without_city():
    result = expectations_for(location={"state": "Punjab"})
    assert result["state"] == "Punjab"
    assert result["city"] is None
    assert result["applicable"]["region"] is True


def test_missing_or_invalid_location_makes_region_not_applicable():
    case = base_case()
    del case["location"]
    for location in (None, [], "Punjab", 5):
        result = build_agricultural_expectations({**case, "location": location})
        assert result["state"] is None
        assert result["city"] is None
        assert result["applicable"]["region"] is False


def test_missing_empty_or_non_string_state_makes_region_not_applicable():
    for state in (None, "", "   ", 5, ["Punjab"]):
        result = expectations_for(location={"city": "Sirsa", "state": state})
        assert result["state"] is None
        assert result["applicable"]["region"] is False


def test_empty_city_becomes_none():
    result = expectations_for(location={"state": "Punjab", "city": "  "})
    assert result["state"] == "Punjab"
    assert result["city"] is None
    assert result["applicable"]["region"] is True


# --- 11. General domain excludes region only -------------------------------


def test_general_domain_excludes_region_even_with_location():
    result = expectations_for(
        expected_domain="General",
        location={"state": "Punjab", "city": "Ropar"},
        expected_plan={"crop": "Paddy"},
        expected_answer="Transplant paddy seedlings.",
        expected_answer_source="synthetic_manual",
    )
    assert result["state"] is None
    assert result["city"] is None
    assert result["applicable"]["region"] is False
    # General is not a blanket exclusion.
    assert result["applicable"]["crop"] is True
    assert result["applicable"]["cultivation_guidance"] is True


# --- 12/13/14. Cultivation guidance ----------------------------------------


def test_cultivation_guidance_from_expected_answer_and_source():
    result = expectations_for(
        expected_answer="Transplant paddy seedlings.",
        expected_answer_source="synthetic_manual",
    )
    assert result["cultivation_guidance_reference"] == "Transplant paddy seedlings."
    assert result["cultivation_guidance_reference_source"] == "synthetic_manual"
    assert result["applicable"]["cultivation_guidance"] is True


def test_whitespace_or_missing_expected_answer_makes_guidance_not_applicable():
    for answer in (None, "", "   ", "\t\n"):
        result = expectations_for(expected_answer=answer)
        assert result["cultivation_guidance_reference"] is None
        assert result["cultivation_guidance_reference_source"] is None
        assert result["applicable"]["cultivation_guidance"] is False


def test_non_string_expected_answer_makes_guidance_not_applicable():
    for answer in (5, ["text"], {"text": "x"}):
        result = expectations_for(expected_answer=answer)
        assert result["cultivation_guidance_reference"] is None
        assert result["cultivation_guidance_reference_source"] is None
        assert result["applicable"]["cultivation_guidance"] is False


def test_missing_source_is_not_invented():
    result = expectations_for(expected_answer="Transplant paddy seedlings.")
    assert result["cultivation_guidance_reference"] == "Transplant paddy seedlings."
    assert result["cultivation_guidance_reference_source"] is None
    assert result["applicable"]["cultivation_guidance"] is True


def test_expected_answer_is_stripped():
    result = expectations_for(expected_answer="  Transplant paddy seedlings.  ")
    assert result["cultivation_guidance_reference"] == "Transplant paddy seedlings."


# --- 15/16/17. No expectations, no inference --------------------------------


def test_returns_none_when_no_dimension_applies():
    result = build_agricultural_expectations(
        base_case(
            expected_plan={"crop": "all"},
            location=None,
            expected_domain="General",
        )
    )
    assert result is None


def test_no_inference_from_query_or_name():
    result = build_agricultural_expectations(
        {
            "name": "rice_punjab_mandya_treatment",
            "query": (
                "How to grow rice in Punjab? What is the price in Mandya mandi "
                "and what fertilizer treatment should I apply?"
            ),
            "expected_domain": "Cultural Practices",
        }
    )
    assert result is None


def test_mandya_case_yields_none_without_structured_expectations():
    case = get_case("mandya_paddy_price")
    assert "location" not in case
    assert "crop" not in case["expected_plan"]
    assert case["expected_domain"] != "General"

    assert build_agricultural_expectations(case) is None


# --- 18. No mutation --------------------------------------------------------


def test_builder_does_not_mutate_input():
    case = base_case(
        expected_plan={"crop": "Paddy"},
        location={"state": "Punjab", "city": "Ropar"},
        expected_answer="Transplant paddy seedlings.",
        expected_answer_source="synthetic_manual",
    )
    before = deepcopy(case)
    result = build_agricultural_expectations(case)
    assert case == before
    assert result["applicable"] == {
        "crop": True,
        "region": True,
        "cultivation_guidance": True,
    }


# --- 19. Independent applicability -----------------------------------------


def test_crop_only_applicability():
    result = expectations_for(
        expected_plan={"crop": "Wheat"},
        expected_domain="General",
        location=None,
    )
    assert result["applicable"] == {
        "crop": True,
        "region": False,
        "cultivation_guidance": False,
    }


def test_region_only_applicability():
    result = expectations_for(
        expected_plan={"crop": "all"},
        expected_domain="Weather",
        location={"state": "Punjab"},
    )
    assert result["applicable"] == {
        "crop": False,
        "region": True,
        "cultivation_guidance": False,
    }


def test_cultivation_guidance_only_applicability():
    result = expectations_for(
        expected_plan={"crop": "all"},
        expected_domain="General",
        location=None,
        expected_answer="Transplant paddy seedlings.",
    )
    assert result["applicable"] == {
        "crop": False,
        "region": False,
        "cultivation_guidance": True,
    }


def test_all_three_dimensions_applicability():
    result = expectations_for(
        expected_plan={"crop": "Paddy"},
        expected_domain="Cultural Practices",
        location={"state": "Punjab", "city": "Ropar"},
        expected_answer="Transplant paddy seedlings.",
        expected_answer_source="synthetic_manual",
    )
    assert result["applicable"] == {
        "crop": True,
        "region": True,
        "cultivation_guidance": True,
    }


# --- 20. Current-data coverage guard ---------------------------------------


def test_current_data_coverage_guard():
    """Deliberate guard: update only when the fixture data changes on purpose.

    The spec says "approximately 12" region cases. The current file yields 11
    because ``mandya_paddy_price`` has no ``location`` (so no explicit state,
    and no state is inferred from "Mandya").
    """
    crop_names = set()
    region_names = set()
    cultivation_guidance_names = set()

    for case in TEST_CASES:
        result = build_agricultural_expectations(case)
        if result is None:
            continue
        if result["applicable"]["crop"]:
            crop_names.add(case["name"])
        if result["applicable"]["region"]:
            region_names.add(case["name"])
        if result["applicable"]["cultivation_guidance"]:
            cultivation_guidance_names.add(case["name"])

    assert crop_names == {
        "market_question_1",
        "market_question_2",
        "soil_question_1",
        "gdb_question_1",
        "multi_tool_question",
    }
    assert region_names == {
        "weather_question_1",
        "weather_question_2",
        "weather_question_3",
        "market_question_1",
        "market_question_2",
        "soil_question_1",
        "scheme_question_1",
        "scheme_question_2",
        "gdb_question_1",
        "simple_weather_control",
        "multi_tool_question",
    }
    assert cultivation_guidance_names == {"gdb_question_1"}


# ==========================================================================
# Step 3 — scoring helper and evaluate_agricultural_accuracy
#
# No DeepEval judge, no network. ``get_judge_model`` and
# ``_build_agricultural_metric`` are replaced with recording fakes.
# ==========================================================================


JUDGE_VARS = [
    "JUDGE_PROVIDER",
    "JUDGE_MODEL",
    "JUDGE_BASE_URL",
    "JUDGE_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
]


@pytest.fixture(autouse=True)
def clear_judge_env(monkeypatch):
    """The whole module must run with no judge configuration present."""
    for name in JUDGE_VARS:
        monkeypatch.delenv(name, raising=False)


FULL_CASE = {
    "name": "agricultural_full_case",
    "query": "How should I grow paddy in Punjab?",
    "expected_domain": "Cultural Practices",
    "expected_plan": {"crop": "Paddy"},
    "location": {"state": "Punjab", "city": "Ropar"},
    "expected_answer": "Transplant paddy seedlings after puddling.",
    "expected_answer_source": "synthetic_manual",
}


def expectations_for_keys(*keys):
    """Build real expectations containing only the requested dimensions."""
    case = {"expected_domain": "Cultural Practices"}
    if "crop" in keys:
        case["expected_plan"] = {"crop": "Paddy"}
    if "region" in keys:
        case["location"] = {"state": "Punjab"}
    if "cultivation_guidance" in keys:
        case["expected_answer"] = "Transplant paddy seedlings after puddling."
        case["expected_answer_source"] = "synthetic_manual"
    expectations = build_agricultural_expectations(case)
    assert expectations is not None
    return expectations


def full_expectations():
    return build_agricultural_expectations(FULL_CASE)


class FakeAgriculturalMetric:
    """Mirror of the GEval measure contract used by the scoring helper."""

    def __init__(self, dimension, score, reason, measure_error=None):
        self.dimension = dimension
        self._score = score
        self._reason = reason
        self._measure_error = measure_error
        self.score = None
        self.reason = None
        self.test_cases = []

    def measure(self, test_case):
        self.test_cases.append(test_case)
        if self._measure_error is not None:
            raise self._measure_error
        self.score = self._score
        self.reason = self._reason


def install_agricultural_fakes(
    monkeypatch,
    scores=None,
    reasons=None,
    measure_errors=None,
    build_errors=None,
    judge_error=None,
):
    """Install recording fakes and return (metrics registry, judge calls)."""
    scores = scores or {}
    reasons = reasons or {}
    measure_errors = measure_errors or {}
    build_errors = build_errors or {}
    registry = []
    judge_calls = []

    def fake_get_judge_model():
        judge_calls.append(True)
        if judge_error is not None:
            raise judge_error
        return object()

    def fake_build_metric(model, dimension):
        error = build_errors.get(dimension)
        if error is not None:
            raise error
        metric = FakeAgriculturalMetric(
            dimension,
            score=scores.get(dimension, 1.0),
            reason=reasons.get(dimension, f"{dimension} judge reason"),
            measure_error=measure_errors.get(dimension),
        )
        registry.append(metric)
        return metric

    monkeypatch.setattr(dm, "get_judge_model", fake_get_judge_model)
    monkeypatch.setattr(
        dm, "_build_agricultural_metric", fake_build_metric, raising=False
    )
    return registry, judge_calls


# --- 1. Anchor mapping ------------------------------------------------------


@pytest.mark.parametrize(
    "score, anchor",
    [
        (0.0, 0.0),
        (0.29, 0.0),
        (0.3, 0.0),
        (0.3000001, 0.5),
        (0.35, 0.5),
        (0.59, 0.5),
        (0.6, 0.5),
        (0.6000001, 1.0),
        (0.7, 1.0),
        (0.9, 1.0),
        (1.0, 1.0),
    ],
)
def test_dimension_anchor_bands(score, anchor):
    assert _dimension_anchor(score) == anchor


@pytest.mark.parametrize(
    "score",
    [
        None,
        float("nan"),
        "0.5",
        True,
        False,
        object(),
        [],
        -0.1,
        1.1,
        float("inf"),
    ],
)
def test_dimension_anchor_rejects_invalid_scores(score):
    assert _dimension_anchor(score) is None


def test_invalid_scores_never_become_zero():
    for score in (None, float("nan"), "0.5", True, -0.1, 1.1):
        anchor = _dimension_anchor(score)
        assert anchor is None
        assert anchor != 0.0


# --- 2. Only applicable dimensions are measured -----------------------------


def test_crop_only_expectations_measure_only_crop(monkeypatch):
    registry, judge_calls = install_agricultural_fakes(monkeypatch)

    result = evaluate_agricultural_accuracy(
        "q", "a", expectations_for_keys("crop")
    )

    assert [metric.dimension for metric in registry] == ["crop"]
    assert len(registry[0].test_cases) == 1
    assert len(judge_calls) == 1
    assert result["dimensions"].keys() == {"crop"}


def test_all_three_dimensions_measure_once_each(monkeypatch):
    registry, judge_calls = install_agricultural_fakes(monkeypatch)

    evaluate_agricultural_accuracy("q", "a", full_expectations())

    assert [metric.dimension for metric in registry] == [
        "crop",
        "region",
        "cultivation_guidance",
    ]
    assert all(len(metric.test_cases) == 1 for metric in registry)
    assert len(judge_calls) == 1


def test_no_expectations_returns_none_without_building_a_judge(monkeypatch):
    def boom():
        raise AssertionError("judge must not be built")

    monkeypatch.setattr(dm, "get_judge_model", boom)
    assert evaluate_agricultural_accuracy("q", "a", None) is None


def test_no_applicable_dimension_returns_none_without_building_a_judge(
    monkeypatch,
):
    def boom():
        raise AssertionError("judge must not be built")

    monkeypatch.setattr(dm, "get_judge_model", boom)
    expectations = {
        "applicable": {
            "crop": False,
            "region": False,
            "cultivation_guidance": False,
        }
    }
    assert evaluate_agricultural_accuracy("q", "a", expectations) is None


# --- 3. Deterministic expectation text -------------------------------------


def test_crop_expectation_text_has_crop_and_aliases():
    text = _expectation_text("crop", full_expectations())

    assert "Crop expectation:" in text
    assert "expected_crop: Paddy" in text
    assert "Paddy" in text and "Rice" in text
    assert "equivalent_aliases: Paddy, Rice" in text
    assert "expected_state" not in text
    assert "reference:" not in text


def test_region_expectation_text_has_state_and_city():
    text = _expectation_text("region", full_expectations())

    assert "Region expectation:" in text
    assert "expected_state: Punjab" in text
    assert "expected_city: Ropar" in text
    assert "expected_crop" not in text
    assert "reference:" not in text


def test_region_expectation_text_omits_missing_city():
    text = _expectation_text("region", expectations_for_keys("region"))

    assert "expected_state: Punjab" in text
    assert "expected_city" not in text


def test_cultivation_guidance_expectation_text_has_reference_and_provenance():
    text = _expectation_text("cultivation_guidance", full_expectations())

    assert "Cultivation guidance expectation:" in text
    assert "Transplant paddy seedlings after puddling." in text
    assert "source: synthetic_manual (synthetic/manual reference, not ACE GDB)" in text
    assert "expected_crop" not in text
    assert "expected_state" not in text


def test_cultivation_guidance_text_reports_missing_source_as_unknown():
    expectations = build_agricultural_expectations(
        {
            "expected_domain": "Cultural Practices",
            "expected_answer": "Transplant paddy seedlings after puddling.",
        }
    )
    text = _expectation_text("cultivation_guidance", expectations)

    assert "source: unknown" in text
    assert "ACE GDB" not in text


def test_cultivation_guidance_text_does_not_claim_ace_status_for_other_source():
    expectations = build_agricultural_expectations(
        {
            "expected_domain": "Cultural Practices",
            "expected_answer": "Transplant paddy seedlings after puddling.",
            "expected_answer_source": "expert_review",
        }
    )
    text = _expectation_text("cultivation_guidance", expectations)

    assert "source: expert_review" in text
    assert "ACE GDB" not in text


# --- 4/5. LLMTestCase construction -----------------------------------------


def test_dimension_expectation_is_passed_as_context(monkeypatch):
    registry, _ = install_agricultural_fakes(monkeypatch)
    expectations = full_expectations()

    evaluate_agricultural_accuracy("q", "a", expectations)

    for metric in registry:
        test_case = metric.test_cases[0]
        assert test_case.context == [
            _expectation_text(metric.dimension, expectations)
        ]


def test_full_gdb_reference_is_passed_as_cultivation_guidance_context(monkeypatch):
    case = get_case("gdb_question_1")
    expectations = build_agricultural_expectations(case)
    registry, _ = install_agricultural_fakes(monkeypatch)

    evaluate_agricultural_accuracy(
        case["query"], "A paddy-growing answer.", expectations
    )

    metric = next(
        metric
        for metric in registry
        if metric.dimension == "cultivation_guidance"
    )
    context = metric.test_cases[0].context[0]
    assert case["expected_answer"] in context
    assert case["expected_answer_source"] == "synthetic_manual"


def test_llm_test_case_uses_query_and_answer(monkeypatch):
    registry, _ = install_agricultural_fakes(monkeypatch)

    evaluate_agricultural_accuracy(
        "What is the price in Mandya?",
        "The price is about Rs 2300.",
        expectations_for_keys("crop"),
    )

    test_case = registry[0].test_cases[0]
    assert test_case.input == "What is the price in Mandya?"
    assert test_case.actual_output == "The price is about Rs 2300."
    assert len(test_case.context) == 1


# --- 5/6. Combination rules and passed -------------------------------------


@pytest.mark.parametrize(
    "keys, scores, expected",
    [
        (("crop",), {"crop": 1.0}, 1.0),
        (("crop", "region"), {"crop": 0.5, "region": 0.5}, 0.5),
        (("crop", "region"), {"crop": 1.0, "region": 0.5}, 0.75),
        (
            ("crop", "region", "cultivation_guidance"),
            {"crop": 1.0, "region": 1.0, "cultivation_guidance": 1.0},
            1.0,
        ),
        (
            ("crop", "region", "cultivation_guidance"),
            {"crop": 1.0, "region": 0.0, "cultivation_guidance": 1.0},
            0.3,
        ),
        (("crop", "region"), {"crop": 0.5, "region": 0.0}, 0.25),
        (
            ("crop", "region", "cultivation_guidance"),
            {"crop": 1.0, "region": 0.5, "cultivation_guidance": 0.5},
            0.67,
        ),
    ],
)
def test_score_combinations(monkeypatch, keys, scores, expected):
    install_agricultural_fakes(monkeypatch, scores=scores)

    result = evaluate_agricultural_accuracy(
        "q", "a", expectations_for_keys(*keys)
    )

    assert result["score"] == expected
    assert result["passed"] is None


# --- 7. Reason --------------------------------------------------------------


def test_reason_lists_every_dimension_and_band(monkeypatch):
    install_agricultural_fakes(
        monkeypatch,
        scores={"crop": 0.9, "region": 0.5, "cultivation_guidance": 0.1},
        reasons={
            "crop": "crop matches",
            "region": "state omitted or uncertain",
            "cultivation_guidance": "conflicts with the reference",
        },
    )

    result = evaluate_agricultural_accuracy("q", "a", full_expectations())
    reason = result["reason"]

    assert "crop=1.0 (supported): crop matches" in reason
    assert "region=0.5 (omitted or partial): state omitted or uncertain" in reason
    assert (
        "cultivation_guidance=0.0 (contradictory): conflicts with the reference"
        in reason
    )
    assert reason.endswith(
        "cultivation guidance reference: synthetic_manual "
        "(synthetic/manual reference, not ACE GDB)"
    )


def test_reason_reports_unknown_source_without_claiming_ace_status(monkeypatch):
    install_agricultural_fakes(monkeypatch)
    expectations = build_agricultural_expectations(
        {
            "expected_domain": "Cultural Practices",
            "expected_answer": "Transplant paddy seedlings after puddling.",
        }
    )

    result = evaluate_agricultural_accuracy("q", "a", expectations)

    assert result["reason"].endswith("cultivation guidance reference: unknown")
    assert "ACE GDB" not in result["reason"]


def test_reason_shows_other_source_without_claiming_ace_status(monkeypatch):
    install_agricultural_fakes(monkeypatch)
    expectations = build_agricultural_expectations(
        {
            "expected_domain": "Cultural Practices",
            "expected_answer": "Transplant paddy seedlings after puddling.",
            "expected_answer_source": "expert_review",
        }
    )

    result = evaluate_agricultural_accuracy("q", "a", expectations)

    assert result["reason"].endswith(
        "cultivation guidance reference: expert_review"
    )
    assert "ACE GDB" not in result["reason"]


def test_partial_band_does_not_claim_a_contradiction(monkeypatch):
    install_agricultural_fakes(monkeypatch, scores={"crop": 0.5})

    result = evaluate_agricultural_accuracy(
        "q", "a", expectations_for_keys("crop")
    )

    assert "crop=0.5 (omitted or partial)" in result["reason"]
    assert "contradictory" not in result["reason"]


def test_dimension_result_keeps_judge_reason(monkeypatch):
    install_agricultural_fakes(
        monkeypatch, reasons={"crop": "the answer names paddy"}
    )

    result = evaluate_agricultural_accuracy(
        "q", "a", expectations_for_keys("crop")
    )

    assert result["dimensions"]["crop"] == {
        "score": 1.0,
        "reason": "the answer names paddy",
        "contradiction": False,
        "error": None,
    }


# --- 8/11. One dimension fails ---------------------------------------------


def test_one_measure_error_keeps_other_findings(monkeypatch):
    registry, judge_calls = install_agricultural_fakes(
        monkeypatch,
        scores={"crop": 1.0, "cultivation_guidance": 1.0},
        measure_errors={"region": RuntimeError("region exploded")},
    )

    result = evaluate_agricultural_accuracy("q", "a", full_expectations())

    assert [metric.dimension for metric in registry] == [
        "crop",
        "region",
        "cultivation_guidance",
    ]
    assert result["score"] is None
    assert result["passed"] is None
    assert len(judge_calls) == 1
    assert result["dimensions"]["crop"]["score"] == 1.0
    assert result["dimensions"]["cultivation_guidance"]["score"] == 1.0
    assert result["dimensions"]["region"]["score"] is None
    assert "region exploded" in result["dimensions"]["region"]["error"]
    assert "agricultural_region_error:" in result["reason"]
    assert "crop=1.0" in result["reason"]
    assert "cultivation_guidance=1.0" in result["reason"]


def test_one_construction_error_is_isolated(monkeypatch):
    registry, _ = install_agricultural_fakes(
        monkeypatch, build_errors={"region": RuntimeError("cannot build region")}
    )

    result = evaluate_agricultural_accuracy("q", "a", full_expectations())

    assert [metric.dimension for metric in registry] == [
        "crop",
        "cultivation_guidance",
    ]
    assert result["score"] is None
    assert "agricultural_region_error:" in result["reason"]
    assert "cannot build region" in result["dimensions"]["region"]["error"]


def test_invalid_judge_score_is_not_an_anchor(monkeypatch):
    install_agricultural_fakes(monkeypatch, scores={"crop": None})

    result = evaluate_agricultural_accuracy(
        "q", "a", expectations_for_keys("crop")
    )

    assert result["score"] is None
    assert result["dimensions"]["crop"]["score"] is None
    assert "invalid judge score" in result["dimensions"]["crop"]["error"]


# --- 9. All dimensions fail -------------------------------------------------


def test_all_dimensions_failing_returns_none_score(monkeypatch):
    install_agricultural_fakes(
        monkeypatch,
        measure_errors={
            dimension: RuntimeError(f"{dimension} boom")
            for dimension in ("crop", "region", "cultivation_guidance")
        },
    )

    result = evaluate_agricultural_accuracy("q", "a", full_expectations())

    assert result["score"] is None
    assert result["passed"] is None
    assert result["reason"].startswith("agricultural_error:")
    for dimension in ("crop", "region", "cultivation_guidance"):
        assert f"agricultural_{dimension}_error:" in result["reason"]
        assert result["dimensions"][dimension]["score"] is None


# --- 10. JudgeSetupError propagates ----------------------------------------


def test_judge_setup_error_from_model_propagates(monkeypatch):
    install_agricultural_fakes(
        monkeypatch, judge_error=dm.JudgeSetupError("no key")
    )

    with pytest.raises(dm.JudgeSetupError, match="no key"):
        evaluate_agricultural_accuracy(
            "q", "a", expectations_for_keys("crop")
        )


def test_judge_setup_error_from_construction_propagates(monkeypatch):
    install_agricultural_fakes(
        monkeypatch, build_errors={"crop": dm.JudgeSetupError("crop setup")}
    )

    with pytest.raises(dm.JudgeSetupError, match="crop setup"):
        evaluate_agricultural_accuracy(
            "q", "a", expectations_for_keys("crop")
        )


def test_judge_setup_error_from_measure_propagates(monkeypatch):
    install_agricultural_fakes(
        monkeypatch, measure_errors={"crop": dm.JudgeSetupError("crop measure")}
    )

    with pytest.raises(dm.JudgeSetupError, match="crop measure"):
        evaluate_agricultural_accuracy(
            "q", "a", expectations_for_keys("crop")
        )


# --- 12. Empty answer -------------------------------------------------------


def test_empty_or_whitespace_answer_returns_none_without_judge(monkeypatch):
    def boom():
        raise AssertionError("judge must not be built")

    monkeypatch.setattr(dm, "get_judge_model", boom)

    for answer in ("", "   ", "\t\n", None):
        assert (
            evaluate_agricultural_accuracy("q", answer, full_expectations())
            is None
        )


# ==========================================================================
# 14. DeepEval agricultural metric construction.
# No network: the fake judge below is a real ``DeepEvalBaseLLM`` subclass, so
# DeepEval accepts it at construction time, but any generation attempt raises.
# ==========================================================================


class FakeJudgeModel(DeepEvalBaseLLM):
    def load_model(self):
        return self

    def generate(self, *args, **kwargs):
        raise AssertionError("construction tests must not call the judge")

    async def a_generate(self, *args, **kwargs):
        raise AssertionError("construction tests must not call the judge")

    def get_model_name(self):
        return "fake-judge"


def test_agricultural_dimensions_constant():
    assert dm.AGRICULTURAL_DIMENSIONS == (
        "crop",
        "region",
        "cultivation_guidance",
    )
    assert tuple(dm.AGRICULTURAL_CRITERIA) == dm.AGRICULTURAL_DIMENSIONS


def test_agricultural_rubric_has_three_non_overlapping_bands():
    ranges = [rubric.score_range for rubric in dm.AGRICULTURAL_RUBRIC]

    assert ranges == [(0, 3), (4, 6), (7, 10)]
    assert all(
        rubric.expected_outcome.strip() for rubric in dm.AGRICULTURAL_RUBRIC
    )


def test_rubric_separates_contradiction_omission_and_support():
    contradiction, partial, supported = dm.AGRICULTURAL_RUBRIC

    assert "contradiction" in contradiction.expected_outcome.lower()
    assert "omitted" in partial.expected_outcome.lower()
    assert "uncertain" in partial.expected_outcome.lower()
    assert "correct" in supported.expected_outcome.lower()


@pytest.mark.parametrize(
    "dimension", ("crop", "region", "cultivation_guidance")
)
def test_build_agricultural_metric_selects_dimension_criteria(dimension):
    model = FakeJudgeModel()

    metric = dm._build_agricultural_metric(model, dimension)

    assert isinstance(metric, dm.AgriculturalAccuracyMetric)
    assert isinstance(metric, dm.GEval)
    assert metric.__class__.__name__ == "AgriculturalAccuracyMetric"
    assert metric.criteria == dm.AGRICULTURAL_CRITERIA[dimension]
    assert metric.rubric == dm.AGRICULTURAL_RUBRIC
    assert metric.threshold is None
    assert metric.model is model


def test_build_agricultural_metric_uses_input_output_and_context():
    metric = dm._build_agricultural_metric(FakeJudgeModel(), "crop")

    assert metric.evaluation_params == [
        dm.SingleTurnParams.INPUT,
        dm.SingleTurnParams.ACTUAL_OUTPUT,
        dm.SingleTurnParams.CONTEXT,
    ]


def test_each_dimension_has_its_own_criteria():
    criteria = [dm.AGRICULTURAL_CRITERIA[key] for key in dm.AGRICULTURAL_DIMENSIONS]

    assert len(set(criteria)) == len(criteria)


def test_crop_criteria_cover_alias_and_contradiction_rules():
    criteria = dm.AGRICULTURAL_CRITERIA["crop"].lower()

    assert "paddy" in criteria and "rice" in criteria
    assert "equivalent" in criteria
    assert "contradiction" in criteria
    assert "outside knowledge" in criteria


def test_region_criteria_forbid_state_inference_from_city():
    criteria = dm.AGRICULTURAL_CRITERIA["region"].lower()

    assert "state" in criteria and "city" in criteria
    assert "infer a state from a city" in criteria
    assert "contradiction" in criteria


def test_cultivation_guidance_criteria_identify_synthetic_reference_scope():
    criteria = dm.AGRICULTURAL_CRITERIA["cultivation_guidance"].lower()

    assert "supplied reference" in criteria
    assert "synthetic_manual" in criteria
    assert "ace gdb" in criteria
    assert "not" in criteria


@pytest.mark.parametrize("dimension", ("soil", "", None, "Crop", 3))
def test_build_agricultural_metric_rejects_invalid_dimension(dimension):
    with pytest.raises(ValueError, match="unknown agricultural dimension"):
        dm._build_agricultural_metric(FakeJudgeModel(), dimension)


def test_building_the_metric_does_not_load_judge_config(monkeypatch):
    def boom():
        raise AssertionError("metric construction must not configure the judge")

    monkeypatch.setattr(dm, "get_judge_model", boom)
    monkeypatch.setattr(dm, "load_judge_config", boom)

    metric = dm._build_agricultural_metric(FakeJudgeModel(), "region")

    assert isinstance(metric, dm.AgriculturalAccuracyMetric)
    assert metric.model.get_model_name() == "fake-judge"


def test_configured_judge_model_is_passed_to_metric(monkeypatch):
    model = FakeJudgeModel()
    monkeypatch.setattr(dm, "get_judge_model", lambda: model)

    metric = dm._build_agricultural_metric(dm.get_judge_model(), "crop")

    assert metric.model is model
