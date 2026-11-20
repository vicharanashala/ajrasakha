from assistant import text_checks


def test_align_sentences_equal_count():
    pairs = text_checks.align_sentences(
        "Apply 2 ml per litre. Spray in the evening.",
        "Apply 2 ml per litre. Spray during the evening.",
    )
    assert pairs is not None
    assert len(pairs) == 2


def test_align_sentences_ambiguous_on_merge():
    pairs = text_checks.align_sentences(
        "Apply 2 ml per litre. Spray in the evening.",
        "Apply 2 ml per litre and spray in the evening.",
    )
    assert pairs is None


def test_split_sections_on_blank_lines():
    sections = text_checks.split_sections("First part.\n\nSecond part.\n\nThird part.")
    assert sections == ["First part.", "Second part.", "Third part."]


def test_split_sections_single_paragraph_is_one_section():
    assert text_checks.split_sections("Just one paragraph, no blank lines at all.") == [
        "Just one paragraph, no blank lines at all."
    ]


def test_align_sections_and_sentences_same_shape():
    result = text_checks.align_sections_and_sentences(
        "Intro here.\n\nSecond section here.",
        "Intro here, rephrased.\n\nSecond section here, rephrased.",
    )
    assert result is not None
    pairs, degraded = result
    assert len(pairs) == 2
    assert degraded == []


def test_align_sections_and_sentences_falls_back_within_one_section():
    result = text_checks.align_sections_and_sentences(
        "Apply 2 ml per litre. Spray in the evening.",
        "Apply 2 ml per litre and spray in the evening.",
    )
    assert result is not None
    pairs, degraded = result
    assert degraded == [1]
    assert pairs == [("Apply 2 ml per litre. Spray in the evening.", "Apply 2 ml per litre and spray in the evening.")]


def test_align_sections_and_sentences_falls_back_to_whole_document_on_section_count_mismatch():
    # Revision 16 (ISS-13): a section-count mismatch no longer gives up
    # entirely - it falls back one level further, to one whole-document
    # pair, instead of returning no comparison at all.
    pairs, degraded = text_checks.align_sections_and_sentences(
        "First.\n\nSecond.",
        "First and second combined.",
    )
    assert degraded == ["document"]
    assert pairs == [("First.\n\nSecond.", "First and second combined.")]


def test_extract_numbers_and_units():
    assert text_checks.extract_numbers_and_units("Apply 2 ml per litre of water.") == frozenset({"2ml"})
    assert text_checks.extract_numbers_and_units("Wait 3 days before harvest.") == frozenset({"3days"})
    assert text_checks.extract_numbers_and_units("No numbers here.") == frozenset()


def test_extract_numbers_and_units_recognizes_hinglish_din():
    # Revision 16 (ISS-16): confirmed missing live against a real
    # "10 din baad" (Hinglish for "10 days later") draft.
    assert text_checks.extract_numbers_and_units("Spray 10 din baad repeat karein.") == frozenset({"10din"})


def test_extract_negations():
    assert "not" in text_checks.extract_negations("Do not apply before flowering.")
    assert text_checks.extract_negations("Apply before flowering.") == frozenset()


def test_extract_negations_recognizes_hindi():
    # Revision 17 (ISS-16): confirmed live that Hindi-script negation was
    # invisible to every word-based check (the word regex didn't match
    # Devanagari characters at all, not just a missing word).
    assert "नहीं" in text_checks.extract_negations("यह दवा नहीं डालें।")


def test_extract_crop_names_recognizes_hindi():
    assert "धान" in text_checks.extract_crop_names("धान की फसल अच्छी है।")


def test_extract_certainty_markers_hedge_vs_absolute():
    assert "may" in text_checks.extract_certainty_markers("This may help reduce the spread.")
    assert "will" in text_checks.extract_certainty_markers("This will completely eliminate the disease.")
    assert "completely" in text_checks.extract_certainty_markers("This will completely eliminate the disease.")


def test_extract_certainty_polarities():
    assert text_checks.extract_certainty_polarities("This may help reduce the spread.") == frozenset({"hedge"})
    assert text_checks.extract_certainty_polarities("This could help reduce the spread.") == frozenset({"hedge"})
    assert text_checks.extract_certainty_polarities("This will completely eliminate it.") == frozenset({"absolute"})
    assert text_checks.extract_certainty_polarities("Apply the treatment now.") == frozenset()


def test_extract_crop_names():
    assert text_checks.extract_crop_names("My paddy field has pests.") == frozenset({"paddy"})
    assert text_checks.extract_crop_names("My wheat field has pests.") == frozenset({"wheat"})


def test_extract_treatment_terms():
    assert "neem oil" in text_checks.extract_treatment_terms("Spray neem oil on the affected leaves.")


# Live-confirmed real rejection: generate_polish's grammar fix correctly
# pluralized "mode of action" -> "modes of action" (also fixing
# "rotate" -> "rotated"), and the old plain substring check read that as
# the treatment term itself changing, since "mode of action" isn't a
# substring of "modes of action".
def test_extract_treatment_terms_tolerates_plural_forms():
    assert "mode of action" in text_checks.extract_treatment_terms(
        "Insecticides should be rotated with different modes of action."
    )
    assert "neem oil" in text_checks.extract_treatment_terms("Spray neem oils on the affected leaves.")


