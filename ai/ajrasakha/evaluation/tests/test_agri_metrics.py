from unittest.mock import patch

from deepeval.test_case import LLMTestCase

from ajrasakha.evaluation.agri_metrics import AgriAccuracyMetric, TreatmentJudgeResult


def test_no_applicable_fields_scores_full_marks():
    metric = AgriAccuracyMetric()
    test_case = LLMTestCase(
        input="What is the weather today in Delhi?",
        actual_output="It's 32°C and sunny in Delhi today.",
        metadata={
            "expected_crop": "all",
            "expected_region": None,
            "expected_treatment": None,
        },
    )

    score = metric.measure(test_case)

    assert score == 1.0
    assert metric.is_successful()
    assert "no crop/treatment/region applicable" in metric.reason


def test_crop_and_region_present_passes():
    metric = AgriAccuracyMetric()
    test_case = LLMTestCase(
        input="how to grow paddy in punjab",
        actual_output="For Paddy cultivation in Punjab, sow nursery in June and transplant after 25-30 days.",
        metadata={
            "expected_crop": "Paddy",
            "expected_region": "Punjab",
            "expected_treatment": None,
        },
    )

    score = metric.measure(test_case)

    assert score == 1.0
    assert metric.is_successful()


def test_crop_mismatch_lowers_score_and_reason():
    metric = AgriAccuracyMetric()
    test_case = LLMTestCase(
        input="how to grow paddy in punjab",
        actual_output="For Wheat cultivation in Haryana, sow in November.",
        metadata={
            "expected_crop": "Paddy",
            "expected_region": "Punjab",
            "expected_treatment": None,
        },
    )

    score = metric.measure(test_case)

    assert score < 1.0
    assert not metric.is_successful()
    assert "crop" in metric.reason
    assert "region" in metric.reason


@patch("ajrasakha.evaluation.agri_metrics._judge_treatment_with_claude")
def test_treatment_mismatch_flagged_by_judge(mock_judge):
    mock_judge.return_value = TreatmentJudgeResult(
        matches=False, reason="different active ingredient recommended"
    )

    metric = AgriAccuracyMetric()
    test_case = LLMTestCase(
        input="what to spray for yellow rust in wheat",
        actual_output="Spray Mancozeb 75% WP @ 2g/l for yellow rust.",
        metadata={
            "expected_crop": "Wheat",
            "expected_region": "Punjab",
            "expected_treatment": "Propiconazole 25% EC @ 1ml/l",
        },
    )

    score = metric.measure(test_case)

    assert score < 1.0
    assert "treatment mismatch" in metric.reason
    mock_judge.assert_called_once()


@patch("ajrasakha.evaluation.agri_metrics._judge_treatment_with_claude")
def test_treatment_match_passes(mock_judge):
    mock_judge.return_value = TreatmentJudgeResult(matches=True, reason="same active ingredient and dosage")

    metric = AgriAccuracyMetric()
    test_case = LLMTestCase(
        input="what to spray for yellow rust in wheat",
        actual_output="Spray Propiconazole 25% EC at 1ml per litre of water for wheat yellow rust in Punjab.",
        metadata={
            "expected_crop": "Wheat",
            "expected_region": "Punjab",
            "expected_treatment": "Propiconazole 25% EC @ 1ml/l",
        },
    )

    score = metric.measure(test_case)

    assert score == 1.0
    assert metric.is_successful()
