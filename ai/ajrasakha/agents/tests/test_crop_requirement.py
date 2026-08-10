"""Tests for three-way crop requirement LLM output parsing."""

from ajrasakha.agents.crop_requirement import parse_crop_classification


def test_parse_input_crop_required():
    assert parse_crop_classification("input_crop_required") == "input_crop_required"
    assert parse_crop_classification("INPUT_CROP_REQUIRED") == "input_crop_required"
    # Legacy binary output remains compatible.
    assert parse_crop_classification("crop_specific") == "input_crop_required"


def test_parse_crop_output_requested():
    assert parse_crop_classification("crop_output_requested") == "crop_output_requested"


def test_parse_crop_not_required():
    assert parse_crop_classification("crop_not_required") == "crop_not_required"
    # Legacy binary output remains compatible.
    assert parse_crop_classification("general") == "crop_not_required"
    assert parse_crop_classification("general.") == "crop_not_required"


def test_parse_unknown_fail_open():
    assert parse_crop_classification("") == "crop_not_required"
    assert parse_crop_classification("maybe") == "crop_not_required"


def test_parse_unknown_uses_supplied_fallback():
    assert parse_crop_classification("maybe", fallback=True) == "input_crop_required"
