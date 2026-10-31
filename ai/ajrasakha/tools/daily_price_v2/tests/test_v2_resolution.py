"""v2 tool against a tiny v2 database (needs TEST_MONGO_URI; creates and drops its own DB)."""

import importlib
import os
import uuid
from datetime import datetime, timezone

import pytest
from bson import ObjectId
from pymongo import MongoClient

URI = os.getenv("TEST_MONGO_URI")
pytestmark = pytest.mark.skipif(not URI, reason="TEST_MONGO_URI not set")

DAY = datetime(2026, 10, 28, tzinfo=timezone.utc)


@pytest.fixture
def tool():
    name = f"test_dp_v2_{uuid.uuid4().hex[:8]}"
    client = MongoClient(URI)
    db = client[name]
    crop, paddy, basmati = ObjectId(), ObjectId(), ObjectId()
    mandi_a, mandi_b = ObjectId(), ObjectId()
    db.states.insert_one({"_id": "keralam", "name": "keralam", "spellings": ["kerala", "keralam"]})
    db.crops.insert_one({"_id": crop, "name": "paddy", "default_product_id": paddy, "active": True})
    db.products.insert_many([
        {"_id": paddy, "crop_id": crop, "name": "paddy", "active": True},
        {"_id": basmati, "crop_id": crop, "name": "basmati paddy", "active": True},
    ])
    db.crop_names.insert_many([
        {"source": "agmarknet", "raw_name": "paddy(common)", "raw_variety": "*", "product_id": paddy, "status": "approved"},
        {"source": "agmarknet", "raw_name": "rice", "raw_variety": "*", "product_id": None, "status": "pending"},
    ])
    db.available_mandi.insert_many([
        {"_id": mandi_a, "name": "kottayam apmc", "state": "keralam", "district": "kottayam",
         "location": {"type": "Point", "coordinates": [76.52, 9.59]}, "aliases": []},
        {"_id": mandi_b, "name": "pala apmc", "state": "kerala", "district": "kottayam",
         "location": {"type": "Point", "coordinates": [76.68, 9.71]}, "aliases": []},
    ])
    l1, l2, l3 = ObjectId(), ObjectId(), ObjectId()
    db.listings.insert_many([
        {"_id": l1, "source_system": "agmarknet", "state": "keralam", "state_code": "keralam", "market_name": "kottayam apmc",
         "commodity_name": "paddy(common)", "variety": "paddy", "product_id": paddy, "mandi_id": mandi_a},
        {"_id": l2, "source_system": "agmarknet", "state": "kerala", "state_code": "keralam", "market_name": "pala apmc",
         "commodity_name": "paddy(basmati)", "variety": None, "product_id": basmati, "mandi_id": mandi_b},
        {"_id": l3, "source_system": "agmarknet", "state": "keralam", "state_code": "keralam", "market_name": "kottayam apmc",
         "commodity_name": "rice", "variety": None, "product_id": None, "mandi_id": mandi_a},
    ])
    db.price_records.insert_many([
        {"market_commodity_id": l1, "date": DAY, "modal_price": 2400.0, "min_price": 2300.0, "max_price": 2500.0},
        {"market_commodity_id": l2, "date": DAY, "modal_price": 4100.0, "min_price": 4000.0, "max_price": 4200.0},
        {"market_commodity_id": l3, "date": DAY, "modal_price": 5000.0, "min_price": 4900.0, "max_price": 5100.0},
    ])
    os.environ["MARKET_MONGO_URI"] = URI
    os.environ["MARKET_MONGO_DB_NAME"] = name
    from ajrasakha.tools.daily_price_v2 import daily_market_price_v2 as mod
    mod = importlib.reload(mod)
    fn = getattr(mod.mandi_price_tool, "fn", mod.mandi_price_tool)
    yield lambda **kw: fn(action="get_today_price", lat=9.6, long=76.55, nearest_market=True,
                          from_date="2026-10-28", to_date="2026-10-28", **kw)
    client.drop_database(name)
    client.close()


def _rows(res):
    return sorted((r["market_name"], r["commodity_name"]) for r in res.get("price_records") or [])


def test_crop_name_uses_default_product(tool):
    res = tool(commodity_name="Paddy", state="Kerala")
    assert _rows(res) == [("kottayam apmc", "paddy(common)")]


def test_product_name_gives_that_product(tool):
    res = tool(commodity_name="basmati paddy", state="keralam")
    assert _rows(res) == [("pala apmc", "paddy(basmati)")]


def test_approved_mandi_spelling_resolves(tool):
    res = tool(commodity_name="paddy(common)", state="kerala")
    assert _rows(res) == [("kottayam apmc", "paddy(common)")]


def test_pending_name_gives_no_price(tool):
    res = tool(commodity_name="rice", state="kerala")
    assert res.get("error_code") == "COMMODITY_NOT_AVAILABLE"
