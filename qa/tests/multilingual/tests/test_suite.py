"""Smoke + structural tests for the multilingual suite.

These tests don't talk to AjraSakha.  They verify the suite itself:

* 30 scenarios defined across 5 domains, no duplicates;
* 6 languages, all 180 cells populated;
* evaluators behave on hand-crafted inputs;
* matrix + recommendations render correctly.

Run with::

    pytest qa/tests/multilingual/tests/test_suite.py -q
"""
from __future__ import annotations

import json

import pytest

from qa.tests.multilingual.deep_eval import (
    PASS_THRESHOLD,
    score_response,
)
from qa.tests.multilingual.evaluators import (
    detect_language_switch,
    detect_response_language,
    evaluate_disclaimer,
    evaluate_gdb_accuracy,
    evaluate_language_switch,
    evaluate_transliteration,
    script_ratio,
)
from qa.tests.multilingual.reporter import (
    LanguageQualityMatrix,
    build_matrix,
    format_recommendations_markdown,
    generate_recommendations,
)
from qa.tests.multilingual.scenarios import FARMING_SCENARIOS
from qa.tests.multilingual.translations import (
    DISCLAIMER_TEXT,
    SUPPORTED_LANGUAGES,
    get_flat_test_cases,
    get_translation_lookup,
)


# ---------------------------------------------------------------------------
# Structural invariants
# ---------------------------------------------------------------------------


def test_scenarios_have_30_entries():
    assert len(FARMING_SCENARIOS) == 30


def test_scenarios_unique_ids():
    ids = [s["id"] for s in FARMING_SCENARIOS]
    assert len(set(ids)) == 30


def test_scenarios_cover_5_domains():
    domains = {s["domain"] for s in FARMING_SCENARIOS}
    assert domains == {"weather", "pest", "scheme", "soil", "market"}


def test_scenarios_have_required_metadata():
    for s in FARMING_SCENARIOS:
        assert s.get("expected_gdb_id"), s
        assert isinstance(s.get("required_keywords", []), list)
        assert isinstance(s.get("required_entities", []), list)
        assert s.get("language_hint") in SUPPORTED_LANGUAGES


def test_translations_have_all_180_cases():
    cases = get_flat_test_cases()
    assert len(cases) == 30 * len(SUPPORTED_LANGUAGES) == 180


def test_translations_unique_case_ids():
    cases = get_flat_test_cases()
    ids = [c["case_id"] for c in cases]
    assert len(set(ids)) == 180


def test_translations_match_scenarios():
    lookup = get_translation_lookup()
    scenario_ids = {s["id"] for s in FARMING_SCENARIOS}
    assert set(lookup.keys()) == scenario_ids


# ---------------------------------------------------------------------------
# Language detector
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("text,expected", [
    ("यह हिन्दी में है", "hindi"),
    ("This is English text", "english"),
    ("ಇದು ಕನ್ನಡ", "kannada"),
    ("இது தமிழ்", "tamil"),
    ("ਇਹ ਪੰਜਾਬੀ ਹੈ", "punjabi"),
    ("ఇది తెలుగు", "telugu"),
])
def test_detect_response_language(text, expected):
    assert detect_response_language(text) == expected


def test_script_ratio_devanagari():
    text = "यह हिन्दी है"
    assert script_ratio(text, "hindi") > 0.5
    assert script_ratio(text, "english") == 0.0


def test_detect_language_switch_clean():
    info = detect_language_switch("यह हिन्दी का उत्तर है", "hindi")
    assert info["switched"] is False
    assert info["primary"] == "hindi"


def test_detect_language_switch_mid():
    info = detect_language_switch(
        "यह हिन्दी है और this is mixed Tamil content அதிகம்", "hindi"
    )
    assert info["primary"] in {"hindi", "tamil"}


# ---------------------------------------------------------------------------
# GDB accuracy
# ---------------------------------------------------------------------------


def test_gdb_accuracy_pass():
    res = evaluate_gdb_accuracy(
        response_text="Sirsa mandi wheat price is INR 2275/quintal.",
        response_gdb_ids=["MARKET-001"],
        required_keywords=["Sirsa", "wheat", "INR"],
        expected_gdb_id="MARKET-001",
    )
    assert res["correct"] is True
    assert res["gdb_id_match"] is True
    assert res["keyword_coverage"] == 1.0


