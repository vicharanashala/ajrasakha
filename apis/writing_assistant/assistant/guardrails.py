"""The technical-content preservation guardrail: layered checks, each
capable of rejecting a rewrite on its own. Reduces risk; does not, and
never claims to, prove complete semantic equivalence (Writing Assistant
Build Plan, "Technical-content preservation policy").
"""

import logging

from . import chemical_matcher, llm_client, text_checks
from .models import CheckedTokens, CheckStatus, GuardrailResult, GuardrailStatus, LLMUnavailableError

log = logging.getLogger("writing_assistant.guardrails")


def _diff_check(
    pairs: list[tuple[str, str]], extractor, marker_words: frozenset[str] | None = None
) -> tuple[CheckStatus, tuple[str, str] | None]:
    """Returns the status plus the sentence pair that triggered a CHANGED
    verdict (or None otherwise) - same reasoning as _presence_diff_check's
    own pair-tracking: without it, a rejection detail can only name the
    category, never the sentence, forcing a live reproduction hunt every
    time (confirmed real: a treatmentIdentity rejection with no pair
    attached took three live re-runs to even attempt pinning down).

    marker_words enables the same single-word-typo-fix guard
    _presence_diff_check already has (see its docstring and
    text_checks.is_single_word_typo_fix) - a spelling correction landing
    on/off a protected word is not a real content change. Confirmed real
    for crop names too, not just negation: a typo'd "wheet" (not a real
    crop name) corrected to "wheat" (a real one) read as "the set of
    named crops differs" - the exact same false-positive shape, just
    surfacing in a different category than the one first reported.
    Passing None skips the guard (used by categories where the specific
    word genuinely is the protected content and a near-miss typo isn't a
    meaningful concept, e.g. numbers_and_units - a mis-typed digit is
    never safe to treat as "probably the same number")."""
    any_present = False
    for orig_s, rew_s in pairs:
        o = extractor(orig_s)
        r = extractor(rew_s)
        if o or r:
            any_present = True
        if o != r:
            if marker_words and text_checks.is_single_word_typo_fix(orig_s, rew_s, marker_words):
                continue
            return CheckStatus.CHANGED, (orig_s, rew_s)
    return (CheckStatus.UNCHANGED if any_present else CheckStatus.NA), None


