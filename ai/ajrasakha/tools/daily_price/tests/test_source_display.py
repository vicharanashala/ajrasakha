from ajrasakha.tools.daily_price.daily_market_price import (
    _norm,
    _norm_commodity_name,
    display_source_system,
)


def test_norm_lowercases():
    assert _norm("Kerala") == "kerala"
    assert _norm("  Angamali  ") == "angamali"
    assert _norm("") is None


def test_norm_commodity_name_lowercases_list():
    assert _norm_commodity_name(["Onion", "WHEAT"]) == ["onion", "wheat"]
    assert _norm_commodity_name("Onion") == "onion"


def test_display_source_system_agmark_aliases():
    assert display_source_system("agmark") == "Agmarknet"
    assert display_source_system("AGMARKNET") == "Agmarknet"
    assert display_source_system("agmark-net") == "Agmarknet"


def test_display_source_system_enam():
    assert display_source_system("enam") == "eNAM"


def test_display_source_system_unknown_passthrough():
    assert display_source_system("State APMC Kerala") == "State APMC Kerala"
