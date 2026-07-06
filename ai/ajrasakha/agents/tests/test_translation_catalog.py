"""Tests for the fixed-string translation catalogue."""

from __future__ import annotations

import json
import logging
from pathlib import Path

import pytest

from ajrasakha.agents.translation_catalog import (
    get_crop_price_unavailable_reply,
    get_mandi_unavailable_reply,
    get_non_agriculture_reply,
    get_weather_unavailable_reply,
    load_catalog,
)


TEXT_FIELDS = {
    "two_hour_disclaimer": "two-hour",
    "state_follow_up": "state",
    "crop_follow_up": "crop",
    "testing_disclaimer": "testing",
    "late_night_disclaimer": "late-night",
    "early_morning_disclaimer": "early-morning",
    "non_agriculture_reply": "reply",
    "weather_unavailable_for_dynamic_weather_queries": "weather-unavailable",
    "crop_price_not_available_in_selected_mandi": "crop-price-unavailable",
    "mandi_not_available": "mandi-unavailable",
}


def _row(
    script: str | None,
    vocal: str | None,
    reply: str | None,
    **overrides: object,
) -> dict[str, object]:
    texts: dict[str, object] = {**TEXT_FIELDS, "non_agriculture_reply": reply}
    texts.update(overrides)
    return {
        "script_language": script,
        "vocal_language": vocal,
        "texts": texts,
    }


