import os
import re
from datetime import datetime, timedelta, timezone, time as dt_time
from typing import Any, Optional
from mcp.server.transport_security import TransportSecuritySettings

from pymongo import MongoClient
from pymongo.collection import Collection
from bson import ObjectId
from bson.errors import InvalidId

from mcp.server.fastmcp import FastMCP

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

MONGO_URI       = os.environ.get("MARKET_MONGO_URI")
MONGO_DB_NAME   = os.environ.get("MARKET_MONGO_DB_NAME", "Price")
DEFAULT_TOP_N_NEAREST = int(os.environ.get("MARKET_DEFAULT_TOP_N_NEAREST", 5))

# Hard-coded result cap — never return more than this many price records
PRICE_RECORD_LIMIT = 500

_client: Optional[MongoClient] = None


def get_client() -> MongoClient:
    global _client
    if _client is None:
        _client = MongoClient(MONGO_URI)
    return _client


def get_db():
    return get_client()[MONGO_DB_NAME]


def markets_commodities_col() -> Collection:
    return get_db()["markets_commodities"]

def price_records_col() -> Collection:
    return get_db()["price_records"]

def available_mandi_col() -> Collection:
    return get_db()["available_mandi"]

def commodity_alias_col() -> Collection:
    return get_db()["commodity_alias_lookup"]


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def _norm(s: Optional[str]) -> Optional[str]:
    return s.strip().lower() if isinstance(s, str) else s


def _to_oid(value: Any) -> Optional[ObjectId]:
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return value
    try:
        return ObjectId(str(value))
    except InvalidId:
        return None


def _parse_date(value: str) -> datetime:
    """
    Parse flexible human-friendly date strings into a tz-aware UTC datetime.

    Supported formats (examples):
        "27-Jun-2025"  "27-June-2025"
        "1-Jul-2025"   "1-July-2025"
        "27-06-2025"   "27/06/2025"
        "2025-06-27"
        "27-Jun"  "27-June"   (current UTC year assumed)
    """
    value = value.strip()
    # Normalise separators → "-"
    value_n = value.replace("/", "-").replace(" ", "-")

    # Formats to try (order matters — longer/more specific first)
    fmts = [
        "%d-%b-%Y",   # 27-Jun-2025
        "%d-%B-%Y",   # 27-June-2025
        "%d-%m-%Y",   # 27-06-2025
        "%Y-%m-%d",   # 2025-06-27
        "%d-%b",      # 27-Jun  (no year)
        "%d-%B",      # 27-June (no year)
    ]
    for fmt in fmts:
        try:
            dt = datetime.strptime(value_n, fmt)
            # If year was not in format, inject current UTC year
            if "%Y" not in fmt and "%y" not in fmt:
                dt = dt.replace(year=datetime.now(timezone.utc).year)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue

    raise ValueError(
        f"Cannot parse date '{value}'. "
        "Use formats like: 27-Jun-2025, 27-06-2025, 2025-06-27, 27-Jun."
    )


def _day_start(dt: datetime) -> datetime:
    return datetime.combine(dt.date(), dt_time.min, tzinfo=timezone.utc)


def _day_end(dt: datetime) -> datetime:
    return datetime.combine(dt.date(), dt_time.max, tzinfo=timezone.utc)


def _round2(v: Any) -> Optional[float]:
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return None


# --------------------------------------------------------------------------
# Result serializers — clean JSON, no ObjectIds, no display formatting
# --------------------------------------------------------------------------

def _serialize_market(doc: dict) -> dict:
    loc = doc.get("location") or {}
    coords = None
    if isinstance(loc, dict) and loc.get("coordinates"):
        lon, lat = loc["coordinates"]
        coords = {"latitude": lat, "longitude": lon}
    return {
        "name":        doc.get("name"),
        "state":       doc.get("state"),
        "district":    doc.get("district"),
        "postcode":    doc.get("postcode"),
        "aliases":     doc.get("aliases", []),
        "coordinates": coords,
    }


