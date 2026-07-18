from ajrasakha.evaluation.validators.language_quality import evaluate_language_quality


def _case(**overrides):
    base = {
        "language_code": "hi",
        "language": "Hindi",
        "expected_language": "Hindi",
        "expected_script": "Devanagari",
        "domain": "weather",
        "scenario_id": "weather_hindi",
        "expect_2hr_disclaimer": True,
        "expected_disclaimer_marker": "विशेषज्ञ",
        "expected_gdb_entry_id": "gdb-1",
        "mock_retrieved_gdb_entry_id": "gdb-1",
    }
    base.update(overrides)
    return base


def test_language_quality_passes_matching_hindi_answer():
    result = {
        "response_text": "आज मौसम साफ रहेगा। विशेषज्ञ: यह नमूना उत्तर है।",
    }

    evaluation = evaluate_language_quality(result, _case())

    assert evaluation["answer_language_pass"] is True
    assert evaluation["disclaimer_language_pass"] is True
    assert evaluation["language_switching_pass"] is True
    assert evaluation["gdb_entry_pass"] is True
    assert evaluation["language_quality_pass"] is True


def test_language_quality_fails_wrong_script():
    result = {
        "response_text": "The weather is clear today. expert: sample answer.",
    }

    evaluation = evaluate_language_quality(result, _case())

    assert evaluation["answer_language_pass"] is False
    assert evaluation["language_quality_pass"] is False
    assert "expected script not detected" in evaluation["language_quality_reason"]


def test_language_quality_detects_mid_answer_language_switching():
    result = {
        "response_text": (
            "आज मौसम साफ रहेगा। विशेषज्ञ: यह नमूना उत्तर है। "
            "This answer suddenly switches into English for a long sentence."
        ),
    }

    evaluation = evaluate_language_quality(result, _case())

    assert evaluation["language_switching_pass"] is False
    assert evaluation["language_quality_pass"] is False
    assert "unexpected script mix" in evaluation["language_quality_reason"]


def test_language_quality_fails_missing_expected_gdb_entry():
    result = {
        "response_text": "आज मौसम साफ रहेगा। विशेषज्ञ: यह नमूना उत्तर है।",
        "observed_gdb_entry_id": "other-gdb",
    }

    evaluation = evaluate_language_quality(result, _case())

    assert evaluation["gdb_entry_pass"] is False
    assert evaluation["language_quality_pass"] is False
    assert "expected gdb-1" in evaluation["language_quality_reason"]
