"""Tests for the fixed-string translation catalogue."""

from __future__ import annotations

import logging
from pathlib import Path

import pytest
from openpyxl import Workbook

from ajrasakha.agents.translation_catalog import (
    get_non_agriculture_reply,
    load_catalog,
)


HEADERS = [
    "Script Language",
    "Vocal Language",
    "2 hour disclaimer",
    "State Follow Up",
    "Crop Follow Up",
    "Testing disclaimer",
    "Questions submitted between 10:01 PM and 11:59 PM",
    "Questions submitted between 12:00 AM and 5:59 AM",
    "Non-Agriculture Query",
]


def _row(script: str | None, vocal: str | None, reply: str | None) -> list[str | None]:
    return [
        script,
        vocal,
        "two-hour",
        "state",
        "crop",
        "testing",
        "late-night",
        "early-morning",
        reply,
    ]


def _write_catalog(tmp_path: Path, rows: list[list[str | None]]) -> Path:
    path = tmp_path / "catalog.xlsx"
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(HEADERS)
    for row in rows:
        sheet.append(row)
    workbook.save(path)
    workbook.close()
    return path


def test_non_agriculture_reply_exact_english_cell(tmp_path: Path):
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


def test_non_agriculture_reply_blank_cell_falls_back_and_logs(
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
    assert "blank Non-Agriculture Query cell" in caplog.text


def test_non_agriculture_reply_empty_english_fallback_is_configuration_error(tmp_path: Path):
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
    incomplete_row: list[str | None],
):
    path = _write_catalog(tmp_path, [incomplete_row])

    with pytest.raises(ValueError, match="Incomplete translation catalogue row"):
        load_catalog(path)
