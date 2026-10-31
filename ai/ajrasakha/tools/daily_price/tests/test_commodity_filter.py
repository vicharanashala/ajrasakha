import pytest
from bson import ObjectId
from ajrasakha.tools.daily_price.daily_market_price import (
    _filter_mc_by_commodity_preference,
)


def test_filter_mc_by_commodity_preference_exact_requested_match():
    aid = ObjectId()
    mc_docs = [
        {"_id": 1, "commodity_alias_lookup_id": aid, "commodity_name": "banana"},
        {"_id": 2, "commodity_alias_lookup_id": aid, "commodity_name": "banana - green"},
    ]
    resolved = {"banana": [{"_id": aid, "canonical_name": "banana"}]}

    # When user asks for "banana", only "banana" is kept
    res = _filter_mc_by_commodity_preference(mc_docs, ["banana"], resolved)
    assert len(res) == 1
    assert res[0]["commodity_name"] == "banana"

    # When user asks for "banana - green", only "banana - green" is kept
    resolved_green = {"banana - green": [{"_id": aid, "canonical_name": "banana"}]}
    res_green = _filter_mc_by_commodity_preference(mc_docs, ["banana - green"], resolved_green)
    assert len(res_green) == 1
    assert res_green[0]["commodity_name"] == "banana - green"


def test_filter_mc_by_commodity_preference_canonical_fallback():
    aid = ObjectId()
    mc_docs = [
        {"_id": 1, "commodity_alias_lookup_id": aid, "commodity_name": "banana"},
        {"_id": 2, "commodity_alias_lookup_id": aid, "commodity_name": "banana - green"},
    ]
    # User passes alias "kela", which resolves to canonical "banana"
    resolved_kela = {"kela": [{"_id": aid, "canonical_name": "banana"}]}
    res = _filter_mc_by_commodity_preference(mc_docs, ["kela"], resolved_kela)
    assert len(res) == 1
    assert res[0]["commodity_name"] == "banana"


def test_filter_mc_by_commodity_preference_multi_commodity():
    aid_banana = ObjectId()
    aid_onion = ObjectId()

    mc_docs = [
        {"_id": 1, "commodity_alias_lookup_id": aid_banana, "commodity_name": "banana"},
        {"_id": 2, "commodity_alias_lookup_id": aid_banana, "commodity_name": "banana - green"},
        {"_id": 3, "commodity_alias_lookup_id": aid_onion, "commodity_name": "onion"},
        {"_id": 4, "commodity_alias_lookup_id": aid_onion, "commodity_name": "onion green"},
    ]

    resolved = {
        "banana": [{"_id": aid_banana, "canonical_name": "banana"}],
        "onion": [{"_id": aid_onion, "canonical_name": "onion"}],
    }

    res = _filter_mc_by_commodity_preference(mc_docs, ["banana", "onion"], resolved)
    assert len(res) == 2
    kept_names = {d["commodity_name"] for d in res}
    assert kept_names == {"banana", "onion"}


def test_filter_mc_by_commodity_preference_whitespace_variation():
    aid = ObjectId()
    mc_docs = [
        {"_id": 1, "commodity_alias_lookup_id": aid, "commodity_name": "ashgourd"},
        {"_id": 2, "commodity_alias_lookup_id": aid, "commodity_name": "squash"},
    ]
    resolved = {"ash gourd": [{"_id": aid, "canonical_name": "squash"}]}

    # When user asks for "ash gourd", "ashgourd" is kept over other varieties
    res = _filter_mc_by_commodity_preference(mc_docs, ["ash gourd"], resolved)
    assert len(res) == 1
    assert res[0]["commodity_name"] == "ashgourd"


def test_filter_mc_generic_qualifier_counts_as_exact():
    # An exact "paddy" in one mandi must not drop "paddy(common)" from other mandis.
    aid = ObjectId()
    kurnool, pendurthi = ObjectId(), ObjectId()
    mc_docs = [
        {"_id": 1, "commodity_alias_lookup_id": aid, "market_id": kurnool, "commodity_name": "paddy"},
        {"_id": 2, "commodity_alias_lookup_id": aid, "market_id": pendurthi, "commodity_name": "paddy(common)"},
        {"_id": 3, "commodity_alias_lookup_id": aid, "market_id": pendurthi, "commodity_name": "rice"},
    ]
    resolved = {"paddy": [{"_id": aid, "canonical_name": "paddy"}]}
    res = _filter_mc_by_commodity_preference(mc_docs, ["paddy"], resolved)
    assert sorted(d["_id"] for d in res) == [1, 2]


def test_filter_mc_real_qualifier_is_not_exact():
    # "chilli" must not pull in "chilli(red)" from a mandi that only lists red chilli.
    aid = ObjectId()
    m1, m2 = ObjectId(), ObjectId()
    mc_docs = [
        {"_id": 1, "commodity_alias_lookup_id": aid, "market_id": m1, "commodity_name": "chilli"},
        {"_id": 2, "commodity_alias_lookup_id": aid, "market_id": m2, "commodity_name": "chillies(red)"},
    ]
    resolved = {"chilli": [{"_id": aid, "canonical_name": "chilli"}]}
    res = _filter_mc_by_commodity_preference(mc_docs, ["chilli"], resolved)
    assert [d["_id"] for d in res] == [1]


def test_commodity_base_key_keeps_lone_generic_word():
    from ajrasakha.tools.daily_price.daily_market_price import _commodity_base_key

    assert _commodity_base_key("Paddy (Common)") == _commodity_base_key("paddy")
    assert _commodity_base_key("rose(local)") == _commodity_base_key("rose")
    assert _commodity_base_key("chilli(red)") != _commodity_base_key("chilli")
    assert _commodity_base_key("local") == frozenset({"local"})


def test_state_synonyms_andaman_and_nicobar():
    from ajrasakha.tools.daily_price.daily_market_price import _STATE_SYNONYMS
    assert "andaman and nicobar" in _STATE_SYNONYMS["andaman and nicobar islands"]
    assert "andaman and nicobar islands" in _STATE_SYNONYMS["andaman and nicobar"]
    assert "andaman and nicobar" in _STATE_SYNONYMS["andaman & nicobar"]



def test_commodity_word_key_ignores_order_and_punctuation():
    from ajrasakha.tools.daily_price.daily_market_price import _commodity_word_key

    assert _commodity_word_key("dry ginger") == _commodity_word_key("Ginger(Dry)")
    assert _commodity_word_key("ginger (dry)") == _commodity_word_key("ginger(dry)")
    assert _commodity_word_key("ginger") != _commodity_word_key("ginger(dry)")
    assert _commodity_word_key(None) == frozenset()


def test_filter_mc_prefers_same_words_in_different_order():
    alias_id = ObjectId()
    resolved = {"dry ginger": [{"_id": alias_id, "canonical_name": "ginger"}]}
    mc = [
        {"commodity_alias_lookup_id": alias_id, "commodity_name": "ginger"},
        {"commodity_alias_lookup_id": alias_id, "commodity_name": "ginger(dry)"},
        {"commodity_alias_lookup_id": alias_id, "commodity_name": "ginger(green)"},
    ]
    out = _filter_mc_by_commodity_preference(mc, ["dry ginger"], resolved)
    assert [d["commodity_name"] for d in out] == ["ginger(dry)"]
