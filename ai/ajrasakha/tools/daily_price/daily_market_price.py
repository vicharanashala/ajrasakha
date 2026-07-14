import os
import re
from datetime import datetime, timedelta, timezone, time as dt_time
from typing import Any, Optional, Union
import logging
import sys

from pymongo import MongoClient
from pymongo.collection import Collection
from bson import ObjectId
from bson.errors import InvalidId

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from dotenv import load_dotenv
load_dotenv()

# Configure logging to output to stderr (stdout is reserved for MCP protocol messages)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr
)
logger = logging.getLogger("mandi_price_tool")

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------
MONGO_URI       = os.getenv("MARKET_MONGO_URI")
MONGO_DB_NAME   = os.getenv("MARKET_MONGO_DB_NAME", "Price")
DEFAULT_TOP_N_NEAREST = int(os.getenv("MARKET_DEFAULT_TOP_N_NEAREST", 5))

# Hard-coded result cap — never return more than this many price records
PRICE_RECORD_LIMIT = 100

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
# MCP Server
# --------------------------------------------------------------------------
mcp = FastMCP(
    "ajrasakha-daily-price-mcp",
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=False
    )
)


# --------------------------------------------------------------------------
# SINGLE EXPOSED TOOL — 8 ACTIONS
# --------------------------------------------------------------------------

