"""
Ajrasakha Mandi API
===================
GET /v1/prices/nearby?lat=..&lng=..

Mandis within a fixed 40 km radius (nearest first), each with its latest
price per approved crop. Schema: Mandi repo, branch feat/catalog-v2,
docs/v2_database_design.md.

  available_mandi   2dsphere idx_location_2dsphere on `location`
  v2_listings       mandi+crop rows; only product_id & mandi_id non-null are trusted
  v2_price_records  time series per listing (latest row per listing is used)
  v2_products / v2_crops   crop name + price_unit

v2_latest_prices does not exist yet, so the latest price is read per listing
from v2_price_records. Env: MONGO_URI, MANDI_DB_NAME, V2_COLLECTION_PREFIX.
"""

from __future__ import annotations

import logging
import os
import sys
from datetime import date, datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient

load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("mandi_api")

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------
MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MARKET_MONGO_URI")
MONGO_DB_NAME = os.getenv("MANDI_DB_NAME") or os.getenv("MARKET_MONGO_DB_NAME") or "Price"
_P = (os.getenv("V2_COLLECTION_PREFIX") or "v2_").strip()
LISTINGS, PRICES = f"{_P}listings", f"{_P}price_records"
PRODUCTS, CROPS = f"{_P}products", f"{_P}crops"
MONGO_MAX_TIME_MS = int(os.getenv("MARKET_MONGO_MAX_TIME_MS", 10000))

RADIUS_KM = 40  # fixed server-side
RADIUS_M = RADIUS_KM * 1000
MAX_MANDIS = int(os.getenv("MARKET_NEARBY_MAX_MANDIS", 200))
STALE_AFTER_DAYS = int(os.getenv("MARKET_STALE_AFTER_DAYS", 3))
DEFAULT_UNIT = "Rs/quintal"

_client: Optional[MongoClient] = None


def get_db():
    global _client
    if _client is None:
        if not MONGO_URI:
            raise RuntimeError("MONGO_URI is not set")
        _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    return _client[MONGO_DB_NAME]


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _oid_str(v: Any) -> Optional[str]:
    return str(v) if v is not None else None


def _num(v: Any) -> Optional[float]:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return int(f) if f.is_integer() else round(f, 2)


def _price_value(doc: dict, *names: str) -> Optional[float]:
    for n in names:
        if doc.get(n) is not None:
            return _num(doc[n])
    return None


def _to_date(v: Any) -> Optional[date]:
    if isinstance(v, datetime):
        return v.astimezone(timezone.utc).date() if v.tzinfo else v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, str):
        try:
            return date.fromisoformat(v[:10])
        except ValueError:
            return None
    return None


def _age(price_date: Optional[date], today: date) -> tuple[Optional[int], bool]:
    if price_date is None:
        return None, True
    age = max((today - price_date).days, 0)
    return age, age > STALE_AFTER_DAYS