def _presence_diff_check(
    pairs: list[tuple[str, str]], extractor, marker_words: frozenset[str] | None = None
) -> tuple[CheckStatus, tuple[str, str] | None]:
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
    condition itself being unchanged.

    marker_words (the category's own raw word set, e.g. NEGATION_WORDS)
    enables a second, narrower false-positive guard: a presence flip
    caused by a single-word spelling fix that happened to land on/off a
    marker word (e.g. "Avid" -> "Avoid" - see
    text_checks.is_single_word_typo_fix) is not a real content change,
    just a typo crossing the marker boundary by accident - confirmed
    live. Passing None skips this guard (used by callers with no single
    well-defined word set, none currently).

    Also returns the sentence pair that triggered a CHANGED verdict (or
    None otherwise) - without it, a rejection detail can only say "a
    marker was added or removed" with no pointer to which sentence,
    forcing a live reproduction hunt to tell a genuine catch apart from a
    sentence-alignment artifact (confirmed real: a draft that timed out
    and retried mid-rewrite, under this service's own concurrency pool,
    left no trace of which sentence pair the model actually touched)."""
    any_present = False
    for orig_s, rew_s in pairs:
        o_present = bool(extractor(orig_s))
        r_present = bool(extractor(rew_s))
        if o_present or r_present:
            any_present = True
        if o_present != r_present:
            if marker_words and text_checks.is_single_word_typo_fix(orig_s, rew_s, marker_words):
                continue
            return CheckStatus.CHANGED, (orig_s, rew_s)
    return (CheckStatus.UNCHANGED if any_present else CheckStatus.NA), None


def run_guardrail(original_text: str, rewrite_text: str) -> GuardrailResult:
    details: list[str] = []
    tokens = CheckedTokens()

    pairs, degraded_sections = text_checks.align_sections_and_sentences(original_text, rewrite_text)
    tokens.sentence_alignment = CheckStatus.UNCHANGED
    if degraded_sections == ["document"]:
        # Section count itself differs - coarsest fallback, one whole-
        # document comparison. Still runs the deterministic checks below
        # (at document granularity) plus the LLM second opinion - no
        # longer an automatic reject (Writing Assistant Build Plan,
        # Revision 16, ISS-13: confirmed live this was still blocking
        # most rewrites, short drafts included, after the per-section
        # fallback alone).
        details.append(
            "Could not align the original and rewrite into the same number of sections "
            "(paragraph count differs) - compared as one whole document instead, which "
            "can't detect a quantity/instruction reassociation between sections."
        )
    elif degraded_sections:
        details.append(
            "Section(s) " + ", ".join(str(i) for i in degraded_sections) + " could not be "
            "aligned sentence-by-sentence (sentence count differs within that section) - "
            "compared as a whole section instead, which can't detect a quantity/instruction "
            "reassociation within it specifically."
        )

    tokens.numbers_and_units, numbers_pair = _diff_check(pairs, text_checks.extract_numbers_and_units)
    if tokens.numbers_and_units == CheckStatus.CHANGED:
        details.append(
            "A number/unit present in the original does not appear unchanged in the rewrite. "
            f"Original: {numbers_pair[0]!r} -> Rewrite: {numbers_pair[1]!r}"
        )

    tokens.certainty_language, certainty_pair = _diff_check(
        pairs, text_checks.extract_certainty_polarities, text_checks.HEDGE_WORDS | text_checks.ABSOLUTE_WORDS
    )
    if tokens.certainty_language == CheckStatus.CHANGED:
        details.append(
            "Claim strength shifted between hedged and absolute certainty. "
            f"Original: {certainty_pair[0]!r} -> Rewrite: {certainty_pair[1]!r}"
        )

    tokens.negation, negation_pair = _presence_diff_check(
        pairs, text_checks.extract_negations, text_checks.NEGATION_WORDS
    )
    if tokens.negation == CheckStatus.CHANGED:
        details.append(
            "A negation marker (e.g. 'not'/'never'/'avoid') was added or removed. "
            f"Original: {negation_pair[0]!r} -> Rewrite: {negation_pair[1]!r}"
        )

    tokens.crop_names, crop_pair = _diff_check(pairs, text_checks.extract_crop_names, text_checks.CROP_NAMES)
    if tokens.crop_names == CheckStatus.CHANGED:
        details.append(
            "The set of named crops differs between the original and the rewrite. "
            f"Original: {crop_pair[0]!r} -> Rewrite: {crop_pair[1]!r}"
        )

    tokens.treatment_identity, treatment_pair = _diff_check(pairs, text_checks.extract_treatment_terms)
    if tokens.treatment_identity == CheckStatus.CHANGED:
        details.append(
            "A named treatment/method term differs between the original and the rewrite. "
            f"Original: {treatment_pair[0]!r} -> Rewrite: {treatment_pair[1]!r}"
        )

    tokens.timing, timing_pair = _diff_check(pairs, text_checks.extract_timing_phrases, text_checks.TIMING_PHRASES)
    if tokens.timing == CheckStatus.CHANGED:
        details.append(
            "A timing phrase (before/after/within/every ...) differs between the original and the rewrite. "
            f"Original: {timing_pair[0]!r} -> Rewrite: {timing_pair[1]!r}"
        )

    tokens.conditions, conditions_pair = _presence_diff_check(
        pairs, text_checks.extract_conditional_markers, text_checks.CONDITIONAL_MARKERS
    )
    if tokens.conditions == CheckStatus.CHANGED:
        details.append(
            "A conditional marker (if/when/unless/only ...) was added or removed. "
            f"Original: {conditions_pair[0]!r} -> Rewrite: {conditions_pair[1]!r}"
        )

    # Standalone chemical matching - whole-text, not per-sentence. In-process,
    # no network call to any sibling service (Writing Assistant Build Plan,
    # Revision 14, ISS-03).
    try:
        orig_chem = chemical_matcher.detect_chemicals(original_text)
        rew_chem = chemical_matcher.detect_chemicals(rewrite_text)
        if orig_chem or rew_chem:
            tokens.chemical_names = (
                CheckStatus.UNCHANGED if orig_chem == rew_chem else CheckStatus.CHANGED
            )
            if tokens.chemical_names == CheckStatus.CHANGED:
                details.append("The set of detected banned/restricted chemicals differs between the original and the rewrite.")
        else:
            tokens.chemical_names = CheckStatus.NA
    except chemical_matcher.ChemicalDetectorUnavailableError as exc:
        tokens.chemical_names = CheckStatus.NOT_RUN
        details.append(f"Chemical check could not run: {exc}")

    # LLM second-opinion - adds coverage for what the deterministic checks
    # above can't name (e.g. a subtler recommendation change), is not proof.
    # Section counts always match here when the rewrite came from
    # generate_polish's whole-document path; if they don't (e.g. a hand-
    # supplied rewrite in a test, or a per-section fallback rewrite
    # introducing a new blank line), fall back to one whole-document
    # comparison rather than inventing a new failure mode. A section
    # identical to its original is skipped entirely - nothing to ask the
    # model, it trivially can't have changed.
    orig_sections = text_checks.split_sections(original_text)
    rew_sections = text_checks.split_sections(rewrite_text)
    section_pairs = (
        list(zip(orig_sections, rew_sections))
        if len(orig_sections) == len(rew_sections)
        else [(original_text, rewrite_text)]
    )
    to_check = [(o, r) for o, r in section_pairs if o != r]

    # One call checks every changed pair at once (check_meaning_preserved_batch)
    # instead of one call per pair (run_concurrent over check_meaning_preserved) -
    # live-confirmed this still catches a real dosage change, a negation
    # flip, and a pure-punctuation non-change correctly in a single batch.
    llm_flagged_change = False
    llm_not_run = False
    try:
        batch_results = llm_client.check_meaning_preserved_batch(to_check)
    except LLMUnavailableError as exc:
        # Never treat an unconfirmed section as safe - the batch call
        # failing means the second opinion as a whole could not run, even
        # if every section would otherwise have matched.
        llm_not_run = True
        details.append(f"LLM second-opinion check could not run: {exc}")
    else:
        for (orig_section, rew_section), (changed, explanation) in zip(to_check, batch_results):
            if changed:
                llm_flagged_change = True
                details.append(f"LLM second-opinion check flagged a possible meaning change: {explanation}")
    # The second opinion doesn't have its own CheckedTokens slot - it's
    # folded into the overall pass/fail decision directly, below.

    overall_failed = tokens.any_failed() or llm_flagged_change or llm_not_run
    status = GuardrailStatus.FAILED if overall_failed else GuardrailStatus.PASSED
    # A real catch (something actually CHANGED, deterministically or per the
    # LLM second opinion) vs. merely "could not verify" (a NOT_RUN channel,
    # or the LLM call itself failing) - see GuardrailResult.confirmed_change.
    confirmed_change = tokens.any_changed() or llm_flagged_change

    if overall_failed:
        _log_rejection(original_text, rewrite_text, details)

    return GuardrailResult(status=status, checked_tokens=tokens, confirmed_change=confirmed_change, details=details)


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
