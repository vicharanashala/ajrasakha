from ajrasakha.tools.golden.golden_core import _normalize_crop_for_search


def test_round_gourd():
    assert _normalize_crop_for_search("round_gourd") == "Round Gourd"


def test_mixed_case_and_spaces():
    assert _normalize_crop_for_search("  Round_Gourd  ") == "Round Gourd"


def test_all_unchanged():
    assert _normalize_crop_for_search("all") == "all"
    assert _normalize_crop_for_search("") == "all"


def test_bengal_gram_title_case():
    assert _normalize_crop_for_search("bengal gram") == "Bengal Gram"
    assert _normalize_crop_for_search("BENGAL GRAM") == "Bengal Gram"
