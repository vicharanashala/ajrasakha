from __future__ import annotations

from ajrasakha.tools.answer_shortener.validation import (
    ProtectedContent,
    validate_candidate,
)


def test_validation_allows_omitting_source_urls_and_measurements():
    protected = ProtectedContent.from_text(
        "Apply 2 ml/L. Details: https://example.org/advice"
    )

    failures = validate_candidate(
        "Apply the recommended treatment carefully.",
        lower_bound=1,
        upper_bound=500,
        protected=protected,
    )

    assert not any(item.startswith("MISSING_URL") for item in failures)
    assert not any(item.startswith("MISSING_MEASUREMENT") for item in failures)
    assert failures == []


def test_validation_rejects_new_urls_and_measurements():
    protected = ProtectedContent.from_text(
        "Apply 2 ml/L. Details: https://example.org/advice"
    )

    failures = validate_candidate(
        "Apply 5 ml/L. Details: https://other.example/advice",
        lower_bound=1,
        upper_bound=500,
        protected=protected,
    )

    assert not any(item.startswith("MISSING_URL") for item in failures)
    assert any(item.startswith("NEW_URL_NOT_IN_SOURCE") for item in failures)
    assert not any(item.startswith("MISSING_MEASUREMENT") for item in failures)
    assert any(item.startswith("NEW_MEASUREMENT_NOT_IN_SOURCE") for item in failures)


def test_validation_accepts_equivalent_measurement_spacing_and_range_style():
    protected = ProtectedContent.from_text(
        "Apply 2 ml/L and between 800 to 1000 g per acre."
    )

    failures = validate_candidate(
        "Apply 2ml/L and between 800-1000g per acre.",
        lower_bound=1,
        upper_bound=500,
        protected=protected,
    )

    assert failures == []


def test_validation_requires_source_safety_span_exactly():
    protected = ProtectedContent.from_text(
        "Wear gloves while spraying. Apply in the morning."
    )

    failures = validate_candidate(
        "Apply in the morning.",
        lower_bound=1,
        upper_bound=500,
        protected=protected,
    )

    assert any(item.startswith("MISSING_SAFETY_SPAN") for item in failures)


def test_validation_rejects_new_signed_measurements_and_ratios():
    protected = ProtectedContent.from_text(
        "Store at -2°C and use an NPK ratio of 120:60:40."
    )

    failures = validate_candidate(
        "Store at 2°C and use an NPK ratio of 120:40:60.",
        lower_bound=1,
        upper_bound=500,
        protected=protected,
    )

    assert not any(item.startswith("MISSING_MEASUREMENT") for item in failures)
    assert sum(item.startswith("NEW_MEASUREMENT_NOT_IN_SOURCE") for item in failures) == 2


def test_prompt_metadata_separates_mandatory_safety_from_source_allowlists():
    safety = "Wear gloves while applying 2 ml/L."
    protected = ProtectedContent.from_text(
        f"{safety} Details: https://example.org/advice"
    )

    metadata = protected.prompt_metadata

    assert metadata.mandatory_safety_spans == (safety,)
    assert metadata.available_source_measurements == ("2ml/l",)
    assert metadata.available_source_urls == ("https://example.org/advice",)
    assert protected.mandatory_prompt_spans == (safety,)
    assert protected.available_source_measurements == ("2ml/l",)
    assert protected.available_source_urls == ("https://example.org/advice",)
    assert protected.prompt_spans == (safety,)
    assert protected.minimum_rendered_length == len(safety)


def test_preflight_minimum_ignores_optional_measurements_and_urls():
    protected = ProtectedContent.from_text(
        "Apply 2 ml/L. Details: https://example.org/advice"
    )

    assert protected.mandatory_prompt_spans == ()
    assert protected.minimum_rendered_length == 0


def test_validation_rejects_a_different_writing_script():
    protected = ProtectedContent.from_text(
        "गेहूं की फसल में सिंचाई सुबह करें।"
    )

    failures = validate_candidate(
        "Irrigate the wheat crop in the morning.",
        lower_bound=1,
        upper_bound=500,
        protected=protected,
    )

    assert any(item.startswith("WRONG_WRITING_SCRIPT") for item in failures)
