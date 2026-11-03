"""Production behaviour of the v2 mandi price tool.

Pure-function tests always run. Tool tests need TEST_MONGO_URI; they build a small
v2 database (Haryana and Kerala), fix "today" to TODAY and drop the database after.

What is pinned here:
  * today's price only: no older price is ever shown in its place (any action)
  * mandis farther than 40 km from the farmer are never used
  * bad inputs (lat/long, radius, days, dates, state, crop) give a plain message
  * every error message is written for farmers (no field names, no Python text)
"""

import importlib
import math
import os
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from bson import ObjectId
from pymongo import MongoClient

from ajrasakha.tools.daily_price_v2 import daily_market_price_v2 as base

URI = os.getenv("TEST_MONGO_URI")
needs_db = pytest.mark.skipif(not URI, reason="TEST_MONGO_URI not set")

TODAY = date(2026, 11, 2)
KARNAL = (29.6857, 76.9905)          # farmer's location
FAR_TECHNICAL_WORDS = ("markets_commodities", "crop=", "state=", "traceback", "exception", "none", "null",
                       "objectid", "keyerror", "$in", "mongo", "[", "]", "{", "}")


def day(n_days_ago: int) -> datetime:
    d = TODAY - timedelta(days=n_days_ago)
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


# ──────────────────────────────────────────────────────────────────────────
# Pure helpers (no database)
# ──────────────────────────────────────────────────────────────────────────

class TestCleanLatLong:
    def test_valid_india_location_is_kept(self):
        assert base.clean_lat_long(29.68, 76.99) == (29.68, 76.99)

    def test_strings_are_converted(self):
        assert base.clean_lat_long("29.68", "76.99") == (29.68, 76.99)

    def test_swapped_values_are_put_back(self):
        assert base.clean_lat_long(76.99, 29.68) == (29.68, 76.99)

    @pytest.mark.parametrize("lat,lon", [
        (None, 76.9), (29.6, None), (None, None), ("abc", 76.9), (float("nan"), 76.9),
        (29.6, float("inf")), (0, 0), (51.5, -0.12), (-33.8, 151.2), (40.7, -74.0),
    ])
    def test_missing_or_foreign_location_is_dropped(self, lat, lon):
        assert base.clean_lat_long(lat, lon) == (None, None)


class TestCleanRadius:
    @pytest.mark.parametrize("value,expected", [
        (None, None), (0, None), (-5, None), ("abc", None), (float("nan"), None),
        (10, 10.0), ("25", 25.0), (40, 40.0), (41, 40.0), (100, 40.0), (10_000, 40.0),
    ])
    def test_radius_is_positive_and_at_most_40_km(self, value, expected):
        assert base.clean_radius_km(value) == expected

    def test_default_radius_is_40_km(self):
        assert base.DEFAULT_MAX_RADIUS_KM == 40


class TestCleanLookback:
    @pytest.mark.parametrize("value,expected", [
        (None, None), ("abc", None), (0, 1), (-3, 1), (1, 1), (7, 7), ("15", 15), (7.9, 7),
        (10_000, base.MAX_LOOKBACK_DAYS), (float("inf"), None),
    ])
    def test_lookback_is_clamped(self, value, expected):
        assert base.clean_lookback_days(value) == expected


class TestCleanPriceValues:
    def test_good_row(self):
        out = base.clean_price_values({"modal_price": 2000, "min_price": 1900, "max_price": 2100, "arrival_quantity": 12})
        assert out == {"modal_price": 2000.0, "min_price": 1900.0, "max_price": 2100.0, "arrival_quantity": 12.0}

    def test_zero_prices_count_as_missing(self):
        out = base.clean_price_values({"modal_price": 2000, "min_price": 0, "max_price": 0})
        assert out == {"modal_price": 2000.0, "min_price": None, "max_price": None, "arrival_quantity": None}

    @pytest.mark.parametrize("row", [
        {"modal_price": 0, "min_price": 0, "max_price": 0},
        {"modal_price": None, "min_price": None, "max_price": None},
        {"modal_price": -5, "min_price": None, "max_price": None},
        {"modal_price": 2000, "min_price": 3000, "max_price": 2500},      # min above max
        {"modal_price": 5000, "min_price": 1900, "max_price": 2100},      # modal above max
        {"modal_price": 1000, "min_price": 1900, "max_price": 2100},      # modal below min
        {"modal_price": "abc", "min_price": None, "max_price": None},
        {"modal_price": float("nan"), "min_price": None, "max_price": None},
    ])
    def test_rows_that_cannot_be_right_are_dropped(self, row):
        assert base.clean_price_values(row) is None

    def test_modal_only_row_is_kept(self):  # Meghalaya reports only the modal price
        assert base.clean_price_values({"modal_price": 6200})["modal_price"] == 6200.0

    def test_negative_arrival_is_dropped(self):
        assert base.clean_price_values({"modal_price": 10, "arrival_quantity": -1})["arrival_quantity"] is None


