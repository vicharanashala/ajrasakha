"""
Ajrasakha Mandi API
===================
GET /v1/mandis/nearby?lat=..&lng=..&search=&page=1&limit=20
GET /v1/mandi/{mandi_id}/prices/nearby?search=&sort=&page=1&limit=20

Mandis within a 40 km radius (nearest first), and the latest price per
approved crop for one mandi. Both are paginated. Schema: Mandi repo, branch feat/catalog-v2,
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
import re
import secrets
import sys
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Optional

from bson import ObjectId
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.security import APIKeyHeader
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
MONGO_URI = (
    os.getenv("MONGO_URI") or os.getenv("MARKET_MONGO_URI") or os.getenv("MONGODB_URI")
)
MONGO_DB_NAME = os.getenv("MANDI_DB_NAME") or os.getenv("MARKET_MONGO_DB_NAME") or "Price"
_P = (os.getenv("V2_COLLECTION_PREFIX") or "v2_").strip()
LISTINGS, PRICES = f"{_P}listings", f"{_P}price_records"
PRODUCTS, CROPS = f"{_P}products", f"{_P}crops"
MONGO_MAX_TIME_MS = int(os.getenv("MARKET_MONGO_MAX_TIME_MS", 10000))

# --------------------------------------------------------------------------
# API-key authentication (header: X-API-Key). Keys come from API_KEYS (comma-separated,
# so a key can be rotated without downtime). If none is configured, every protected
# request is rejected (fail closed).
# --------------------------------------------------------------------------
_API_KEYS = [k.strip() for k in os.getenv("API_KEYS", "").split(",") if k.strip()]
if not _API_KEYS:
    logger.error("API_KEYS is not set: all protected endpoints will return 503 until it is configured")


_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False, description="Secret API key")


def require_api_key(x_api_key: Optional[str] = Depends(_api_key_header)) -> None:
    if not _API_KEYS:
        raise HTTPException(503, "API authentication is not configured")
    supplied = (x_api_key or "").encode()
    ok = False
    for k in _API_KEYS:  # check all keys, constant-time each
        ok |= secrets.compare_digest(supplied, k.encode())
    if not ok:
        raise HTTPException(401, "Invalid or missing API key", headers={"WWW-Authenticate": "ApiKey"})


DEFAULT_RADIUS_KM = 40
MAX_RADIUS_KM = 100
DEFAULT_LIMIT = 20
MAX_LIMIT = 100
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


def _pagination(total: int, page: int, limit: int) -> dict:
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit if total else 0,
    }


def _iso(d: Optional[date]) -> Optional[str]:
    return d.isoformat() if d else None


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


@app.get("/v1/mandis/nearby", dependencies=[Depends(require_api_key)])
def mandis_nearby(
    lat: float = Query(..., description="Latitude, -90..90"),
    lng: float = Query(..., description="Longitude, -180..180"),
    search: Optional[str] = Query(None, description="Mandi name, case-insensitive substring"),
    radius_km: float = Query(DEFAULT_RADIUS_KM, gt=0, le=MAX_RADIUS_KM, description="Search radius in km"),
    page: int = Query(1, ge=1),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
) -> dict:
    if not (-90 <= lat <= 90):
        raise HTTPException(400, "lat must be between -90 and 90")
    if not (-180 <= lng <= 180):
        raise HTTPException(400, "lng must be between -180 and 180")
    term = (search or "").strip()
    db = get_db()

    geo: dict[str, Any] = {
        "near": {"type": "Point", "coordinates": [lng, lat]},
        "distanceField": "distance_m",
        "maxDistance": radius_km * 1000,
        "spherical": True,
    }
    if term:
        geo["query"] = {"name": {"$regex": re.escape(term), "$options": "i"}}
    try:
        res = list(
            db["available_mandi"].aggregate(
                [
                    {"$geoNear": geo},
                    {
                        "$facet": {
                            "items": [{"$skip": (page - 1) * limit}, {"$limit": limit}],
                            "total": [{"$count": "n"}],
                        }
                    },
                ],
                maxTimeMS=MONGO_MAX_TIME_MS,
            )
        )
        mandis = res[0]["items"] if res else []
        total = res[0]["total"][0]["n"] if res and res[0]["total"] else 0

        # updated_time = newest price date across the mandi's listings
        updated: dict[Any, Any] = {}
        if mandis:
            for r in db[LISTINGS].aggregate(
                [
                    {"$match": {"mandi_id": {"$in": [m["_id"] for m in mandis]}, "product_id": {"$ne": None}}},
                    {
                        "$lookup": {
                            "from": PRICES,
                            "let": {"lid": "$_id"},
                            "pipeline": [
                                {"$match": {"$expr": {"$eq": ["$market_commodity_id", "$$lid"]}}},
                                {"$sort": {"date": -1}},
                                {"$limit": 1},
                                {"$project": {"date": 1}},
                            ],
                            "as": "latest",
                        }
                    },
                    {"$unwind": "$latest"},
                    {"$group": {"_id": "$mandi_id", "updated": {"$max": "$latest.date"}}},
                ],
                maxTimeMS=MONGO_MAX_TIME_MS,
            ):
                updated[r["_id"]] = r["updated"]
    except Exception:
        logger.exception("nearby mandis failed")
        raise HTTPException(503, "Mandi lookup is temporarily unavailable")

    items = []
    for m in mandis:
        d = _to_date(updated.get(m["_id"]))
        items.append(
            {
                "id": _oid_str(m["_id"]),
                "name": m.get("name"),
                "distance_km": round(m["distance_m"] / 1000, 1),
                "updated_time": _iso(d),
            }
        )
    return {"data": items, "pagination": _pagination(total, page, limit)}


@app.get("/v1/mandi/{mandi_id}/prices/nearby", dependencies=[Depends(require_api_key)])
def mandi_prices(
    mandi_id: str,
    search: Optional[str] = Query(None, description="Crop or variety name, case-insensitive substring"),
    sort: Optional[str] = Query(
        "crop", description="crop (A-Z), price_high / price_low (by modal), newest"
    ),
    page: int = Query(1, ge=1),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
) -> dict:
    try:
        oid = ObjectId(mandi_id)
    except Exception:
        raise HTTPException(400, "mandi_id is not a valid id")
    sort = (sort or "").strip().lower() or "crop"
    if sort not in ("crop", "price_high", "price_low", "newest"):
        raise HTTPException(400, "sort must be crop, price_high, price_low or newest")
    term = (search or "").strip().lower()

    db = get_db()
    today = datetime.now(timezone.utc).date()
    try:
        if db["available_mandi"].count_documents({"_id": oid}, limit=1) == 0:
            raise HTTPException(404, "Mandi not found")
        listings = list(
            db[LISTINGS].aggregate(
                [
                    {"$match": {"mandi_id": oid, "product_id": {"$ne": None}}},
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
        products = {
            p["_id"]: p
            for p in db[PRODUCTS]
            .find({"_id": {"$in": list({d["product_id"] for d in listings})}})
            .max_time_ms(MONGO_MAX_TIME_MS)
        }
        crop_ids = list({p.get("crop_id") for p in products.values() if p.get("crop_id")})
        crops = {
            c["_id"]: c
            for c in db[CROPS].find({"_id": {"$in": crop_ids}}).max_time_ms(MONGO_MAX_TIME_MS)
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("mandi prices failed")
        raise HTTPException(503, "Price lookup is temporarily unavailable")

    # One row per (product, variety): several sources may list the same thing, keep the newest.
    best: dict[tuple, dict] = {}
    for ls in listings:
        product = products.get(ls["product_id"])
        if product is None:
            continue
        pr = ls["latest"]
        modal, mn, mx = (_num(pr.get(k)) for k in ("modal_price", "min_price", "max_price"))
        if modal is None and mn is None and mx is None:
            continue
        price_date = _to_date(pr.get("date"))
        if price_date is None or price_date > today:
            continue
        variety = ls.get("variety") or None
        key = (ls["product_id"], (variety or "").lower())
        if key in best and best[key]["_d"] >= price_date:
            continue
        crop = (crops.get(product.get("crop_id")) or {}).get("name") or product.get("name")
        age_days, stale = _age(price_date, today)
        best[key] = {
            "_d": price_date,
            "product_id": _oid_str(ls["product_id"]),
            "crop": crop,
            "variety": variety,
            "unit": product.get("price_unit") or DEFAULT_UNIT,
            "modal": modal,
            "max": mx,
            "min": mn,
            "price_date": price_date.isoformat(),
            "age_days": age_days,
            "stale": stale,
        }

    rows = list(best.values())
    if term:
        rows = [r for r in rows if term in (r["crop"] or "").lower() or term in (r["variety"] or "").lower()]
    rows.sort(key=lambda r: ((r["crop"] or "").lower(), (r["variety"] or "").lower()))
    if sort == "price_high":
        rows.sort(key=lambda r: (r["modal"] is None, -(r["modal"] or 0)))
    elif sort == "price_low":
        rows.sort(key=lambda r: (r["modal"] is None, r["modal"] or 0))
    elif sort == "newest":
        rows.sort(key=lambda r: r["_d"], reverse=True)

    total = len(rows)
    start = (page - 1) * limit
    items = rows[start : start + limit]
    for r in items:
        r.pop("_d")
    return {"data": items, "pagination": _pagination(total, page, limit)}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
