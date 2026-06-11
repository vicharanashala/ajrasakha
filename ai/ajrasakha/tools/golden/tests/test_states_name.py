from ajrasakha.tools.golden.states_name import resolve_state_name


def test_resolve_state_name_exact_match():
    assert resolve_state_name("Punjab") == "Punjab"
    assert resolve_state_name("punjab") == "Punjab"


def test_resolve_state_name_fuzzy_typo():
    assert resolve_state_name("Maharastra") == "Maharashtra"
    assert resolve_state_name("Tamilnadu") == "Tamil Nadu"


def test_resolve_state_name_below_threshold_passthrough():
    assert resolve_state_name("xyz") == "xyz"


def test_resolve_state_name_skip_values_return_all():
    assert resolve_state_name("") == "all"
    assert resolve_state_name("all") == "all"
    assert resolve_state_name("Not specified") == "all"
    assert resolve_state_name("general") == "all"
