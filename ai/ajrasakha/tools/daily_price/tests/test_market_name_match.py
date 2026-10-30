"""Mandi name matching (no DB): word order, market words, spelling variants, ambiguity."""

import pytest

from ajrasakha.tools.daily_price.daily_market_price import (
    _market_core_tokens,
    _rank_markets_by_name,
    _spelling_variant,
)


def _mandi(name, aliases=(), lon=90.0, lat=26.0):
    return {"name": name, "aliases": list(aliases), "location": {"type": "Point", "coordinates": [lon, lat]}}


ASSAM = [
    _mandi("bilasipara apmc"),
    _mandi("dhubri apmc"),
    _mandi("pamohi(garchuk) apmc"),
    _mandi("p.o. uparhali guwahati apmc"),
]
AP = [
    _mandi("kurnool apmc"),
    _mandi("kurnool(rythu bazar) apmc"),
    _mandi("nagarkurnool apmc"),
    _mandi("b.n.kandriga apmc"),
]


def _names(docs, query, **kw):
    matched, meta = _rank_markets_by_name(docs, query, **kw)
    return [d["name"] for d in matched], meta


def test_core_tokens_drop_market_words_and_punctuation():
    assert _market_core_tokens("APMC Bilasipara") == ("bilasipara",)
    assert _market_core_tokens("Bilasipara Mandi") == ("bilasipara",)
    assert _market_core_tokens("kurnool(rythu bazar) apmc") == ("kurnool", "rythu")
    assert _market_core_tokens(None) == ()


@pytest.mark.parametrize("query", [
    "apmc bilasipara", "Bilasipara APMC", "bilasipara mandi", "Bilasipara market", "bilasi para haat",
])
def test_word_order_and_market_words_do_not_matter(query):
    names, meta = _names(ASSAM, query)
    assert names == ["bilasipara apmc"]
    assert meta["match_type"] == "exact"


def test_spelling_variant_is_a_fuzzy_match():
    names, meta = _names(ASSAM, "bilashipara mandi")
    assert names == ["bilasipara apmc"]
    assert meta["match_type"] == "fuzzy"


def test_name_inside_a_longer_mandi_name():
    assert _names(ASSAM, "pamohi")[0] == ["pamohi(garchuk) apmc"]
    assert _names(ASSAM, "guwahati")[0] == ["p.o. uparhali guwahati apmc"]


def test_no_substring_false_positive():
    # A raw substring regex would also return "nagarkurnool apmc".
    names, meta = _names(AP, "kurnool")
    assert names == ["kurnool apmc"]
    assert meta["ambiguous"] is False


def test_qualifier_picks_the_specific_mandi():
    assert _names(AP, "Kurnool rythu bazar")[0] == ["kurnool(rythu bazar) apmc"]


def test_dotted_initials_match_without_dots():
    assert _names(AP, "bn kandriga")[0] == ["b.n.kandriga apmc"]


def test_unknown_name_matches_nothing():
    names, meta = _names(ASSAM, "xyz mandi")
    assert names == []
    assert meta["match_type"] is None
    assert _names(ASSAM, "mandi")[0] == []  # only a market word, no name


def test_aliases_are_searched():
    docs = [_mandi("anakapally apmc", aliases=["Anakapalli"])]
    assert _names(docs, "anakapalli market")[0] == ["anakapally apmc"]


def test_duplicate_rows_for_one_mandi_are_not_ambiguous():
    docs = [_mandi("azadpur apmc"), _mandi("apmc azadpur")]
    names, meta = _names(docs, "azadpur mandi")
    assert sorted(names) == ["apmc azadpur", "azadpur apmc"]
    assert meta["ambiguous"] is False
    assert len(meta["candidates"]) == 1


def test_weak_match_keeps_only_the_closest_name():
    docs = [_mandi("ropar apmc"), _mandi("rampuraphul(bhai rupan) apmc")]
    names, meta = _names(docs, "rupar")
    assert names == ["ropar apmc"]
    assert meta["match_type"] == "fuzzy"


def test_equal_matches_are_ordered_by_distance_from_the_farmer():
    docs = [_mandi("eluru apmc", lon=81.0, lat=16.0), _mandi("eluru apmc", aliases=["eluru"], lon=80.0, lat=17.0)]
    matched, _ = _rank_markets_by_name(docs, "eluru", lat=17.0, lon=80.0)
    assert matched[0]["location"]["coordinates"] == [80.0, 17.0]


def test_spelling_variant_rules():
    assert _spelling_variant("ropar", "rupar")
    assert _spelling_variant("bilasipara", "bilashipara")
    assert not _spelling_variant("una", "ina")  # too short to guess
    assert not _spelling_variant("karnal", "kurnool")