class TestWhenPhrase:
    def setup_method(self):
        self.today = TODAY.isoformat()

    def test_today(self):
        assert base.when_phrase({"mode": "lookback", "lookback_days": 1, "today": self.today}) == "today"

    def test_last_n_days(self):
        assert base.when_phrase({"mode": "lookback", "lookback_days": 7, "today": self.today}) == "in the last 7 days"

    def test_single_day(self):
        assert base.when_phrase({"mode": "range", "from_date": "2026-10-28", "to_date": "2026-10-28", "today": self.today}) == "for 28 Oct 2026"

    def test_single_day_that_is_today(self):
        assert base.when_phrase({"mode": "range", "from_date": self.today, "to_date": self.today, "today": self.today}) == "today"

    def test_range(self):
        assert base.when_phrase({"mode": "range", "from_date": "2026-10-20", "to_date": "2026-10-28"}) == "between 20 Oct 2026 and 28 Oct 2026"

    def test_open_ranges(self):
        assert base.when_phrase({"mode": "range", "from_date": "2026-10-20"}) == "since 20 Oct 2026"
        assert base.when_phrase({"mode": "range", "to_date": "2026-10-20"}) == "up to 20 Oct 2026"

    def test_fmt_day(self):
        assert base.fmt_day("2026-01-05") == "5 Jan 2026"
        assert base.fmt_day("not a date") == "not a date"


class TestIngestedIso:
    def test_naive_datetime_is_utc(self):
        assert base.ingested_iso(datetime(2026, 11, 2, 0, 45, 12, 999)) == "2026-11-02T00:45:12+00:00"

    def test_aware_datetime_and_strings(self):
        ist = timezone(timedelta(hours=5, minutes=30))
        assert base.ingested_iso(datetime(2026, 11, 2, 6, 15, tzinfo=ist)) == "2026-11-02T00:45:00+00:00"
        assert base.ingested_iso("2026-11-02T00:45:00.123456+00:00") == "2026-11-02T00:45:00+00:00"
        assert base.ingested_iso("2026-11-02T00:45:00Z") == "2026-11-02T00:45:00+00:00"

    @pytest.mark.parametrize("value", [None, "", "yesterday", 12345])
    def test_unknown_is_none(self, value):
        assert base.ingested_iso(value) is None


def test_today_is_india_time(monkeypatch):
    """At 00:30 IST the UTC date is still yesterday; "today" must be India's date."""
    class Fake(datetime):
        @classmethod
        def now(cls, tz=None):
            utc = datetime(2026, 11, 1, 19, 0, tzinfo=timezone.utc)  # = 2 Nov 00:30 IST
            return utc.astimezone(tz) if tz else utc.replace(tzinfo=None)
    monkeypatch.setattr(base, "datetime", Fake)
    assert base.today_ist() == date(2026, 11, 2)


def test_word_index_keeps_last_good_copy_when_reload_fails(monkeypatch):
    w = base.WordIndex()
    w.tiers = [{"onion": {"A"}}, {}, {}]
    w.loaded_at = 1.0  # loaded long ago: due for a reload

    def boom():
        raise RuntimeError("database down")
    monkeypatch.setattr(w, "_load", boom)
    assert w.resolve("onion") == (["A"], "name")


def test_word_index_first_load_failure_is_raised(monkeypatch):
    w = base.WordIndex()

    def boom():
        raise RuntimeError("database down")
    monkeypatch.setattr(w, "_load", boom)
    with pytest.raises(RuntimeError):
        w.resolve("onion")


def test_exact_name_wins_when_two_products_share_a_key():
    w = base.WordIndex()
    w.loaded_at = float("inf")
    w.products = {"P1": {"name": "potato/sweet potato"}, "P2": {"name": "sweet potato"}}
    w.tiers = [{base.word_key("sweet potato"): {"P1", "P2"}}, {}, {}]
    assert w.resolve("Sweet  Potato")[0] == ["P2"]
    assert sorted(w.resolve("potato sweet")[0]) == ["P1", "P2"]   # neither typed exactly: ambiguous


