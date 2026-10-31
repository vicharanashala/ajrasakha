"""
Daily mandi price MCP tool — v2 data model.

Same actions, inputs and output shape as tools/daily_price (v1). What differs is
how a crop becomes a set of listings:

  v1: farmer's crop → commodity_alias_lookup group (guessed aliases) →
      markets_commodities.commodity_alias_lookup_id, then name filters.
  v2: farmer's crop → product (crops / products / approved crop_names) →
      listings.product_id. Only person-approved links are used; there is no
      fuzzy matching and nothing to filter afterwards.

States are matched through the `states` collection (every known spelling of a
state), and listings point at available_mandi through listings.mandi_id.
Reads the v2 database (MARKET_MONGO_DB_NAME, default "PriceV2").
"""
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
MONGO_DB_NAME   = os.getenv("MARKET_MONGO_DB_NAME") or "PriceV2"
# v2 collections can live next to v1 in the same database with a prefix (e.g. "v2_").
# available_mandi is shared with v1 and never prefixed: v2 only reads it.
V2_PREFIX       = (os.getenv("MARKET_V2_COLLECTION_PREFIX") or "").strip()
MANDI_COLLECTION = (os.getenv("MARKET_MANDI_COLLECTION") or "available_mandi").strip()
DEFAULT_TOP_N_NEAREST = int(os.getenv("MARKET_DEFAULT_TOP_N_NEAREST", 5))

# Hard-coded result cap — never return more than this many price records
PRICE_RECORD_LIMIT = 100
# Cap how many markets we load after state+crop narrowing before distance ranking
MAX_CANDIDATE_MARKETS = int(os.getenv("MARKET_MAX_CANDIDATE_MARKETS", 500))
MAX_ACTIONS = int(os.getenv("MARKET_MAX_ACTIONS", "3"))
# When the user's lat/long is known, never serve prices from a mandi farther than this
# (km) unless the caller passed an explicit radius_km.
DEFAULT_MAX_RADIUS_KM = float(os.getenv("MARKET_DEFAULT_MAX_RADIUS_KM", 50))
# Safety timeout for Mongo reads (ms) — prevent MCP session hangs
MONGO_MAX_TIME_MS = int(os.getenv("MARKET_MONGO_MAX_TIME_MS", 10000))

ARRIVAL_AGMARKNET_NOTICE = "Data.gov.in does not provide arrival quantity for agmarknet"

# Standardized / alternate state keys across collections (exact match only).
# markets_commodities often uses "nct of delhi"; available_mandi uses "delhi".
_STATE_SYNONYMS: dict[str, tuple[str, ...]] = {
    "delhi": ("delhi", "nct of delhi"),
    "nct of delhi": ("delhi", "nct of delhi"),
    "nct delhi": ("delhi", "nct of delhi"),
    "kerala": ("kerala", "keralam"),
    "keralam": ("kerala", "keralam"),
    "pondicherry": ("puducherry", "pondicherry"),
    "puducherry": ("puducherry", "pondicherry"),
    "chhattisgarh": ("chhattisgarh", "chattisgarh"),
    "chattisgarh": ("chhattisgarh", "chattisgarh"),
    "andaman and nicobar": ("andaman and nicobar", "andaman and nicobar islands"),
    "andaman and nicobar islands": ("andaman and nicobar", "andaman and nicobar islands"),
    "andaman & nicobar": ("andaman and nicobar", "andaman and nicobar islands"),
    "andaman & nicobar islands": ("andaman and nicobar", "andaman and nicobar islands"),
    "odisha": ("odisha", "orissa"),
    "orissa": ("odisha", "orissa"),
    "uttarakhand": ("uttarakhand", "uttaranchal"),
    "uttaranchal": ("uttarakhand", "uttaranchal"),
    "jammu and kashmir": ("jammu and kashmir", "jammu & kashmir"),
    "jammu & kashmir": ("jammu and kashmir", "jammu & kashmir"),
    "dadra and nagar haveli": ("dadra and nagar haveli", "dadra and nagar haveli and daman and diu"),
    "daman and diu": ("daman and diu", "dadra and nagar haveli and daman and diu"),
    "dadra and nagar haveli and daman and diu": (
        "dadra and nagar haveli",
        "daman and diu",
        "dadra and nagar haveli and daman and diu",
    ),
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
    """v2: listings (same _id and fields as v1 markets_commodities, plus product_id / mandi_id / state_code)."""
    return get_db()[f"{V2_PREFIX}listings"]

def price_records_col() -> Collection:
    return get_db()[f"{V2_PREFIX}price_records"]

def available_mandi_col() -> Collection:
    return get_db()[MANDI_COLLECTION]

def crops_col() -> Collection:
    return get_db()[f"{V2_PREFIX}crops"]

def products_col() -> Collection:
    return get_db()[f"{V2_PREFIX}products"]

def crop_names_col() -> Collection:
    return get_db()[f"{V2_PREFIX}crop_names"]

def states_col() -> Collection:
    return get_db()[f"{V2_PREFIX}states"]


# --------------------------------------------------------------------------
# MCP Server
# --------------------------------------------------------------------------
mcp = FastMCP(
    "ajrasakha-daily-price-v2-mcp",
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=False
    )
)

_SOURCE_SYSTEM_DISPLAY_NAMES: dict[str, str] = {
    "agmark": "Agmarknet",
    "agmarknet": "Agmarknet",
    "enam": "eNAM",
    "ajrasakhaagmarknet": "Agmarknet",
    "ajrasakhaagmark": "Agmarknet",
}


def _normalize_source_system_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.strip().lower())


def display_source_system(value: Any) -> Optional[str]:
    """Map DB source_system codes to farmer-facing names (e.g. agmark → Agmarknet)."""
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    key = _normalize_source_system_key(raw)
    if key in _SOURCE_SYSTEM_DISPLAY_NAMES:
        return _SOURCE_SYSTEM_DISPLAY_NAMES[key]
    if key.startswith("agmark"):
        return "Agmarknet"
    if key.startswith("enam"):
        return "eNAM"
    return raw


def _norm(value: Optional[str]) -> Optional[str]:
    if not isinstance(value, str):
        return None
    cleaned = value.strip().lower()
    return cleaned or None


def _clean_commodity_token(value: Optional[str]) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"[^a-z0-9]", "", value.strip().lower())


def _commodity_word_key(value: Optional[str]) -> frozenset:
    """Order- and punctuation-insensitive key: "dry ginger" == "ginger(dry)" == "Ginger (Dry)"."""
    if not isinstance(value, str):
        return frozenset()
    return frozenset(re.sub(r"[^a-z0-9]+", " ", value.lower()).split())


# Qualifiers that only label the ordinary form of a crop ("paddy(common)", "rose(local)").
# Qualifiers like red/dry/green/basmati name a different product and are NOT listed here.
_GENERIC_COMMODITY_QUALIFIERS = frozenset({"common", "local", "general", "ordinary", "normal", "regular"})


def _commodity_base_key(value: Optional[str]) -> frozenset:
    """Word key without generic qualifiers: "paddy(common)" == "paddy", "chilli(red)" != "chilli"."""
    words = _commodity_word_key(value)
    return (words - _GENERIC_COMMODITY_QUALIFIERS) or words


def _norm_commodity_name(
    value: Optional[Union[str, list[str]]],
) -> Optional[Union[str, list[str]]]:
    if value is None:
        return None
    if isinstance(value, list):
        normalized = [_norm(str(item)) for item in value]
        out = [item for item in normalized if item]
        return out or None
    return _norm(str(value))


# --------------------------------------------------------------------------
# Mandi name matching
# --------------------------------------------------------------------------

# Words that only say "this is a market"; they are not part of a mandi's identity, so
# "apmc bilasipara", "Bilasipara mandi" and "bilasipara apmc" all reduce to "bilasipara".
_MARKET_GENERIC_WORDS = frozenset({
    "apmc", "apmcs", "mandi", "mandis", "mandai", "market", "markets", "mkt",
    "hat", "hats", "haat", "haats", "bazar", "bazaar", "bazars", "bajar", "yard",
    "sabzi", "sabji", "subzi", "krishi", "krushi", "upaj", "utpanna", "anaj", "galla",
    "grain", "vegetable", "vegetables", "veg", "fruit", "fruits",
    "samiti", "committee", "regulated", "agricultural", "agriculture", "produce", "marketing",
    "the", "of", "at", "in", "near",
})

# Match strength, strongest first. Only the strongest tier found is returned.
_NAME_MATCH_EXACT = 4      # same words in any order, or same letters ("bilasi para" / "bilasipara")
_NAME_MATCH_CONTAINS = 3   # mandi name adds a qualifier ("pamohi" -> "pamohi(garchuk) apmc")
_NAME_MATCH_FUZZY = 2      # spelling variant ("bilashipara" -> "bilasipara apmc")
_NAME_MATCH_PARTIAL = 1    # query adds words the mandi name lacks ("bilasipara dhubri" -> "bilasipara apmc")
_NAME_MATCH_LABELS = {
    _NAME_MATCH_EXACT: "exact",
    _NAME_MATCH_CONTAINS: "contains",
    _NAME_MATCH_FUZZY: "fuzzy",
    _NAME_MATCH_PARTIAL: "partial",
}


