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


def test_align_sections_and_sentences_none_on_section_count_mismatch():
    result = text_checks.align_sections_and_sentences(
        "First.\n\nSecond.",
        "First and second combined.",
    )
    assert result is None


def test_extract_numbers_and_units():
    assert text_checks.extract_numbers_and_units("Apply 2 ml per litre of water.") == frozenset({"2ml"})
    assert text_checks.extract_numbers_and_units("Wait 3 days before harvest.") == frozenset({"3days"})
    assert text_checks.extract_numbers_and_units("No numbers here.") == frozenset()


def test_extract_negations():
    assert "not" in text_checks.extract_negations("Do not apply before flowering.")
    assert text_checks.extract_negations("Apply before flowering.") == frozenset()


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


def test_extract_timing_phrases():
    phrases = text_checks.extract_timing_phrases("Apply within 24 hours before flowering.")
    assert any(p.startswith("within") for p in phrases)
    assert any(p.startswith("before") for p in phrases)


def test_extract_conditional_markers():
    assert "if" in text_checks.extract_conditional_markers("Apply only if infestation exceeds the threshold.")
    assert text_checks.extract_conditional_markers("Apply the treatment now.") == frozenset()
