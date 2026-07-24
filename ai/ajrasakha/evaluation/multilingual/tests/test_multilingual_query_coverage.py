"""Tests for multilingual query coverage (Gap 1)."""

import json
from pathlib import Path

from ajrasakha.evaluation.multilingual.languages import LANGUAGES
from ajrasakha.evaluation.multilingual.scenarios import SCENARIOS
from ajrasakha.evaluation.multilingual.case_generator import _QUERIES_PATH


def test_no_missing_or_placeholder_queries():
    """All 30 scenarios × 6 languages must have valid queries."""
    payload = json.loads(_QUERIES_PATH.read_text(encoding="utf-8"))
    
    # Check we have exactly 30 scenarios
    scenarios = payload.get("scenarios", [])
    assert len(scenarios) == 30, f"Expected 30 scenarios in data artifact, got {len(scenarios)}"
    
    # Check each language slot
    expected_langs = [l.code for l in LANGUAGES]
    
    for entry in scenarios:
        sid = entry["id"]
        queries = entry.get("queries", {})
        
        for lang in expected_langs:
            q = queries.get(lang, "")
            # Must not be blank
            assert q, f"Scenario {sid} missing query for language {lang}"
            
            # Must not be a placeholder like "[HI] English query"
            assert not q.startswith("["), f"Scenario {sid} language {lang} has placeholder query: {q}"

def test_query_translations_match_scripts():
    """Basic sanity check that native translations actually contain native script."""
    payload = json.loads(_QUERIES_PATH.read_text(encoding="utf-8"))
    scenarios = payload.get("scenarios", [])
    
    # Quick heuristic check for script ranges (excluding EN)
    script_check = {
        "HI": lambda q: any('\u0900' <= c <= '\u097F' for c in q), # Devanagari
        "KN": lambda q: any('\u0C80' <= c <= '\u0CFF' for c in q), # Kannada
        "TA": lambda q: any('\u0B80' <= c <= '\u0BFF' for c in q), # Tamil
        "PA": lambda q: any('\u0A00' <= c <= '\u0A7F' for c in q), # Gurmukhi
        "TE": lambda q: any('\u0C00' <= c <= '\u0C7F' for c in q), # Telugu
    }
    
    for entry in scenarios:
        sid = entry["id"]
        queries = entry.get("queries", {})
        
        for lang, checker in script_check.items():
            q = queries.get(lang, "")
            assert checker(q), f"Scenario {sid} query for {lang} does not appear to contain native script characters: {q}"
