"""A named mandi outside the farmer's profile district is refused (in-memory available_mandi)."""

import re

import pytest

from ajrasakha.tools.daily_price import daily_market_price as dmp
from ajrasakha.tools.daily_price.daily_market_price import _same_district, mandi_price_tool


def _mandi(_id, name, district, state="assam", lon=90.0, lat=26.0):
    return {
        "_id": _id, "name": name, "aliases": [], "state": state, "district": district,
        "location": {"type": "Point", "coordinates": [lon, lat]},
    }


def _matches(doc, query):
    for key, cond in query.items():
        value = doc.get(key)
        if isinstance(cond, dict) and "$in" in cond:
            if value not in cond["$in"]:
                return False
        elif isinstance(cond, dict) and "$regex" in cond:
            if not isinstance(value, str) or not re.search(cond["$regex"], value, re.IGNORECASE):
                return False
        elif value != cond:
            return False
    return True


class _Cursor(list):
    def max_time_ms(self, _ms):
        return self

    def limit(self, n):
        return _Cursor(self[:n])


class _FakeMandiCollection:
    def __init__(self, docs):
        self.docs = docs

    def find(self, query):
        return _Cursor(d for d in self.docs if _matches(d, query))

    def distinct(self, key, query, **_kw):
        return list({d.get(key) for d in self.docs if _matches(d, query)})


MANDIS = [
    _mandi(1, "bilasipara apmc", "dhubri"),
    _mandi(2, "dhubri apmc", "dhubri"),
    _mandi(3, "pamohi(garchuk) apmc", "kamrup metro"),
    _mandi(4, "kalapani apmc", "goalpara"),
    _mandi(5, "kalapani apmc", "kamrup metro"),
]


@pytest.fixture(autouse=True)
def _fake_db(monkeypatch):
    coll = _FakeMandiCollection(MANDIS)
    monkeypatch.setattr(dmp, "available_mandi_col", lambda: coll)


def _search(market_name, district, **kw):
    return mandi_price_tool(
        action="search_markets", market_name=market_name, state="Assam",
        district=district, search_by_apmc=True, **kw,
    )


def test_mandi_in_another_district_is_refused():
    res = _search("Bilasipara APMC", "Kamrup Metro")
    assert res["error_code"] == "MARKET_OUTSIDE_DISTRICT"
    assert res["error"].startswith("You are only able to see mandis in your district (Kamrup Metro).")
    assert "Bilasipara APMC is in Dhubri district." in res["error"]


def test_district_named_as_mandi_in_another_district_is_refused():
    res = _search("Goalpara mandi", "Dhubri")
    assert res["error_code"] == "MARKET_OUTSIDE_DISTRICT"
    assert "Goalpara Mandi is in Goalpara district." in res["error"]


def test_mandi_in_own_district_is_served():
    res = _search("Bilasipara APMC", "Dhubri District")
    assert "error" not in res
    assert [m["name"] for m in res["markets"]] == ["bilasipara apmc"]


def test_same_name_mandi_prefers_own_district():
    res = _search("Kalapani APMC", "Kamrup Metro")
    assert "error" not in res
    assert [m["district"] for m in res["markets"]] == ["kamrup metro"]


def test_no_restriction_without_district_or_named_mandi():
    assert "error" not in _search("Bilasipara APMC", None)
    res = mandi_price_tool(action="search_markets", market_name="Bilasipara APMC", state="Assam",
                           district="Kamrup Metro", search_by_apmc=False)
    assert res.get("error_code") != "MARKET_OUTSIDE_DISTRICT"


def test_unrecognised_profile_district_does_not_block():
    assert "error" not in _search("Bilasipara APMC", "Some Unknown Place")


def test_same_district_matching():
    assert _same_district("ropar (rupnagar)", "Rupnagar")
    assert _same_district("Rupar", "ropar")
    assert _same_district("dhubri", "Dhubri District")
    assert _same_district("bilasi para", "Bilasipara")
    assert not _same_district("north 24 parganas", "South 24 Parganas")
    assert not _same_district("east godavari", "West Godavari")
    assert not _same_district("dhubri", "goalpara")
