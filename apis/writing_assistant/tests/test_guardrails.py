"""Guardrail tests mapped to the acceptance-test examples in the Writing
Assistant Build Plan. The LLM second-opinion and chemical-detector calls are
monkeypatched throughout - no automated test makes a real network call.
"""

import pytest

from assistant import chemical_detector_client, guardrails, llm_client
from assistant.chemical_detector_client import ChemicalDetectorUnavailableError
from assistant.models import CheckStatus, GuardrailStatus, LLMUnavailableError


@pytest.fixture(autouse=True)
def _no_real_network(monkeypatch):
    """By default: chemical-detector finds nothing, LLM second opinion says
    'no change'. Individual tests override one or the other."""
    monkeypatch.setattr(chemical_detector_client, "detect_chemicals", lambda text: {})
    monkeypatch.setattr(llm_client, "check_meaning_preserved", lambda o, r: (False, ""))
    yield


# Example A - grammar correction, accepted
def test_grammar_only_rewrite_passes():
    result = guardrails.run_guardrail(
        "The treatment are effective when farmers apply it correctly.",
        "The treatment is effective when farmers apply it correctly.",
    )
    assert result.status == GuardrailStatus.PASSED
    assert result.checked_tokens.numbers_and_units == CheckStatus.NA
    assert result.checked_tokens.certainty_language == CheckStatus.NA


# Example B - claim strength changed, rejected
def test_claim_strength_change_is_rejected():
    result = guardrails.run_guardrail(
        "The treatment may help reduce the spread of the disease.",
        "The treatment will completely eliminate the disease.",
    )
    assert result.status == GuardrailStatus.FAILED
    assert result.checked_tokens.certainty_language == CheckStatus.CHANGED


# Example C - dosage changed, rejected
def test_dosage_change_is_rejected():
    result = guardrails.run_guardrail(
        "Apply 2 ml of the specified product per litre of water.",
        "Apply 5 ml of the specified product per litre of water.",
    )
    assert result.status == GuardrailStatus.FAILED
    assert result.checked_tokens.numbers_and_units == CheckStatus.CHANGED


# Example F - negation flipped
def test_negation_flip_is_rejected():
    result = guardrails.run_guardrail(
        "Do not apply the spray before flowering.",
        "Apply the spray before flowering.",
    )
    assert result.status == GuardrailStatus.FAILED
    assert result.checked_tokens.negation == CheckStatus.CHANGED


# Example G - crop name swapped
def test_crop_name_swap_is_rejected():
    result = guardrails.run_guardrail(
        "This treatment is recommended for paddy fields.",
        "This treatment is recommended for wheat fields.",
    )
    assert result.status == GuardrailStatus.FAILED
    assert result.checked_tokens.crop_names == CheckStatus.CHANGED


# Example H - treatment identity changed
def test_treatment_identity_change_is_rejected():
    result = guardrails.run_guardrail(
        "Spray neem oil on the affected leaves.",
        "Spray a chemical pesticide on the affected leaves.",
    )
    assert result.status == GuardrailStatus.FAILED
    assert result.checked_tokens.treatment_identity == CheckStatus.CHANGED


# Example I - timing changed
def test_timing_change_is_rejected():
    result = guardrails.run_guardrail(
        "Observe the pre-harvest interval within 24 hours before picking.",
        "Observe the pre-harvest interval within 48 hours before picking.",
    )
    assert result.status == GuardrailStatus.FAILED
    assert result.checked_tokens.timing == CheckStatus.CHANGED


# Example J - condition dropped
def test_condition_dropped_is_rejected():
    result = guardrails.run_guardrail(
        "Apply the spray only if infestation exceeds the threshold.",
        "Apply the spray.",
    )
    assert result.status == GuardrailStatus.FAILED
    assert result.checked_tokens.conditions == CheckStatus.CHANGED


# Example K - quantity/instruction reassociation across two sentences.
# Both numbers are still present somewhere in the rewrite - a whole-text
# diff would miss this. Per-sentence alignment catches it.
def test_quantity_instruction_reassociation_is_rejected():
    original = "Use 2 ml per litre for severe infestation. Use 1 ml per litre for mild infestation."
    rewrite = "Use 1 ml per litre for severe infestation. Use 2 ml per litre for mild infestation."
    # sanity check the premise: a naive whole-text set comparison would see no difference
    import re
    assert set(re.findall(r"\d+\s*ml", original)) == set(re.findall(r"\d+\s*ml", rewrite))

    result = guardrails.run_guardrail(original, rewrite)
    assert result.status == GuardrailStatus.FAILED
    assert result.checked_tokens.numbers_and_units == CheckStatus.CHANGED


# Example L - ambiguous sentence alignment (rewrite merges two sentences)
def test_ambiguous_alignment_is_rejected():
    result = guardrails.run_guardrail(
        "Apply 2 ml per litre. Spray in the evening.",
        "Apply 2 ml per litre and spray in the evening.",
    )
    assert result.status == GuardrailStatus.FAILED
    assert result.checked_tokens.sentence_alignment == CheckStatus.NOT_RUN


# Example S - a required guardrail layer is unavailable -> rejected, not skipped
def test_chemical_detector_unavailable_rejects(monkeypatch):
    def _raise(text):
        raise ChemicalDetectorUnavailableError("simulated outage")

    monkeypatch.setattr(chemical_detector_client, "detect_chemicals", _raise)

    result = guardrails.run_guardrail(
        "The treatment is effective when farmers apply it correctly.",
        "The treatment is very effective when farmers apply it correctly.",
    )
    assert result.status == GuardrailStatus.FAILED
    assert result.checked_tokens.chemical_names == CheckStatus.NOT_RUN


def test_llm_second_opinion_unavailable_rejects(monkeypatch):
    def _raise(original, rewrite):
        raise LLMUnavailableError("simulated LLM outage")

    monkeypatch.setattr(llm_client, "check_meaning_preserved", _raise)

    result = guardrails.run_guardrail(
        "The treatment is effective when farmers apply it correctly.",
        "The treatment is very effective when farmers apply it correctly.",
    )
    assert result.status == GuardrailStatus.FAILED


def test_llm_second_opinion_flagging_a_change_rejects(monkeypatch):
    monkeypatch.setattr(
        llm_client, "check_meaning_preserved",
        lambda o, r: (True, "The rewrite subtly strengthens the recommendation."),
    )

    result = guardrails.run_guardrail(
        "The treatment is effective when farmers apply it correctly.",
        "The treatment is very effective when farmers apply it correctly.",
    )
    assert result.status == GuardrailStatus.FAILED
    assert any("second-opinion" in d.lower() for d in result.details)


def test_chemical_name_drift_is_rejected(monkeypatch):
    calls = iter([{"Endrin": "Banned"}, {}])
    monkeypatch.setattr(chemical_detector_client, "detect_chemicals", lambda text: next(calls))

    result = guardrails.run_guardrail(
        "Do not use Endrin on this crop.",
        "Do not use any chemical on this crop.",
    )
    assert result.status == GuardrailStatus.FAILED
    assert result.checked_tokens.chemical_names == CheckStatus.CHANGED
