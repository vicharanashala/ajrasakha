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