# ──────────────────────────────────────────────────────────────────────────
# Tool against a small database
# ──────────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def env():
    if not URI:
        pytest.skip("TEST_MONGO_URI not set")
    name = f"test_dp_v2_prod_{uuid.uuid4().hex[:8]}"
    client = MongoClient(URI)
    db = client[name]
    ids = {k: ObjectId() for k in (
        "c_onion", "p_onion", "c_paddy", "p_paddy", "p_basmati", "c_tomato", "p_tomato",
        "c_potato", "p_potato_sweet", "c_sweet", "p_sweet",
        "m_karnal", "m_tarori", "m_panipat", "m_hisar", "m_noloc", "m_kottayam", "m_ambala", "m_thanesar",
    )}
    db.states.insert_many([
        {"_id": "haryana", "name": "haryana", "spellings": ["haryana"]},
        {"_id": "keralam", "name": "keralam", "spellings": ["kerala", "keralam"]},
    ])
    db.crops.insert_many([
        {"_id": ids["c_onion"], "name": "onion", "default_product_id": ids["p_onion"]},
        {"_id": ids["c_paddy"], "name": "paddy", "default_product_id": ids["p_paddy"]},
        {"_id": ids["c_tomato"], "name": "tomato", "default_product_id": ids["p_tomato"]},
        {"_id": ids["c_potato"], "name": "potato", "default_product_id": ids["p_potato_sweet"]},
        {"_id": ids["c_sweet"], "name": "sweet potato crop", "default_product_id": ids["p_sweet"]},
    ])
    unit = "Rs/quintal"
    db.products.insert_many([
        {"_id": ids["p_onion"], "crop_id": ids["c_onion"], "name": "onion", "price_unit": unit},
        {"_id": ids["p_paddy"], "crop_id": ids["c_paddy"], "name": "paddy", "price_unit": unit},
        {"_id": ids["p_basmati"], "crop_id": ids["c_paddy"], "name": "basmati paddy", "price_unit": unit},
        {"_id": ids["p_tomato"], "crop_id": ids["c_tomato"], "name": "tomato", "price_unit": unit},
        {"_id": ids["p_potato_sweet"], "crop_id": ids["c_potato"], "name": "potato/sweet potato", "price_unit": unit},
        {"_id": ids["p_sweet"], "crop_id": ids["c_sweet"], "name": "sweet potato", "price_unit": unit},
    ])
    db.crop_words.insert_many([
        {"key": "dhan", "word": "dhan", "crop_id": ids["c_paddy"], "product_id": None, "status": "approved"},
        {"key": "chawal", "word": "chawal", "crop_id": ids["c_paddy"], "product_id": None, "status": "pending"},
        {"key": "dry chillies", "word": "dry chillies", "crop_id": ids["c_tomato"], "product_id": None, "status": "rejected"},
    ])
    db.crop_names.insert_many([
        {"source": "agmarknet", "raw_name": "onion", "raw_variety": "*", "product_id": ids["p_onion"], "status": "approved"},
        {"source": "agmarknet", "raw_name": "paddy(common)", "raw_variety": "*", "product_id": ids["p_paddy"], "status": "approved"},
        {"source": "agmarknet", "raw_name": "rice", "raw_variety": "*", "product_id": None, "status": "pending"},
    ])

    def mandi(key, name, district, lat, lon, state="haryana"):
        doc = {"_id": ids[key], "name": name, "state": state, "district": district, "aliases": []}
        if lat is not None:
            doc["location"] = {"type": "Point", "coordinates": [lon, lat]}
        return doc
    db.available_mandi.insert_many([
        mandi("m_karnal", "karnal apmc", "karnal", 29.6857, 76.9905),        # 0 km
        mandi("m_tarori", "tarori apmc", "karnal", 29.7995, 76.9286),        # ~14 km
        mandi("m_panipat", "panipat apmc", "panipat", 29.3909, 76.9635),     # ~33 km
        mandi("m_ambala", "ambala apmc", "ambala", 30.3782, 76.7767),        # ~79 km
        mandi("m_hisar", "hisar apmc", "hisar", 29.1492, 75.7217),           # ~136 km
        mandi("m_thanesar", "thanesar apmc", "kurukshetra", 30.10, 76.60),   # ~60 km; no mandi is named kurukshetra
        mandi("m_noloc", "nowhere apmc", "karnal", None, None),
        mandi("m_kottayam", "kottayam apmc", "kottayam", 9.59, 76.52, state="keralam"),
    ])

    def listing(key, crop_name, product, mandi_key, variety="other", state="haryana"):
        doc = {"_id": ObjectId(), "source_system": "agmarknet", "state": state, "state_code": state,
               "market_name": mandi_key.replace("m_", "") + " apmc" if mandi_key else "unlinked apmc",
               "commodity_name": crop_name, "variety": variety, "grade": "faq",
               "product_id": ids[product] if product else None, "mandi_id": ids[mandi_key] if mandi_key else None}
        ids[key] = doc["_id"]
        return doc
    db.listings.insert_many([
        listing("l_onion_karnal", "onion", "p_onion", "m_karnal", variety="red"),
        listing("l_onion_tarori", "onion", "p_onion", "m_tarori"),
        listing("l_onion_panipat", "onion", "p_onion", "m_panipat"),
        listing("l_onion_ambala", "onion", "p_onion", "m_ambala"),
        listing("l_onion_hisar", "onion", "p_onion", "m_hisar"),
        listing("l_onion_unlinked", "onion", "p_onion", None),
        listing("l_paddy_karnal", "paddy(common)", "p_paddy", "m_karnal", variety="paddy"),
        listing("l_basmati_tarori", "paddy(basmati)", "p_basmati", "m_tarori"),
        listing("l_tomato_karnal", "tomato", "p_tomato", "m_karnal"),
        listing("l_tomato_panipat", "tomato", "p_tomato", "m_panipat"),
        listing("l_sweet_panipat", "sweet potato", "p_sweet", "m_panipat"),
        listing("l_onion_thanesar", "onion", "p_onion", "m_thanesar"),
        listing("l_rice_karnal", "rice", None, "m_karnal"),
        listing("l_onion_kottayam", "onion", "p_onion", "m_kottayam", state="keralam"),
    ])

    def price(listing_key, ago, modal, low=None, high=None, arrival=None, ingested=None):
        doc = {"market_commodity_id": ids[listing_key], "date": day(ago), "modal_price": modal,
               "min_price": low, "max_price": high, "arrival_quantity": arrival}
        if ingested is not None:
            doc["ingested_at"] = ingested
        return doc
    db.price_records.insert_many([
        # The scraper's two ingested_at formats: a datetime (stored naive UTC) and an older ISO string.
        price("l_onion_karnal", 0, 2000, 1900, 2100, arrival=120, ingested=datetime(2026, 11, 2, 0, 45)),
        price("l_onion_karnal", 1, 2100, 2000, 2200, arrival=80, ingested="2026-11-01T06:00:00+00:00"),
        price("l_onion_karnal", 3, 2200, 2100, 2300),
        price("l_onion_tarori", 1, 2300, 2200, 2400),
        price("l_onion_tarori", 0, 0, 0, 0),                    # zero: dropped
        price("l_onion_panipat", 0, 2500, 3000, 2000),          # min above max: dropped
        price("l_onion_panipat", 2, 2400, 2300, 2500, arrival=50),
        price("l_onion_ambala", 0, 1800, 1700, 1900),           # 79 km: never with a location
        price("l_onion_hisar", 0, 1500, 1400, 1600),            # 136 km: never with a location
        price("l_onion_unlinked", 0, 1600, 1500, 1700),
        price("l_paddy_karnal", 5, 2300, 2200, 2400),           # no paddy price today
        price("l_basmati_tarori", 0, 4100, 4000, 4200),
        price("l_tomato_karnal", 2, 1200, 1000, 1500),
        price("l_tomato_panipat", 4, 1800, 1500, 2000),
        price("l_sweet_panipat", 0, 2500, 2000, 3000),
        price("l_onion_thanesar", 1, 2600, 2500, 2700),
        price("l_rice_karnal", 0, 5000, 4900, 5100),
        price("l_onion_kottayam", 0, 3000, 2900, 3100),
    ])

    saved = {k: os.environ.get(k) for k in ("MARKET_MONGO_URI", "MARKET_MONGO_DB_NAME", "MARKET_V2_COLLECTION_PREFIX")}
    os.environ.update(MARKET_MONGO_URI=URI, MARKET_MONGO_DB_NAME=name, MARKET_V2_COLLECTION_PREFIX="")
    mod = importlib.reload(base)
    real_today = mod.today_ist
    mod.today_ist = lambda: TODAY
    fn = getattr(mod.mandi_price_tool, "fn", mod.mandi_price_tool)
    yield {"mod": mod, "fn": fn, "ids": ids, "db": db}
    mod.today_ist = real_today
    for k, v in saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v
    importlib.reload(base)
    client.drop_database(name)
    client.close()


