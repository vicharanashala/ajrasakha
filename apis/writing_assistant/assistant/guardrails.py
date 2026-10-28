"""The technical-content preservation guardrail: layered checks, each
capable of rejecting a rewrite on its own. Reduces risk; does not, and
never claims to, prove complete semantic equivalence (Writing Assistant
Build Plan, "Technical-content preservation policy").
"""

import logging

from . import chemical_detector_client, llm_client, text_checks
from .models import CheckedTokens, CheckStatus, GuardrailResult, GuardrailStatus, LLMUnavailableError

log = logging.getLogger("writing_assistant.guardrails")


def _diff_check(pairs: list[tuple[str, str]], extractor) -> CheckStatus:
    any_present = False
    for orig_s, rew_s in pairs:
        o = extractor(orig_s)
        r = extractor(rew_s)
        if o or r:
            any_present = True
        if o != r:
            return CheckStatus.CHANGED
    return CheckStatus.UNCHANGED if any_present else CheckStatus.NA


def _presence_diff_check(pairs: list[tuple[str, str]], extractor) -> CheckStatus:
    """Like _diff_check, but only compares whether the extractor found
    anything at all, not which specific word - correct for a marker
    category where every member is a safe synonym for another (negation:
    'not' vs 'avoid'; conditions: 'when' vs 'if' - both just mean "this is
    conditional"). Unlike crop names or treatment terms, where the
    specific word *is* the protected content, swapping within one of
    these categories doesn't change what's being said. Confirmed as a
    real false-positive source from a live rejection (Writing Assistant
    Build Plan, Revision 13) - "only when permitted" -> "only if ...
    permits" was rejected for using 'if' instead of 'when', despite the
    condition itself being unchanged."""
    any_present = False
    for orig_s, rew_s in pairs:
        o_present = bool(extractor(orig_s))
        r_present = bool(extractor(rew_s))
        if o_present or r_present:
            any_present = True
        if o_present != r_present:
            return CheckStatus.CHANGED
    return CheckStatus.UNCHANGED if any_present else CheckStatus.NA


def run_guardrail(original_text: str, rewrite_text: str) -> GuardrailResult:
    details: list[str] = []
    tokens = CheckedTokens()

    pairs = text_checks.align_sentences(original_text, rewrite_text)
    if pairs is None:
        # Ambiguous alignment (the rewrite merged/split sentences) is itself
        # higher risk - reject rather than attempt a best-effort check.
        tokens.sentence_alignment = CheckStatus.NOT_RUN
        details.append(
            "Could not align original and rewritten sentences 1:1 "
            "(sentence count differs) - treated as uncertain."
        )
        _log_rejection(original_text, rewrite_text, details)
        return GuardrailResult(status=GuardrailStatus.FAILED, checked_tokens=tokens, details=details)

    tokens.sentence_alignment = CheckStatus.UNCHANGED

    tokens.numbers_and_units = _diff_check(pairs, text_checks.extract_numbers_and_units)
    if tokens.numbers_and_units == CheckStatus.CHANGED:
        details.append("A number/unit present in the original does not appear unchanged in the rewrite.")

    tokens.certainty_language = _diff_check(pairs, text_checks.extract_certainty_polarities)
    if tokens.certainty_language == CheckStatus.CHANGED:
        details.append("Claim strength shifted between hedged and absolute certainty.")

    tokens.negation = _presence_diff_check(pairs, text_checks.extract_negations)
    if tokens.negation == CheckStatus.CHANGED:
        details.append("A negation marker (e.g. 'not'/'never'/'avoid') was added or removed.")

    tokens.crop_names = _diff_check(pairs, text_checks.extract_crop_names)
    if tokens.crop_names == CheckStatus.CHANGED:
        details.append("The set of named crops differs between the original and the rewrite.")

    tokens.treatment_identity = _diff_check(pairs, text_checks.extract_treatment_terms)
    if tokens.treatment_identity == CheckStatus.CHANGED:
        details.append("A named treatment/method term differs between the original and the rewrite.")

    tokens.timing = _diff_check(pairs, text_checks.extract_timing_phrases)
    if tokens.timing == CheckStatus.CHANGED:
        details.append("A timing phrase (before/after/within/every ...) differs between the original and the rewrite.")

    tokens.conditions = _presence_diff_check(pairs, text_checks.extract_conditional_markers)
    if tokens.conditions == CheckStatus.CHANGED:
        details.append("A conditional marker (if/when/unless/only ...) was added or removed.")

    # Scoped chemical-detector reuse - whole-text, not per-sentence, since
    # that's the deployed service's own contract.
    try:
        orig_chem = chemical_detector_client.detect_chemicals(original_text)
        rew_chem = chemical_detector_client.detect_chemicals(rewrite_text)
        if orig_chem or rew_chem:
            tokens.chemical_names = (
                CheckStatus.UNCHANGED if orig_chem == rew_chem else CheckStatus.CHANGED
            )
            if tokens.chemical_names == CheckStatus.CHANGED:
                details.append("The set of detected banned/restricted chemicals differs between the original and the rewrite.")
        else:
            tokens.chemical_names = CheckStatus.NA
    except chemical_detector_client.ChemicalDetectorUnavailableError as exc:
        tokens.chemical_names = CheckStatus.NOT_RUN
        details.append(f"Chemical-detector check could not run: {exc}")

    # LLM second-opinion - adds coverage for what the deterministic checks
    # above can't name (e.g. a subtler recommendation change), is not proof.
    try:
        changed, explanation = llm_client.check_meaning_preserved(original_text, rewrite_text)
        if changed:
            details.append(f"LLM second-opinion check flagged a possible meaning change: {explanation}")
        # The second opinion doesn't have its own CheckedTokens slot - it's
        # folded into the overall pass/fail decision directly, below.
        llm_flagged_change = changed
        llm_not_run = False
    except LLMUnavailableError as exc:
        details.append(f"LLM second-opinion check could not run: {exc}")
        llm_flagged_change = False
        llm_not_run = True

    overall_failed = tokens.any_failed() or llm_flagged_change or llm_not_run
    status = GuardrailStatus.FAILED if overall_failed else GuardrailStatus.PASSED

    if overall_failed:
        _log_rejection(original_text, rewrite_text, details)

    return GuardrailResult(status=status, checked_tokens=tokens, details=details)


def _log_rejection(original_text: str, rewrite_text: str, details: list[str]) -> None:
    """Server-side only - never returned in the HTTP response (a rejected
    suggestedText is never shown to the client either). Without this, a
    rejected rewrite leaves no trace anywhere, making a false-positive-vs-
    real-catch call on a real rejection impossible after the fact (see
    Writing Assistant Build Plan, Revision 12)."""
    log.info(
        "Guardrail rejected a rewrite. details=%s original=%r rewrite=%r",
        details, original_text, rewrite_text,
    )
