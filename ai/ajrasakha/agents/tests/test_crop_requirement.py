"""Tests for crop requirement LLM output parsing."""

from ajrasakha.agents.crop_requirement import parse_crop_classification


def test_parse_crop_specific():
    assert parse_crop_classification("crop_specific") is True
    assert parse_crop_classification("CROP_SPECIFIC") is True


def test_parse_general():
    assert parse_crop_classification("general") is False
    assert parse_crop_classification("general.") is False


def test_parse_unknown_fail_open():
    assert parse_crop_classification("") is False
    assert parse_crop_classification("maybe") is False