# --------------------------------------------------------------------------
# App
# --------------------------------------------------------------------------
app = FastAPI(title="Ajrasakha Mandi API", version="1.0.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"]
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/v1/prices/nearby")
def prices_nearby(
    lat: float = Query(..., description="Latitude, -90..90"),
    lng: float = Query(..., description="Longitude, -180..180"),
) -> dict:
    # 1. Validate (also rejects NaN/inf, which fail both range checks)
    if not (-90 <= lat <= 90):
        raise HTTPException(400, "lat must be between -90 and 90")
    if not (-180 <= lng <= 180):
        raise HTTPException(400, "lng must be between -180 and 180")

    db = get_db()
    now = datetime.now(timezone.utc)
    today = now.date()

    # 2. Nearby mandis, nearest first, distance in metres (GeoJSON: [lng, lat])
    try:
        mandis = list(
            db["available_mandi"].aggregate(
                [
                    {
                        "$geoNear": {
                            "near": {"type": "Point", "coordinates": [lng, lat]},
                            "distanceField": "distance_m",
                            "maxDistance": RADIUS_M,
                            "spherical": True,
                        }
                    },
                    {"$limit": MAX_MANDIS},
                ],
                maxTimeMS=MONGO_MAX_TIME_MS,
            )
        )
    except Exception:
        logger.exception("geoNear failed")
        raise HTTPException(503, "Mandi lookup is temporarily unavailable")

    response: dict[str, Any] = {
        "location": {"lat": lat, "lng": lng},
        "radius_km": RADIUS_KM,
        "as_of": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "mandis": [],
    }
    if not mandis:
        return response

    mandi_ids = [m["_id"] for m in mandis]

    # 3. Approved listings (product_id and mandi_id non-null) in the nearby
    #    mandis, each joined to its newest price row. v2_latest_prices does not
    #    exist yet, so the latest row is taken from v2_price_records.
    try:
        listings = list(
            db[LISTINGS].aggregate(
                [
                    {
                        "$match": {
                            "mandi_id": {"$in": mandi_ids},
                            "product_id": {"$ne": None},
                        }
                    },
                    {
                        "$lookup": {
                            "from": PRICES,
                            "let": {"lid": "$_id"},
                            "pipeline": [
                                {"$match": {"$expr": {"$eq": ["$market_commodity_id", "$$lid"]}}},
                                {"$sort": {"date": -1}},
                                {"$limit": 1},
                            ],
                            "as": "latest",
                        }
                    },
                    {"$unwind": "$latest"},
                ],
                maxTimeMS=MONGO_MAX_TIME_MS,
            )
        )

        # 4. Product + crop lookups (batched, not per row)
        product_ids = list({d["product_id"] for d in listings})
        products = {
            p["_id"]: p
            for p in db[PRODUCTS]
            .find({"_id": {"$in": product_ids}})
            .max_time_ms(MONGO_MAX_TIME_MS)
        }
        crop_ids = list({p.get("crop_id") for p in products.values() if p.get("crop_id")})
        crops = {
            c["_id"]: c
            for c in db[CROPS]
            .find({"_id": {"$in": crop_ids}})
            .max_time_ms(MONGO_MAX_TIME_MS)
        }
    except Exception:
        logger.exception("price lookup failed")
        raise HTTPException(503, "Price lookup is temporarily unavailable")

    # One row per (mandi, product, variety): several sources may list the
    # same thing, keep the newest.
    best: dict[tuple, dict] = {}
    for ls in listings:
        product = products.get(ls["product_id"])
        if product is None:
            continue  # orphaned product reference
        pr = ls["latest"]
        modal, mn, mx = (_num(pr.get(k)) for k in ("modal_price", "min_price", "max_price"))
        if modal is None and mn is None and mx is None:
            continue
        price_date = _to_date(pr.get("date"))
        if price_date is None or price_date > today:
            continue  # unparseable / future dates are not trustworthy
        variety = ls.get("variety") or None
        key = (ls["mandi_id"], ls["product_id"], (variety or "").lower())
        if key in best and best[key]["_d"] >= price_date:
            continue
        crop = crops.get(product.get("crop_id")) or {}
        age_days, stale = _age(price_date, today)
        best[key] = {
            "_d": price_date,
            "_m": ls["mandi_id"],
            "product_id": _oid_str(ls["product_id"]),
            "crop": crop.get("name") or product.get("name"),
            "variety": variety,
            "unit": product.get("price_unit") or DEFAULT_UNIT,
            "modal": modal,
            "min": mn,
            "max": mx,
            "price_date": price_date.isoformat(),
            "age_days": age_days,
            "stale": stale,
        }

    prices_by_mandi: dict[Any, list[dict]] = {}
    for row in best.values():
        prices_by_mandi.setdefault(row.pop("_m"), []).append(row)
        row.pop("_d")

    # 5. Assemble, nearest first ($geoNear already sorts; sort again for safety)
    for m in sorted(mandis, key=lambda d: d["distance_m"]):
        prices = prices_by_mandi.get(m["_id"], [])
        prices.sort(key=lambda p: ((p["crop"] or "").lower(), (p["variety"] or "").lower()))
        response["mandis"].append(
            {
                "mandi_id": _oid_str(m["_id"]),
                "name": m.get("name"),
                "district": m.get("district"),
                "state": m.get("state"),
                "distance_km": round(m["distance_m"] / 1000, 1),
                "prices": prices,
            }
        )
    return response


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
