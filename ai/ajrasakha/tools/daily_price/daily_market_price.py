import math
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
MONGO_DB_NAME   = os.getenv("MARKET_MONGO_DB_NAME") or os.getenv("MONGO_DB_NAME") or "Price"
DEFAULT_TOP_N_NEAREST = int(os.getenv("MARKET_DEFAULT_TOP_N_NEAREST", 5))

# Hard-coded result cap — never return more than this many price records
PRICE_RECORD_LIMIT = 100
# Cap how many markets we load after state+crop narrowing before distance ranking
MAX_CANDIDATE_MARKETS = int(os.getenv("MARKET_MAX_CANDIDATE_MARKETS", 500))
MAX_ACTIONS = int(os.getenv("MARKET_MAX_ACTIONS", "3"))
# Safety timeout for Mongo reads (ms) — prevent MCP session hangs
MONGO_MAX_TIME_MS = int(os.getenv("MARKET_MONGO_MAX_TIME_MS", 10000))

# Standardized / alternate state keys across collections (exact match only).
# markets_commodities often uses "nct of delhi"; available_mandi uses "delhi".
_STATE_SYNONYMS: dict[str, tuple[str, ...]] = {
    "delhi": ("delhi", "nct of delhi"),
    "nct of delhi": ("delhi", "nct of delhi"),
    "kerala": ("kerala", "keralam"),
    "keralam": ("kerala", "keralam"),
    "pondicherry": ("puducherry", "pondicherry"),
    "puducherry": ("puducherry", "pondicherry"),
    "chhattisgarh": ("chhattisgarh", "chattisgarh"),
    "chattisgarh": ("chhattisgarh", "chattisgarh"),
}

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
    action: Union[str, list[str]],
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

      "search_markets"     — Search for mandis/APMCs by name and state (required).
                             Params: state (required), market_name, lat, long,
                             nearest_market, radius_km.
                             commodity_name is optional (filters mandis that
                             trade that commodity).

    Args:
        action        : One action string, or a list of up to 3 action strings from the list above.
                        Single string → legacy single-action response shape.
                        List → {"actions": [...], "results": {<action>: {...}, ...}}.
        commodity_name: Raw commodity name (string) or list of names.
        lat           : Latitude (WGS-84) for nearest-market ranking after state filter.
        long          : Longitude (WGS-84) for nearest-market ranking after state filter.
        nearest_market: True = return multiple nearest markets (up to 5).
                        False = only the single nearest.
        radius_km     : Search radius in kilometres (applied after state narrowing).
        market_name   : Free-text match on market name / aliases.
        state         : Required standardized state name (exact match, no regex).
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

    def _state_exact_values(state: str) -> list[str]:
        """Exact state keys for DB match (no regex), including known synonyms."""
        n = _norm(state)
        if not n:
            return []
        values: list[str] = []
        for key in _STATE_SYNONYMS.get(n, (n,)):
            if key not in values:
                values.append(key)
            titled = " ".join(part.capitalize() for part in key.split())
            if titled not in values:
                values.append(titled)
        return values

    def _mc_state_values(state: str) -> list[str]:
        """Lowercase exact keys for markets_commodities.state."""
        return [v for v in _state_exact_values(state) if v == v.lower()]

    def _require_state(state_val: Optional[str]) -> Optional[dict]:
        if not state_val or not str(state_val).strip():
            return {"error": "state name is not present"}
        return None

    def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        r = 6371.0
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlmb = math.radians(lon2 - lon1)
        a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
        return 2 * r * math.asin(math.sqrt(a))

    def _market_lat_lon(doc: dict) -> Optional[tuple[float, float]]:
        loc = doc.get("location") or {}
        if not isinstance(loc, dict):
            return None
        coords = loc.get("coordinates")
        if not coords or len(coords) < 2:
            return None
        try:
            return float(coords[1]), float(coords[0])
        except (TypeError, ValueError):
            return None

    def _rank_markets_by_distance(
        docs: list[dict],
        lat: float,
        lon: float,
        *,
        nearest_market: bool,
        radius_km: Optional[float],
    ) -> list[dict]:
        scored: list[tuple[float, dict]] = []
        for doc in docs:
            coords = _market_lat_lon(doc)
            if coords is None:
                continue
            dist = _haversine_km(lat, lon, coords[0], coords[1])
            if radius_km is not None and dist > float(radius_km):
                continue
            scored.append((dist, doc))
        scored.sort(key=lambda item: item[0])
        limit = DEFAULT_TOP_N_NEAREST if nearest_market else 1
        return [doc for _, doc in scored[:limit]]

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
            "source_url":    mc.get("source_url"),
            "source_system": mc.get("source_system"),
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
        """Exact alias/canonical match first (indexed); avoid slow regex scans."""
        logger.info("Resolving commodity aliases for input names: %s", names)
        coll = commodity_alias_col()
        results: dict[str, Optional[dict]] = {}
        for raw in names:
            norm = _norm(raw)
            candidates = [norm]
            if isinstance(raw, str) and raw.strip() and raw.strip() not in candidates:
                candidates.append(raw.strip())
            doc = None
            for key in candidates:
                doc = coll.find_one(
                    {"active": True, "$or": [{"canonical_name": key}, {"aliases": key}]},
                    max_time_ms=MONGO_MAX_TIME_MS,
                )
                if doc:
                    break
            results[raw] = doc
            if doc:
                logger.info(
                    "Resolved commodity '%s' to canonical name: '%s' (_id: %s)",
                    raw, doc.get("canonical_name"), doc.get("_id"),
                )
            else:
                logger.warning("Could not resolve commodity alias for input name: '%s'", raw)
        return results

    def _market_name_tokens(market_name: str) -> list[str]:
        """Build searchable market tokens; strip common suffixes like mandi/apmc."""
        raw = (market_name or "").strip()
        if not raw:
            return []
        tokens = [raw]
        cleaned = re.sub(r"\b(mandi|apmc|market)\b", "", raw, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" -_")
        if cleaned and cleaned.lower() not in {t.lower() for t in tokens}:
            tokens.append(cleaned)
        return tokens

    def _date_query(
        *,
        lookback_days_arg: Optional[int] = None,
        from_date_arg: Optional[str] = None,
        to_date_arg: Optional[str] = None,
        ignore_date_filters: bool = False,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """Build price_records date clause + metadata."""
        date_meta: dict[str, Any] = {}
        if ignore_date_filters:
            return {}, {"mode": "all_dates"}
        if lookback_days_arg is not None:
            cutoff = _day_start(datetime.now(timezone.utc) - timedelta(days=int(lookback_days_arg) - 1))
            return {"date": {"$gte": cutoff}}, {
                "mode": "lookback",
                "lookback_days": lookback_days_arg,
                "from": cutoff.date().isoformat(),
            }
        if from_date_arg or to_date_arg:
            date_range: dict[str, Any] = {}
            if from_date_arg:
                fd = _parse_date(from_date_arg)
                date_range["$gte"] = _day_start(fd)
                date_meta["from_date"] = fd.date().isoformat()
            if to_date_arg:
                td = _parse_date(to_date_arg)
                date_range["$lte"] = _day_end(td)
                date_meta["to_date"] = td.date().isoformat()
            date_meta["mode"] = "range"
            return {"date": date_range}, date_meta
        return {}, {"mode": "all_dates"}

    # ------------------------------------------------------------------
    # Market search — state required; exact match; distance in-memory
    # ------------------------------------------------------------------
    def _do_search_markets(
        market_name: Optional[str] = None,
        state: Optional[str] = None,
        lat: Optional[float] = None,
        long: Optional[float] = None,
        nearest_market: bool = False,
        radius_km: Optional[float] = None,
        market_ids: Optional[list[ObjectId]] = None,
    ) -> dict:
        missing = _require_state(state)
        if missing:
            return missing

        logger.info(
            "Searching markets | name=%s, state=%s, lat=%s, long=%s, nearest_market=%s, radius_km=%s, market_ids=%s",
            market_name, state, lat, long, nearest_market, radius_km,
            len(market_ids) if market_ids is not None else None,
        )
        coll = available_mandi_col()
        state_values = _state_exact_values(state or "")
        query: dict[str, Any] = {"state": {"$in": state_values}}
        if market_ids is not None:
            query["_id"] = {"$in": list(market_ids)}
        if market_name:
            or_clauses: list[dict[str, Any]] = []
            for token in _market_name_tokens(market_name):
                or_clauses.append({"name": {"$regex": re.escape(token), "$options": "i"}})
                or_clauses.append({"aliases": {"$regex": re.escape(token), "$options": "i"}})
            query["$or"] = or_clauses

        logger.info("Executing exact-state market query on available_mandi: %s", query)
        cursor = coll.find(query).limit(MAX_CANDIDATE_MARKETS).max_time_ms(MONGO_MAX_TIME_MS)
        docs = list(cursor)
        logger.info("State-filtered available_mandi returned %d markets.", len(docs))
        if not docs:
            return {
                "count": 0,
                "mode": "state_exact",
                "markets": [],
                "_raw_docs": [],
                "error": f"APMC not available for state '{state}'.",
            }

        mode = "state_exact"
        if lat is not None and long is not None:
            ranked = _rank_markets_by_distance(
                docs, float(lat), float(long),
                nearest_market=nearest_market, radius_km=radius_km,
            )
            if ranked:
                docs = ranked
                mode = "state_then_distance"
            else:
                # Keep state hits but cap when no geo coords / outside radius
                limit = DEFAULT_TOP_N_NEAREST if nearest_market else 1
                docs = docs[:limit]
                mode = "state_exact_no_geo_match"
        else:
            limit = 50
            if market_name:
                limit = DEFAULT_TOP_N_NEAREST if nearest_market else min(10, len(docs))
            docs = docs[:limit]

        return {
            "count":     len(docs),
            "mode":      mode,
            "markets":   [_serialize_market(d) for d in docs],
            "_raw_docs": docs,
        }

    # ------------------------------------------------------------------
    # Shared core: state+crop(+date) first, then nearest ranking
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
        Orchestrated flow (avoids $near hangs):
          1) Require standardized state (exact match).
          2) Resolve commodity aliases; narrow by state + crop (+ date).
          3) Location priority cascade (first stage with price rows wins):
               market_name → lat/long nearest → whole state.
          4) Within each stage, optional latest-price fallback if date window empty.
        """
        missing = _require_state(state)
        if missing:
            return missing

        # ── Step 1: resolve commodity ───────────────────────────────────
        resolved = _resolve_commodity_aliases(commodity_list)
        alias_ids = [doc["_id"] for doc in resolved.values() if doc]
        unmatched = [name for name, doc in resolved.items() if not doc]
        if not alias_ids:
            return {
                "error": f"We do not have {', '.join(commodity_list)} available in {state}.",
                "unresolved_commodities": unmatched,
            }

        state_norm_values = _mc_state_values(state or "")
        mc_coll = markets_commodities_col()
        pr_coll = price_records_col()

        # ── Step 2: state + crop on markets_commodities ──────────────────
        mc_filter: dict[str, Any] = {
            "commodity_alias_lookup_id": {"$in": alias_ids},
            "state": {"$in": state_norm_values},
        }
        logger.info("Narrowing markets_commodities by state+crop: %s", mc_filter)
        mc_docs_list = list(mc_coll.find(mc_filter).max_time_ms(MONGO_MAX_TIME_MS))
        logger.info("Found %d markets_commodities for state+crop.", len(mc_docs_list))
        if not mc_docs_list:
            return {
                "error": f"No markets_commodities entries matched crop={commodity_list} in state={state}.",
            }

        candidate_market_ids = list({
            d["market_id"] for d in mc_docs_list if d.get("market_id")
        })
        if not candidate_market_ids:
            return {"error": f"No linked markets found for crop={commodity_list} in state={state}."}

        # ── Step 3: optional date narrowing on price_records ────────────
        date_clause, date_meta = _date_query(
            lookback_days_arg=lookback_days,
            from_date_arg=from_date,
            to_date_arg=to_date,
            ignore_date_filters=False,
        )
        mc_by_id_all = {d["_id"]: d for d in mc_docs_list}
        date_filtered_market_ids = candidate_market_ids
        if date_clause:
            mc_ids = list(mc_by_id_all.keys())
            pr_filter = {"market_commodity_id": {"$in": mc_ids}, **date_clause}
            logger.info(
                "Date-narrowing price_records before geo ranking | filter=%s",
                {**pr_filter, "market_commodity_id": f"$in[{len(mc_ids)}]"},
            )
            # Distinct market_commodity_ids that have rows in the date window
            active_mc_ids = pr_coll.distinct(
                "market_commodity_id",
                pr_filter,
            )
            # pymongo distinct may not take max_time_ms in older versions; wrap safely
            if active_mc_ids:
                date_filtered_market_ids = list({
                    mc_by_id_all[mid]["market_id"]
                    for mid in active_mc_ids
                    if mid in mc_by_id_all and mc_by_id_all[mid].get("market_id")
                })
                logger.info(
                    "Date filter kept %d markets (from %d).",
                    len(date_filtered_market_ids), len(candidate_market_ids),
                )
            else:
                logger.info("Date filter matched no price_records; keeping state+crop market set for ranking.")
                date_filtered_market_ids = candidate_market_ids

        # ── Step 4–7: location priority cascade ─────────────────────────
        # 1) market_name  2) lat/long nearest  3) whole state
        # Stop at the first stage that returns price records.
        def _do_fetch(market_ids_arg, alias_ids_arg, state_arg, mandi_docs_arg, ignore_date_filters=False):
            logger.info(
                "Executing _do_fetch | market_ids=%s, alias_ids=%s, state=%s, ignore_date_filters=%s",
                len(market_ids_arg) if market_ids_arg is not None else None,
                alias_ids_arg, state_arg, ignore_date_filters,
            )
            resolution_meta: dict[str, Any] = {}

            mc_filter_local: dict[str, Any] = {
                "commodity_alias_lookup_id": {"$in": alias_ids_arg},
            }
            if state_arg:
                mc_filter_local["state"] = {"$in": _mc_state_values(state_arg)}
            if market_ids_arg:
                mc_filter_local["market_id"] = {"$in": list(market_ids_arg)}

            logger.info("Querying markets_commodities with filter: %s", {
                **mc_filter_local,
                "market_id": f"$in[{len(market_ids_arg)}]" if market_ids_arg else None,
            })
            mc_docs = list(mc_coll.find(mc_filter_local).max_time_ms(MONGO_MAX_TIME_MS))
            logger.info("Found %d markets_commodities documents.", len(mc_docs))
            if not mc_docs:
                return {
                    "error": "No markets_commodities entries matched the given filters.",
                    "resolution": resolution_meta,
                }
            mc_by_id = {d["_id"]: d for d in mc_docs}

            if mandi_docs_arg is not None:
                mandi_by_id = mandi_docs_arg
            else:
                mandi_coll = available_mandi_col()
                market_oid_set = {d["market_id"] for d in mc_docs if d.get("market_id")}
                mandi_by_id = {}
                if market_oid_set:
                    for m in mandi_coll.find(
                        {"_id": {"$in": list(market_oid_set)}}
                    ).max_time_ms(MONGO_MAX_TIME_MS):
                        mandi_by_id[m["_id"]] = m

            clause, local_date_meta = _date_query(
                lookback_days_arg=lookback_days,
                from_date_arg=from_date,
                to_date_arg=to_date,
                ignore_date_filters=ignore_date_filters,
            )
            pr_query: dict[str, Any] = {"market_commodity_id": {"$in": list(mc_by_id.keys())}, **clause}
            resolution_meta["date_filter"] = local_date_meta

            logger.info("Querying price_records with query: %s (limit: %d)", {
                **pr_query,
                "market_commodity_id": f"$in[{len(mc_by_id)}]",
            }, PRICE_RECORD_LIMIT)
            raw_records = list(
                pr_coll.find(pr_query).sort("date", -1).limit(PRICE_RECORD_LIMIT).max_time_ms(MONGO_MAX_TIME_MS)
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

        def _has_price_rows(payload: Any) -> bool:
            return (
                isinstance(payload, dict)
                and not payload.get("error")
                and int(payload.get("total_records_returned") or 0) > 0
            )

        def _fetch_with_optional_latest(
            market_ids_arg: Optional[list],
            mandi_docs_arg: Optional[dict],
        ) -> dict:
            local = _do_fetch(market_ids_arg, alias_ids, state, mandi_docs_arg, ignore_date_filters=False)
            if _has_price_rows(local):
                return local
            date_filter_was_applied = (
                lookback_days is not None or from_date is not None or to_date is not None
            )
            if latest_price_fallback and date_filter_was_applied:
                logger.info(
                    "No price records in date window for this location stage; "
                    "trying latest available price."
                )
                latest = _do_fetch(
                    market_ids_arg, alias_ids, state, mandi_docs_arg, ignore_date_filters=True,
                )
                if _has_price_rows(latest):
                    records = latest.get("price_records") or []
                    latest_date = records[0].get("date") if records else None
                    latest.setdefault("resolution", {})["latest_price_notice"] = (
                        "No price data found for the requested date. "
                        "Showing the latest available price"
                        + (f" (as of {latest_date})" if latest_date else "") + "."
                    )
                    if latest_date:
                        filtered_records = [r for r in records if r.get("date") == latest_date]
                        latest["price_records"] = filtered_records
                        latest["total_records_returned"] = len(filtered_records)
                    return latest
            return local

        stages: list[tuple[str, Optional[str], Optional[float], Optional[float], bool]] = []
        # (priority_label, market_name, lat, lon, nearest_market)
        if market_name and str(market_name).strip():
            stages.append(("market_name", market_name, None, None, False))
        if lat is not None and long is not None:
            stages.append(("lat_long", None, lat, long, nearest_market if nearest_market else True))
        stages.append(("state", None, None, None, False))

        result: dict[str, Any] = {"error": "No price records found."}
        raw_docs: list[dict] = []
        chosen_stage: Optional[str] = None
        market_result: dict[str, Any] = {}
        tried: list[str] = []

        for priority_label, stage_market, stage_lat, stage_lon, stage_nearest in stages:
            tried.append(priority_label)
            logger.info(
                "Location priority stage=%s | market_name=%s lat=%s long=%s",
                priority_label, stage_market, stage_lat, stage_lon,
            )
            if priority_label == "state":
                # Whole-state commodity markets (no mandi name / geo narrowing)
                stage_result = _fetch_with_optional_latest(None, None)
                if _has_price_rows(stage_result):
                    result = stage_result
                    chosen_stage = priority_label
                    raw_docs = []
                    market_result = {"mode": "state_wide"}
                    if len(tried) > 1:
                        result.setdefault("resolution", {})["fallback"] = (
                            f"No price records for prior location filters "
                            f"({', '.join(tried[:-1])}). Showing results from APMCs in {state}."
                        )
                    break
                result = stage_result
                continue

            market_result = _do_search_markets(
                market_name=stage_market,
                state=state,
                lat=stage_lat,
                long=stage_lon,
                nearest_market=stage_nearest,
                radius_km=radius_km if priority_label == "lat_long" else None,
                market_ids=date_filtered_market_ids,
            )
            stage_docs = market_result.get("_raw_docs") or []
            if not stage_docs:
                logger.info("Stage %s found 0 markets; trying next priority.", priority_label)
                continue

            stage_mandi = {d["_id"]: d for d in stage_docs}
            stage_ids = list(stage_mandi.keys())
            stage_result = _fetch_with_optional_latest(stage_ids, stage_mandi)
            if _has_price_rows(stage_result):
                result = stage_result
                chosen_stage = priority_label
                raw_docs = stage_docs
                if len(tried) > 1:
                    result.setdefault("resolution", {})["fallback"] = (
                        f"Used location priority '{priority_label}' after "
                        f"{', '.join(tried[:-1])} returned no price records."
                    )
                break
            logger.info(
                "Stage %s returned 0 price records; trying next priority.",
                priority_label,
            )
            result = stage_result
            raw_docs = stage_docs

        if isinstance(result, dict):
            resolution = result.setdefault("resolution", {})
            resolution["date_filter"] = resolution.get("date_filter") or date_meta
            resolution["selection_mode"] = (
                f"priority_{chosen_stage}" if chosen_stage else market_result.get("mode")
            )
            resolution["location_priority_tried"] = tried
            if chosen_stage:
                resolution["location_priority_used"] = chosen_stage
            if raw_docs:
                resolution["nearest_markets"] = [
                    {
                        "name": m.get("name"),
                        "state": m.get("state"),
                        "district": m.get("district"),
                    }
                    for m in raw_docs
                ]
            if unmatched and "error" not in result:
                resolution["unresolved_commodity_names"] = unmatched

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
        # When no explicit date range is provided, scope to today's data only
        # (with latest-price fallback so the farmer always sees something).
        # This prevents returning a stale historical high as the "best price".
        effective_lookback = lookback_days
        if effective_lookback is None and from_date is None and to_date is None:
            effective_lookback = 1
        result = _fetch_price_data(
            commodity_list=c_list,
            market_name=market_name, state=state,
            lat=lat, long=long,
            nearest_market=nearest_market, radius_km=radius_km,
            from_date=from_date, to_date=to_date,
            lookback_days=effective_lookback,
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

    def _normalize_action_list(raw: Union[str, list[str], None]) -> list[str]:
        if raw is None:
            return []
        items = [raw] if isinstance(raw, str) else list(raw)
        seen: set[str] = set()
        out: list[str] = []
        for item in items:
            key = (str(item) if item is not None else "").strip().lower()
            if not key or key in seen:
                continue
            seen.add(key)
            out.append(key)
            if len(out) >= MAX_ACTIONS:
                break
        return out

    actions = _normalize_action_list(action)
    multi_mode = isinstance(action, list)

    if not actions:
        return {"error": "action is required"}

    if not multi_mode and len(actions) == 1:
        key = actions[0]
        handler = dispatch.get(key)
        if handler:
            return handler()
        return {
            "error": (
                f"Unknown action '{key}'. Choose one of: "
                + ", ".join(sorted(dispatch.keys()))
            )
        }

    results: dict[str, dict] = {}
    for key in actions:
        handler = dispatch.get(key)
        if handler:
            try:
                results[key] = handler()
            except Exception as exc:
                logger.exception("mandi_price_tool action=%s failed", key)
                results[key] = {"error": str(exc), "action": key}
        else:
            results[key] = {
                "error": (
                    f"Unknown action '{key}'. Choose one of: "
                    + ", ".join(sorted(dispatch.keys()))
                ),
                "action": key,
            }

    return {"actions": actions, "results": results}


# --------------------------------------------------------------------------
# Entrypoint
# --------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run(transport="streamable-http")
