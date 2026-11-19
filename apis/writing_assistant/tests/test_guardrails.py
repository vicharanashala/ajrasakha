"""Guardrail tests mapped to the acceptance-test examples in the Writing
Assistant Build Plan. The LLM second-opinion and chemical-detector calls are
monkeypatched throughout - no automated test makes a real network call.
"""

import pytest

from assistant import chemical_matcher, guardrails, llm_client
from assistant.chemical_matcher import ChemicalDetectorUnavailableError
from assistant.models import CheckStatus, GuardrailStatus, LLMUnavailableError


@pytest.fixture(autouse=True)
def _no_real_network(monkeypatch):
    """By default: chemical-detector finds nothing, LLM second opinion says
    'no change' for every pair. Individual tests override one or the other."""
    monkeypatch.setattr(chemical_matcher, "detect_chemicals", lambda text: {})
    monkeypatch.setattr(llm_client, "check_meaning_preserved_batch", lambda pairs: [(False, "")] * len(pairs))
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


# Live-confirmed real rejection: a draft typo ("Avid" for "Avoid") got
# correctly fixed by generate_polish, but the negation check read the
# now-correct "avoid" as a negation marker being added, since "avid"
# isn't a recognized negation word - a false positive, not a real
# content change.
# Live-confirmed real rejection: a grammar fix correctly pluralized
# "mode of action" -> "modes of action" (and "rotate" -> "rotated"),
# and the treatment-term check read the pluralization as the named
# treatment itself changing.
def test_grammar_fix_pluralizing_a_treatment_term_passes():
    result = guardrails.run_guardrail(
        "Insecticides should be rotate with different mode of action.",
        "Insecticides should be rotated with different modes of action.",
    )
    assert result.checked_tokens.treatment_identity == CheckStatus.UNCHANGED
    assert result.status == GuardrailStatus.PASSED


# Live-confirmed real rejection: "wheet" (a typo, not a real crop name)
# corrected to "wheat" (a real one) - same false-positive shape as the
# negation case, in a different category.
def test_typo_fix_that_restores_a_crop_name_passes():
    result = guardrails.run_guardrail(
        "Leaf blight is a common fungal disease affecting wheet crops.",
        "Leaf blight is a common fungal disease affecting wheat crops.",
    )
    assert result.checked_tokens.crop_names == CheckStatus.UNCHANGED
    assert result.status == GuardrailStatus.PASSED


# Live-confirmed real rejection: the same polish pass fixed TWO typos in
# one sentence ("disese"/"wheet" -> "disease"/"wheat"), not just the
# crop name - must still pass.
def test_typo_fix_with_two_corrections_in_one_sentence_passes():
    result = guardrails.run_guardrail(
        "Leaf blight is a common fungal disese affecting wheet crops.",
        "Leaf blight is a common fungal disease affecting wheat crops.",
    )
    assert result.checked_tokens.crop_names == CheckStatus.UNCHANGED
    assert result.status == GuardrailStatus.PASSED


# Same guard, proactively extended to certainty (hedge/absolute words)
# and timing keywords - not yet reported live, but structurally the
# identical risk (a typo'd "wil" corrected to "will", "beforre" to
# "before", etc.).
def test_typo_fix_that_restores_an_absolute_certainty_word_passes():
    result = guardrails.run_guardrail(
        "The treatment wil help reduce the disease.",
        "The treatment will help reduce the disease.",
    )
    assert result.checked_tokens.certainty_language == CheckStatus.UNCHANGED
    assert result.status == GuardrailStatus.PASSED


def test_typo_fix_that_restores_a_timing_keyword_passes():
    result = guardrails.run_guardrail(
        "Apply the spray beforre flowering.",
        "Apply the spray before flowering.",
    )
    assert result.checked_tokens.timing == CheckStatus.UNCHANGED
    assert result.status == GuardrailStatus.PASSED


def test_typo_fix_that_restores_a_negation_word_passes():
    result = guardrails.run_guardrail(
        "Cultural Control:\n- Avid excessive application of nitrogen fertilizers.",
        "Cultural Control:\n- Avoid excessive application of nitrogen fertilizers.",
    )
    assert result.checked_tokens.negation == CheckStatus.UNCHANGED
    assert result.status == GuardrailStatus.PASSED


# Example F - negation flipped
def test_negation_flip_is_rejected():
    result = guardrails.run_guardrail(
        "Do not apply the spray before flowering.",
        "Apply the spray before flowering.",
    )
    assert result.status == GuardrailStatus.FAILED
    assert result.checked_tokens.negation == CheckStatus.CHANGED


# A rejection must point at the specific sentence that triggered it -
# without this, diagnosing a real report means reproducing it live
# (see the conditions test below for why that's expensive and unreliable).
def test_negation_flip_detail_names_the_offending_sentence():
    result = guardrails.run_guardrail(
        "Do not apply the spray before flowering.",
        "Apply the spray before flowering.",
    )
    detail = next(d for d in result.details if "negation marker" in d)
    assert "Do not apply the spray before flowering." in detail
    assert "Apply the spray before flowering." in detail


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