def call(env, **kw):
    kw.setdefault("state", "haryana")
    return env["fn"](**kw)


def near(env, **kw):
    """A farmer at Karnal asking with their location."""
    return call(env, lat=KARNAL[0], long=KARNAL[1], nearest_market=True, **kw)


def rows(res):
    return sorted((r["market_name"], r["date"]) for r in res.get("price_records") or [])


def markets(res):
    return sorted({r["market_name"] for r in res.get("price_records") or []})


def assert_friendly(res):
    msg = str(res.get("error") or "")
    assert msg, res
    assert msg[0].isupper() and msg.rstrip().endswith((".", "?")), msg
    lowered = msg.lower()
    for word in FAR_TECHNICAL_WORDS:
        assert word not in lowered, f"{word!r} in {msg!r}"
    assert res.get("error_code"), res


# ── today's price: no fallback ────────────────────────────────────────────

@needs_db
class TestTodayOnly:
    def test_today_price_near_farmer(self, env):
        res = near(env, action="get_today_price", commodity_name=["onion"])
        # Karnal today (Tarori zero and Panipat min>max are dropped; Ambala/Hisar too far)
        assert rows(res) == [("karnal apmc", TODAY.isoformat())]

    def test_no_price_today_gives_message_not_older_price(self, env):
        res = near(env, action="get_today_price", commodity_name=["paddy"])
        assert res.get("price_records") is None
        assert res["error_code"] == "NO_PRICE_DATA"
        assert res["reason"] == "no_price_today"
        assert "today" in res["error"] and "40 km" in res["error"]
        assert_friendly(res)

    def test_no_price_on_asked_date_gives_message(self, env):
        d = (TODAY - timedelta(days=4)).isoformat()
        res = near(env, action="get_today_price", commodity_name=["paddy"], from_date=d, to_date=d)
        assert res["error_code"] == "NO_PRICE_DATA" and res["reason"] == "no_price_in_period"
        assert "29 Oct 2026" in res["error"]
        assert_friendly(res)

    def test_asked_past_date_with_data(self, env):
        d = (TODAY - timedelta(days=1)).isoformat()
        res = near(env, action="get_today_price", commodity_name=["onion"], from_date=d, to_date=d)
        assert rows(res) == [("karnal apmc", d), ("tarori apmc", d)]

    def test_lookback_1_is_today_only(self, env):
        res = near(env, action="get_today_price", commodity_name=["onion"], lookback_days=1)
        assert {r["date"] for r in res["price_records"]} == {TODAY.isoformat()}

    @pytest.mark.parametrize("action", [
        "get_today_price", "get_price_history", "get_price_summary", "get_highest_price",
        "get_lowest_price", "get_today_arrival", "get_arrival_history", "get_extreme_arrival",
    ])
    def test_no_action_shows_a_price_outside_the_asked_period(self, env, action):
        d = (TODAY - timedelta(days=4)).isoformat()   # only tomato at Panipat has a row that day
        res = near(env, action=action, commodity_name=["onion"], from_date=d, to_date=d)
        assert res.get("error_code") == "NO_PRICE_DATA", res
        assert_friendly(res)

    def test_state_wide_today_without_location(self, env):
        res = call(env, action="get_today_price", commodity_name=["onion"])
        names = markets(res)
        assert "hisar apmc" in names and "unlinked apmc" in names   # whole state, no distance limit
        assert {r["date"] for r in res["price_records"]} == {TODAY.isoformat()}
        assert "tarori apmc" not in names and "panipat apmc" not in names  # bad rows dropped

    def test_state_wide_no_price_today(self, env):
        res = call(env, action="get_today_price", commodity_name=["paddy"])
        assert res["error_code"] == "NO_PRICE_DATA"
        assert "Haryana" in res["error"]
        assert_friendly(res)


