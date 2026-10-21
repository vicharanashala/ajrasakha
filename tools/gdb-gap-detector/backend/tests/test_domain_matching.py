import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain_matching import normalize_domain


class TestNormalizeDomain:
    def test_handles_empty_string(self):
        assert normalize_domain("") == ""

    def test_lowercases(self):
        assert normalize_domain("Disease") == "disease"

    def test_strips_crop_modifier_word(self):
        # Real mismatch found in testing: raw_queries has "Disease",
        # gdb_entries has "Crop Disease" — same underlying topic.
        assert normalize_domain("Crop Disease") == "disease"
        assert normalize_domain("Disease") == "disease"

    def test_strips_control_modifier_word(self):
        # Real mismatch found in testing: raw_queries has "Pest",
        # gdb_entries has "Pest Control".
        assert normalize_domain("Pest Control") == "pest"
        assert normalize_domain("Pest") == "pest"

    def test_strips_trailing_plural_s(self):
        # Real mismatch found in testing: raw_queries has "Fertilizer",
        # gdb_entries has "Fertilizers".
        assert normalize_domain("Fertilizers") == "fertilizer"
        assert normalize_domain("Fertilizer") == "fertilizer"

    def test_does_not_over_strip_a_short_word_ending_in_s(self):
        assert normalize_domain("Seeds") != ""
        assert len(normalize_domain("Seeds")) >= 3

    def test_genuinely_different_domains_stay_different(self):
        assert normalize_domain("Weather") != normalize_domain("Soil Health")
        assert normalize_domain("Irrigation") != normalize_domain("Harvesting")

    def test_collapses_extra_whitespace(self):
        assert normalize_domain("  Pest   Control  ") == "pest"
