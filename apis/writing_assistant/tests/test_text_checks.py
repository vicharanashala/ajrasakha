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