# ── 40 km rule ────────────────────────────────────────────────────────────

@needs_db
class TestDistance:
    def test_far_mandis_never_used(self, env):
        res = near(env, action="get_price_history", commodity_name=["onion"], lookback_days=7)
        assert "hisar apmc" not in markets(res) and "ambala apmc" not in markets(res)

    def test_larger_radius_is_capped_at_40_km(self, env):
        res = near(env, action="get_today_price", commodity_name=["onion"], radius_km=500)
        assert markets(res) == ["karnal apmc"]

    def test_smaller_radius_is_respected(self, env):
        d = (TODAY - timedelta(days=1)).isoformat()
        res = near(env, action="get_today_price", commodity_name=["onion"], radius_km=5, from_date=d, to_date=d)
        assert markets(res) == ["karnal apmc"]

    def test_records_carry_distance_nearest_first(self, env):
        d = (TODAY - timedelta(days=1)).isoformat()
        res = near(env, action="get_today_price", commodity_name=["onion"], from_date=d, to_date=d)
        dist = [r["distance_km"] for r in res["price_records"]]
        assert dist == sorted(dist) and dist[0] < 1 and 10 < dist[1] < 20

    def test_nothing_within_40_km(self, env):
        res = call(env, action="get_today_price", commodity_name=["onion"], lat=28.0, long=73.3)  # Bikaner area
        assert res["error_code"] == "NO_PRICE_DATA" and "40 km" in res["error"]
        assert_friendly(res)

    def test_swapped_lat_long_still_finds_mandis(self, env):
        res = call(env, action="get_today_price", commodity_name=["onion"], lat=KARNAL[1], long=KARNAL[0], nearest_market=True)
        assert markets(res) == ["karnal apmc"]

    @pytest.mark.parametrize("lat,lon", [(0, 0), (float("nan"), 76.9), ("abc", "def"), (51.5, -0.1)])
    def test_bad_location_is_ignored_and_state_is_used(self, env, lat, lon):
        res = call(env, action="get_today_price", commodity_name=["onion"], lat=lat, long=lon)
        assert "hisar apmc" in markets(res)  # answered for the whole state

    def test_search_markets_near_me_within_40_km(self, env):
        res = near(env, action="search_markets")
        names = [m["name"] for m in res["markets"]]
        assert names == ["karnal apmc", "tarori apmc", "panipat apmc"]
        assert all(m["distance_km"] <= 40 for m in res["markets"])

    def test_search_markets_without_location_lists_state(self, env):
        res = call(env, action="search_markets", nearest_market=True)
        assert {m["name"] for m in res["markets"]} >= {"karnal apmc", "hisar apmc"}

    def test_search_markets_nothing_near(self, env):
        res = call(env, action="search_markets", lat=28.0, long=73.3, nearest_market=True)
        assert res["error_code"] == "MARKET_NOT_FOUND" and "40 km" in res["error"]
        assert_friendly(res)


# ── crops ─────────────────────────────────────────────────────────────────

