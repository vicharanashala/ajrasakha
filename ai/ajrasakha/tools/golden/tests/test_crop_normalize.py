from ajrasakha.tools.golden.golden_core import _normalize_crop_for_search


def test_round_gourd():
    assert _normalize_crop_for_search("round_gourd") == "round gourd"


def test_mixed_case_and_spaces():
    assert _normalize_crop_for_search("  Round_Gourd  ") == "round gourd"


def test_all_unchanged():
    assert _normalize_crop_for_search("all") == "all"
    assert _normalize_crop_for_search("") == "all"