def _serialize_price_record(pr: dict, mc: dict, market: Optional[dict]) -> dict:
    date_val = pr.get("date")
    record = {
        "date":             date_val.date().isoformat() if isinstance(date_val, datetime) else None,
        "state":            mc.get("state"),
        "market_name":      market.get("name") if market else mc.get("market_name"),
        "district":         market.get("district") if market else None,
        "commodity_name":   mc.get("commodity_name"),
        "variety":          mc.get("variety"),
        "grade":            mc.get("grade"),
        "commodity_group":  mc.get("commodity_group"),
        "source_system":    mc.get("source_system"),
        "modal_price":      _round2(pr.get("modal_price")),
        "arrival_quantity": _round2(pr.get("arrival_quantity")),
    }
    min_price = _round2(pr.get("min_price"))
    max_price = _round2(pr.get("max_price"))
    if min_price is not None:
        record["min_price"] = min_price
    if max_price is not None:
        record["max_price"] = max_price
    return record


def _compute_stats(records: list[dict]) -> dict:
    def _vals(key):
        return [r[key] for r in records if r.get(key) is not None]

    def _avg(lst):   return round(sum(lst) / len(lst), 2) if lst else None
    def _min(lst):   return round(min(lst), 2) if lst else None
    def _max(lst):   return round(max(lst), 2) if lst else None
    def _total(lst): return round(sum(lst), 2) if lst else None

    min_p   = _vals("min_price")
    max_p   = _vals("max_price")
    modal_p = _vals("modal_price")
    qty     = _vals("arrival_quantity")

    by_commodity: dict[str, dict] = {}
    for r in records:
        c = r.get("commodity_name") or "unknown"
        by_commodity.setdefault(c, {"min_price": [], "max_price": [], "modal_price": [], "arrival_quantity": []})
        for f in ("min_price", "max_price", "modal_price", "arrival_quantity"):
            if r.get(f) is not None:
                by_commodity[c][f].append(r[f])

    return {
        "total_records": len(records),
        "overall": {
            "avg_min_price":      _avg(min_p),
            "avg_max_price":      _avg(max_p),
            "avg_modal_price":    _avg(modal_p),
            "lowest_min_price":   _min(min_p),
            "highest_max_price":  _max(max_p),
            "price_spread":       round((_max(max_p) or 0) - (_min(min_p) or 0), 2) if min_p and max_p else None,
            "avg_arrival_qty":    _avg(qty),
            "total_arrival_qty":  _total(qty),
        },
        "by_commodity": {
            c: {
                "record_count":      len(v["modal_price"]) or len(v["min_price"]),
                "avg_min_price":     _avg(v["min_price"]),
                "avg_max_price":     _avg(v["max_price"]),
                "avg_modal_price":   _avg(v["modal_price"]),
                "lowest_min_price":  _min(v["min_price"]),
                "highest_max_price": _max(v["max_price"]),
                "total_arrival_qty": _total(v["arrival_quantity"]),
            }
            for c, v in by_commodity.items()
        },
    }


# --------------------------------------------------------------------------
# MCP Server
# --------------------------------------------------------------------------

mcp = FastMCP(
    "market_price_mcp",
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=False
    )
)


# --------------------------------------------------------------------------
# Internal action implementations
# --------------------------------------------------------------------------