def test_extract_treatment_terms_plural_tolerance_does_not_overmatch():
    # The plural-tolerant pattern must not bleed into an unrelated,
    # longer word that happens to start the same way.
    assert text_checks.extract_treatment_terms("Try a new mode of transportation.") == frozenset()
    assert text_checks.extract_treatment_terms("The field was oiled before planting.") == frozenset()


def test_extract_timing_phrases():
    phrases = text_checks.extract_timing_phrases("Apply within 24 hours before flowering.")
    assert phrases == frozenset({"within", "before"})


def test_extract_timing_phrases_ignores_trailing_words():
    # Revision 15: only the keyword matters, not what follows it.
    assert text_checks.extract_timing_phrases("before harvesting the crop") == frozenset({"before"})
    assert text_checks.extract_timing_phrases("before harvest") == frozenset({"before"})


def test_extract_conditional_markers():
    assert "if" in text_checks.extract_conditional_markers("Apply only if infestation exceeds the threshold.")
    assert text_checks.extract_conditional_markers("Apply the treatment now.") == frozenset()


# A spelling fix that happens to land on/off a marker word by accident
# (e.g. "Avid" -> "Avoid") is not a content change - live-confirmed real
# rejection, distinct from the already-handled word-choice-synonym case.
def test_is_single_word_typo_fix_detects_a_typo_landing_on_a_marker():
    assert text_checks.is_single_word_typo_fix(
        "Avid excessive application of nitrogen fertilizers.",
        "Avoid excessive application of nitrogen fertilizers.",
        text_checks.NEGATION_WORDS,
    )


def test_is_single_word_typo_fix_false_for_a_genuine_negation_removal():
    # "not" is deleted outright, not replaced by a close-spelling word -
    # must stay flagged as a real change.
    assert not text_checks.is_single_word_typo_fix(
        "Do not apply the spray before flowering.",
        "Apply the spray before flowering.",
        text_checks.NEGATION_WORDS,
    )


def test_is_single_word_typo_fix_false_for_a_genuine_removal_in_a_long_sentence():
    # Same shape, stress-tested on a long sentence where the removed
    # word is a tiny fraction of the total text - must still be caught,
    # not waved through just because the sentences are "mostly" similar.
    assert not text_checks.is_single_word_typo_fix(
        "The farmer should not spray the pesticide during the hot afternoon "
        "hours when temperatures are at their highest peak.",
        "The farmer should spray the pesticide during the hot afternoon "
        "hours when temperatures are at their highest peak.",
        text_checks.NEGATION_WORDS,
    )


def test_is_single_word_typo_fix_false_for_the_existing_synonym_swap_case():
    # "Do not spray" -> "Avoid spraying" is a multi-word diff region
    # (two words removed, one added, plus a word-form change) - not a
    # single 1-for-1 replace, so this guard correctly stays out of the
    # way; the pre-existing presence-based check already handles this
    # case (both sides have a negation marker present).
    assert not text_checks.is_single_word_typo_fix(
        "Do not spray during windy conditions.",
        "Avoid spraying during windy conditions.",
        text_checks.NEGATION_WORDS,
    )


def test_is_single_word_typo_fix_false_when_neither_side_is_a_marker():
    assert not text_checks.is_single_word_typo_fix(
        "The crop recieved water.", "The crop received water.", text_checks.NEGATION_WORDS
    )


# Live-confirmed real rejection: a single polish pass fixed TWO typos in
# the same sentence ("disese"/"wheet" -> "disease"/"wheat"), not just
# one - the first version of this check bailed out as soon as it saw a
# second diff region, even though "disese"/"disease" is just as harmless
# as the crop-name fix itself.
def test_is_single_word_typo_fix_handles_multiple_typos_in_one_sentence():
    assert text_checks.is_single_word_typo_fix(
        "Leaf blight is a common fungal disese affecting wheet crops.",
        "Leaf blight is a common fungal disease affecting wheat crops.",
        text_checks.CROP_NAMES,
    )


def test_is_single_word_typo_fix_false_when_one_of_several_regions_is_a_real_change():
    # Even with multiple diffed regions, a single non-spelling change
    # (here, a whole different crop swapped in) must still fail the
    # check - the guard requires EVERY region to be a close-spelling
    # fix, not just some of them.
    assert not text_checks.is_single_word_typo_fix(
        "Leaf blight is a common fungal disese affecting wheet crops.",
        "Leaf blight is a common fungal disease affecting rice crops.",
        text_checks.CROP_NAMES,
    )


def test_significant_words_filters_short_words_and_stopwords():
    words = text_checks.significant_words("Test the soil before applying the recommended nutrient correction.")
    assert "nutrient" in words
    assert "correction" in words
    assert "the" not in words
    assert "soil" in words  # len 4, kept


def test_significant_words_empty_on_no_real_content():
    assert text_checks.significant_words("the and for") == frozenset()
