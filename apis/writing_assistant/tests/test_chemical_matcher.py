"""Tests for assistant.chemical_matcher - the standalone, in-process port
of apis/chemical_detector's matching algorithm (Writing Assistant Build
Plan, Revision 14, ISS-03). No real Mongo connection: the loaded-cache
globals are populated directly via _build_indices(), bypassing
_ensure_loaded()'s DB call entirely."""

import pytest

from assistant import chemical_matcher
from assistant.chemical_matcher import ChemicalDetectorUnavailableError

_FAKE_CANDIDATES = {
    "endrin": ("Endrin", "Banned"),
    "malathion": ("Malathion", "Restricted"),
    "carbaryl": ("Carbaryl", "Restricted"),
    "calcium cyanide": ("Calcium Cyanide", "Banned"),
}


@pytest.fixture(autouse=True)
def _loaded(monkeypatch):
    chemical_matcher._build_indices(dict(_FAKE_CANDIDATES))
    monkeypatch.setattr(chemical_matcher, "_LOADED", True)
    yield
    monkeypatch.setattr(chemical_matcher, "_LOADED", False)


def test_exact_match():
    assert chemical_matcher.detect_chemicals("Do not use Endrin on this crop.") == {"Endrin": "Banned"}


def test_no_match_on_unrelated_text():
    assert chemical_matcher.detect_chemicals("Use neem oil and good drainage.") == {}


def test_word_order_match():
    assert chemical_matcher.detect_chemicals("Avoid Cyanide Calcium entirely.") == {"Calcium Cyanide": "Banned"}


def test_formulation_suffix_is_stripped():
    assert chemical_matcher.detect_chemicals("The label says Carbaryl50EC.") == {"Carbaryl": "Restricted"}


def test_leetspeak_is_decoded():
    assert chemical_matcher.detect_chemicals("Found traces of M@l@thion in the sample.") == {"Malathion": "Restricted"}


def test_letter_spaced_text_is_collapsed():
    assert chemical_matcher.detect_chemicals("Contains E n d r i n residue.") == {"Endrin": "Banned"}


def test_fuzzy_typo_match():
    assert chemical_matcher.detect_chemicals("Suspected endrn contamination.") == {"Endrin": "Banned"}


def test_unavailable_when_db_url_not_set(monkeypatch):
    monkeypatch.setattr(chemical_matcher, "_LOADED", False)
    monkeypatch.setattr(chemical_matcher, "_client", None)
    monkeypatch.setattr(chemical_matcher, "_collection", None)

    from assistant import config
    monkeypatch.setattr(config, "CHEMICAL_DB_URL", None)

    with pytest.raises(ChemicalDetectorUnavailableError) as exc_info:
        chemical_matcher.detect_chemicals("Endrin")
    # Revision 16 (ISS-14): confirmed live that the env var name leaked
    # into a real public API response - the user-facing message must
    # never name it.
    assert "CHEMICAL_DB_URL" not in str(exc_info.value)