def _search_markets(
    market_name: Optional[str] = None,
    state: Optional[str] = None,
    lat: Optional[float] = None,
    long: Optional[float] = None,
    nearest_market: bool = False,
    radius_km: Optional[float] = None,
) -> dict:
    coll = available_mandi_col()
    query: dict[str, Any] = {}
    use_geo = lat is not None and long is not None

    if use_geo:
        near: dict[str, Any] = {
            "$geometry": {"type": "Point", "coordinates": [float(long), float(lat)]}
        }
        if radius_km is not None:
            near["$maxDistance"] = float(radius_km) * 1000  # km → metres

        query["location"] = {"$near": near}
        if market_name:
            query["$or"] = [
                {"name":    {"$regex": re.escape(market_name), "$options": "i"}},
                {"aliases": {"$regex": re.escape(market_name), "$options": "i"}},
            ]
        if state:
            query["state"] = {"$regex": f"^{re.escape(state)}$", "$options": "i"}

        fetch_limit = 1 if not nearest_market else DEFAULT_TOP_N_NEAREST
        docs = list(coll.find(query).limit(fetch_limit))
        return {
            "count":   len(docs),
            "mode":    "geo_near",
            "markets": [_serialize_market(d) for d in docs],
        }

    # Text-only path
    if market_name:
        query["$or"] = [
            {"name":    {"$regex": re.escape(market_name), "$options": "i"}},
            {"aliases": {"$regex": re.escape(market_name), "$options": "i"}},
        ]
    if state:
        query["state"] = {"$regex": f"^{re.escape(state)}$", "$options": "i"}

    if not query:
        return {"error": "Provide at least market_name, state, or lat/long."}

    docs = list(coll.find(query).limit(50))
    return {
        "count":   len(docs),
        "mode":    "text_search",
        "markets": [_serialize_market(d) for d in docs],
    }


def _lookup_commodity(commodity_name: list[str]) -> dict:
    coll = commodity_alias_col()
    resolutions: dict[str, Any] = {}

    for raw in commodity_name:
        norm = _norm(raw)
        # 1. Exact anchored match (active only)
        doc = coll.find_one({
            "$or": [
                {"canonical_name": {"$regex": f"^{re.escape(norm)}$", "$options": "i"}},
                {"aliases":        {"$regex": f"^{re.escape(norm)}$", "$options": "i"}},
            ],
            "active": True,
        })
        # 2. Substring fallback (still active only)
        if not doc:
            doc = coll.find_one({
                "$or": [
                    {"canonical_name": {"$regex": re.escape(norm), "$options": "i"}},
                    {"aliases":        {"$regex": re.escape(norm), "$options": "i"}},
                ],
                "active": True,
            })

        if doc:
            resolutions[raw] = {
                "matched":        True,
                "canonical_name": doc.get("canonical_name"),
                "crop_master_id": doc.get("crop_master_id"),
                "known_aliases":  doc.get("aliases", []),
            }
        else:
            resolutions[raw] = {"matched": False}

    return {"resolutions": resolutions}