def _write_catalog(
    tmp_path: Path,
    rows: list[dict[str, object]],
    *,
    schema_version: int = 1,
) -> Path:
    path = tmp_path / "catalog.json"
    path.write_text(
        json.dumps(
            {"schema_version": schema_version, "rows": rows},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return path


def test_non_agriculture_reply_exact_english_text(tmp_path: Path):
    exact = "  First line\n\nSecond line\n"
    catalog = load_catalog(_write_catalog(tmp_path, [_row("English", "English", exact)]))

    assert get_non_agriculture_reply("English", "English", catalog=catalog) == exact


@pytest.mark.parametrize(
    ("script", "vocal", "expected"),
    [
        ("Bengali-Assamese", "Assamese", "অসমীয়া উত্তৰ"),
        ("English", "Assamese", "Oxomiya uttor"),
    ],
)
def test_non_agriculture_reply_uses_exact_language_pair(
    tmp_path: Path,
    script: str,
    vocal: str,
    expected: str,
):
    catalog = load_catalog(
        _write_catalog(
            tmp_path,
            [
                _row("English", "English", "English fallback"),
                _row("Bengali-Assamese", "Assamese", "অসমীয়া উত্তৰ"),
                _row("English", "Assamese", "Oxomiya uttor"),
            ],
        )
    )

    assert get_non_agriculture_reply(script, vocal, catalog=catalog) == expected


def test_non_agriculture_reply_missing_pair_falls_back_and_logs(
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
):
    catalog = load_catalog(
        _write_catalog(tmp_path, [_row("English", "English", "English fallback")])
    )

    with caplog.at_level(logging.WARNING):
        result = get_non_agriculture_reply("Tamil", "Tamil", catalog=catalog)

    assert result == "English fallback"
    assert "missing language pair" in caplog.text
    assert "using English/English" in caplog.text


def test_non_agriculture_reply_blank_text_falls_back_and_logs(
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
):
    catalog = load_catalog(
        _write_catalog(
            tmp_path,
            [
                _row("English", "English", "English fallback"),
                _row("Tamil", "Tamil", "   "),
            ],
        )
    )

    with caplog.at_level(logging.WARNING):
        result = get_non_agriculture_reply("Tamil", "Tamil", catalog=catalog)

    assert result == "English fallback"
    assert "blank Non-Agriculture Query" in caplog.text


def test_non_agriculture_reply_empty_english_fallback_is_configuration_error(
    tmp_path: Path,
):
    catalog = load_catalog(_write_catalog(tmp_path, [_row("English", "English", "")]))

    with pytest.raises(ValueError, match="English/English Non-Agriculture Query"):
        get_non_agriculture_reply("Tamil", "Tamil", catalog=catalog)


def test_load_catalog_rejects_duplicate_language_pair(tmp_path: Path):
    path = _write_catalog(
        tmp_path,
        [
            _row("English", "English", "First"),
            _row("English", "English", "Second"),
        ],
    )

    with pytest.raises(ValueError, match="Duplicate translation catalogue row"):
        load_catalog(path)


@pytest.mark.parametrize(
    "incomplete_row",
    [
        _row("English", None, "Reply"),
        _row(None, "English", "Reply"),
    ],
)
def test_load_catalog_rejects_incomplete_language_pair(
    tmp_path: Path,
    incomplete_row: dict[str, object],
):
    path = _write_catalog(tmp_path, [incomplete_row])

    with pytest.raises(ValueError, match="Incomplete translation catalogue row"):
        load_catalog(path)


def test_load_catalog_rejects_invalid_json(tmp_path: Path):
    path = tmp_path / "catalog.json"
    path.write_text("{", encoding="utf-8")

    with pytest.raises(ValueError, match="Invalid JSON"):
        load_catalog(path)


def test_load_catalog_rejects_unsupported_schema_version(tmp_path: Path):
    path = _write_catalog(
        tmp_path,
        [_row("English", "English", "Reply")],
        schema_version=2,
    )

    with pytest.raises(ValueError, match="Unsupported translation catalogue schema version"):
        load_catalog(path)


def test_load_catalog_rejects_missing_text_field(tmp_path: Path):
    row = _row("English", "English", "Reply")
    texts = row["texts"]
    assert isinstance(texts, dict)
    texts.pop("testing_disclaimer")

    with pytest.raises(ValueError, match="missing required text fields: testing_disclaimer"):
        load_catalog(_write_catalog(tmp_path, [row]))


def test_load_catalog_rejects_non_string_text(tmp_path: Path):
    row = _row("English", "English", "Reply", testing_disclaimer=None)

    with pytest.raises(ValueError, match="testing_disclaimer.*must be a string"):
        load_catalog(_write_catalog(tmp_path, [row]))


def test_load_catalog_rejects_unexpected_text_field(tmp_path: Path):
    row = _row("English", "English", "Reply", misspelled_disclaimer="text")

    with pytest.raises(ValueError, match="unsupported text fields: misspelled_disclaimer"):
        load_catalog(_write_catalog(tmp_path, [row]))


def test_load_catalog_requires_english_fallback(tmp_path: Path):
    path = _write_catalog(tmp_path, [_row("Tamil", "Tamil", "Reply")])

    with pytest.raises(ValueError, match="English/English fallback"):
        load_catalog(path)


def test_existing_fields_keep_legacy_surrounding_whitespace_behavior(tmp_path: Path):
    row = _row(
        "English",
        "English",
        "  exact reply\n",
        two_hour_disclaimer="  two-hour\n",
        testing_disclaimer="\ntesting  ",
    )
    catalog = load_catalog(_write_catalog(tmp_path, [row]))
    english = catalog[("English", "English")]

    assert english.two_hour_disclaimer == "two-hour"
    assert english.testing_disclaimer == "testing"
    assert english.non_agriculture_reply == "  exact reply\n"


def test_new_message_fields_preserve_spaces_and_line_breaks(tmp_path: Path):
    exact = "  First line\n\nSecond line  \n"
    row = _row(
        "English",
        "English",
        "Reply",
        weather_unavailable_for_dynamic_weather_queries=exact,
        crop_price_not_available_in_selected_mandi=exact,
        mandi_not_available=exact,
    )
    catalog = load_catalog(_write_catalog(tmp_path, [row]))
    english = catalog[("English", "English")]

    assert english.weather_unavailable_for_dynamic_weather_queries == exact
    assert english.crop_price_not_available_in_selected_mandi == exact
    assert english.mandi_not_available == exact


def test_real_catalog_contains_all_language_pairs_and_new_messages():
    catalog = load_catalog()

    assert len(catalog) == 45
    assert get_weather_unavailable_reply("English", "English").strip()
    assert get_crop_price_unavailable_reply("English", "English").strip()
    assert get_mandi_unavailable_reply("English", "English").strip()