def test_gdb_accuracy_wrong_id():
    res = evaluate_gdb_accuracy(
        response_text="irrelevant answer",
        response_gdb_ids=["SCHEME-001"],
        required_keywords=["sirsa", "wheat"],
        expected_gdb_id="MARKET-001",
    )
    assert res["correct"] is False
    assert res["gdb_id_match"] is False


# ---------------------------------------------------------------------------
# Disclaimer
# ---------------------------------------------------------------------------


def test_disclaimer_hindi_present():
    res = evaluate_disclaimer(
        response_text="कुछ सलाह। " + DISCLAIMER_TEXT["hindi"],
        query_language="hindi",
    )
    assert res["present"] is True
    assert res["language_match"] is True


def test_disclaimer_missing():
    res = evaluate_disclaimer(
        response_text="कोई डिस्क्लेमर नहीं है",
        query_language="hindi",
    )
    assert res["present"] is False
    assert res["language_match"] is False


# ---------------------------------------------------------------------------
# Transliteration
# ---------------------------------------------------------------------------


def test_transliteration_all_found():
    res = evaluate_transliteration(
        response_text="गेहूं में पीला रतुआ के लिए profenofos 50 EC का छिड़काव करें।",
        required_entities=["wheat", "wheat_rust"],
    )
    assert res["correct"] is True
    assert res["score"] == 1.0


def test_transliteration_missing():
    res = evaluate_transliteration(
        response_text="Some english answer without crop names.",
        required_entities=["wheat", "paddy"],
    )
    assert res["correct"] is False
    assert "wheat" in res["missing"]


# ---------------------------------------------------------------------------
# Language switch
# ---------------------------------------------------------------------------


def test_no_language_switch():
    res = evaluate_language_switch(
        response_text="यह पूरी तरह हिन्दी में उत्तर है।",
        query_language="hindi",
    )
    assert res["switched"] is False


def test_language_switch_detected():
    res = evaluate_language_switch(
        response_text=(
            "यह हिन्दी में शुरू होता है। "
            + " ".join(["ಇದು ಕನ್ನಡ ಪಠ್ಯವಾಗಿದೆ"] * 20)
        ),
        query_language="hindi",
    )
    assert res["switched"] is True


# ---------------------------------------------------------------------------
# Aggregated scorer
# ---------------------------------------------------------------------------


def test_score_response_pass():
    score = score_response(
        case_id="MARKET-001__hi",
        scenario_id="MARKET-001",
        domain="market",
        query_language="hindi",
        response_text=(
            "Sirsa mandi गेहूं का भाव 2275 रुपये प्रति क्विंटल है। "
            + DISCLAIMER_TEXT["hindi"]
        ),
        response_gdb_ids=["MARKET-001"],
        required_keywords=["Sirsa", "wheat", "2275"],
        required_entities=["wheat"],
        expected_gdb_id="MARKET-001",
    )
    assert score.overall >= PASS_THRESHOLD
    assert score.passed is True


def test_score_response_fail():
    score = score_response(
        case_id="PEST-002__kn",
        scenario_id="PEST-002",
        domain="pest",
        query_language="kannada",
        response_text="some unrelated english text",
        response_gdb_ids=["WEATHER-001"],
        required_keywords=["mustard", "Bharatpur"],
        required_entities=["mustard", "aphid"],
        expected_gdb_id="PEST-002",
    )
    assert score.passed is False


# ---------------------------------------------------------------------------
# Matrix + recommendations
# ---------------------------------------------------------------------------


def _build_minimal_scores() -> list:
    return [
        score_response(
            case_id=f"{s['id']}__{lang}",
            scenario_id=s["id"],
            domain=s["domain"],
            query_language=lang,
            response_text=DISCLAIMER_TEXT[lang],
            response_gdb_ids=[s["id"]],
            required_keywords=s.get("required_keywords", []),
            required_entities=s.get("required_entities", []),
            expected_gdb_id=s.get("expected_gdb_id", ""),
        )
        for s in FARMING_SCENARIOS
        for lang in SUPPORTED_LANGUAGES
    ]


def test_matrix_builds_and_renders(tmp_path):
    scores = _build_minimal_scores()
    matrix = build_matrix(scores)
    assert matrix.totals  # non-empty
    paths = matrix.write_artifacts(tmp_path)
    for key, p in paths.items():
        assert (tmp_path / Path(p).name).exists()


def test_recommendations_format(tmp_path):
    scores = _build_minimal_scores()
    matrix = build_matrix(scores)
    recs = generate_recommendations(matrix)
    md = format_recommendations_markdown(recs)
    assert isinstance(md, str)
    assert "AjraSakha" in md