# Example I - timing changed (Revision 15: the duration change is caught
# via numbers_and_units, not timing specifically - timing now compares
# which keyword is used, not the words after it, see below).
def test_timing_duration_change_is_still_rejected():
    result = guardrails.run_guardrail(
        "Observe the pre-harvest interval within 24 hours before picking.",
        "Observe the pre-harvest interval within 48 hours before picking.",
    )
    assert result.status == GuardrailStatus.FAILED
    assert result.checked_tokens.numbers_and_units == CheckStatus.CHANGED
    assert result.checked_tokens.timing == CheckStatus.UNCHANGED


# A genuine timing-keyword swap (before <-> after) is a real content
# change and must still be caught.
def test_timing_keyword_swap_is_rejected():
    result = guardrails.run_guardrail(
        "Apply the spray before flowering.",
        "Apply the spray after flowering.",
    )
    assert result.status == GuardrailStatus.FAILED
    assert result.checked_tokens.timing == CheckStatus.CHANGED


# Rewording what follows a timing keyword, without changing the keyword
# itself, is a wording choice, not a timing change - confirmed as a real
# false-positive source live (Writing Assistant Build Plan, Revision 15).
def test_timing_trailing_words_rewording_passes():
    result = guardrails.run_guardrail(
        "Strictly observe the product-specific pre-harvest interval before harvesting the crop.",
        "Strictly observe the product-specific pre-harvest interval before harvest.",
    )
    assert result.checked_tokens.timing == CheckStatus.UNCHANGED


# Example J - condition dropped
def test_condition_dropped_is_rejected():
    result = guardrails.run_guardrail(
        "Apply the spray only if infestation exceeds the threshold.",
        "Apply the spray.",
    )
    assert result.status == GuardrailStatus.FAILED
    assert result.checked_tokens.conditions == CheckStatus.CHANGED


def test_condition_dropped_detail_names_the_offending_sentence():
    result = guardrails.run_guardrail(
        "Apply the spray only if infestation exceeds the threshold.",
        "Apply the spray.",
    )
    detail = next(d for d in result.details if "conditional marker" in d)
    assert "Apply the spray only if infestation exceeds the threshold." in detail
    assert "Apply the spray." in detail


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


# Example L - synonym swaps within a marker category pass (Revision 13):
# a real live rejection showed "only when permitted" -> "only if ... permits"
# being rejected for using 'if' instead of 'when', though the condition
# itself was unchanged. negation/conditions/certainty-polarity are now
# presence-based, not exact-word-based, so these synonym swaps pass.
def test_conditional_marker_synonym_swap_passes():
    result = guardrails.run_guardrail(
        "Repeat applications only when permitted by the label.",
        "Repeat applications only if the label permits them.",
    )
    assert result.checked_tokens.conditions == CheckStatus.UNCHANGED


def test_negation_synonym_swap_passes():
    result = guardrails.run_guardrail(
        "Do not spray during windy conditions.",
        "Avoid spraying during windy conditions.",
    )
    assert result.checked_tokens.negation == CheckStatus.UNCHANGED


# Revision 18: confirmed live from a real rejection - "and not an
# occasional issue" -> "rather than an occasional issue" was rejected
# despite being a safe paraphrase the LLM second opinion itself didn't
# flag.
def test_negation_rather_than_paraphrase_passes():
    result = guardrails.run_guardrail(
        "It is a major, yield-significant disease and not an occasional issue.",
        "It is a major, yield-significant disease rather than an occasional issue.",
    )
    assert result.checked_tokens.negation == CheckStatus.UNCHANGED


def test_certainty_same_polarity_synonym_swap_passes():
    result = guardrails.run_guardrail(
        "This may help reduce the spread of the disease.",
        "This could help reduce the spread of the disease.",
    )
    assert result.checked_tokens.certainty_language == CheckStatus.UNCHANGED


# Example L - a sentence merge/split *within one section* now falls back to
# a whole-section comparison instead of an automatic reject (Writing
# Assistant Build Plan, Revision 14, ISS-02) - a real test report showed
# the old whole-document rule rejecting 16/21 real multi-section drafts for
# exactly this kind of formatting-only change. Nothing technical changed
# here, so it must pass.
def test_sentence_merge_within_one_section_falls_back_instead_of_rejecting():
    result = guardrails.run_guardrail(
        "Apply 2 ml per litre. Spray in the evening.",
        "Apply 2 ml per litre and spray in the evening.",
    )
    assert result.status == GuardrailStatus.PASSED
    assert result.checked_tokens.sentence_alignment == CheckStatus.UNCHANGED
    assert any("compared as a whole section" in d for d in result.details)


# A genuine difference in section *count* (not just sentence count within
# one section) is still too ambiguous to check at all.
def test_section_count_mismatch_falls_back_to_whole_document_instead_of_rejecting():
    # Revision 16 (ISS-13): confirmed live this was still blocking most
    # rewrites even after the per-section fallback - a section-count
    # mismatch now falls back one level further instead of an automatic
    # reject. Nothing technical changed here, so it must pass.
    result = guardrails.run_guardrail(
        "Intro paragraph here.\n\nSecond paragraph here.",
        "Intro paragraph here and second paragraph here.",
    )
    assert result.status == GuardrailStatus.PASSED
    assert result.checked_tokens.sentence_alignment == CheckStatus.UNCHANGED
    assert any("compared as one whole document" in d for d in result.details)