@needs_db
class TestCrops:
    def test_farmer_word(self, env):
        d = (TODAY - timedelta(days=5)).isoformat()
        res = near(env, action="get_today_price", commodity_name=["dhan"], from_date=d, to_date=d)
        assert markets(res) == ["karnal apmc"]
        assert res["price_records"][0]["product_name"] == "paddy"
        assert res["price_records"][0]["price_unit"] == "Rs/quintal"

    def test_last_scrape_time_is_returned(self, env):
        res = near(env, action="get_price_history", commodity_name=["onion"], lookback_days=7)
        by_row = {(r["market_name"], r["date"]): r["ingested_at"] for r in res["price_records"]}
        assert by_row[("karnal apmc", TODAY.isoformat())] == "2026-11-02T00:45:00+00:00"
        assert by_row[("karnal apmc", "2026-11-01")] == "2026-11-01T06:00:00+00:00"
        assert by_row[("tarori apmc", "2026-11-01")] is None           # row without ingested_at
        assert res["resolution"]["data_updated_at"] == "2026-11-02T00:45:00+00:00"
        summary = near(env, action="get_price_summary", commodity_name=["onion"], lookback_days=7)
        assert summary["resolution"]["data_updated_at"] == "2026-11-02T00:45:00+00:00"

    def test_product_name(self, env):
        assert markets(near(env, action="get_today_price", commodity_name=["basmati paddy"])) == ["tarori apmc"]

    def test_crop_name_does_not_mix_other_products(self, env):
        res = near(env, action="get_price_history", commodity_name=["paddy"], lookback_days=7)
        assert {r["product_name"] for r in res["price_records"]} == {"paddy"}

    @pytest.mark.parametrize("word", ["chawal", "rice", "dry chillies"])
    def test_pending_or_rejected_name_gives_no_price(self, env, word):
        res = near(env, action="get_today_price", commodity_name=[word])
        assert res["error_code"] == "COMMODITY_NOT_AVAILABLE" and res["reason"] == "crop_not_recognised"
        assert "price_records" not in res
        assert_friendly(res)

    def test_unknown_crop_with_suggestion(self, env):
        res = near(env, action="get_today_price", commodity_name=["oniun pyaz"])
        assert res["reason"] == "crop_not_recognised"
        assert_friendly(res)

    def test_one_letter_typo_is_accepted(self, env):
        assert markets(near(env, action="get_today_price", commodity_name=["onionn"])) == ["karnal apmc"]

    def test_swapped_letters_are_not_guessed(self, env):
        res = near(env, action="get_today_price", commodity_name=["onoin"])
        assert res["reason"] == "crop_not_recognised"
        assert "Onion" in res["error"]  # offered as "did you mean"

    def test_exact_product_wins_over_shared_key(self, env):
        assert markets(near(env, action="get_today_price", commodity_name=["sweet potato"])) == ["panipat apmc"]

    def test_ambiguous_name_asks_which(self, env):
        res = near(env, action="get_today_price", commodity_name=["potato sweet"])
        assert res["error_code"] == "COMMODITY_AMBIGUOUS"
        assert set(res["options"]) == {"potato/sweet potato", "sweet potato"}
        assert_friendly(res)

    def test_crop_known_but_not_in_state(self, env):
        res = call(env, state="kerala", action="get_today_price", commodity_name=["paddy"])
        assert res["error_code"] == "COMMODITY_NOT_AVAILABLE" and res["reason"] == "no_listings_in_state"
        assert "Kerala" in res["error"]
        assert_friendly(res)

    def test_missing_crop(self, env):
        res = near(env, action="get_today_price")
        assert res["error_code"] == "COMMODITY_REQUIRED"
        assert_friendly(res)

    def test_several_crops_some_without_price(self, env):
        res = near(env, action="get_today_price", commodity_name=["onion", "paddy"])
        assert markets(res) == ["karnal apmc"]
        assert any("Paddy price today" in w for w in res["resolution"]["unavailable_commodities"])

    def test_several_crops_none_with_price(self, env):
        res = near(env, action="get_today_price", commodity_name=["paddy", "tomato"])
        assert res["error_code"] == "NO_PRICE_DATA"
        assert "Paddy" in res["error"] and "Tomato" in res["error"]
        assert_friendly(res)

    def test_crops_split_from_one_string(self, env):
        res = near(env, action="get_today_price", commodity_name="onion and basmati paddy")
        assert markets(res) == ["karnal apmc", "tarori apmc"]


# ── states ────────────────────────────────────────────────────────────────

@needs_db
class TestStates:
    def test_other_spelling_of_state(self, env):
        assert markets(call(env, state="Kerala", action="get_today_price", commodity_name=["onion"])) == ["kottayam apmc"]

    @pytest.mark.parametrize("state", ["Bangladesh", "Nepal", "Atlantis"])
    def test_unknown_state(self, env, state):
        res = call(env, state=state, action="get_today_price", commodity_name=["onion"])
        assert res["error_code"] == "STATE_NOT_FOUND"
        assert_friendly(res)

    @pytest.mark.parametrize("state", [None, "", "   "])
    def test_missing_state(self, env, state):
        res = env["fn"](action="get_today_price", commodity_name=["onion"], state=state)
        assert res["error_code"] == "STATE_REQUIRED"
        assert_friendly(res)


# ── named mandis ──────────────────────────────────────────────────────────