def _get_prices(
    commodity_name: list[str],
    state: Optional[str] = None,
    lat: Optional[float] = None,
    long: Optional[float] = None,
    nearest_market: bool = False,
    radius_km: Optional[float] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    lookback_days: Optional[int] = None,
) -> dict:
    mc_coll    = markets_commodities_col()
    pr_coll    = price_records_col()
    mandi_coll = available_mandi_col()
    alias_coll = commodity_alias_col()
    resolution_meta: dict[str, Any] = {}

    # ── 1. Resolve commodity names → alias IDs ─────────────────────────────
    alias_ids: list[ObjectId] = []
    unresolved_names: list[str] = []
    for raw in commodity_name:
        norm = _norm(raw)
        doc = alias_coll.find_one({
            "$or": [
                {"canonical_name": {"$regex": f"^{re.escape(norm)}$", "$options": "i"}},
                {"aliases":        {"$regex": f"^{re.escape(norm)}$", "$options": "i"}},
            ],
            "active": True,
        })
        if not doc:
            doc = alias_coll.find_one({
                "$or": [
                    {"canonical_name": {"$regex": re.escape(norm), "$options": "i"}},
                    {"aliases":        {"$regex": re.escape(norm), "$options": "i"}},
                ],
                "active": True,
            })
        if doc:
            alias_ids.append(doc["_id"])
        else:
            unresolved_names.append(raw)

    if unresolved_names:
        resolution_meta["unresolved_commodity_names"] = unresolved_names
    if not alias_ids:
        return {
            "error": "None of the commodity_name values could be resolved via commodity_alias_lookup.",
            "unresolved": unresolved_names,
        }

    # ── 2. Build markets_commodities filter ────────────────────────────────
    mc_filter: dict[str, Any] = {
        "commodity_alias_lookup_id": {"$in": alias_ids}
    }

    if state:
        mc_filter["state"] = _norm(state)

    # ── 3. Geo: resolve nearest market(s) via $near ────────────────────────
    if lat is not None and long is not None:
        near: dict[str, Any] = {
            "$geometry": {"type": "Point", "coordinates": [float(long), float(lat)]}
        }
        if radius_km is not None:
            near["$maxDistance"] = float(radius_km) * 1000  # km → metres

        fetch_n = 1 if not nearest_market else DEFAULT_TOP_N_NEAREST
        nearby = list(mandi_coll.find({"location": {"$near": near}}).limit(fetch_n))
        if not nearby:
            return {"error": "No markets found near the given coordinates."}

        market_ids = [m["_id"] for m in nearby]
        mc_filter["market_id"] = {"$in": market_ids}
        resolution_meta["nearest_markets"] = [
            {"name": m.get("name"), "state": m.get("state"), "district": m.get("district")}
            for m in nearby
        ]

    # ── 4. Fetch matching market_commodity entries ─────────────────────────
    mc_docs = list(mc_coll.find(mc_filter))
    if not mc_docs:
        return {
            "error": "No markets_commodities entries matched the given filters.",
            "resolution": resolution_meta,
        }

    mc_by_id = {d["_id"]: d for d in mc_docs}

    # Batch-fetch available_mandi for enrichment
    market_oid_set = {d["market_id"] for d in mc_docs if d.get("market_id")}
    mandi_by_id: dict[ObjectId, dict] = {}
    if market_oid_set:
        for m in mandi_coll.find({"_id": {"$in": list(market_oid_set)}}):
            mandi_by_id[m["_id"]] = m

    # ── 5. Build date filter ───────────────────────────────────────────────
    pr_query: dict[str, Any] = {"market_commodity_id": {"$in": list(mc_by_id.keys())}}
    date_meta: dict[str, Any] = {}

    if lookback_days is not None:
        cutoff = _day_start(datetime.now(timezone.utc) - timedelta(days=int(lookback_days)))
        pr_query["date"] = {"$gte": cutoff}
        date_meta = {"mode": "lookback", "lookback_days": lookback_days, "from": cutoff.date().isoformat()}

    elif from_date or to_date:
        date_range: dict[str, Any] = {}
        if from_date:
            fd = _parse_date(from_date)
            date_range["$gte"] = _day_start(fd)
            date_meta["from_date"] = fd.date().isoformat()
        if to_date:
            td = _parse_date(to_date)
            date_range["$lte"] = _day_end(td)
            date_meta["to_date"] = td.date().isoformat()
        pr_query["date"] = date_range
        date_meta["mode"] = "range"

    else:
        date_meta = {"mode": "all_dates"}

    resolution_meta["date_filter"] = date_meta

    # ── 6. Fetch price records ─────────────────────────────────────────────
    raw_records = list(
        pr_coll.find(pr_query).sort("date", -1).limit(PRICE_RECORD_LIMIT)
    )

    # ── 7. Format records (no ObjectIds) ──────────────────────────────────
    formatted: list[dict] = []
    for pr in raw_records:
        mc  = mc_by_id.get(pr.get("market_commodity_id"), {})
        mid = mc.get("market_id")
        mkt = mandi_by_id.get(mid) if mid else None
        formatted.append(_serialize_price_record(pr, mc, mkt))

    # ── 8. Stats ───────────────────────────────────────────────────────────
    stats = _compute_stats(formatted)

    return {
        "stats":        stats,
        "resolution":   resolution_meta,
        "price_records": formatted,
    }


def _get_unresolved_markets(state: Optional[str] = None) -> dict:
    coll = markets_commodities_col()
    query: dict[str, Any] = {
        "$or": [{"market_id": None}, {"market_id": {"$exists": False}}]
    }
    if state:
        query = {"$and": [query, {"state": _norm(state)}]}

    docs = list(coll.find(query).limit(PRICE_RECORD_LIMIT))
    formatted = [
        {
            "source_system":   d.get("source_system"),
            "state":           d.get("state"),
            "market_name":     d.get("market_name"),
            "commodity_name":  d.get("commodity_name"),
            "variety":         d.get("variety"),
            "grade":           d.get("grade"),
            "commodity_group": d.get("commodity_group"),
        }
        for d in docs
    ]
    return {"count": len(formatted), "unresolved_markets": formatted}