def _market_core_tokens(value: Optional[str]) -> tuple[str, ...]:
    """Identity words of a mandi name, in order, without generic market words."""
    if not isinstance(value, str):
        return ()
    words = re.findall(r"[^\W_]+", value.lower())
    return tuple(w for w in words if w not in _MARKET_GENERIC_WORDS)


def _within_edit_distance(a: str, b: str, limit: int) -> bool:
    """True when Levenshtein(a, b) <= limit (banded, stops early)."""
    if abs(len(a) - len(b)) > limit:
        return False
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i] + [0] * len(b)
        for j, cb in enumerate(b, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb))
        if min(cur) > limit:
            return False
        prev = cur
    return prev[-1] <= limit


def _spelling_variant(a: str, b: str) -> bool:
    """Transliteration-level spelling difference ("ropar"/"rupar", "azadpur"/"azaadpur")."""
    shorter = min(len(a), len(b))
    if shorter < 4:
        return False
    return _within_edit_distance(a, b, 1 if shorter <= 7 else 2)


def _name_match_score(query_core: tuple[str, ...], cand_core: tuple[str, ...]) -> int:
    if not query_core or not cand_core:
        return 0
    q, c = set(query_core), set(cand_core)
    if q == c or "".join(query_core) == "".join(cand_core):
        return _NAME_MATCH_EXACT
    if q < c:
        return _NAME_MATCH_CONTAINS
    if _spelling_variant("".join(query_core), "".join(cand_core)):
        return _NAME_MATCH_FUZZY
    unused = list(cand_core)
    for token in query_core:
        hit = next((u for u in unused if u == token or _spelling_variant(token, u)), None)
        if hit is None:
            break
        unused.remove(hit)
    else:
        return _NAME_MATCH_FUZZY
    if c < q and sum(len(t) for t in c) >= 4:
        return _NAME_MATCH_PARTIAL
    return 0


def _doc_name_variants(doc: dict) -> list[str]:
    names = [doc.get("name")] + list(doc.get("aliases") or [])
    return [n for n in names if isinstance(n, str) and n.strip()]


def _rank_markets_by_name(
    docs: list[dict],
    market_name: str,
    *,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    limit: int = 5,
) -> tuple[list[dict], dict[str, Any]]:
    """Best-matching mandis for a farmer-typed name, plus how they matched.

    Word order, generic words (APMC/mandi/market/haat...), punctuation and small
    spelling differences are ignored. Only the strongest match tier is kept, so
    "kurnool" returns "kurnool apmc" and not "nagarkurnool apmc". Ties are ordered by
    closeness of the name, then by distance from (lat, lon) when given.
    """
    query_core = _market_core_tokens(market_name)
    meta: dict[str, Any] = {"query": market_name, "match_type": None, "ambiguous": False, "candidates": []}
    if not query_core:
        return [], meta

    scored: list[tuple[int, int, dict]] = []
    for doc in docs:
        best_score, best_extra = 0, 0
        for variant in _doc_name_variants(doc):
            core = _market_core_tokens(variant)
            score = _name_match_score(query_core, core)
            extra = len(set(core) ^ set(query_core))
            if score > best_score or (score == best_score and score and extra < best_extra):
                best_score, best_extra = score, extra
        if best_score:
            scored.append((best_score, best_extra, doc))
    if not scored:
        return [], meta

    top = max(s for s, _, _ in scored)
    hits = [(extra, doc) for s, extra, doc in scored if s == top]
    if top <= _NAME_MATCH_FUZZY:
        # Weak tiers: keep only the closest names, not every loosely similar mandi.
        closest = min(extra for extra, _ in hits)
        hits = [(extra, doc) for extra, doc in hits if extra == closest]

    def _sort_key(item: tuple[int, dict]) -> tuple:
        extra, doc = item
        dist = 0.0
        coords = (doc.get("location") or {}).get("coordinates") if isinstance(doc.get("location"), dict) else None
        if lat is not None and lon is not None and coords and len(coords) >= 2:
            dist = math.hypot(float(coords[1]) - lat, float(coords[0]) - lon)
        return (extra, dist, str(doc.get("name") or ""))

    hits.sort(key=_sort_key)
    matched = [doc for _, doc in hits[:limit]]
    # One display name per distinct mandi ("azadpur apmc" and "apmc azadpur" are one).
    candidates: dict[frozenset, str] = {}
    for d in matched:
        candidates.setdefault(frozenset(_market_core_tokens(d.get("name"))), d.get("name"))
    meta.update(
        match_type=_NAME_MATCH_LABELS[top],
        ambiguous=len(candidates) > 1,
        candidates=list(candidates.values()),
    )
    return matched, meta


def _display_place(value: Optional[str]) -> str:
    text = str(value or "").strip().title()
    return re.sub(r"\bApmc\b", "APMC", text)


def _join_display(values: list[Optional[str]]) -> str:
    names: list[str] = []
    for value in values:
        name = _display_place(value)
        if name and name not in names:
            names.append(name)
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


# --------------------------------------------------------------------------
# District matching
# --------------------------------------------------------------------------

_DISTRICT_GENERIC_WORDS = frozenset({"district", "dist", "zila", "zilla", "jila", "jilla"})


def _district_name_keys(value: Optional[str]) -> set[tuple[str, ...]]:
    """Words of each name a district goes by: "Ropar (Rupnagar)" -> {("ropar", "rupnagar"), ("ropar",), ("rupnagar",)}."""
    if not isinstance(value, str):
        return set()
    text = value.lower()
    parts = [text, re.sub(r"\(.*?\)", " ", text), *re.findall(r"\((.*?)\)", text)]
    keys: set[tuple[str, ...]] = set()
    for part in parts:
        words = tuple(w for w in re.findall(r"[^\W_]+", part) if w not in _DISTRICT_GENERIC_WORDS)
        if words:
            keys.add(words)
    return keys