# Example S - a required guardrail layer is unavailable -> rejected, not skipped
def test_chemical_detector_unavailable_rejects(monkeypatch):
    def _raise(text):
        raise ChemicalDetectorUnavailableError("simulated outage")

    monkeypatch.setattr(chemical_matcher, "detect_chemicals", _raise)

    result = guardrails.run_guardrail(
        "The treatment is effective when farmers apply it correctly.",
        "The treatment is very effective when farmers apply it correctly.",
    )
    assert result.status == GuardrailStatus.FAILED
    assert result.checked_tokens.chemical_names == CheckStatus.NOT_RUN


def test_llm_second_opinion_unavailable_rejects(monkeypatch):
    def _raise(pairs):
        raise LLMUnavailableError("simulated LLM outage")

    monkeypatch.setattr(llm_client, "check_meaning_preserved_batch", _raise)

    result = guardrails.run_guardrail(
        "The treatment is effective when farmers apply it correctly.",
        "The treatment is very effective when farmers apply it correctly.",
    )
    assert result.status == GuardrailStatus.FAILED


def test_llm_second_opinion_flagging_a_change_rejects(monkeypatch):
    monkeypatch.setattr(
        llm_client, "check_meaning_preserved_batch",
        lambda pairs: [(True, "The rewrite subtly strengthens the recommendation.")] * len(pairs),
    )

    result = guardrails.run_guardrail(
        "The treatment is effective when farmers apply it correctly.",
        "The treatment is very effective when farmers apply it correctly.",
    )
    assert result.status == GuardrailStatus.FAILED
    assert any("second-opinion" in d.lower() for d in result.details)


# The second opinion checks every changed section in ONE batched call
# (check_meaning_preserved_batch) rather than one call per section or one
# call for the whole document - live-confirmed a single batch call still
# correctly distinguishes a real dosage change, a negation flip, and a
# pure-punctuation non-change across several pairs at once.
def test_llm_second_opinion_skips_identical_sections(monkeypatch):
    seen_pairs = []

    def _record(pairs):
        seen_pairs.extend(pairs)
        return [(False, "")] * len(pairs)

    monkeypatch.setattr(llm_client, "check_meaning_preserved_batch", _record)

    guardrails.run_guardrail(
        "First section unchanged.\n\nSecond section are wrong.",
        "First section unchanged.\n\nSecond section is wrong.",
    )
    # Only the changed section is sent to the model - the identical one
    # is skipped, nothing to ask about.
    assert seen_pairs == [("Second section are wrong.", "Second section is wrong.")]


def test_llm_second_opinion_one_changed_section_rejects(monkeypatch):
    def _check(pairs):
        return [(True, "meaning shifted") if o != r else (False, "") for o, r in pairs]

    monkeypatch.setattr(llm_client, "check_meaning_preserved_batch", _check)

    result = guardrails.run_guardrail(
        "Section one.\n\nSection two.",
        "Section one.\n\nSection two, now stronger.",
    )
    assert result.status == GuardrailStatus.FAILED


# A batch failure fails the whole second opinion, even if some sections
# in the batch would have matched - the batch call is now one call for
# every changed section, so there's no more "this one section's own call
# failed while the others succeeded"; a failure is all-or-nothing for the
# whole batch, same fail-closed principle as before, just at the batch's
# own granularity now.
def test_llm_second_opinion_batch_failure_rejects_even_with_multiple_changed_sections(monkeypatch):
    def _raise(pairs):
        raise LLMUnavailableError("simulated outage")

    monkeypatch.setattr(llm_client, "check_meaning_preserved_batch", _raise)

    result = guardrails.run_guardrail(
        "First section rewritten.\n\nSecond section.",
        "First section, rewritten.\n\nSecond section, slightly different.",
    )
    assert result.status == GuardrailStatus.FAILED
    assert any("could not run" in d.lower() for d in result.details)


def test_llm_second_opinion_falls_back_to_whole_document_on_section_count_mismatch(monkeypatch):
    seen_pairs = []

    def _record(pairs):
        seen_pairs.extend(pairs)
        return [(False, "")] * len(pairs)

    monkeypatch.setattr(llm_client, "check_meaning_preserved_batch", _record)

    original = "One section only."
    rewrite = "First part.\n\nSecond part - an extra section appeared."
    guardrails.run_guardrail(original, rewrite)
    assert seen_pairs == [(original, rewrite)]


def test_chemical_name_drift_is_rejected(monkeypatch):
    calls = iter([{"Endrin": "Banned"}, {}])
    monkeypatch.setattr(chemical_matcher, "detect_chemicals", lambda text: next(calls))

    result = guardrails.run_guardrail(
        "Do not use Endrin on this crop.",
        "Do not use any chemical on this crop.",
    )
    assert result.status == GuardrailStatus.FAILED
    assert result.checked_tokens.chemical_names == CheckStatus.CHANGED
