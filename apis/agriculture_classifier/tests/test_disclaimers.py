import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from classifier import disclaimers


def test_get_disclaimer_english():
    assert disclaimers.get_disclaimer("English") == disclaimers._load()["English"]


def test_get_disclaimer_language_specific_lookup():
    real = disclaimers._load()
    for language in ("Tamil", "Hindi", "Punjabi"):
        assert disclaimers.get_disclaimer(language) == real[language]
        assert disclaimers.get_disclaimer(language) != real["English"]


def test_get_disclaimer_unknown_language_falls_back_to_english():
    assert disclaimers.get_disclaimer("Klingon") == disclaimers._load()["English"]


def test_known_languages_includes_every_csv_row():
    languages = disclaimers.known_languages()
    assert len(languages) == len(disclaimers._load())
    assert "English" in languages
    assert "Tamil" in languages


def test_script_candidates_single_script_language():
    assert disclaimers.script_candidates("வேளாண்மை பற்றிய கேள்வி") == ["Tamil"]
    assert disclaimers.script_candidates("How is the weather?") == ["English"]


def test_script_candidates_shared_script_derived_from_csv_text():
    # These 8 languages are grouped only because their own CSV disclaimer
    # text happens to be written in Devanagari - not because of a
    # hardcoded list. Adding a 9th Devanagari-script language to the CSV
    # would join this group automatically, with no code change.
    candidates = disclaimers.script_candidates("कृषि संबंधित प्रश्न")
    assert set(candidates) == {
        "Hindi", "Marathi", "Nepali", "Sanskrit", "Maithili", "Bodo", "Konkani", "Dogri",
    }


def test_load_raises_when_english_row_missing(tmp_path):
    bad_csv = tmp_path / "bad.csv"
    bad_csv.write_text("#,Language,Translation\n1,Tamil,some text\n", encoding="utf-8")

    with pytest.raises(RuntimeError):
        disclaimers._load(bad_csv)


def test_load_raises_on_empty_csv(tmp_path):
    empty_csv = tmp_path / "empty.csv"
    empty_csv.write_text("#,Language,Translation\n", encoding="utf-8")

    with pytest.raises(RuntimeError):
        disclaimers._load(empty_csv)