@mcp.tool()
def mandi_price_tool(
    action: str,
    # --- commodity ---
    commodity_name: Optional[Union[str, list[str]]] = None,
    # --- geo / market search ---
    lat: Optional[float] = None,
    long: Optional[float] = None,
    nearest_market: bool = False,
    radius_km: Optional[float] = None,
    market_name: Optional[str] = None,
    state: Optional[str] = None,
    # --- date filters (mutually exclusive; lookback_days takes priority) ---
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    lookback_days: Optional[int] = None,
    # --- sort/filter modifiers (for extreme queries) ---
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = None,
) -> dict:
    """
    Single entry point for all mandi/commodity price, arrival, and market
    operations.  The `action` parameter selects the operation:

    Actions:
      "get_today_price"    — Today's / latest commodity price.
                             Params: commodity_name (required), market_name,
                             state, lat, long, nearest_market, radius_km.

      "get_price_history"  — Historical prices over a date range.
                             Params: commodity_name (required), market_name,
                             state, lat, long, nearest_market, radius_km,
                             from_date, to_date OR lookback_days.

      "get_price_summary"  — Aggregated min/max/modal price statistics.
                             Params: commodity_name (required), market_name,
                             state, lat, long, nearest_market, radius_km,
                             from_date, to_date OR lookback_days.

      "get_highest_price"  — Find the highest/best by max price and Modal price  commodity price.
                             Params: commodity_name (required), market_name,
                             state, lat, long, nearest_market, radius_km,
                             from_date, to_date OR lookback_days.

      "get_today_arrival"  — Today's arrival quantity for a commodity.
                             Params: commodity_name (required), market_name,
                             state, lat, long, nearest_market, radius_km.

      "get_arrival_history" — Historical arrival quantities over a date range.
                             Params: commodity_name (required), market_name,
                             state, lat, long, nearest_market, radius_km,
                             from_date, to_date OR lookback_days.

      "get_extreme_arrival" — Highest or lowest arrival across markets/dates.
                             Params: commodity_name (required), market_name,
                             state, lat, long, nearest_market, radius_km,
                             from_date, to_date OR lookback_days,
                             sort_order ("highest" or "lowest").

      "search_markets"     — Search for mandis/APMCs by name, state, or geo.
                             Params: market_name, state, lat, long,
                             nearest_market, radius_km.
                             commodity_name is optional (filters mandis that
                             trade that commodity).

    Args:
        action        : One of the 8 action strings listed above (required).
        commodity_name: Raw commodity name (string) or list of names.
        lat           : Latitude (WGS-84) for geo search.
        long          : Longitude (WGS-84) for geo search.
        nearest_market: True = return multiple nearest markets (up to 5).
                        False = only the single nearest.
        radius_km     : Search radius in kilometres.
        market_name   : Free-text match on market name / aliases.
        state         : State name filter (case-insensitive).
        from_date     : Inclusive start date (e.g. "27-Jun-2025", "2025-06-27").
        to_date       : Inclusive end date.
        lookback_days : Fetch records from the past N days.
        sort_by       : Field to sort extreme queries by ("price" or "arrival").
        sort_order    : Direction for extreme queries ("highest" or "lowest").
    """
    logger.info(
        "mandi_price_tool called | action=%s, commodity_name=%s, market_name=%s, state=%s, lat=%s, long=%s, nearest_market=%s, radius_km=%s, from_date=%s, to_date=%s, lookback_days=%s, sort_by=%s, sort_order=%s",
        action, commodity_name, market_name, state, lat, long, nearest_market, radius_km, from_date, to_date, lookback_days, sort_by, sort_order
    )

    # ======================================================================
    # NESTED HELPERS
    # ======================================================================

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
        value = value.strip()
        value_n = value.replace("/", "-").replace(" ", "-")
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

    def _serialize_market(doc: dict) -> dict:
        loc = doc.get("location") or {}
        coords = None
        if isinstance(loc, dict) and loc.get("coordinates"):
            lon, lat_val = loc["coordinates"]
            coords = {"latitude": lat_val, "longitude": lon}
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
            "min_price":        _round2(pr.get("min_price")),
            "max_price":        _round2(pr.get("max_price")),
            "arrival_quantity": _round2(pr.get("arrival_quantity")),
        }
        return record

    def _compute_stats(records: list[dict]) -> dict:
        def _vals(key):
            return [r[key] for r in records if r.get(key) is not None]
        def _avg(lst):   return round(sum(lst) / len(lst), 2) if lst else None
        def _min_val(lst): return round(min(lst), 2) if lst else None
        def _max_val(lst): return round(max(lst), 2) if lst else None
        def _total(lst): return round(sum(lst), 2) if lst else None

        min_p   = _vals("min_price")
        max_p   = _vals("max_price")
        modal_p = _vals("modal_price")
        qty     = _vals("arrival_quantity")

        by_commodity: dict[str, dict] = {}
        for r in records:
            c = r.get("commodity_name") or "unknown"
            by_commodity.setdefault(c, {
                "min_price": [], "max_price": [],
                "modal_price": [], "arrival_quantity": [],
            })
            for f in ("min_price", "max_price", "modal_price", "arrival_quantity"):
                if r.get(f) is not None:
                    by_commodity[c][f].append(r[f])

        return {
            "total_records": len(records),
            "overall": {
                "avg_min_price":      _avg(min_p),
                "avg_max_price":      _avg(max_p),
                "avg_modal_price":    _avg(modal_p),
                "lowest_min_price":   _min_val(min_p),
                "highest_max_price":  _max_val(max_p),
                "price_spread":       round((_max_val(max_p) or 0) - (_min_val(min_p) or 0), 2) if min_p and max_p else None,
                "avg_arrival_qty":    _avg(qty),
                "total_arrival_qty":  _total(qty),
            },
            "by_commodity": {
                c: {
                    "record_count":      len(v["modal_price"]) or len(v["min_price"]),
                    "avg_min_price":     _avg(v["min_price"]),
                    "avg_max_price":     _avg(v["max_price"]),
                    "avg_modal_price":   _avg(v["modal_price"]),
                    "lowest_min_price":  _min_val(v["min_price"]),
                    "highest_max_price": _max_val(v["max_price"]),
                    "total_arrival_qty": _total(v["arrival_quantity"]),
                }
                for c, v in by_commodity.items()
            },
        }

    def _resolve_commodity_aliases(names: list[str]) -> dict[str, Optional[dict]]:
        logger.info("Resolving commodity aliases for input names: %s", names)
        coll = commodity_alias_col()
        results: dict[str, Optional[dict]] = {}
        for raw in names:
            norm = _norm(raw)
            doc = coll.find_one({
                "$or": [
                    {"canonical_name": {"$regex": f"^{re.escape(norm)}$", "$options": "i"}},
                    {"aliases":        {"$regex": f"^{re.escape(norm)}$", "$options": "i"}},
                ],
                "active": True,
            })
            if not doc:
                doc = coll.find_one({
                    "$or": [
                        {"canonical_name": {"$regex": re.escape(norm), "$options": "i"}},
                        {"aliases":        {"$regex": re.escape(norm), "$options": "i"}},
                    ],
                    "active": True,
                })
            results[raw] = doc
            if doc:
                logger.info("Resolved commodity '%s' to canonical name: '%s' (_id: %s)", raw, doc.get("canonical_name"), doc.get("_id"))
            else:
                logger.warning("Could not resolve commodity alias for input name: '%s'", raw)
        return results

    # ------------------------------------------------------------------
    # Market search (shared helper + action 8 handler)
    # ------------------------------------------------------------------
    def _do_search_markets(
        market_name: Optional[str] = None,
        state: Optional[str] = None,
        lat: Optional[float] = None,
        long: Optional[float] = None,
        nearest_market: bool = False,
        radius_km: Optional[float] = None,
    ) -> dict:
        logger.info(
            "Searching markets | name=%s, state=%s, lat=%s, long=%s, nearest_market=%s, radius_km=%s",
            market_name, state, lat, long, nearest_market, radius_km
        )
        coll = available_mandi_col()
        query: dict[str, Any] = {}
        use_geo = lat is not None and long is not None

        if use_geo:
            near: dict[str, Any] = {
                "$geometry": {"type": "Point", "coordinates": [float(long), float(lat)]}
            }
            if radius_km is not None:
                near["$maxDistance"] = float(radius_km) * 1000
            query["location"] = {"$near": near}
            if market_name:
                query["$or"] = [
                    {"name":    {"$regex": re.escape(market_name), "$options": "i"}},
                    {"aliases": {"$regex": re.escape(market_name), "$options": "i"}},
                ]
            if state:
                query["state"] = {"$regex": f"^{re.escape(state)}$", "$options": "i"}
            fetch_limit = 1 if not nearest_market else DEFAULT_TOP_N_NEAREST
            logger.info("Executing geo-search query on available_mandi: %s", query)
            docs = list(coll.find(query).limit(fetch_limit))
            logger.info("Geo-search returned %d markets.", len(docs))
            return {
                "count":     len(docs),
                "mode":      "geo_near",
                "markets":   [_serialize_market(d) for d in docs],
                "_raw_docs": docs,
            }

        if market_name:
            query["$or"] = [
                {"name":    {"$regex": re.escape(market_name), "$options": "i"}},
                {"aliases": {"$regex": re.escape(market_name), "$options": "i"}},
            ]
        if state:
            query["state"] = {"$regex": f"^{re.escape(state)}$", "$options": "i"}
        if not query:
            logger.warning("Market search query is empty. Providing at least one search filter is required.")
            return {"error": "Provide at least market_name, state, or lat/long."}
        logger.info("Executing text-search query on available_mandi: %s", query)
        docs = list(coll.find(query).limit(50))
        logger.info("Text-search returned %d markets.", len(docs))
        return {
            "count":     len(docs),
            "mode":      "text_search",
            "markets":   [_serialize_market(d) for d in docs],
            "_raw_docs": docs,
        }

    # ------------------------------------------------------------------
    # Shared core: fetch price/arrival data (used by actions 1-7)
    # ------------------------------------------------------------------
    def _fetch_price_data(
        commodity_list: list[str],
        market_name: Optional[str] = None,
        state: Optional[str] = None,
        lat: Optional[float] = None,
        long: Optional[float] = None,
        nearest_market: bool = False,
        radius_km: Optional[float] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        lookback_days: Optional[int] = None,
        latest_price_fallback: bool = False,
    ) -> dict:
        """
        Orchestrated flow:
          1) Resolve market/APMC via _do_search_markets.
          2) Resolve commodity aliases.
          3) Fetch price records with date filters.
          4) State-wide fallback if no records found at specific market.
        Returns dict with keys: stats, resolution, price_records,
        total_records_returned  — or  error.
        """
        # ── Step 1: resolve market ──────────────────────────────────────
        market_result = _do_search_markets(
            market_name=market_name, state=state,
            lat=lat, long=long,
            nearest_market=nearest_market, radius_km=radius_km,
        )
        if market_result.get("error"):
            return {"error": market_result["error"]}
        raw_docs = market_result.get("_raw_docs") or []
        if not raw_docs:
            label = market_name or state or "the given location"
            return {"error": f"APMC '{label}' is not available."}

        # ── Step 2: resolve commodity ───────────────────────────────────
        resolved = _resolve_commodity_aliases(commodity_list)
        alias_ids = [doc["_id"] for doc in resolved.values() if doc]
        unmatched = [name for name, doc in resolved.items() if not doc]
        if not alias_ids:
            label = market_name or state or "this APMC"
            return {
                "error": f"We do not have {', '.join(commodity_list)} available at {label}.",
                "unresolved_commodities": unmatched,
            }

        mandi_docs = {d["_id"]: d for d in raw_docs}
        market_ids = list(mandi_docs.keys())

        # ── Step 3: fetch price records ─────────────────────────────────
        def _do_fetch(market_ids_arg, alias_ids_arg, state_arg, mandi_docs_arg, ignore_date_filters=False):
            logger.info("Executing _do_fetch | market_ids=%s, alias_ids=%s, state=%s, ignore_date_filters=%s", market_ids_arg, alias_ids_arg, state_arg, ignore_date_filters)
            mc_coll = markets_commodities_col()
            pr_coll = price_records_col()
            resolution_meta: dict[str, Any] = {}

            mc_filter: dict[str, Any] = {
                "commodity_alias_lookup_id": {"$in": alias_ids_arg}
            }
            if state_arg:
                mc_filter["state"] = _norm(state_arg)
            if market_ids_arg:
                mc_filter["market_id"] = {"$in": list(market_ids_arg)}

            logger.info("Querying markets_commodities with filter: %s", mc_filter)
            mc_docs_list = list(mc_coll.find(mc_filter))
            logger.info("Found %d markets_commodities documents.", len(mc_docs_list))
            if not mc_docs_list:
                return {
                    "error": "No markets_commodities entries matched the given filters.",
                    "resolution": resolution_meta,
                }
            mc_by_id = {d["_id"]: d for d in mc_docs_list}

            if mandi_docs_arg is not None:
                mandi_by_id = mandi_docs_arg
            else:
                mandi_coll = available_mandi_col()
                market_oid_set = {d["market_id"] for d in mc_docs_list if d.get("market_id")}
                mandi_by_id: dict[ObjectId, dict] = {}
                if market_oid_set:
                    for m in mandi_coll.find({"_id": {"$in": list(market_oid_set)}}):
                        mandi_by_id[m["_id"]] = m

            pr_query: dict[str, Any] = {"market_commodity_id": {"$in": list(mc_by_id.keys())}}
            date_meta: dict[str, Any] = {}

            if not ignore_date_filters and lookback_days is not None:
                cutoff = _day_start(datetime.now(timezone.utc) - timedelta(days=int(lookback_days) - 1))
                pr_query["date"] = {"$gte": cutoff}
                date_meta = {"mode": "lookback", "lookback_days": lookback_days, "from": cutoff.date().isoformat()}
            elif not ignore_date_filters and (from_date or to_date):
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

            logger.info("Querying price_records with query: %s (limit: %d)", pr_query, PRICE_RECORD_LIMIT)
            raw_records = list(
                pr_coll.find(pr_query).sort("date", -1).limit(PRICE_RECORD_LIMIT)
            )
            logger.info("Found %d raw price records.", len(raw_records))
            formatted: list[dict] = []
            for pr in raw_records:
                mc = mc_by_id.get(pr.get("market_commodity_id"), {})
                mid = mc.get("market_id")
                mkt = mandi_by_id.get(mid) if mid else None
                formatted.append(_serialize_price_record(pr, mc, mkt))

            stats = _compute_stats(formatted)
            return {
                "stats":                  stats,
                "resolution":             resolution_meta,
                "price_records":          formatted[:15],
                "total_records_returned": len(formatted),
            }

        result = _do_fetch(market_ids, alias_ids, state, mandi_docs)

        # ── Step 4: state-wide fallback ─────────────────────────────────
        fallback_state = state or (raw_docs[0].get("state") if raw_docs else None)
        no_records = (
            isinstance(result, dict)
            and (result.get("error") or result.get("total_records_returned", 0) == 0)
        )
        if no_records and fallback_state:
            logger.info("No records found at specific market. Retrying with state-wide fallback for state: '%s'", fallback_state)
            result = _do_fetch(None, alias_ids, fallback_state, None)
            if isinstance(result, dict):
                market_label = market_name or (
                    raw_docs[0].get("name") if raw_docs else "the specified market"
                )
                result.setdefault("resolution", {})["fallback"] = (
                    f"No price records found at '{market_label}'. "
                    f"Showing results from other APMCs in {fallback_state}."
                )

        # ── Step 5: latest-price fallback (for price actions when date filter yields nothing) ──
        still_no_records = (
            isinstance(result, dict)
            and result.get("total_records_returned", 0) == 0
            and not result.get("error")
        )
        date_filter_was_applied = lookback_days is not None or from_date is not None or to_date is not None
        if latest_price_fallback and still_no_records and date_filter_was_applied:
            logger.info(
                "No price records found for the requested date range. "
                "Falling back to latest available price (no date filter)."
            )
            # Re-fetch without any date filter, using market-level result if available,
            # otherwise state-wide.
            latest_result = _do_fetch(market_ids, alias_ids, state, mandi_docs, ignore_date_filters=True)
            if isinstance(latest_result, dict) and latest_result.get("total_records_returned", 0) == 0 and fallback_state:
                latest_result = _do_fetch(None, alias_ids, fallback_state, None, ignore_date_filters=True)
            if isinstance(latest_result, dict) and latest_result.get("total_records_returned", 0) > 0:
                records = latest_result.get("price_records") or []
                latest_date = records[0].get("date") if records else None
                latest_result.setdefault("resolution", {})["latest_price_notice"] = (
                    f"No price data found for the requested date. "
                    f"Showing the latest available price"
                    + (f" (as of {latest_date})" if latest_date else "") + "."
                )
                if latest_date:
                    filtered_records = [r for r in records if r.get("date") == latest_date]
                    latest_result["price_records"] = filtered_records
                    latest_result["total_records_returned"] = len(filtered_records)
                result = latest_result

        # ── Enrich resolution metadata ──────────────────────────────────
        if isinstance(result, dict):
            if lat is not None and long is not None and raw_docs:
                resolution = result.setdefault("resolution", {})
                if "nearest_markets" not in resolution:
                    resolution["nearest_markets"] = [
                        {"name": m.get("name"), "state": m.get("state"), "district": m.get("district")}
                        for m in raw_docs
                    ]
            if unmatched and "error" not in result:
                result.setdefault("resolution", {})["unresolved_commodity_names"] = unmatched

        return result

    # ======================================================================
    # ACTION 1: get_today_price
    # ======================================================================
    def _get_today_price() -> dict:
        if not commodity_name:
            return {"error": "commodity_name is required for action='get_today_price'."}
        c_list = [commodity_name] if isinstance(commodity_name, str) else commodity_name
        result = _fetch_price_data(
            commodity_list=c_list,
            market_name=market_name, state=state,
            lat=lat, long=long,
            nearest_market=nearest_market, radius_km=radius_km,
            lookback_days=1,
            latest_price_fallback=True,
        )
        if not result.get("error"):
            result["action"] = "get_today_price"
            result.pop("stats", None)
        return result

    # ======================================================================
    # ACTION 2: get_price_history
    # ======================================================================
    def _get_price_history() -> dict:
        if not commodity_name:
            return {"error": "commodity_name is required for action='get_price_history'."}
        c_list = [commodity_name] if isinstance(commodity_name, str) else commodity_name
        result = _fetch_price_data(
            commodity_list=c_list,
            market_name=market_name, state=state,
            lat=lat, long=long,
            nearest_market=nearest_market, radius_km=radius_km,
            from_date=from_date, to_date=to_date,
            lookback_days=lookback_days,
            latest_price_fallback=True,
        )
        if not result.get("error"):
            result["action"] = "get_price_history"
            result.pop("stats", None)
        return result

    # ======================================================================
    # ACTION 3: get_price_summary
    # ======================================================================
    def _get_price_summary() -> dict:
        if not commodity_name:
            return {"error": "commodity_name is required for action='get_price_summary'."}
        c_list = [commodity_name] if isinstance(commodity_name, str) else commodity_name
        result = _fetch_price_data(
            commodity_list=c_list,
            market_name=market_name, state=state,
            lat=lat, long=long,
            nearest_market=nearest_market, radius_km=radius_km,
            from_date=from_date, to_date=to_date,
            lookback_days=lookback_days,
            latest_price_fallback=True,
        )
        if result.get("error"):
            return result
        # Return only stats (summary), omit individual records
        return {
            "action":     "get_price_summary",
            "stats":      result.get("stats"),
            "resolution": result.get("resolution"),
            "total_records_analysed": result.get("total_records_returned"),
        }

    # ======================================================================
    # ACTION 4: get_highest_price
    # ======================================================================
    def _get_highest_price() -> dict:
        if not commodity_name:
            return {"error": "commodity_name is required for action='get_highest_price'."}
        c_list = [commodity_name] if isinstance(commodity_name, str) else commodity_name
        result = _fetch_price_data(
            commodity_list=c_list,
            market_name=market_name, state=state,
            lat=lat, long=long,
            nearest_market=nearest_market, radius_km=radius_km,
            from_date=from_date, to_date=to_date,
            lookback_days=lookback_days,
            latest_price_fallback=True,
        )
        if result.get("error"):
            return result
        records = result.get("price_records") or []
        # Sort by max_price descending, then modal_price
        sorted_records = sorted(
            records,
            key=lambda r: (r.get("max_price") or 0, r.get("modal_price") or 0),
            reverse=True,
        )
        return {
            "action":            "get_highest_price",
            "highest_records":   sorted_records[:5],
            "resolution":        result.get("resolution"),
            "total_records_analysed": result.get("total_records_returned"),
        }

    # ======================================================================
    # ACTION 5: get_today_arrival
    # ======================================================================
    def _get_today_arrival() -> dict:
        if not commodity_name:
            return {"error": "commodity_name is required for action='get_today_arrival'."}
        c_list = [commodity_name] if isinstance(commodity_name, str) else commodity_name
        result = _fetch_price_data(
            commodity_list=c_list,
            market_name=market_name, state=state,
            lat=lat, long=long,
            nearest_market=nearest_market, radius_km=radius_km,
            lookback_days=1,
        )
        if result.get("error"):
            return result
        # Focus on arrival data
        records = result.get("price_records") or []
        arrival_records = [
            {
                "date":             r.get("date"),
                "market_name":      r.get("market_name"),
                "state":            r.get("state"),
                "district":         r.get("district"),
                "commodity_name":   r.get("commodity_name"),
                "variety":          r.get("variety"),
                "arrival_quantity": r.get("arrival_quantity"),
            }
            for r in records
        ]
        stats = result.get("stats", {})
        return {
            "action":            "get_today_arrival",
            "arrival_records":   arrival_records,
            "total_arrival_qty": stats.get("overall", {}).get("total_arrival_qty"),
            "avg_arrival_qty":   stats.get("overall", {}).get("avg_arrival_qty"),
            "resolution":        result.get("resolution"),
            "total_records_returned": result.get("total_records_returned"),
        }

    # ======================================================================
    # ACTION 6: get_arrival_history
    # ======================================================================
    def _get_arrival_history() -> dict:
        if not commodity_name:
            return {"error": "commodity_name is required for action='get_arrival_history'."}
        c_list = [commodity_name] if isinstance(commodity_name, str) else commodity_name
        result = _fetch_price_data(
            commodity_list=c_list,
            market_name=market_name, state=state,
            lat=lat, long=long,
            nearest_market=nearest_market, radius_km=radius_km,
            from_date=from_date, to_date=to_date,
            lookback_days=lookback_days,
        )
        if result.get("error"):
            return result
        records = result.get("price_records") or []
        arrival_records = [
            {
                "date":             r.get("date"),
                "market_name":      r.get("market_name"),
                "state":            r.get("state"),
                "district":         r.get("district"),
                "commodity_name":   r.get("commodity_name"),
                "variety":          r.get("variety"),
                "arrival_quantity": r.get("arrival_quantity"),
            }
            for r in records
        ]
        stats = result.get("stats", {})
        return {
            "action":            "get_arrival_history",
            "arrival_records":   arrival_records,
            "total_arrival_qty": stats.get("overall", {}).get("total_arrival_qty"),
            "avg_arrival_qty":   stats.get("overall", {}).get("avg_arrival_qty"),
            "resolution":        result.get("resolution"),
            "total_records_returned": result.get("total_records_returned"),
        }

    # ======================================================================
    # ACTION 7: get_extreme_arrival
    # ======================================================================
    def _get_extreme_arrival() -> dict:
        if not commodity_name:
            return {"error": "commodity_name is required for action='get_extreme_arrival'."}
        c_list = [commodity_name] if isinstance(commodity_name, str) else commodity_name
        result = _fetch_price_data(
            commodity_list=c_list,
            market_name=market_name, state=state,
            lat=lat, long=long,
            nearest_market=nearest_market, radius_km=radius_km,
            from_date=from_date, to_date=to_date,
            lookback_days=lookback_days,
        )
        if result.get("error"):
            return result
        records = result.get("price_records") or []
        order = (sort_order or "highest").strip().lower()
        descending = order != "lowest"
        sorted_records = sorted(
            records,
            key=lambda r: r.get("arrival_quantity") or 0,
            reverse=descending,
        )
        label = "highest" if descending else "lowest"
        return {
            "action":              "get_extreme_arrival",
            "sort_order":          label,
            f"{label}_arrivals":   sorted_records[:5],
            "resolution":          result.get("resolution"),
            "total_records_analysed": result.get("total_records_returned"),
        }

    # ======================================================================
    # ACTION 8: search_markets
    # ======================================================================
    def _action_search_markets() -> dict:
        result = _do_search_markets(
            market_name=market_name, state=state,
            lat=lat, long=long,
            nearest_market=nearest_market, radius_km=radius_km,
        )
        result.pop("_raw_docs", None)
        result["action"] = "search_markets"
        return result

    # ======================================================================
    # ACTION DISPATCHER
    # ======================================================================
    key = (action or "").strip().lower()

    dispatch = {
        "get_today_price":    _get_today_price,
        "get_price_history":  _get_price_history,
        "get_price_summary":  _get_price_summary,
        "get_highest_price":  _get_highest_price,
        "get_today_arrival":  _get_today_arrival,
        "get_arrival_history": _get_arrival_history,
        "get_extreme_arrival": _get_extreme_arrival,
        "search_markets":     _action_search_markets,
    }

    handler = dispatch.get(key)
    if handler:
        return handler()

    return {
        "error": (
            f"Unknown action '{action}'. Choose one of: "
            + ", ".join(sorted(dispatch.keys()))
        )
    }


# --------------------------------------------------------------------------
# Entrypoint
# --------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run(transport="streamable-http")