@needs_db
class TestNamedMandi:
    def test_named_mandi_with_price(self, env):
        res = near(env, action="get_today_price", commodity_name=["onion"], market_name="karnal", search_by_apmc=True)
        assert markets(res) == ["karnal apmc"]

    @pytest.mark.parametrize("action", ["get_today_price", "get_price_with_nearby", "get_price_history"])
    def test_named_mandi_without_price_gives_message_not_other_mandis(self, env, action):
        # Tarori, 20 km from Panipat, has basmati paddy today; it must not be shown instead.
        res = near(env, action=action, commodity_name=["basmati paddy"], market_name="panipat", search_by_apmc=True)
        assert res["error_code"] == "NO_PRICE_DATA" and res["reason"] == "no_price_at_market"
        assert "Panipat APMC" in res["error"]
        assert not res.get("price_records") and not res.get("nearby_markets")
        assert_friendly(res)

    def test_named_mandi_without_price_and_no_location(self, env):
        res = call(env, action="get_today_price", commodity_name=["basmati paddy"], market_name="panipat", search_by_apmc=True)
        assert res["error_code"] == "NO_PRICE_DATA" and not res.get("price_records")

    def test_named_district_with_price(self, env):
        d = (TODAY - timedelta(days=1)).isoformat()
        res = call(env, action="get_today_price", commodity_name=["onion"], market_name="kurukshetra",
                   search_by_apmc=True, from_date=d, to_date=d)
        assert markets(res) == ["thanesar apmc"]
        assert "Kurukshetra district" in res["resolution"]["market_fallback_notice"]

    def test_named_district_without_price(self, env):
        res = call(env, action="get_today_price", commodity_name=["onion"], market_name="kurukshetra", search_by_apmc=True)
        assert res["error_code"] == "NO_PRICE_DATA"
        assert res["error"] == "Onion price today is not available in mandis in Kurukshetra district."

    def test_named_district_beyond_40_km_gives_message(self, env):
        d = (TODAY - timedelta(days=1)).isoformat()
        res = near(env, action="get_today_price", commodity_name=["onion"], market_name="kurukshetra",
                   search_by_apmc=True, from_date=d, to_date=d)
        assert res["error_code"] == "NO_PRICE_DATA" and not res.get("price_records")

    def test_unknown_mandi_with_location_gives_message(self, env):
        res = near(env, action="get_today_price", commodity_name=["onion"], market_name="zzzpur", search_by_apmc=True)
        assert res["error_code"] == "MARKET_NOT_FOUND" and not res.get("price_records")
        assert_friendly(res)

    def test_unknown_mandi_without_location(self, env):
        res = call(env, action="get_today_price", commodity_name=["onion"], market_name="zzzpur", search_by_apmc=True)
        assert res["error_code"] == "MARKET_NOT_FOUND"
        assert "Zzzpur" in res["error"]
        assert_friendly(res)

    def test_named_mandi_and_nearby(self, env):
        d = (TODAY - timedelta(days=1)).isoformat()
        res = near(env, action="get_price_with_nearby", commodity_name=["onion"], market_name="karnal",
                   search_by_apmc=True, from_date=d, to_date=d)
        assert markets(res["named_market"]) == ["karnal apmc"]
        assert markets(res["nearby_markets"]) == ["tarori apmc"]

    def test_named_mandi_and_nearby_never_far(self, env):
        res = near(env, action="get_price_with_nearby", commodity_name=["onion"], market_name="karnal", search_by_apmc=True)
        assert res["nearby_markets"] is None or "hisar apmc" not in markets(res["nearby_markets"])

    def test_named_mandi_and_nearby_nothing_anywhere(self, env):
        res = near(env, action="get_price_with_nearby", commodity_name=["paddy"], market_name="karnal", search_by_apmc=True)
        assert res["error_code"] == "NO_PRICE_DATA"
        assert res["error"] == "Paddy price today is not available at Karnal APMC."

    def test_mandi_outside_farmers_district(self, env):
        res = near(env, action="get_today_price", commodity_name=["onion"], market_name="hisar",
                   search_by_apmc=True, district="karnal")
        assert res["error_code"] == "MARKET_OUTSIDE_DISTRICT"


# ── other actions ─────────────────────────────────────────────────────────

@needs_db
class TestActions:
    def test_history_default_is_last_7_days(self, env):
        res = near(env, action="get_price_history", commodity_name=["onion"])
        dates = {r["date"] for r in res["price_records"]}
        assert min(dates) >= (TODAY - timedelta(days=6)).isoformat()
        assert res["resolution"]["date_filter"]["lookback_days"] == 7

    def test_summary(self, env):
        res = near(env, action="get_price_summary", commodity_name=["onion"], lookback_days=7)
        overall = res["stats"]["overall"]
        assert overall["lowest_min_price"] == 1900 and overall["highest_max_price"] == 2500

    def test_highest_and_lowest(self, env):
        hi = near(env, action="get_highest_price", commodity_name=["onion"])
        lo = near(env, action="get_lowest_price", commodity_name=["onion"])
        assert hi["highest_records"][0]["modal_price"] == 2400   # Panipat, 2 days ago
        assert lo["lowest_records"][0]["modal_price"] == 2000    # Karnal today

    def test_today_arrival(self, env):
        res = near(env, action="get_today_arrival", commodity_name=["onion"])
        assert [r["arrival_quantity"] for r in res["arrival_records"]] == [120]

    def test_today_arrival_without_quantity(self, env):
        res = near(env, action="get_today_arrival", commodity_name=["basmati paddy"])
        assert res["arrival_records"][0]["arrival_quantity"] is None
        assert res["message"] == base.ARRIVAL_AGMARKNET_NOTICE

    def test_extreme_arrival_ignores_missing_quantities(self, env):
        res = near(env, action="get_extreme_arrival", commodity_name=["onion"], sort_order="lowest")
        assert [r["arrival_quantity"] for r in res["lowest_arrivals"]] == [50, 80, 120]

    def test_several_actions(self, env):
        res = near(env, action=["get_today_price", "get_price_summary"], commodity_name=["onion"])
        assert set(res["results"]) == {"get_today_price", "get_price_summary"}

    @pytest.mark.parametrize("action", ["get_forecast", "sell_now"])
    def test_unknown_action(self, env, action):
        res = near(env, action=action, commodity_name=["onion"])
        assert res["error_code"] == "UNSUPPORTED_ACTION"

    @pytest.mark.parametrize("action", [None, "", []])
    def test_missing_action(self, env, action):
        res = near(env, action=action, commodity_name=["onion"])
        assert res["error_code"] == "UNSUPPORTED_ACTION"
        assert_friendly(res)


# ── dates and periods ─────────────────────────────────────────────────────

