from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

import main

client = TestClient(main.app)


@pytest.mark.parametrize("q", ["lat=91&lng=77", "lat=-91&lng=77", "lat=12&lng=181", "lat=12&lng=-181"])
def test_out_of_range_400(q):
    assert client.get(f"/v1/prices/nearby?{q}").status_code == 400


def test_missing_param_422():
    assert client.get("/v1/prices/nearby?lat=12").status_code == 422


def _fake_db(mandis, listings, products, crops):
    cols = {
        "available_mandi": MagicMock(),
        main.LISTINGS: MagicMock(),
        main.PRODUCTS: MagicMock(),
        main.CROPS: MagicMock(),
    }
    cols["available_mandi"].aggregate.return_value = mandis
    cols[main.LISTINGS].aggregate.return_value = listings
    cols[main.PRODUCTS].find.return_value.max_time_ms.return_value = products
    cols[main.CROPS].find.return_value.max_time_ms.return_value = crops
    db = MagicMock()
    db.__getitem__.side_effect = lambda k: cols[k]
    return db


def test_happy_path(monkeypatch):
    m1, m2, pid, cid = (ObjectId() for _ in range(4))
    today = datetime.now(timezone.utc)
    day = lambda n: today - timedelta(days=n)
    listing = lambda mid, d, modal, var="Red": {
        "_id": ObjectId(), "mandi_id": mid, "product_id": pid, "variety": var,
        "latest": {"date": d, "modal_price": modal, "min_price": 1800, "max_price": 2400},
    }
    db = _fake_db(
        mandis=[
            {"_id": m2, "name": "Far", "distance_m": 30000},
            {"_id": m1, "name": "Near", "district": "Bengaluru", "state": "Karnataka", "distance_m": 12400},
        ],
        listings=[
            listing(m1, day(1), 2100),
            listing(m1, day(6), 999),          # older duplicate -> dropped
            listing(m2, day(6), 1500),         # stale
            {**listing(m2, day(0), None), "latest": {"date": day(0)}},  # no prices -> dropped
            listing(m2, today + timedelta(days=3), 1),  # future -> dropped
        ],
        products=[{"_id": pid, "crop_id": cid, "price_unit": "Rs/quintal"}],
        crops=[{"_id": cid, "name": "Onion"}],
    )
    monkeypatch.setattr(main, "get_db", lambda: db)
    r = client.get("/v1/prices/nearby?lat=12.97&lng=77.59")
    assert r.status_code == 200
    body = r.json()
    assert body["radius_km"] == 40
    assert [m["name"] for m in body["mandis"]] == ["Near", "Far"]
    near, far = body["mandis"]
    assert near["distance_km"] == 12.4
    assert len(near["prices"]) == 1
    p = near["prices"][0]
    assert (p["crop"], p["modal"], p["age_days"], p["stale"]) == ("Onion", 2100, 1, False)
    assert far["prices"][0]["stale"] is True and len(far["prices"]) == 1


def test_no_mandis(monkeypatch):
    monkeypatch.setattr(main, "get_db", lambda: _fake_db([], [], [], []))
    r = client.get("/v1/prices/nearby?lat=0&lng=0")
    assert r.json()["mandis"] == []