# --------------------------------------------------------------------------
# SINGLE EXPOSED TOOL
# --------------------------------------------------------------------------

@mcp.tool()
def mandi_price_tool(
    action: str,
    # --- geo / market search ---
    lat: Optional[float] = None,
    long: Optional[float] = None,
    nearest_market: bool = False,
    radius_km: Optional[float] = None,
    market_name: Optional[str] = None,
    state: Optional[str] = None,
    # --- commodity (required for get_prices / lookup_commodity) ---
    commodity_name: Optional[list[str]] = None,
    # --- date filters (mutually exclusive; lookback_days takes priority) ---
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    lookback_days: Optional[int] = None,
) -> dict:
    """
    Single entry point for all mandi/commodity price operations.

    `action` selects the operation:

      "search_markets"
          Search available_mandi by name/state/geo.
          Params: lat, long, nearest_market, radius_km, market_name, state.

      "lookup_commodity"
          Resolve raw commodity name(s) to canonical form + crop_master_id.
          Params: commodity_name (required).

      "get_prices"
          Fetch formatted price records with statistics.
          Params: commodity_name (required), state, lat, long,
                  nearest_market, radius_km,
                  from_date, to_date  OR  lookback_days.

      "get_unresolved_markets"
          List markets_commodities rows with missing market_id.
          Params: state.

    Args:
        action        : Operation name (see above).
        lat           : Latitude (WGS-84) for geo search / nearest-market lookup.
        long          : Longitude (WGS-84) for geo search / nearest-market lookup.
        nearest_market: False (default) = only the single nearest market.
                        True  = top nearest markets (up to DEFAULT_TOP_N_NEAREST).
        radius_km     : Optional search radius in kilometres ($maxDistance cap).
        market_name   : Free-text match on market name / aliases (search_markets).
        state         : State name filter (case-insensitive exact match).
        commodity_name: List of raw commodity names/aliases to query or resolve.
                        Required for "get_prices" and "lookup_commodity".
        from_date     : Inclusive start date. Flexible formats accepted:
                        "27-Jun-2025", "27-June-2025", "27-06-2025", "2025-06-27",
                        "27-Jun" (current year assumed). Records with date >= start
                        of this day are included.
        to_date       : Inclusive end date (same formats). Records with date <=
                        end of this day are included.
        lookback_days : If set, fetches records from the past N days (ignores
                        from_date / to_date). E.g. 7, 10, 30.

    Returns:
        For get_prices: {"stats": {...}, "resolution": {...}, "price_records": [...]}
        For others:     action-specific formatted dict (no raw ObjectIds).
    """
    key = (action or "").strip().lower()
    if key == "search_markets":
        return _search_markets(
            market_name=market_name,
            state=state,
            lat=lat,
            long=long,
            nearest_market=nearest_market,
            radius_km=radius_km,
        )

    if key == "lookup_commodity":
        if not commodity_name:
            return {"error": "commodity_name (list[str]) is required for action='lookup_commodity'."}
        return _lookup_commodity(commodity_name=commodity_name)

    if key == "get_prices":
        if not commodity_name:
            return {"error": "commodity_name (list[str]) is required for action='get_prices'."}
        return _get_prices(
            commodity_name=commodity_name,
            state=state,
            lat=lat,
            long=long,
            nearest_market=nearest_market,
            radius_km=radius_km,
            from_date=from_date,
            to_date=to_date,
            lookback_days=lookback_days,
        )

    if key == "get_unresolved_markets":
        return _get_unresolved_markets(state=state)

    return {
        "error": (
            f"Unknown action '{action}'. Choose one of: "
            "search_markets, lookup_commodity, get_prices, get_unresolved_markets."
        )
    }


# --------------------------------------------------------------------------
# Entrypoint
# --------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run(transport="streamable-http")