@needs_db
class TestDates:
    @pytest.mark.parametrize("text", ["1 Nov 2026", "Nov 1, 2026", "01.11.2026", "01/11/2026", "2026-11-01",
                                      "2026-11-01T00:00:00", "1st November 2026", "1-Nov"])
    def test_date_formats(self, env, text):
        res = near(env, action="get_today_price", commodity_name=["onion"], from_date=text, to_date=text)
        assert {r["date"] for r in res["price_records"]} == {"2026-11-01"}, text

    def test_year_less_date_in_future_means_last_year(self, env):
        res = near(env, action="get_today_price", commodity_name=["onion"], from_date="25-Dec", to_date="25-Dec")
        assert res["resolution"]["date_filter"]["from_date"] == "2025-12-25"

    def test_reversed_range_is_swapped(self, env):
        a, b = (TODAY - timedelta(days=1)).isoformat(), (TODAY - timedelta(days=3)).isoformat()
        res = near(env, action="get_price_history", commodity_name=["onion"], from_date=a, to_date=b)
        dates = {r["date"] for r in res["price_records"]}
        assert min(dates) == b and max(dates) == a

    @pytest.mark.parametrize("text", ["32-13-2026", "yesterday-ish", "abc"])
    def test_bad_date(self, env, text):
        res = near(env, action="get_today_price", commodity_name=["onion"], from_date=text, to_date=text)
        assert res["error_code"] == "BAD_DATE"
        assert_friendly(res)

    @pytest.mark.parametrize("days", [0, -1, "x", 10_000])
    def test_odd_lookback_values_do_not_break(self, env, days):
        res = near(env, action="get_price_history", commodity_name=["onion"], lookback_days=days)
        assert res.get("price_records") or res.get("error_code") == "NO_PRICE_DATA"

    def test_future_date(self, env):
        d = (TODAY + timedelta(days=3)).isoformat()
        res = near(env, action="get_today_price", commodity_name=["onion"], from_date=d, to_date=d)
        assert res["error_code"] == "NO_PRICE_DATA"
        assert_friendly(res)


# ── failures ──────────────────────────────────────────────────────────────

@needs_db
class TestFailures:
    def test_database_error_gives_plain_message(self, env, monkeypatch):
        def broken():
            raise RuntimeError("ServerSelectionTimeoutError: localhost:27017 connection refused")
        monkeypatch.setattr(env["mod"], "states_col", broken)
        res = near(env, action="get_today_price", commodity_name=["onion"])
        assert res["error_code"] == "SERVICE_ERROR"
        assert res["error"] == base.SERVICE_ERROR_MESSAGE
        assert_friendly(res)

    def test_database_error_in_one_of_several_actions(self, env, monkeypatch):
        def broken():
            raise RuntimeError("boom")
        monkeypatch.setattr(env["mod"], "states_col", broken)
        res = near(env, action=["get_today_price", "search_markets"], commodity_name=["onion"])
        assert all(r.get("error_code") == "SERVICE_ERROR" for r in res["results"].values())

    def test_mandi_with_broken_coordinates_does_not_crash(self, env):
        env["db"].available_mandi.insert_one({"_id": ObjectId(), "name": "broken apmc", "state": "haryana",
                                              "district": "karnal", "location": {"coordinates": ["x", None]}})
        try:
            res = near(env, action="search_markets")
            assert "broken apmc" not in [m["name"] for m in res["markets"]]
        finally:
            env["db"].available_mandi.delete_one({"name": "broken apmc"})


@needs_db
def test_every_failure_message_is_written_for_farmers(env):
    """One sweep over every way a request can fail."""
    d4 = (TODAY - timedelta(days=4)).isoformat()
    cases = [
        dict(action="get_today_price", commodity_name=["paddy"]),
        dict(action="get_today_price", commodity_name=["paddy"], from_date=d4, to_date=d4),
        dict(action="get_today_price", commodity_name=["xyz"]),
        dict(action="get_today_price", commodity_name=["rice"]),
        dict(action="get_today_price", commodity_name=["potato sweet"]),
        dict(action="get_today_price", commodity_name=["onion"], state="bangladesh"),
        dict(action="get_today_price", commodity_name=["onion"], state=None),
        dict(action="get_today_price", commodity_name=["onion"], from_date="99-99-99", to_date="x"),
        dict(action="get_today_price"),
        dict(action="unknown_action", commodity_name=["onion"]),
        dict(action="get_today_price", commodity_name=["paddy", "tomato"]),
        dict(action="get_price_with_nearby", commodity_name=["paddy"], market_name="karnal", search_by_apmc=True),
        dict(action="get_today_price", commodity_name=["onion"], market_name="zzz", search_by_apmc=True, lat=None, long=None),
        dict(action="get_today_price", commodity_name=["paddy"], state="kerala"),
        dict(action="search_markets", lat=28.0, long=73.3),
    ]
    for kw in cases:
        kw.setdefault("state", "haryana")
        kw.setdefault("lat", KARNAL[0])
        kw.setdefault("long", KARNAL[1])
        res = env["fn"](**kw)
        assert_friendly(res)
        assert not res.get("price_records"), kw


def test_no_nan_distance():
    assert base._finite_float(float("nan")) is None
    assert math.isfinite(base._finite_float("12.5"))
