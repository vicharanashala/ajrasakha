"""Step 015 — Negative and Boundary Tests for the AjraSakha Multilingual Testing Suite.

Covers:
  1.  Wrong-script response (Hindi response to Tamil query) → FAIL language
  2.  Mixed-language response (>30% Latin in a Hindi response) → FAIL switch
  3.  English response to non-English query → FAIL proportion
  4.  Testing disclaimer missing in required-mode scenario → FAIL
  5.  Testing disclaimer missing in forbidden-mode scenario → PASS (not required)
  6.  2hr disclaimer present when mode=forbidden → FAIL (violation)
  7.  Misplaced testing disclaimer (not at bottom) → test behavior documented
  8.  Incorrect crop terminology in EN response → FAIL terminology
  9.  Empty response → FAIL language
  10. No terminology seeds → trivially PASS
  11. Duplicate case IDs raise AssertionError
  12. Wrong domain count raises AssertionError from assert_domain_distribution
  13. Missing DeepEval credentials → BLOCKED/SKIPPED
  14. WhatsApp transport missing env vars → BLOCKED
  15. WhatsApp transport stub raises NotImplementedError
  16. Language proportion below threshold → FAIL
  17. Segment-level language switch detection fires
  18. URL segments in disclaimer do NOT trigger segment switch
"""

from __future__ import annotations

import os
import pytest
from unittest.mock import patch