def _same_district(a: Optional[str], b: Optional[str]) -> bool:
    """Same district despite case, "district" suffix, bracketed alt names or small spelling differences.

    Spelling is compared word by word so "North 24 Parganas" and "South 24 Parganas" stay apart.
    """
    for ka in _district_name_keys(a):
        for kb in _district_name_keys(b):
            if "".join(ka) == "".join(kb):
                return True
            if len(ka) == len(kb) and all(x == y or _spelling_variant(x, y) for x, y in zip(ka, kb)):
                return True
    return False


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
    district: Optional[str] = None,
    search_by_apmc: Optional[bool] = False,
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

      "get_highest_price"  — Find the highest/best commodity price.
                             Params: commodity_name (required), market_name,
                             state, lat, long, nearest_market, radius_km,
                             from_date, to_date OR lookback_days.

      "get_lowest_price"   — Find the lowest/cheapest commodity price.
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

      "get_price_with_nearby" — Named mandi's latest/date price AND prices from nearby markets.
                             Params: commodity_name (required), market_name (required),
                             state, lat, long, radius_km, from_date, to_date OR lookback_days.

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
        district      : The farmer's own district. When given with a named mandi
                        (search_by_apmc=True), a mandi outside this district is
                        refused with error_code MARKET_OUTSIDE_DISTRICT.
        search_by_apmc: True = user asked for specific APMC/mandi/market/haat.
                        False = query asked for location/district without APMC keyword (search by district only, fallback to lat/long).
        from_date     : Inclusive start date (e.g. "27-Jun-2025", "2025-06-27").
        to_date       : Inclusive end date.
        lookback_days : Fetch records from the past N days.
        sort_by       : Field to sort extreme queries by ("price" or "arrival").
        sort_order    : Direction for extreme queries ("highest" or "lowest").
    """
    state = _norm(state)
    district = _norm(district)
    market_name = _norm(market_name)
    commodity_name = _norm_commodity_name(commodity_name)
    tool_search_by_apmc = bool(search_by_apmc)

    logger.info(
        "mandi_price_tool called | action=%s, commodity_name=%s, market_name=%s, state=%s, district=%s, lat=%s, long=%s, nearest_market=%s, radius_km=%s, search_by_apmc=%s, from_date=%s, to_date=%s, lookback_days=%s, sort_by=%s, sort_order=%s",
        action, commodity_name, market_name, state, district, lat, long, nearest_market, radius_km, tool_search_by_apmc, from_date, to_date, lookback_days, sort_by, sort_order
    )

    # ======================================================================
    # NESTED HELPERS
    # ======================================================================

    def _state_exact_values_v1(state: str) -> list[str]:
        """Exact lowercase state keys for DB match, including known synonyms."""
        n = _norm(state)
        if not n:
            return []
        values: list[str] = []
        for key in _STATE_SYNONYMS.get(n, (n,)):
            if key not in values:
                values.append(key)
        return values

    def _state_exact_values(state: str) -> list[str]:
        """Every known spelling of the state (states.spellings), lower-case."""
        n = _norm(state) or ""
        if not n:
            return []
        doc = states_col().find_one({"$or": [{"spellings": n}, {"name": n}, {"_id": n}]}, {"spellings": 1, "name": 1})
        if not doc:
            return _state_exact_values_v1(state)
        return sorted({_norm(v) for v in [doc.get("name"), *(doc.get("spellings") or [])] if _norm(v)})

    def _mc_state_values(state: str) -> list[str]:
        """Lowercase exact keys for listings.state (and available_mandi.state)."""
        return _state_exact_values(state)

    def _require_state(state_val: Optional[str]) -> Optional[dict]:
        if not state_val or not str(state_val).strip():
            return {"error": "state name is not present", "error_code": "STATE_REQUIRED"}
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
        # Strip ordinal suffixes e.g. "19th" -> "19", "1st" -> "1"
        value_clean = re.sub(r"(\d+)(?:st|nd|rd|th)\b", r"\1", value, flags=re.IGNORECASE)
        value_n = value_clean.replace("/", "-").replace(" ", "-")
        fmts = [
            "%d-%b-%Y",   # 27-Jun-2025
            "%d-%B-%Y",   # 27-June-2025
            "%d-%m-%Y",   # 27-06-2025
            "%Y-%m-%d",   # 2025-06-27
            "%B-%d-%Y",   # June-27-2025
            "%b-%d-%Y",   # Jun-27-2025
            "%d-%b",      # 27-Jun  (no year)
            "%d-%B",      # 27-June (no year)
            "%B-%d",      # June-27 (no year)
            "%b-%d",      # Jun-27  (no year)
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
            "source_system": display_source_system(mc.get("source_system")),
            "modal_price":      _round2(pr.get("modal_price")),
            "min_price":        _round2(pr.get("min_price")),
            "max_price":        _round2(pr.get("max_price")),
            "arrival_quantity": _round2(pr.get("arrival_quantity")),
        }
        return record

    def _extract_source_systems(records: list[dict]) -> list[str]:
        """Unique non-empty source_system values from price records (stable order)."""
        seen: list[str] = []
        for record in records:
            source = record.get("source_system")
            if not source:
                continue
            source_str = str(source).strip()
            if source_str and source_str not in seen:
                seen.append(source_str)
        return seen

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

    def _resolve_commodity_aliases(names: list[str]) -> dict[str, list[dict]]:
        """Farmer's words → products (v2). Exact after lower-case/space normalising:

          1. a product name            → that product
          2. a crop name               → the crop's default product
          3. an approved mandi name for a crop (crop_names.raw_name, status approved)
                                       → its product

        Only active crops/products and approved links count. Returns
        {name: [{"_id": product_id, "canonical_name": product name, "crop_name": ...}]}.
        """
        results: dict[str, list[dict]] = {}
        for raw in names:
            norm = _norm(raw) or ""
            norm = re.sub(r"\s+", " ", norm)
            found: dict = {}
            if norm:
                for p in products_col().find({"name": norm, "active": {"$ne": False}}).max_time_ms(MONGO_MAX_TIME_MS):
                    found[p["_id"]] = p
                for c in crops_col().find({"name": norm, "active": {"$ne": False}}).max_time_ms(MONGO_MAX_TIME_MS):
                    if c.get("default_product_id"):
                        p = products_col().find_one({"_id": c["default_product_id"], "active": {"$ne": False}})
                        if p:
                            found[p["_id"]] = p
                if not found:
                    pids = crop_names_col().distinct(
                        "product_id", {"raw_name": norm, "status": "approved", "product_id": {"$ne": None}},
                        maxTimeMS=MONGO_MAX_TIME_MS,
                    )
                    for p in products_col().find({"_id": {"$in": pids}, "active": {"$ne": False}}):
                        found[p["_id"]] = p
            crop_names = {c["_id"]: c.get("name") for c in crops_col().find(
                {"_id": {"$in": [p.get("crop_id") for p in found.values()]}}, {"name": 1})}
            docs = [{"_id": pid, "canonical_name": p.get("name"), "crop_name": crop_names.get(p.get("crop_id"))}
                    for pid, p in found.items()]
            results[raw] = docs
            if docs:
                logger.info("Resolved commodity '%s' to products: %s", raw, [d["canonical_name"] for d in docs])
            else:
                logger.warning("No approved product for input name: '%s'", raw)
        return results

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
    # Farmer's district (named mandis must be inside it)
    # ------------------------------------------------------------------
    user_district_cache: dict[str, set[str]] = {}

    def _user_district_values() -> set[str]:
        """available_mandi district values (lowercase) in the state that are the farmer's district.

        Empty when no district was given or it matches none of the state's mandi
        districts; the district restriction is then not applied.
        """
        if "values" not in user_district_cache:
            values: set[str] = set()
            if district and state:
                for value in available_mandi_col().distinct(
                    "district", {"state": {"$in": _mc_state_values(state)}}, maxTimeMS=MONGO_MAX_TIME_MS,
                ):
                    if isinstance(value, str) and _same_district(value, district):
                        values.add(value.strip().lower())
                if not values:
                    logger.info("District %r matches no mandi district in %s; not restricting.", district, state)
            user_district_cache["values"] = values
        return user_district_cache["values"]

    def _in_user_district(doc: dict) -> bool:
        return str(doc.get("district") or "").strip().lower() in _user_district_values()

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
        state_values = _mc_state_values(state or "")
        query: dict[str, Any] = {"state": {"$in": state_values}}
        if market_ids is not None:
            query["_id"] = {"$in": list(market_ids)}
        has_geo_arg = lat is not None and long is not None

        logger.info("Executing exact-state market query on available_mandi: %s", {
            **query, **({"_id": f"$in[{len(market_ids)}]"} if market_ids is not None else {}),
        })
        cursor = coll.find(query).max_time_ms(MONGO_MAX_TIME_MS)
        if not market_name and not has_geo_arg:
            # Name matching and distance ranking need every mandi in the state
            # (a state has at most a few hundred); plain listings stay capped.
            cursor = cursor.limit(MAX_CANDIDATE_MARKETS)
        docs = list(cursor)
        logger.info("State-filtered available_mandi returned %d markets.", len(docs))

        if market_name:
            rank_kw = {
                "lat": float(lat) if has_geo_arg else None,
                "lon": float(long) if has_geo_arg else None,
                "limit": DEFAULT_TOP_N_NEAREST,
            }
            matched, name_meta = _rank_markets_by_name(docs, market_name, **rank_kw)
            local = [d for d in matched if _in_user_district(d)] if district else []
            if local and len(local) < len(matched):
                # Same-name mandis elsewhere in the state: keep the farmer's district ones.
                matched, name_meta = _rank_markets_by_name(local, market_name, **rank_kw)
            logger.info("Mandi name match for %r in %s: %s", market_name, state, name_meta)
            if not matched:
                return {
                    "count": 0,
                    "mode": "name_match",
                    "markets": [],
                    "_raw_docs": [],
                    "name_match": name_meta,
                    "error": f"Market '{market_name}' was not found in {_display_place(state)}.",
                    "error_code": "MARKET_NOT_FOUND",
                }
            return {
                "count":      len(matched),
                "mode":       "name_match",
                "markets":    [_serialize_market(d) for d in matched],
                "_raw_docs":  matched,
                "name_match": name_meta,
            }

        if not docs:
            return {
                "count": 0,
                "mode": "state_exact",
                "markets": [],
                "_raw_docs": [],
                "error": f"APMC not available for state '{state}'.",
                "error_code": "MARKET_NOT_FOUND",
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
            elif radius_km is not None:
                # Nothing within the radius — do not fall back to arbitrary far-away mandis.
                return {
                    "count": 0,
                    "mode": "no_market_within_radius",
                    "markets": [],
                    "_raw_docs": [],
                    "error": f"No market found within {radius_km:g} km in '{state}'.",
                    "error_code": "MARKET_NOT_FOUND",
                }
            else:
                # Keep state hits but cap when no geo coords
                limit = DEFAULT_TOP_N_NEAREST if nearest_market else 1
                docs = docs[:limit]
                mode = "state_exact_no_geo_match"
        else:
            docs = docs[:50]

        return {
            "count":     len(docs),
            "mode":      mode,
            "markets":   [_serialize_market(d) for d in docs],
            "_raw_docs": docs,
        }

    # ------------------------------------------------------------------
    # District resolution: find all APMCs in a named district
    # ------------------------------------------------------------------
    def _resolve_district_markets(
        district_name: str,
        state_val: Optional[str],
    ) -> list[dict]:
        """Return available_mandi docs whose 'district' field matches district_name.

        Handles compound inputs like "ropar (rupnagar)" by trying multiple candidate
        tokens: the full string, the part before the parenthesis, and the content
        inside the parenthesis — e.g. ["ropar (rupnagar)", "ropar", "rupnagar"].
        Returns on the first candidate that yields results.

        Used as a fallback when market_name does not resolve to any mandi by
        name/alias but might be a district (e.g. "rupnagar" → "ropar apmc",
        "anandpur sahib apmc", etc.).  Caller ranks by distance when
        lat/long is available.
        """
        if not district_name or not state_val:
            return []
        coll = available_mandi_col()
        state_values = _mc_state_values(state_val)

        # Build candidate district tokens to try in order
        raw = district_name.strip().lower()
        candidates: list[str] = [raw]
        # Part before parenthesis: "ropar (rupnagar)" → "ropar"
        before_paren = re.sub(r"\s*\(.*?\)", "", raw).strip()
        if before_paren and before_paren not in candidates:
            candidates.append(before_paren)
        # Part inside parenthesis: "ropar (rupnagar)" → "rupnagar"
        paren_match = re.search(r"\((.+?)\)", raw)
        if paren_match:
            inside = paren_match.group(1).strip()
            if inside and inside not in candidates:
                candidates.append(inside)
        # Without market words: "cuddalore mandi" -> "cuddalore"
        core = " ".join(_market_core_tokens(raw))
        if core and core not in candidates:
            candidates.append(core)

        logger.info(
            "_resolve_district_markets: candidates=%r state=%r", candidates, state_val,
        )
        for candidate in candidates:
            query: dict[str, Any] = {
                "state": {"$in": state_values},
                "district": {"$regex": re.escape(candidate), "$options": "i"},
            }
            docs = list(
                coll.find(query).limit(MAX_CANDIDATE_MARKETS).max_time_ms(MONGO_MAX_TIME_MS)
            )
            logger.info(
                "_resolve_district_markets: candidate=%r → %d mandis", candidate, len(docs),
            )
            if docs:
                return docs
        return []

    def _named_mandi_outside_district() -> Optional[dict]:
        """Error when the farmer named a mandi (or a district's mandis) outside their own district."""
        if not (tool_search_by_apmc and market_name and state and district):
            return None
        if market_name in {"all", "general", "any"} or not _user_district_values():
            return None
        by_name = _do_search_markets(market_name=market_name, state=state, lat=lat, long=long)
        docs = by_name.get("_raw_docs") or []
        named_by_mandi = bool(docs)
        if not docs:
            # "Cuddalore mandi" may name a district rather than a mandi.
            docs = _resolve_district_markets(market_name, state)
        # Unknown districts are not refused; only mandis known to be elsewhere are.
        if not docs or any(_in_user_district(d) or not d.get("district") for d in docs):
            return None

        names = [d.get("name") for d in docs] if named_by_mandi else [market_name]
        label = _join_display(names)
        verb = "are" if len({_display_place(n) for n in names}) > 1 else "is"
        logger.info("market_name=%r is outside the farmer's district %r: %s", market_name, district,
                    [(d.get("name"), d.get("district")) for d in docs])
        return {
            "error": (
                f"You are only able to see mandis in your district ({_display_place(district)}). "
                f"{label} {verb} in {_join_display([d.get('district') for d in docs])} district. "
                "To see another district's mandis, change your location in the profile section."
            ),
            "error_code": "MARKET_OUTSIDE_DISTRICT",
            "resolution": {
                "requested_market_name": market_name,
                "user_district": district,
                "markets_matched": [{"name": d.get("name"), "district": d.get("district")} for d in docs],
            },
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
        search_by_apmc: Optional[bool] = None,
        geo_fallback_for_named_market: bool = True,
    ) -> dict:
        """
        Orchestrated flow (avoids $near hangs):
          1) Require standardized state (exact match).
          2) Resolve commodity aliases; narrow by state + crop (+ date).
          3) Location priority cascade (first stage with price rows wins):
               named mandi → its district → lat/long nearest (within the radius,
               default DEFAULT_MAX_RADIUS_KM) → whole state (only without lat/long).
          4) Within each stage, optional latest-price fallback if date window empty.

        geo_fallback_for_named_market=False keeps a named-mandi lookup strict (no
        nearest-mandi stage); get_price_with_nearby uses it for its named part.
        """
        missing = _require_state(state)
        if missing:
            return missing

        # ── Step 1: resolve commodity ───────────────────────────────────
        resolved = _resolve_commodity_aliases(commodity_list)
        alias_ids = [doc["_id"] for docs in resolved.values() for doc in docs if doc]
        unmatched = [name for name, docs in resolved.items() if not docs]
        if not alias_ids:
            return {
                "error": f"We do not have {', '.join(commodity_list)} available in {state}.",
                "error_code": "COMMODITY_NOT_AVAILABLE",
                "unresolved_commodities": unmatched,
            }

        state_norm_values = _mc_state_values(state or "")
        mc_coll = markets_commodities_col()
        pr_coll = price_records_col()

        use_apmc_search = tool_search_by_apmc if search_by_apmc is None else bool(search_by_apmc)
        crop_label = (
            str(commodity_list[0])
            if len(commodity_list) == 1
            else ", ".join(str(c) for c in commodity_list)
        )

        def _named_market_unavailable(*, market_not_found: bool, matched_docs: list[dict]) -> dict:
            market_label = (
                _join_display([d.get("name") for d in matched_docs])
                or _display_place(market_name)
                or "the requested market"
            )
            if market_not_found:
                error = f"Market '{_display_place(market_name)}' was not found in {_display_place(state)}."
            else:
                error = f"Mandi price data is not available for {_display_place(crop_label)} in {market_label}."
            return {
                "error": error,
                "error_code": "MARKET_NOT_FOUND" if market_not_found else "NO_PRICE_DATA",
                "resolution": {
                    "requested_market_name": market_name,
                    "requested_commodity": commodity_list,
                    "requested_state": state,
                    "markets_matched": [
                        {"name": d.get("name"), "district": d.get("district")}
                        for d in matched_docs
                    ],
                },
            }

        has_geo = lat is not None and long is not None
        geo_radius_km = (
            float(radius_km) if radius_km is not None
            else (DEFAULT_MAX_RADIUS_KM if has_geo else None)
        )
        date_clause, date_meta = _date_query(
            lookback_days_arg=lookback_days,
            from_date_arg=from_date,
            to_date_arg=to_date,
            ignore_date_filters=False,
        )

        state_scope: dict[str, Any] = {}

        def _state_crop_scope() -> dict[str, Any]:
            """State+crop markets, and those with price rows in the date window (cached)."""
            if state_scope:
                return state_scope
            mc_filter = {
                "product_id": {"$in": alias_ids},
                "state": {"$in": state_norm_values},
            }
            logger.info("Narrowing markets_commodities by state+crop: %s", mc_filter)
            mc_docs = list(mc_coll.find(mc_filter).max_time_ms(MONGO_MAX_TIME_MS))
            logger.info("Found %d markets_commodities for state+crop.", len(mc_docs))
            market_ids = list({d["mandi_id"] for d in mc_docs if d.get("mandi_id")})
            date_ids = market_ids
            if date_clause and mc_docs:
                mc_by_id = {d["_id"]: d for d in mc_docs}
                pr_filter = {"market_commodity_id": {"$in": list(mc_by_id)}, **date_clause}
                logger.info(
                    "Date-narrowing price_records before geo ranking | filter=%s",
                    {**pr_filter, "market_commodity_id": f"$in[{len(mc_by_id)}]"},
                )
                # Distinct market_commodity_ids that have rows in the date window
                active_mc_ids = pr_coll.distinct("market_commodity_id", pr_filter)
                if active_mc_ids:
                    date_ids = list({
                        mc_by_id[mid]["mandi_id"]
                        for mid in active_mc_ids
                        if mid in mc_by_id and mc_by_id[mid].get("mandi_id")
                    })
                    logger.info("Date filter kept %d markets (from %d).", len(date_ids), len(market_ids))
                else:
                    logger.info("Date filter matched no price_records; keeping state+crop market set for ranking.")
            state_scope.update(mc_docs=mc_docs, market_ids=market_ids, date_ids=date_ids)
            return state_scope

        # ── Step 2: resolve the location scope ──────────────────────────
        # Holds pre-resolved district mandi docs when market_name is a district
        # name rather than a specific mandi name (set later if needed).
        _district_raw_docs: list[dict] = []
        named_requested = bool(
            market_name
            and str(market_name).strip()
            and str(market_name).strip().lower() not in {"all", "general", "any"}
        )
        # A farmer-named mandi is looked up by name, then as a district, then (when the
        # user's location is known) the nearest mandis within geo_radius_km take over.
        named_mandi_query = use_apmc_search and named_requested
        named_geo_fallback = named_mandi_query and has_geo and geo_fallback_for_named_market
        named_matched_docs: list[dict] = []
        named_match_meta: dict[str, Any] = {}
        # "not_found" / "no_data" once the named mandi itself cannot answer.
        named_status: Optional[str] = None
        explicit_market_query = False
        candidate_market_ids: list = []

        if not use_apmc_search:
            # Query did not ask for a specific APMC (search_by_apmc is False).
            # Search strictly by district first; if no district matches, fallback to lat_long.
            explicit_market_query = False
            if market_name and str(market_name).strip() and str(market_name).strip().lower() not in {"all", "general", "any"}:
                _district_raw_docs = _resolve_district_markets(market_name, state)
                if _district_raw_docs:
                    logger.info(
                        "search_by_apmc=False: resolved market_name=%r as district with %d APMCs.",
                        market_name, len(_district_raw_docs),
                    )
                else:
                    logger.info(
                        "search_by_apmc=False: market_name=%r not found as district; will fallback to lat_long/state.",
                        market_name,
                    )
        elif named_requested:
            # Named mandi: resolve the mandi by name first, then check crop at that mandi only.
            market_search = _do_search_markets(market_name=market_name, state=state, lat=lat, long=long)
            named_matched_docs = market_search.get("_raw_docs") or []
            named_match_meta = market_search.get("name_match") or {}
            if named_matched_docs:
                named_market_ids = [d["_id"] for d in named_matched_docs]
                mc_filter_named: dict[str, Any] = {
                    "product_id": {"$in": alias_ids},
                    "mandi_id": {"$in": named_market_ids},
                }
                logger.info("Named-mandi markets_commodities filter: %s", mc_filter_named)
                mc_named = list(mc_coll.find(mc_filter_named).max_time_ms(MONGO_MAX_TIME_MS))
                if mc_named:
                    explicit_market_query = True
                    candidate_market_ids = named_market_ids
                else:
                    named_status = "no_data"
                    logger.info("market_name=%r matched %s but they carry no %s.",
                                market_name, named_match_meta.get("candidates"), commodity_list)
            else:
                named_status = "not_found"
                logger.info("market_name=%r matched no mandi in %s.", market_name, state)

            if named_status:
                # The name may be a district rather than a mandi ("Cuddalore" matches
                # "Cuddalore APMC" but the farmer means the district), so try its APMCs.
                _district_raw_docs = _resolve_district_markets(market_name, state)
                if _district_raw_docs:
                    logger.info(
                        "market_name=%r resolves as a district with %d APMCs — switching to district-cascade mode.",
                        market_name, len(_district_raw_docs),
                    )
                elif not named_geo_fallback:
                    return _named_market_unavailable(
                        market_not_found=named_status == "not_found",
                        matched_docs=named_matched_docs,
                    )

        if not explicit_market_query:
            scope = _state_crop_scope()
            if not scope["mc_docs"]:
                if named_status:
                    return _named_market_unavailable(
                        market_not_found=named_status == "not_found",
                        matched_docs=named_matched_docs,
                    )
                return {
                    "error": f"No markets_commodities entries matched crop={commodity_list} in state={state}.",
                    "error_code": "COMMODITY_NOT_AVAILABLE",
                }
            if not scope["market_ids"]:
                return {"error": f"No linked markets found for crop={commodity_list} in state={state}."}

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
                "product_id": {"$in": alias_ids_arg},
            }
            if state_arg:
                mc_filter_local["state"] = {"$in": _mc_state_values(state_arg)}
            if market_ids_arg:
                mc_filter_local["mandi_id"] = {"$in": list(market_ids_arg)}

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
                market_oid_set = {d["mandi_id"] for d in mc_docs if d.get("mandi_id")}
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
                mid = mc.get("mandi_id")
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
                    # Use the requested date in the notice (not always "Today's")
                    requested_date_str = from_date or to_date
                    if requested_date_str:
                        unavail_msg = f"Price data for {requested_date_str} is not available."
                    else:
                        unavail_msg = "Today's price is not available."
                    latest.setdefault("resolution", {})["latest_price_notice"] = (
                        unavail_msg
                        + " Showing the latest available data"
                        + (f" (as of {latest_date})" if latest_date else "") + "."
                    )
                    if latest_date:
                        filtered_records = [r for r in records if r.get("date") == latest_date]
                        latest["price_records"] = filtered_records
                        latest["total_records_returned"] = len(filtered_records)
                    return latest
            return local

        def _named_fallback_notice(stage: str) -> str:
            """Farmer-facing line saying the named mandi could not answer and what is shown instead."""
            if named_status == "not_found":
                head = f"No mandi named '{_display_place(market_name)}' was found in {_display_place(state)}."
            else:
                names = _join_display([d.get("name") for d in named_matched_docs]) or _display_place(market_name)
                head = f"{_display_place(crop_label)} price is not available at {names}."
            if stage == "district_markets":
                district = next((d.get("district") for d in _district_raw_docs if d.get("district")), market_name)
                tail = f"Showing prices from mandis in {_display_place(district)} district."
            elif stage == "lat_long":
                tail = f"Showing prices from the nearest mandis within {geo_radius_km:g} km of your location."
            else:
                tail = f"Showing prices from other mandis in {_display_place(state)}."
            return f"{head} {tail}"

        stages: list[tuple[str, Optional[str], Optional[float], Optional[float], bool]] = []
        # (priority_label, market_name_arg, lat_arg, lon_arg, nearest_market_arg)
        # lat/long on the market_name stage only orders equally good name matches.
        if explicit_market_query:
            stages.append(("market_name", market_name, lat, long, False))
        else:
            if _district_raw_docs:
                # market_name was a district name — try its APMCs before generic geo search
                stages.append(("district_markets", market_name, lat, long, True))
            if has_geo and (named_geo_fallback or not named_mandi_query):
                stages.append(("lat_long", None, lat, long, True))
            if not has_geo:
                # With a known user location, never fall back to arbitrary state-wide mandis.
                stages.append(("state", None, None, None, False))

        result: dict[str, Any] = {"error": "No price records found.", "error_code": "NO_PRICE_DATA"}
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

            # ── district_markets stage: prices from APMCs in the user's district ──────
            if priority_label == "district_markets":
                # For district search, evaluate all APMCs in the district to ensure full coverage
                # rather than arbitrarily truncating to top 5.
                if stage_lat is not None and stage_lon is not None:
                    scored = []
                    for doc in _district_raw_docs:
                        coords = _market_lat_lon(doc)
                        dist = _haversine_km(stage_lat, stage_lon, coords[0], coords[1]) if coords else 99999.0
                        if geo_radius_km is not None and dist > geo_radius_km:
                            continue
                        scored.append((dist, doc))
                    scored.sort(key=lambda item: item[0])
                    d_docs = [doc for _, doc in scored]
                else:
                    d_docs = _district_raw_docs  # all APMCs in the district
                if not d_docs:
                    logger.info(
                        "district_markets: no mandis in range for district '%s'; skipping.",
                        stage_market,
                    )
                    continue
                logger.info(
                    "district_markets: trying %d mandis from district '%s': %s",
                    len(d_docs), stage_market, [d.get("name") for d in d_docs],
                )
                d_mandi = {d["_id"]: d for d in d_docs}
                d_result = _fetch_with_optional_latest(list(d_mandi.keys()), d_mandi)
                if _has_price_rows(d_result):
                    result = d_result
                    chosen_stage = priority_label
                    raw_docs = d_docs
                    d_result.setdefault("resolution", {})["district_resolved_from"] = stage_market
                    break
                logger.info(
                    "district_markets: district '%s' has mandis but no price data; "
                    "continuing to next stage.",
                    stage_market,
                )
                result = d_result
                raw_docs = d_docs
                continue
            # ── end district_markets stage ───────────────────────────────────────────

            market_result = _do_search_markets(
                market_name=stage_market,
                state=state,
                lat=stage_lat,
                long=stage_lon,
                nearest_market=stage_nearest,
                radius_km=geo_radius_km if priority_label == "lat_long" else None,
                market_ids=(
                    candidate_market_ids
                    if priority_label == "market_name"
                    else _state_crop_scope()["date_ids"]
                ),
            )
            stage_docs = market_result.get("_raw_docs") or []
            if not stage_docs:
                logger.info("Stage %s found 0 markets; trying next priority.", priority_label)
                if explicit_market_query and priority_label == "market_name":
                    result = _named_market_unavailable(market_not_found=True, matched_docs=[])
                    chosen_stage = priority_label
                    break
                continue

            stage_mandi = {d["_id"]: d for d in stage_docs}
            stage_ids = list(stage_mandi.keys())

            stage_result = _fetch_with_optional_latest(stage_ids, stage_mandi)
            if _has_price_rows(stage_result):
                result = stage_result
                chosen_stage = priority_label
                raw_docs = stage_docs
                if explicit_market_query:
                    result.setdefault("resolution", {})["requested_market_name"] = market_name
                elif len(tried) > 1:
                    result.setdefault("resolution", {})["fallback"] = (
                        f"Used location priority '{priority_label}' after "
                        f"{', '.join(tried[:-1])} returned no price records."
                    )
                break
            logger.info(
                "Stage %s returned 0 price records; trying next priority.",
                priority_label,
            )
            if explicit_market_query and priority_label == "market_name":
                # Named mandi found but no price records for this crop+date.
                # Before giving up, check if market_name is also a district name
                # and inject a district_markets stage to try all APMCs in that district.
                # This is the common case: "Cuddalore" matches "Cuddalore APMC" but the
                # user means the Cuddalore district — other APMCs there may have data.
                named_status = "no_data"
                named_matched_docs = stage_docs
                if not _district_raw_docs:
                    _district_raw_docs.extend(_resolve_district_markets(market_name, state))
                remaining_stages: list[tuple[str, Optional[str], Optional[float], Optional[float], bool]] = []
                if _district_raw_docs:
                    remaining_stages.append(("district_markets", market_name, lat, long, True))
                if named_geo_fallback:
                    remaining_stages.append(("lat_long", None, lat, long, True))
                elif not has_geo and _district_raw_docs:
                    remaining_stages.append(("state", None, None, None, False))
                if remaining_stages:
                    logger.info(
                        "market_name=%r mandi found but no price records; continuing with %s.",
                        market_name, [s[0] for s in remaining_stages],
                    )
                    explicit_market_query = False
                    stages.extend(remaining_stages)
                    continue
                # No district or nearby fallback — return not-found
                result = _named_market_unavailable(market_not_found=False, matched_docs=stage_docs)
                if isinstance(stage_result, dict) and stage_result.get("resolution"):
                    result["resolution"].update(stage_result["resolution"])
                chosen_stage = priority_label
                break
            result = stage_result
            raw_docs = stage_docs

        if named_mandi_query and named_status and chosen_stage != "market_name":
            if _has_price_rows(result):
                result.setdefault("resolution", {}).update(
                    requested_market_name=market_name,
                    market_fallback_notice=_named_fallback_notice(chosen_stage or "state"),
                )
            else:
                result = _named_market_unavailable(
                    market_not_found=named_status == "not_found",
                    matched_docs=named_matched_docs,
                )
                if named_geo_fallback:
                    result["error"] += (
                        f" No mandi within {geo_radius_km:g} km of your location has"
                        f" {_display_place(crop_label)} price data either."
                    )
        elif chosen_stage == "market_name" and _has_price_rows(result) and named_match_meta:
            res = result.setdefault("resolution", {})
            res["market_match"] = named_match_meta
            names = _join_display(named_match_meta.get("candidates") or [])
            if named_match_meta.get("match_type") in {"fuzzy", "partial"}:
                res["market_match_notice"] = (
                    f"No mandi exactly named '{_display_place(market_name)}' was found; "
                    f"showing {names}, the closest match."
                )
            elif named_match_meta.get("ambiguous"):
                res["market_match_notice"] = (
                    f"More than one mandi matches '{_display_place(market_name)}'; showing {names}."
                )

        if isinstance(result, dict):
            resolution = result.setdefault("resolution", {})
            resolution["date_filter"] = resolution.get("date_filter") or date_meta
            resolution["selection_mode"] = (
                f"priority_{chosen_stage}" if chosen_stage else None
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
        eff_lookback = lookback_days if (from_date or to_date) is None else None
        if eff_lookback is None and not from_date and not to_date:
            eff_lookback = 1
        result = _fetch_price_data(
            commodity_list=c_list,
            market_name=market_name, state=state,
            lat=lat, long=long,
            nearest_market=nearest_market, radius_km=radius_km,
            from_date=from_date, to_date=to_date,
            lookback_days=eff_lookback,
            latest_price_fallback=True,
        )
        if not result.get("error"):
            result["action"] = "get_today_price"
            result.pop("stats", None)
            records = result.get("price_records") or []
            today_str = datetime.now(timezone.utc).date().isoformat()
            if records and not from_date and not to_date and (lookback_days is None or lookback_days == 1):
                rec_date = records[0].get("date")
                if rec_date and rec_date != today_str:
                    result.setdefault("resolution", {})["latest_price_notice"] = (
                        f"Today's price is not available. Showing the latest available price (as of {rec_date})."
                    )
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
        records = result.get("price_records") or []
        source_systems = _extract_source_systems(records)
        summary: dict[str, Any] = {
            "action":     "get_price_summary",
            "stats":      result.get("stats"),
            "resolution": result.get("resolution"),
            "total_records_analysed": result.get("total_records_returned"),
        }
        if source_systems:
            summary["source_system"] = (
                source_systems[0] if len(source_systems) == 1 else ", ".join(source_systems)
            )
        return summary

    # ======================================================================
    # ACTION 4: get_highest_price
    # ======================================================================
    def _get_highest_price() -> dict:
        if not commodity_name:
            return {"error": "commodity_name is required for action='get_highest_price'."}
        c_list = [commodity_name] if isinstance(commodity_name, str) else commodity_name
        effective_lookback = lookback_days
        if effective_lookback is None and from_date is None and to_date is None:
            effective_lookback = 7  # search last 7 days by default for highest/lowest queries
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
        today_str = datetime.now(timezone.utc).date().isoformat()
        if records and not from_date and not to_date and (effective_lookback is None or effective_lookback == 1):
            rec_date = records[0].get("date")
            if rec_date and rec_date != today_str:
                result.setdefault("resolution", {})["latest_price_notice"] = (
                    f"Today's price is not available. Showing the latest available price (as of {rec_date})."
                )
        sorted_records = sorted(
            records,
            key=lambda r: (r.get("modal_price") or 0, r.get("max_price") or 0),
            reverse=True,
        )
        return {
            "action":            "get_highest_price",
            "highest_records":   sorted_records[:1],
            "resolution":        result.get("resolution"),
            "total_records_analysed": result.get("total_records_returned"),
        }

    # ======================================================================
    # ACTION 4B: get_lowest_price
    # ======================================================================
    def _get_lowest_price() -> dict:
        if not commodity_name:
            return {"error": "commodity_name is required for action='get_lowest_price'."}
        c_list = [commodity_name] if isinstance(commodity_name, str) else commodity_name
        effective_lookback = lookback_days
        if effective_lookback is None and from_date is None and to_date is None:
            effective_lookback = 7  # search last 7 days by default for lowest queries if no date given
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
        today_str = datetime.now(timezone.utc).date().isoformat()
        if records and not from_date and not to_date and (effective_lookback is None or effective_lookback == 1):
            rec_date = records[0].get("date")
            if rec_date and rec_date != today_str:
                result.setdefault("resolution", {})["latest_price_notice"] = (
                    f"Today's price is not available. Showing the latest available price (as of {rec_date})."
                )
        valid_records = [
            r for r in records
            if (r.get("modal_price") is not None and r.get("modal_price") > 0)
            or (r.get("min_price") is not None and r.get("min_price") > 0)
        ]
        target_records = valid_records if valid_records else records
        sorted_records = sorted(
            target_records,
            key=lambda r: (
                r.get("modal_price") if (r.get("modal_price") is not None and r.get("modal_price") > 0) else (r.get("min_price") or float("inf")),
                r.get("min_price") if (r.get("min_price") is not None and r.get("min_price") > 0) else float("inf"),
            ),
        )
        return {
            "action":            "get_lowest_price",
            "lowest_records":    sorted_records[:1],
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
        eff_lookback = lookback_days if (from_date or to_date) is None else None
        if eff_lookback is None and not from_date and not to_date:
            eff_lookback = 1
        result = _fetch_price_data(
            commodity_list=c_list,
            market_name=market_name, state=state,
            lat=lat, long=long,
            nearest_market=nearest_market, radius_km=radius_km,
            from_date=from_date, to_date=to_date,
            lookback_days=eff_lookback,
            latest_price_fallback=True,
        )
        if result.get("error"):
            return result
        records = result.get("price_records") or []
        valid_arrivals = [r for r in records if r.get("arrival_quantity") is not None]
        today_str = datetime.now(timezone.utc).date().isoformat()
        if not valid_arrivals and eff_lookback == 1:
            # If today had no arrival quantities recorded, query latest available
            latest_result = _fetch_price_data(
                commodity_list=c_list,
                market_name=market_name, state=state,
                lat=lat, long=long,
                nearest_market=nearest_market, radius_km=radius_km,
                latest_price_fallback=True,
            )
            all_recs = latest_result.get("price_records") or []
            valid_arrivals = [r for r in all_recs if r.get("arrival_quantity") is not None]
            if valid_arrivals:
                latest_date = valid_arrivals[0].get("date")
                records = [r for r in valid_arrivals if r.get("date") == latest_date]
                result = latest_result
                result.setdefault("resolution", {})["latest_price_notice"] = (
                    f"Today's arrival quantity is not available. Showing the latest available arrival data (as of {latest_date})."
                )
        elif records and not from_date and not to_date and eff_lookback == 1:
            rec_date = records[0].get("date")
            if rec_date and rec_date != today_str:
                result.setdefault("resolution", {})["latest_price_notice"] = (
                    f"Today's arrival quantity is not available. Showing the latest available arrival data (as of {rec_date})."
                )

        arrival_records = [
            {
                "date":             r.get("date"),
                "market_name":      r.get("market_name"),
                "state":            r.get("state"),
                "district":         r.get("district"),
                "commodity_name":   r.get("commodity_name"),
                "variety":          r.get("variety"),
                "arrival_quantity": r.get("arrival_quantity"),
                "source_system":    r.get("source_system"),
            }
            for r in records
        ]
        stats = result.get("stats", {})
        resp = {
            "action":            "get_today_arrival",
            "arrival_records":   arrival_records,
            "total_arrival_qty": stats.get("overall", {}).get("total_arrival_qty"),
            "avg_arrival_qty":   stats.get("overall", {}).get("avg_arrival_qty"),
            "resolution":        result.get("resolution"),
            "total_records_returned": len(arrival_records),
        }
        if not arrival_records or any(r.get("arrival_quantity") is None for r in arrival_records):
            resp["message"] = ARRIVAL_AGMARKNET_NOTICE
            resp.setdefault("resolution", {})["arrival_notice"] = ARRIVAL_AGMARKNET_NOTICE
        return resp

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
                "source_system":    r.get("source_system"),
            }
            for r in records
        ]
        stats = result.get("stats", {})
        resp = {
            "action":            "get_arrival_history",
            "arrival_records":   arrival_records,
            "total_arrival_qty": stats.get("overall", {}).get("total_arrival_qty"),
            "avg_arrival_qty":   stats.get("overall", {}).get("avg_arrival_qty"),
            "resolution":        result.get("resolution"),
            "total_records_returned": result.get("total_records_returned"),
        }
        if not arrival_records or any(r.get("arrival_quantity") is None for r in arrival_records):
            resp["message"] = ARRIVAL_AGMARKNET_NOTICE
            resp.setdefault("resolution", {})["arrival_notice"] = ARRIVAL_AGMARKNET_NOTICE
        return resp

    # ======================================================================
    # ACTION 7: get_extreme_arrival
    # ======================================================================
    def _get_extreme_arrival() -> dict:
        if not commodity_name:
            return {"error": "commodity_name is required for action='get_extreme_arrival'."}
        c_list = [commodity_name] if isinstance(commodity_name, str) else commodity_name
        effective_lookback = lookback_days
        if effective_lookback is None and from_date is None and to_date is None:
            effective_lookback = 7  # search last 7 days by default for highest/lowest queries
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
        today_str = datetime.now(timezone.utc).date().isoformat()
        valid_arrivals = [r for r in records if r.get("arrival_quantity") is not None]
        if not valid_arrivals and effective_lookback == 1:
            latest_result = _fetch_price_data(
                commodity_list=c_list,
                market_name=market_name, state=state,
                lat=lat, long=long,
                nearest_market=nearest_market, radius_km=radius_km,
                latest_price_fallback=True,
            )
            all_recs = latest_result.get("price_records") or []
            valid_arrivals = [r for r in all_recs if r.get("arrival_quantity") is not None]
            if valid_arrivals:
                latest_date = valid_arrivals[0].get("date")
                records = [r for r in valid_arrivals if r.get("date") == latest_date]
                result = latest_result
                result.setdefault("resolution", {})["latest_price_notice"] = (
                    f"Today's arrival quantity is not available. Showing the latest available arrival data (as of {latest_date})."
                )
        elif records and not from_date and not to_date and effective_lookback == 1:
            rec_date = records[0].get("date")
            if rec_date and rec_date != today_str:
                result.setdefault("resolution", {})["latest_price_notice"] = (
                    f"Today's arrival quantity is not available. Showing the latest available arrival data (as of {rec_date})."
                )

        order = (sort_order or "highest").strip().lower()
        descending = order != "lowest"
        sorted_records = sorted(
            records,
            key=lambda r: r.get("arrival_quantity") or 0,
            reverse=descending,
        )
        label = "highest" if descending else "lowest"
        resp = {
            "action":              "get_extreme_arrival",
            "sort_order":          label,
            f"{label}_arrivals":   sorted_records[:5],
            "resolution":          result.get("resolution"),
            "total_records_analysed": len(sorted_records),
        }
        if not sorted_records or any(r.get("arrival_quantity") is None for r in sorted_records[:5]):
            resp["message"] = ARRIVAL_AGMARKNET_NOTICE
            resp.setdefault("resolution", {})["arrival_notice"] = ARRIVAL_AGMARKNET_NOTICE
        return resp

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
    # ACTION 9: get_price_with_nearby
    # ======================================================================
    NEARBY_RADIUS_KM = 100

    def _get_price_with_nearby() -> dict:
        """Composite: named mandi latest/date price + nearby markets' latest/date prices."""
        if not commodity_name:
            return {"error": "commodity_name is required for action='get_price_with_nearby'."}
        if not market_name:
            # No named mandi → fall back to regular get_today_price
            return _get_today_price()

        c_list = [commodity_name] if isinstance(commodity_name, str) else commodity_name

        eff_lookback = lookback_days if (from_date or to_date) is None else None
        if eff_lookback is None and not from_date and not to_date:
            eff_lookback = 1

        # ── Part 1: Named mandi's latest/date price ─────────────────────────
        named_result = _fetch_price_data(
            commodity_list=c_list,
            market_name=market_name, state=state,
            lat=lat, long=long,
            nearest_market=False, radius_km=radius_km,
            from_date=from_date, to_date=to_date,
            lookback_days=eff_lookback,
            latest_price_fallback=True,
            # Respect the outer search_by_apmc flag: if the agent identified the
            # market_name as a district (search_by_apmc=False), honour that here
            # so district names like "Kallakurichi" resolve correctly instead of
            # being treated as APMC names that don't match anything.
            search_by_apmc=tool_search_by_apmc,
            # Nearby mandis are Part 2; the named part must not silently become them.
            geo_fallback_for_named_market=False,
        )
        if not named_result.get("error"):
            named_result["action"] = "get_today_price"
            named_result.pop("stats", None)
            records = named_result.get("price_records") or []
            today_str = datetime.now(timezone.utc).date().isoformat()
            if records and not from_date and not to_date and (lookback_days is None or lookback_days == 1):
                rec_date = records[0].get("date")
                if rec_date and rec_date != today_str:
                    named_result.setdefault("resolution", {})["latest_price_notice"] = (
                        f"Today's price is not available. Showing the latest available price (as of {rec_date})."
                    )

        # ── Part 2: Nearby markets' prices on requested date / latest available ───
        def _nearby_prices(
            ref_lat: float, ref_lon: float, radius: float, exclude_names: set[str],
        ) -> dict:
            """Up to DEFAULT_TOP_N_NEAREST price rows from mandis around (ref_lat, ref_lon)."""
            nearby_raw = _fetch_price_data(
                commodity_list=c_list,
                market_name=None,  # no market_name — search by geo
                state=state,
                lat=ref_lat,
                long=ref_lon,
                nearest_market=True,
                radius_km=radius,
                from_date=from_date,
                to_date=to_date,
                lookback_days=eff_lookback,
                latest_price_fallback=True,  # fallback to latest prices for nearby markets
                search_by_apmc=False,
            )
            if nearby_raw.get("error") or int(nearby_raw.get("total_records_returned") or 0) == 0:
                logger.info("get_price_with_nearby: no prices found at nearby markets")
                return {}
            # Filter out the named mandi's records from nearby results
            filtered_records = [
                r for r in nearby_raw.get("price_records") or []
                if (r.get("market_name") or "").strip().lower() not in exclude_names
            ]
            if not filtered_records:
                logger.info("get_price_with_nearby: all nearby records were from the named mandi itself")
                return {}
            top_nearby = filtered_records[:DEFAULT_TOP_N_NEAREST]
            logger.info(
                "get_price_with_nearby: %d nearby price records (after excluding named mandi and capping to %d)",
                len(top_nearby), DEFAULT_TOP_N_NEAREST,
            )
            return {
                "action": "nearby_markets_price",
                "price_records": top_nearby,
                "total_records_returned": len(top_nearby),
                "resolution": nearby_raw.get("resolution"),
            }

        # Resolve the named mandi/district to get its coordinates (same ranking as
        # Part 1, so it is the same mandi). If that finds nothing because market_name
        # is a district, not an APMC, fall back to district resolution.
        named_market_search = _do_search_markets(
            market_name=market_name,
            state=state,
            lat=lat,
            long=long,
        )
        named_docs = named_market_search.get("_raw_docs") or []

        # Fallback: treat market_name as a district name when APMC search finds nothing
        if not named_docs and not tool_search_by_apmc:
            named_docs = _resolve_district_markets(market_name, state)
            logger.info(
                "get_price_with_nearby: APMC name search found no docs; "
                "resolved '%s' as district → %d APMCs for coordinate lookup.",
                market_name, len(named_docs),
            )

        named_mandi_names = {(d.get("name") or "").strip().lower() for d in named_docs}
        # Use the first matched mandi's coordinates
        named_mandi_coords = next((c for c in (_market_lat_lon(d) for d in named_docs) if c), None)

        nearby_result: dict = {}
        if named_mandi_coords:
            logger.info(
                "get_price_with_nearby: using named mandi coords (%s, %s) for nearby search",
                named_mandi_coords[0], named_mandi_coords[1],
            )
            nearby_result = _nearby_prices(
                named_mandi_coords[0], named_mandi_coords[1], NEARBY_RADIUS_KM, named_mandi_names,
            )
        if not nearby_result and named_result.get("error") and lat is not None and long is not None:
            # The named mandi has no price (or was not found): show the farmer's nearest mandis.
            user_radius = float(radius_km) if radius_km is not None else DEFAULT_MAX_RADIUS_KM
            logger.info(
                "get_price_with_nearby: named mandi unavailable; using the farmer's location (%s, %s), %g km",
                lat, long, user_radius,
            )
            nearby_result = _nearby_prices(float(lat), float(long), user_radius, named_mandi_names)
            if nearby_result:
                nearby_result["resolution"] = {
                    **(nearby_result.get("resolution") or {}),
                    "nearby_reference": "user_location",
                    "nearby_radius_km": user_radius,
                }

        return {
            "action": "get_price_with_nearby",
            "named_market": named_result,
            "nearby_markets": nearby_result if nearby_result else None,
        }

    # ======================================================================
    # ACTION DISPATCHER
    # ======================================================================
    dispatch = {
        "get_today_price":    _get_today_price,
        "get_price_history":  _get_price_history,
        "get_price_summary":  _get_price_summary,
        "get_highest_price":  _get_highest_price,
        "get_lowest_price":   _get_lowest_price,
        "get_today_arrival":  _get_today_arrival,
        "get_arrival_history": _get_arrival_history,
        "get_extreme_arrival": _get_extreme_arrival,
        "search_markets":     _action_search_markets,
        "get_price_with_nearby": _get_price_with_nearby,
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

    try:
        outside_district = _named_mandi_outside_district()
    except Exception:
        logger.exception("District check for market_name=%r failed; continuing without it.", market_name)
        outside_district = None
    if outside_district:
        return {**outside_district, "action": actions[0] if len(actions) == 1 else actions}

    _COMMODITY_ACTIONS = {
        "get_today_price",
        "get_price_history",
        "get_price_summary",
        "get_highest_price",
        "get_lowest_price",
        "get_today_arrival",
        "get_arrival_history",
        "get_extreme_arrival",
        "get_price_with_nearby",
    }

    # Extract clean list of individual commodity names if multiple provided
    crop_list: list[str] = []
    if isinstance(commodity_name, list):
        for item in commodity_name:
            if item:
                parts = re.split(r",|\s+and\s+|\s*&\s*", str(item), flags=re.I)
                crop_list.extend([_norm(p) for p in parts if _norm(p)])
    elif isinstance(commodity_name, str) and ("," in commodity_name or " and " in commodity_name or "&" in commodity_name):
        parts = re.split(r",|\s+and\s+|\s*&\s*", commodity_name, flags=re.I)
        crop_list = [_norm(p) for p in parts if _norm(p)]
    elif commodity_name and isinstance(commodity_name, str):
        crop_list = [_norm(commodity_name)]

    # Deduplicate while preserving order
    seen_crops: set[str] = set()
    dedup_crops: list[str] = []
    for c in crop_list:
        if c and c not in seen_crops:
            seen_crops.add(c)
            dedup_crops.append(c)
    crop_list = dedup_crops

    def _combine_multi_crop_results(
        action_name: str,
        results_by_crop: dict[str, dict],
    ) -> dict:
        """Combines individual results for 2+ crops into a single structured response."""
        valid_results = {c: res for c, res in results_by_crop.items() if not res.get("error")}
        if not valid_results:
            return {
                "error": "Failed to fetch data for all requested commodities.",
                "details": {c: res.get("error") for c, res in results_by_crop.items()},
                "by_commodity": results_by_crop,
            }

        combined: dict[str, Any] = {
            "action": action_name,
            "requested_commodities": list(results_by_crop.keys()),
            "by_commodity": results_by_crop,
        }

        # 1. get_today_price & get_price_history
        if action_name in ("get_today_price", "get_price_history"):
            merged_records = []
            for crop, res in results_by_crop.items():
                if not res.get("error"):
                    merged_records.extend(res.get("price_records") or [])
            combined["price_records"] = merged_records
            combined["total_records_returned"] = len(merged_records)

        # 2. get_highest_price
        elif action_name == "get_highest_price":
            highest_recs = []
            for crop, res in results_by_crop.items():
                if not res.get("error"):
                    highest_recs.extend(res.get("highest_records") or [])
            combined["highest_records"] = highest_recs
            combined["total_records_analysed"] = sum(
                res.get("total_records_analysed", 0) for res in results_by_crop.values() if not res.get("error")
            )

        # 3. get_lowest_price
        elif action_name == "get_lowest_price":
            lowest_recs = []
            for crop, res in results_by_crop.items():
                if not res.get("error"):
                    lowest_recs.extend(res.get("lowest_records") or [])
            combined["lowest_records"] = lowest_recs
            combined["total_records_analysed"] = sum(
                res.get("total_records_analysed", 0) for res in results_by_crop.values() if not res.get("error")
            )

        # 4. get_today_arrival & get_arrival_history
        elif action_name in ("get_today_arrival", "get_arrival_history"):
            merged_arrivals = []
            for crop, res in results_by_crop.items():
                if not res.get("error"):
                    merged_arrivals.extend(res.get("arrival_records") or [])
            combined["arrival_records"] = merged_arrivals
            combined["total_records_returned"] = len(merged_arrivals)
            combined["total_arrival_qty"] = sum(
                float(res.get("total_arrival_qty") or 0) for res in results_by_crop.values() if not res.get("error")
            )

        # 5. get_price_summary
        elif action_name == "get_price_summary":
            stats_by_commodity = {}
            for crop, res in results_by_crop.items():
                if not res.get("error"):
                    crop_stats = res.get("stats", {})
                    if crop_stats.get("by_commodity"):
                        stats_by_commodity.update(crop_stats["by_commodity"])
            combined["stats"] = {
                "by_commodity": stats_by_commodity,
                "total_records": sum(
                    res.get("total_records_analysed", 0) for res in results_by_crop.values() if not res.get("error")
                ),
            }

        # 6. get_extreme_arrival
        elif action_name == "get_extreme_arrival":
            merged_extreme = []
            for crop, res in results_by_crop.items():
                if not res.get("error"):
                    recs = (
                        res.get("highest_arrivals")
                        or res.get("lowest_arrivals")
                        or res.get("extreme_records")
                        or []
                    )
                    merged_extreme.extend(recs)
            order = next((res.get("sort_order") for res in results_by_crop.values() if res.get("sort_order")), "highest")
            combined["sort_order"] = order
            combined[f"{order}_arrivals"] = merged_extreme
            combined["extreme_records"] = merged_extreme
            combined["total_records_analysed"] = sum(
                res.get("total_records_analysed", 0) for res in results_by_crop.values() if not res.get("error")
            )

        # 7. get_price_with_nearby
        elif action_name == "get_price_with_nearby":
            named_recs = []
            nearby_recs = []
            for crop, res in results_by_crop.items():
                if not res.get("error"):
                    named_m = res.get("named_market") or {}
                    if isinstance(named_m, dict):
                        named_recs.extend(named_m.get("price_records") or [])
                    nearby_m = res.get("nearby_markets") or {}
                    if isinstance(nearby_m, dict):
                        nearby_recs.extend(nearby_m.get("price_records") or [])

            combined["named_market"] = {
                "action": "get_today_price",
                "price_records": named_recs,
                "total_records_returned": len(named_recs),
            }
            if nearby_recs:
                combined["nearby_markets"] = {
                    "action": "nearby_markets_price",
                    "price_records": nearby_recs,
                    "total_records_returned": len(nearby_recs),
                }
            else:
                combined["nearby_markets"] = None

            combined["named_market_records"] = named_recs
            combined["nearby_market_records"] = nearby_recs

        # Consolidate resolution notices and warnings
        notices = []
        warnings = []
        for crop, res in results_by_crop.items():
            if res.get("error"):
                warnings.append(f"{crop.title()}: {res.get('error')}")
            notice = res.get("resolution", {}).get("latest_price_notice") or (res.get("named_market") or {}).get("resolution", {}).get("latest_price_notice")
            if notice:
                notices.append(f"[{crop.title()}]: {notice}")

        combined_res_meta: dict[str, Any] = {}
        if notices:
            combined_res_meta["latest_price_notices"] = notices
        if warnings:
            combined_res_meta["unavailable_commodities"] = warnings

        # Arrival notice propagation for multi-crop
        if action_name in ("get_today_arrival", "get_arrival_history", "get_extreme_arrival"):
            arrival_recs = (
                combined.get("arrival_records")
                or combined.get("highest_arrivals")
                or combined.get("lowest_arrivals")
                or combined.get("extreme_records")
                or []
            )
            has_arrival_msg = any(
                res.get("message") == ARRIVAL_AGMARKNET_NOTICE
                or (res.get("resolution") or {}).get("arrival_notice") == ARRIVAL_AGMARKNET_NOTICE
                for res in results_by_crop.values()
            )
            if has_arrival_msg or not arrival_recs or any(r.get("arrival_quantity") is None for r in arrival_recs):
                combined["message"] = ARRIVAL_AGMARKNET_NOTICE
                combined_res_meta["arrival_notice"] = ARRIVAL_AGMARKNET_NOTICE

        if combined_res_meta:
            combined["resolution"] = combined_res_meta

        return combined

    def _execute_single_action(act_name: str, target_crop: Optional[str] = None) -> dict:
        nonlocal commodity_name
        orig_commodity = commodity_name
        if target_crop is not None:
            commodity_name = target_crop
        try:
            handler = dispatch.get(act_name)
            if not handler:
                return {
                    "error": (
                        f"Unknown action '{act_name}'. Choose one of: "
                        + ", ".join(sorted(dispatch.keys()))
                    ),
                    "error_code": "UNSUPPORTED_ACTION",
                    "supported_actions": sorted(dispatch.keys()),
                }
            return handler()
        finally:
            commodity_name = orig_commodity

    def _execute_action_with_multi_crop(act_name: str) -> dict:
        if act_name in _COMMODITY_ACTIONS and len(crop_list) > 1:
            logger.info("Executing action=%s sequentially for %d crops: %s", act_name, len(crop_list), crop_list)
            crop_results = {}
            for c in crop_list:
                crop_results[c] = _execute_single_action(act_name, target_crop=c)
            return _combine_multi_crop_results(act_name, crop_results)
        return _execute_single_action(act_name)

    if not multi_mode and len(actions) == 1:
        key = actions[0]
        try:
            return _execute_action_with_multi_crop(key)
        except Exception as exc:
            logger.exception("mandi_price_tool action=%s failed", key)
            return {"error": str(exc), "action": key}

    results: dict[str, dict] = {}
    for key in actions:
        try:
            results[key] = _execute_action_with_multi_crop(key)
        except Exception as exc:
            logger.exception("mandi_price_tool action=%s failed", key)
            results[key] = {"error": str(exc), "action": key}

    return {"actions": actions, "results": results}


# --------------------------------------------------------------------------
# Entrypoint
# --------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run(transport="streamable-http")