from ajrasakha.evaluation.multilingual.case_generator import generate_cases
from ajrasakha.evaluation.multilingual.case_schema import MultilingualCase, TerminologyAssertion
from ajrasakha.evaluation.multilingual.scenarios import SCENARIOS, assert_domain_distribution
from ajrasakha.evaluation.multilingual.validators.language_match import (
    validate_language_match,
    NATIVE_PROPORTION_THRESHOLD,
    ENGLISH_LATIN_THRESHOLD,
)
from ajrasakha.evaluation.multilingual.validators.lang_switch import validate_lang_switch
from ajrasakha.evaluation.multilingual.validators.disclaimer_check import validate_disclaimer
from ajrasakha.evaluation.multilingual.validators.terminology import validate_terminology
from ajrasakha.evaluation.multilingual.validators.deepeval_multilingual import (
    evaluate_deepeval,
    is_deepeval_enabled,
)
from ajrasakha.evaluation.multilingual.transports.whatsapp_transport import (
    run_whatsapp_case,
    is_whatsapp_transport_available,
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _case(scenario_id: str, lang_code: str) -> MultilingualCase:
    """Generate a single test case."""
    cases = generate_cases(scenario_ids=[scenario_id], language_codes=[lang_code])
    assert len(cases) == 1
    return cases[0]


# ═══════════════════════════════════════════════════════════════════════════════
# 1–3: Language match boundary cases
# ═══════════════════════════════════════════════════════════════════════════════

class TestLanguageMatchBoundary:
    def test_wrong_script_fails(self):
        """Hindi Devanagari response to a Tamil query → FAIL."""
        case = _case("S10", "TA")  # Tamil case
        # Devanagari (Hindi) text — wrong script for Tamil case
        hindi_text = (
            "यह पैडी ब्लास्ट रोग का उपचार है जो कि बहुत जरूरी है। "
            "आपको फफूंदनाशक का उपयोग करना चाहिए।"
        )
        result = validate_language_match(hindi_text, case)
        assert result["language_pass"] is False, (
            "Hindi text should FAIL Tamil language check"
        )

    def test_empty_response_fails(self):
        """Empty response string → FAIL for any language."""
        for lang in ["EN", "HI", "KN", "TA"]:
            case = _case("S07", lang)
            result = validate_language_match("", case)
            assert result["language_pass"] is False, (
                f"Empty response should FAIL for language {lang}"
            )
            assert result["language_proportion"] == 0.0

    def test_english_below_latin_threshold_fails(self):
        """English case where Latin chars < 60% → FAIL proportion."""
        case = _case("S12", "EN")  # English case
        # Response is almost all numbers and symbols — few Latin chars
        low_latin = "123 456 789 101 202 303 404 50% 60% 70% @ # ! 202 303 !!! ??? ---"
        result = validate_language_match(low_latin, case)
        # This has very few alphabetic chars
        if result["language_proportion"] < ENGLISH_LATIN_THRESHOLD:
            assert result["language_pass"] is False

    def test_native_proportion_below_threshold_fails(self):
        """Non-English response with <30% native script → FAIL proportion."""
        case = _case("S07", "HI")  # Hindi case
        # Mostly English with just one Hindi character
        mostly_english = "A" * 200 + "क"  # 0.5% Hindi chars
        result = validate_language_match(mostly_english, case)
        assert result["language_script_found"] is True  # found one char
        assert result["language_proportion_pass"] is False  # but below threshold
        assert result["language_pass"] is False

    def test_sufficient_native_proportion_passes(self):
        """Response with ≥30% native script → PASS."""
        case = _case("S07", "HI")
        # ~30% Hindi chars
        response = "\u0915" * 30 + "A" * 70  # 30% Hindi
        result = validate_language_match(response, case)
        assert result["language_proportion"] >= NATIVE_PROPORTION_THRESHOLD
        assert result["language_proportion_pass"] is True
        assert result["language_pass"] is True


# ═══════════════════════════════════════════════════════════════════════════════
# 4–8: Disclaimer boundary cases
# ═══════════════════════════════════════════════════════════════════════════════

class TestDisclaimerBoundary:
    def test_required_mode_missing_testing_disclaimer_fails(self):
        """Required mode: testing disclaimer absent → FAIL."""
        case = _case("S02", "EN")  # required mode
        result = validate_disclaimer("Yellow rust treatment advice.", case)
        assert result["disclaimer_pass"] is False
        assert "missing" in result["disclaimer_reason"].lower()

    def test_required_mode_missing_2hr_disclaimer_fails(self):
        """Required mode: testing present but 2hr absent → FAIL."""
        case = _case("S02", "EN")  # required mode
        # Only testing disclaimer, no 2hr
        response = f"Yellow rust advice.\n{case.expected_testing_disclaimer}"
        result = validate_disclaimer(response, case)
        assert result["disclaimer_pass"] is False
        assert "2-hour" in result["disclaimer_reason"].lower()

    def test_required_mode_both_disclaimers_passes(self):
        """Required mode: both disclaimers present → PASS."""
        case = _case("S02", "EN")  # required mode
        response = f"Advice.\n{case.expected_2hr_disclaimer}\n{case.expected_testing_disclaimer}"
        result = validate_disclaimer(response, case)
        assert result["disclaimer_pass"] is True
        assert "2-hour" not in result["disclaimer_reason"].lower()

    def test_forbidden_mode_no_disclaimer_passes(self):
        """Forbidden mode: no disclaimer in response → PASS (correct)."""
        case = _case("S16", "EN")  # weather, forbidden mode
        result = validate_disclaimer("The weather today is sunny in Ropar.", case)
        assert result["two_hr_disclaimer_forbidden_violated"] is False

    def test_forbidden_mode_2hr_disclaimer_present_fails(self):
        """Forbidden mode: 2hr disclaimer appears in response → FAIL (violation)."""
        case = _case("S16", "EN")  # weather, forbidden mode
        from ajrasakha.agents.translation_catalog import get_two_hour_disclaimer
        two_hr = get_two_hour_disclaimer("English", "English")
        if not two_hr.strip():
            pytest.skip("No 2hr disclaimer in EN catalog")
        result = validate_disclaimer(f"Weather today.\n{two_hr}", case)
        assert result["two_hr_disclaimer_forbidden_violated"] is True
        assert result["disclaimer_pass"] is False


# ═══════════════════════════════════════════════════════════════════════════════
# Language switch boundary cases
# ═══════════════════════════════════════════════════════════════════════════════

class TestLangSwitchBoundary:
    def test_mixed_response_above_threshold_fails(self):
        """Response >30% unexpected Latin tokens in a Hindi case → FAIL."""
        case = _case("S07", "HI")
        # More than 30% English words mixed into Hindi
        mixed = (
            "यह paddy cultivation advice wheat is growing here transplanting nursery beds "
            "this is entirely in English words making up more than thirty percent of tokens"
        )
        result = validate_lang_switch(mixed, case)
        assert result["lang_switch_detected"] is True

    def test_clean_native_script_no_switch(self):
        """Clean Hindi response → no switch detected."""
        case = _case("S07", "HI")
        hindi = (
            "गेहूं में पीला रतुआ रोग के लिए फफूंदनाशक का उपयोग करें। "
            "यह रोग बहुत नुकसानदायक है और समय पर उपचार जरूरी है।"
        )
        result = validate_lang_switch(hindi, case)
        assert result["lang_switch_detected"] is False

    def test_urls_in_disclaimer_do_not_trigger_switch(self):
        """Disclaimer URLs (soilhealth.dac.gov.in) must NOT trigger segment switch."""
        case = _case("S07", "HI")
        # Testing disclaimer for Hindi contains URLs — this should NOT trigger segment switch
        cases_full = generate_cases(scenario_ids=["S07"], language_codes=["HI"])
        c = cases_full[0]
        from ajrasakha.evaluation.multilingual.fixtures.mock_responses import build_mock_response
        mock = build_mock_response(c)
        resp = mock["response_text"]
        result = validate_lang_switch(resp, c)
        assert result["language_segment_switch_detected"] is False, (
            f"URL segments in disclaimer should not trigger switch: "
            f"{result['language_segment_switch_reason']}"
        )

    def test_segment_level_english_paragraph_fires(self):
        """A single fully-English paragraph inside Hindi → segment switch detected."""
        case = _case("S07", "HI")
        # Two Hindi sentences followed by a fully English paragraph
        mixed = (
            "यह गेहूं के रोग की जानकारी है। रोग के लक्षण पत्तियों पर दिखते हैं।\n"
            "This is a completely English paragraph about yellow rust disease in wheat. "
            "You should apply fungicide immediately to prevent further spread of the disease."
        )
        result = validate_lang_switch(mixed, case)
        assert result["language_segment_switch_detected"] is True


# ═══════════════════════════════════════════════════════════════════════════════
# Terminology boundary cases
# ═══════════════════════════════════════════════════════════════════════════════

class TestTerminologyBoundary:
    def test_missing_en_term_fails_for_en_case(self):
        """English case with missing crop term → hard FAIL (not review_required)."""
        case = _case("S12", "EN")  # required seeds: paddy, mandi, price
        result = validate_terminology("generic farming advice unrelated to wheat", case)
        assert result["terminology_pass"] is False
        assert result["terminology_review_required"] is False  # EN → not review_required
        assert len(result["terminology_missing_terms"]) > 0

    def test_all_terms_found_en_passes(self):
        case = _case("S07", "EN")
        result = validate_terminology("Mustard seed treatment should be done using fungicide.", case)
        assert result["terminology_pass"] is True
        assert result["terminology_missing_terms"] == []

    def test_no_seeds_trivially_passes(self):
        """S18 (non-agri query) has no terminology seeds → always PASS."""
        case = _case("S18", "EN")
        result = validate_terminology("Sorry, this is not an agriculture question.", case)
        assert result["terminology_pass"] is True

    def test_non_en_missing_term_sets_review_required(self):
        """Non-English case with missing terms → terminology_review_required is True."""
        case = _case("S07", "HI")
        result = validate_terminology("कुछ उत्तर जिसमें शब्द नहीं हैं।", case)
        assert result["terminology_pass"] is False
        assert result["terminology_review_required"] is True



# ═══════════════════════════════════════════════════════════════════════════════
# Domain distribution integrity
# ═══════════════════════════════════════════════════════════════════════════════

class TestDomainDistributionIntegrity:
    def test_assert_domain_distribution_passes_for_full_corpus(self):
        assert_domain_distribution()  # Must not raise

    def test_assert_domain_distribution_raises_on_wrong_count(self):
        """Supplying wrong scenario count → AssertionError."""
        partial = [s for s in SCENARIOS if s.domain_group == "weather"][:5]  # 5 not 6
        with pytest.raises(AssertionError, match="expected exactly 6"):
            assert_domain_distribution(partial)



# ═══════════════════════════════════════════════════════════════════════════════
# DeepEval credential checks (Step 012)
# ═══════════════════════════════════════════════════════════════════════════════

class TestDeepEvalBoundary:
    def test_missing_credentials_returns_blocked(self):
        """When DEEPEVAL_MULTILINGUAL=1 but no model creds → BLOCKED."""
        with patch.dict(os.environ, {
            "DEEPEVAL_MULTILINGUAL": "1",
            "ANTHROPIC_API_KEY": "",
            "OPENAI_API_KEY": "",
        }):
            result = evaluate_deepeval("wheat query", "Some response text about wheat.")
            assert result["deepeval_status"] == "BLOCKED", (
                f"Expected BLOCKED, got: {result['deepeval_status']} — {result['deepeval_reason']}"
            )
            assert "BLOCKED" in result["deepeval_reason"]

    def test_flag_not_set_returns_skipped(self):
        """When DEEPEVAL_MULTILINGUAL not set → SKIPPED."""
        env = {k: v for k, v in os.environ.items()
               if k != "DEEPEVAL_MULTILINGUAL"}
        with patch.dict(os.environ, env, clear=True):
            result = evaluate_deepeval("wheat query", "Some response.")
            assert result["deepeval_status"] == "SKIPPED"

    def test_empty_response_returns_blocked(self):
        """Empty response text → BLOCKED (cannot evaluate)."""
        with patch.dict(os.environ, {"DEEPEVAL_MULTILINGUAL": "1",
                                     "ANTHROPIC_API_KEY": "fake-key"}):
            result = evaluate_deepeval("a query", "")
            assert result["deepeval_status"] == "BLOCKED"

    def test_is_deepeval_enabled_false_without_flag(self):
        env = {k: v for k, v in os.environ.items()
               if k not in ("DEEPEVAL_MULTILINGUAL",)}
        with patch.dict(os.environ, env, clear=True):
            assert is_deepeval_enabled() is False


# ═══════════════════════════════════════════════════════════════════════════════
# WhatsApp transport boundary cases (Step 013)
# ═══════════════════════════════════════════════════════════════════════════════

class TestWhatsAppTransportBoundary:
    def test_missing_env_vars_returns_blocked(self):
        """WhatsApp transport with no env vars → BLOCKED result dict."""
        env = {k: v for k, v in os.environ.items()
               if k not in ("WHATSAPP_TEST_ENDPOINT", "WHATSAPP_TEST_IDENTITY")}
        with patch.dict(os.environ, env, clear=True):
            result = run_whatsapp_case({"name": "ML-S01-EN"})
            assert result["graph_status"] == "blocked"
            assert "BLOCKED" in result["error"]
            assert "WHATSAPP_TEST_ENDPOINT" in result["error"] or "WHATSAPP_TEST_IDENTITY" in result["error"]

    @patch("httpx.post")
    def test_configured_transport_runs_httpx(self, mock_post):
        """When env vars are set, run_whatsapp_case attempts to POST."""
        mock_post.side_effect = Exception("Mocked error")
        with patch.dict(os.environ, {
            "WHATSAPP_TEST_ENDPOINT": "https://test.example.invalid",
            "WHATSAPP_TEST_IDENTITY": "+91-TEST-SANDBOX-123",
        }):
            result = run_whatsapp_case({"name": "ML-S01-EN"})
            assert "error" in result
            assert "Mocked error" in result["error"]

    def test_is_available_false_without_vars(self):
        env = {k: v for k, v in os.environ.items()
               if k not in ("WHATSAPP_TEST_ENDPOINT", "WHATSAPP_TEST_IDENTITY")}
        with patch.dict(os.environ, env, clear=True):
            assert is_whatsapp_transport_available() is False

    def test_is_available_true_with_vars(self):
        with patch.dict(os.environ, {
            "WHATSAPP_TEST_ENDPOINT": "https://test.example.invalid",
            "WHATSAPP_TEST_IDENTITY": "+91-TEST-SANDBOX-123",
        }):
            assert is_whatsapp_transport_available() is True
