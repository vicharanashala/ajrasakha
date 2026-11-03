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
import threading
import time
import unicodedata

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
# When the user's lat/long is known, prices come only from mandis within this distance (km).
# A caller's radius_km can make it smaller, never larger.
DEFAULT_MAX_RADIUS_KM = float(os.getenv("MARKET_DEFAULT_MAX_RADIUS_KM", 40))
# Safety timeout for Mongo reads (ms) — prevent MCP session hangs
MONGO_MAX_TIME_MS = int(os.getenv("MARKET_MONGO_MAX_TIME_MS", 10000))
# Longest period a farmer can ask for (days).
MAX_LOOKBACK_DAYS = 366

ARRIVAL_AGMARKNET_NOTICE = "Arrival quantity is not reported for these mandis"

# Price dates are calendar days in India, stored as midnight UTC of that day.
IST = timezone(timedelta(hours=5, minutes=30))


def today_ist():
    """Today's date in India; "today's price" means this day, whatever the server's clock zone."""
    return datetime.now(IST).date()


class FriendlyError(Exception):
    """A problem with the request that the farmer should be told about in plain words."""

    def __init__(self, code: str, message: str, **extra: Any) -> None:
        super().__init__(message)
        self.code, self.message, self.extra = code, message, extra

    def payload(self) -> dict:
        return {"error": self.message, "error_code": self.code, **self.extra}


SERVICE_ERROR_MESSAGE = "Mandi prices could not be fetched right now. Please try again in a few minutes."

# Rough box around India. Coordinates outside it are not a farmer's location.
_INDIA_LAT = (5.0, 38.0)
_INDIA_LON = (67.0, 98.0)


def _finite_float(value: Any) -> Optional[float]:
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def clean_lat_long(lat: Any, lon: Any) -> tuple[Optional[float], Optional[float]]:
    """The farmer's location as (lat, lon), or (None, None) when it is missing or not in India.

    Swapped values (lat=77.2, long=28.6) are put back in order.
    """
    la, lo = _finite_float(lat), _finite_float(lon)
    if la is None or lo is None:
        return None, None

    def in_india(a: float, b: float) -> bool:
        return _INDIA_LAT[0] <= a <= _INDIA_LAT[1] and _INDIA_LON[0] <= b <= _INDIA_LON[1]

    if in_india(la, lo):
        return la, lo
    if in_india(lo, la):
        logger.warning("lat/long look swapped (%s, %s); using (%s, %s).", la, lo, lo, la)
        return lo, la
    logger.warning("lat/long (%s, %s) is not in India; ignoring the location.", la, lo)
    return None, None


def clean_radius_km(value: Any) -> Optional[float]:
    """A usable search radius: positive and at most DEFAULT_MAX_RADIUS_KM; None when not given or invalid."""
    r = _finite_float(value)
    if r is None or r <= 0:
        return None
    return min(r, DEFAULT_MAX_RADIUS_KM)


def clean_lookback_days(value: Any) -> Optional[int]:
    """Number of days to look back, between 1 and MAX_LOOKBACK_DAYS; None when not given or invalid."""
    f = _finite_float(value)
    if f is None:
        return None
    return max(1, min(int(f), MAX_LOOKBACK_DAYS))


def fmt_day(iso: Optional[str]) -> str:
    """'2026-10-28' -> '28 Oct 2026' (the input back when it is not an ISO date)."""
    try:
        d = datetime.strptime(str(iso), "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return str(iso or "")
    return f"{d.day} {d:%b %Y}"


def ingested_iso(value: Any) -> Optional[str]:
    """When the scraper last saved a price row, as a UTC ISO time to the second; None when unknown.

    The scraper writes `ingested_at` on every run that sees the row, as a datetime
    (naive means UTC) or, in older rows, an ISO string.
    """
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat(timespec="seconds")


def when_phrase(date_meta: Optional[dict]) -> str:
    """The asked day or period in words: 'today', 'for 28 Oct 2026', 'in the last 7 days'."""
    meta = date_meta or {}
    today = meta.get("today") or today_ist().isoformat()
    if meta.get("mode") == "lookback":
        n = int(meta.get("lookback_days") or 1)
        return "today" if n == 1 else f"in the last {n} days"
    if meta.get("mode") == "range":
        fd, td = meta.get("from_date"), meta.get("to_date")
        if fd and td and fd == td:
            return "today" if fd == today else f"for {fmt_day(fd)}"
        if fd and td:
            return f"between {fmt_day(fd)} and {fmt_day(td)}"
        if fd:
            return f"since {fmt_day(fd)}"
        if td:
            return f"up to {fmt_day(td)}"
    return ""


def clean_price_values(pr: dict) -> Optional[dict]:
    """Prices a farmer can trust, or None when the row cannot be right.

    Zero or negative prices count as missing. A row is dropped when it has no price left,
    when min is above max, or when the modal price lies outside min..max.
    """
    def positive(key: str) -> Optional[float]:
        v = _finite_float(pr.get(key))
        return round(v, 2) if v is not None and v > 0 else None

    modal, low, high = positive("modal_price"), positive("min_price"), positive("max_price")
    if modal is None and low is None and high is None:
        return None
    if low is not None and high is not None and low > high:
        return None
    if modal is not None and ((low is not None and modal < low) or (high is not None and modal > high)):
        return None
    arrival = _finite_float(pr.get("arrival_quantity"))
    return {
        "modal_price": modal, "min_price": low, "max_price": high,
        "arrival_quantity": round(arrival, 2) if arrival is not None and arrival >= 0 else None,
    }

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
        # Fail fast when the database is unreachable instead of hanging the farmer's request.
        _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000, connectTimeoutMS=5000, socketTimeoutMS=30000)
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

def crop_words_col() -> Collection:
    return get_db()[f"{V2_PREFIX}crop_words"]

def states_col() -> Collection:
    return get_db()[f"{V2_PREFIX}states"]


# --------------------------------------------------------------------------
# Farmer's word → product
# --------------------------------------------------------------------------

def word_key(value: Any) -> str:
    """Order- and punctuation-insensitive key: "Ginger (Dry)" == "dry ginger".

    Splits only on punctuation, symbols and spaces, so Indian scripts keep their
    combining vowel signs ("धान" stays one word). Same rules as the scraper's
    catalog.word_key and the review website.
    """
    text = unicodedata.normalize("NFKC", str(value or "")).lower()
    cleaned = "".join(" " if unicodedata.category(ch)[0] in "PSZC" else ch for ch in text)
    return " ".join(sorted(set(cleaned.split())))


WORD_INDEX_TTL_S = float(os.getenv("MARKET_WORD_INDEX_TTL_S", "300"))


class WordIndex:
    """
    Everything a farmer may type, keyed by word_key, in tiers (first tier with a hit wins):
      1. product names, and crop names (→ the crop's default product)
      2. approved farmer words (crop_words)
      3. approved source spellings (crop_names.raw_name)
    Loaded from the database and refreshed every WORD_INDEX_TTL_S seconds.
    """

    def __init__(self) -> None:
        self.tiers: list[dict[str, set]] = [{}, {}, {}]
        # Farmer words still pending or rejected: a decision is due (or was "no"), so
        # they must not fall through to a source spelling ("chana" -> "chafa").
        self.blocked: set[str] = set()
        self.products: dict = {}
        self.crop_names: dict = {}
        self.loaded_at = 0.0
        self._lock = threading.Lock()

    def _load(self) -> None:
        products = {p["_id"]: p for p in products_col().find({"active": {"$ne": False}}, {"name": 1, "crop_id": 1, "price_unit": 1})}
        crops = {c["_id"]: c for c in crops_col().find({"active": {"$ne": False}}, {"name": 1, "default_product_id": 1})}
        tiers: list[dict[str, set]] = [{}, {}, {}]

        def put(tier: int, text: Any, pid: Any) -> None:
            key = word_key(text)
            if key and pid in products:
                tiers[tier].setdefault(key, set()).add(pid)

        for pid, p in products.items():
            put(0, p.get("name"), pid)
        for c in crops.values():
            put(0, c.get("name"), c.get("default_product_id"))
        blocked: set[str] = set()
        for w in crop_words_col().find({}, {"key": 1, "status": 1, "product_id": 1, "crop_id": 1}):
            if w.get("status") != "approved":
                blocked.add(word_key(w.get("key")))
                continue
            pid = w.get("product_id") or (crops.get(w.get("crop_id")) or {}).get("default_product_id")
            put(1, w.get("key"), pid)
        for n in crop_names_col().find({"status": "approved", "product_id": {"$ne": None}}, {"raw_name": 1, "product_id": 1}):
            put(2, n.get("raw_name"), n.get("product_id"))
        self.tiers, self.products, self.blocked = tiers, products, blocked
        self.crop_names = {cid: c.get("name") for cid, c in crops.items()}
        self.loaded_at = time.monotonic()
        logger.info("Word index loaded: %s keys per tier", [len(t) for t in tiers])

    def ensure(self) -> None:
        if time.monotonic() - self.loaded_at > WORD_INDEX_TTL_S:
            with self._lock:
                if time.monotonic() - self.loaded_at > WORD_INDEX_TTL_S:
                    if not self.loaded_at:
                        self._load()  # nothing to serve yet: let the error reach the caller
                        return
                    try:
                        self._load()
                    except Exception:
                        # Keep answering from the last good index; retry after another TTL.
                        logger.exception("Word index reload failed; keeping the previous one.")
                        self.loaded_at = time.monotonic()

    def resolve(self, text: Any) -> tuple[list, str]:
        """Return (product ids, how it matched). Empty list when nothing clear matches."""
        self.ensure()
        key = word_key(text)
        if not key:
            return [], "empty"
        for i, tier in enumerate(self.tiers):
            if i == 1 and key in self.blocked:
                return [], "word_pending"
            if key in tier:
                return self._prefer_exact(text, tier[key]), ("name", "farmer_word", "source_spelling")[i]
        return self._fuzzy(key)

    def _prefer_exact(self, text: Any, pids: set) -> list:
        """One product when several share a word key but one is named exactly as typed.

        "sweet potato" and "potato/sweet potato" have the same key; the farmer typed the first.
        """
        ordered = sorted(pids, key=str)
        if len(ordered) > 1:
            typed = " ".join(str(text or "").lower().split())
            exact = [p for p in ordered if " ".join(str((self.products.get(p) or {}).get("name") or "").lower().split()) == typed]
            if len(exact) == 1:
                return exact
        return ordered

    def _fuzzy(self, key: str) -> tuple[list, str]:
        """Accept a typo only when it is a clear one: within 1 edit (2 for 16+ letters)
        of a name or farmer word, and no other crop is equally close."""
        try:
            from rapidfuzz.distance import Levenshtein
        except ImportError:
            return [], "no_match"
        if len(key) < 4:
            return [], "no_match"
        allowed = 2 if len(key) >= 16 else 1
        best: Optional[int] = None
        targets: set = set()
        matched: list[str] = []
        for tier in self.tiers[:2]:  # typos are checked against names and farmer words only
            for k, pids in tier.items():
                d = Levenshtein.distance(key, k, score_cutoff=allowed)
                if d > allowed:
                    continue
                if best is None or d < best:
                    best, targets, matched = d, set(pids), [k]
                elif d == best:
                    targets |= pids
                    matched.append(k)
        if best is None:
            return [], "no_match"
        if len(targets) > 1:
            return [], "ambiguous_typo"
        logger.info("Typo match: %r -> %r (%d edit(s))", key, matched[0], best)
        return sorted(targets, key=str), f"typo:{matched[0]}"

    def suggestions(self, text: Any, limit: int = 3) -> list[str]:
        """Close names to offer back when nothing matched ("did you mean ...")."""
        try:
            from rapidfuzz import fuzz, process
        except ImportError:
            return []
        self.ensure()
        keys = list({k for tier in self.tiers[:2] for k in tier})
        # Word-aware scoring for hints only; automatic acceptance (_fuzzy) stays strict.
        return [k for k, score, _ in process.extract(word_key(text), keys, scorer=fuzz.WRatio, limit=limit) if score >= 70]


WORDS = WordIndex()


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
        if lat is not None and lon is not None and isinstance(coords, (list, tuple)) and len(coords) >= 2:
            c_lat, c_lon = _finite_float(coords[1]), _finite_float(coords[0])
            if c_lat is not None and c_lon is not None:
                dist = math.hypot(c_lat - lat, c_lon - lon)
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
    logger.info(
        "mandi_price_tool called | action=%s, commodity_name=%s, market_name=%s, state=%s, district=%s, lat=%s, long=%s, nearest_market=%s, radius_km=%s, search_by_apmc=%s, from_date=%s, to_date=%s, lookback_days=%s, sort_by=%s, sort_order=%s",
        action, commodity_name, market_name, state, district, lat, long, nearest_market, radius_km, search_by_apmc, from_date, to_date, lookback_days, sort_by, sort_order
    )
    state = _norm(state) if isinstance(state, str) else None
    district = _norm(district) if isinstance(district, str) else None
    market_name = _norm(market_name) if isinstance(market_name, str) else None
    commodity_name = _norm_commodity_name(commodity_name)
    tool_search_by_apmc = bool(search_by_apmc)
    lat, long = clean_lat_long(lat, long)
    radius_km = clean_radius_km(radius_km)
    lookback_days = clean_lookback_days(lookback_days)
    from_date = from_date.strip() if isinstance(from_date, str) and from_date.strip() else None
    to_date = to_date.strip() if isinstance(to_date, str) and to_date.strip() else None
    nearest_market = bool(nearest_market)

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

    state_cache: dict[str, list[str]] = {}

    def _state_exact_values(state: str) -> list[str]:
        """Every known spelling of the state (states.spellings), lower-case."""
        n = _norm(state) or ""
        if not n:
            return []
        if n not in state_cache:
            doc = states_col().find_one({"$or": [{"spellings": n}, {"name": n}, {"_id": n}]}, {"spellings": 1, "name": 1})
            if doc:
                state_cache[n] = sorted({_norm(v) for v in [doc.get("name"), *(doc.get("spellings") or [])] if _norm(v)})
            else:
                state_cache[n] = _state_exact_values_v1(state)
        return state_cache[n]

    def _mc_state_values(state: str) -> list[str]:
        """Lowercase exact keys for listings.state (and available_mandi.state)."""
        return _state_exact_values(state)

    known_states: dict[str, bool] = {}

    def _state_is_known(state_val: str) -> bool:
        """True when the state is in the states list or any mandi/listing uses that spelling."""
        n = _norm(state_val) or ""
        if n not in known_states:
            values = _mc_state_values(n)
            known_states[n] = bool(
                states_col().find_one({"$or": [{"spellings": n}, {"name": n}, {"_id": n}]}, {"_id": 1})
                or available_mandi_col().find_one({"state": {"$in": values}}, {"_id": 1})
                or markets_commodities_col().find_one({"state": {"$in": values}}, {"_id": 1})
            )
        return known_states[n]

    def _require_state(state_val: Optional[str]) -> Optional[dict]:
        if not state_val or not str(state_val).strip():
            return {
                "error": "Your state is not known, so mandi prices cannot be looked up. Please set your state in your profile.",
                "error_code": "STATE_REQUIRED",
            }
        if not _state_is_known(state_val):
            return {
                "error": (
                    f"Mandi prices are available only for Indian states and union territories, "
                    f"and '{_display_place(state_val)}' is not one we know. Please check the state in your profile."
                ),
                "error_code": "STATE_NOT_FOUND",
                "requested_state": state_val,
            }
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
        if not isinstance(coords, (list, tuple)) or len(coords) < 2:
            return None
        la, lo = _finite_float(coords[1]), _finite_float(coords[0])
        return (la, lo) if la is not None and lo is not None else None

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
        value = str(value).strip()
        # Strip ordinal suffixes e.g. "19th" -> "19", "1st" -> "1"
        value_clean = re.sub(r"(\d+)(?:st|nd|rd|th)\b", r"\1", value, flags=re.IGNORECASE)
        value_clean = re.sub(r"T.*$", "", value_clean) if re.match(r"\d{4}-\d{2}-\d{2}T", value_clean) else value_clean
        value_n = re.sub(r"[\s/.,]+", "-", value_clean).strip("-")
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
                if "%Y" not in fmt:
                    # strptime needs a year to accept 29-Feb; parse in a leap year, then set the real one.
                    dt = datetime.strptime(f"{value_n}-2024", f"{fmt}-%Y")
                    today = today_ist()
                    try:
                        dt = dt.replace(year=today.year)
                    except ValueError:  # 29-Feb outside a leap year
                        dt = dt.replace(year=today.year - 1, day=28)
                    if dt.date() > today:
                        # "27-Dec" asked in January means last December.
                        try:
                            dt = dt.replace(year=today.year - 1)
                        except ValueError:
                            dt = dt.replace(year=today.year - 1, day=28)
                else:
                    dt = datetime.strptime(value_n, fmt)
                return dt.replace(tzinfo=timezone.utc)
            except ValueError:
                continue
        raise FriendlyError(
            "BAD_DATE",
            f"I could not understand the date '{value}'. Please give a date like 28 October 2026.",
        )

    def _day_start(dt) -> datetime:
        d = dt.date() if isinstance(dt, datetime) else dt
        return datetime.combine(d, dt_time.min, tzinfo=timezone.utc)

    def _day_end(dt) -> datetime:
        d = dt.date() if isinstance(dt, datetime) else dt
        return datetime.combine(d, dt_time.max, tzinfo=timezone.utc)

    def _round2(v: Any) -> Optional[float]:
        try:
            return round(float(v), 2)
        except (TypeError, ValueError):
            return None

    def _distance_km(doc: Optional[dict]) -> Optional[float]:
        """Distance from the farmer's location to a mandi, or None when either is unknown."""
        if not doc or lat is None or long is None:
            return None
        coords = _market_lat_lon(doc)
        return round(_haversine_km(lat, long, coords[0], coords[1]), 1) if coords else None

    def _serialize_market(doc: dict) -> dict:
        ll = _market_lat_lon(doc)
        out = {
            "name":        doc.get("name"),
            "state":       doc.get("state"),
            "district":    doc.get("district"),
            "postcode":    doc.get("postcode"),
            "aliases":     doc.get("aliases", []),
            "coordinates": {"latitude": ll[0], "longitude": ll[1]} if ll else None,
        }
        dist = _distance_km(doc)
        if dist is not None:
            out["distance_km"] = dist
        return out

    def _serialize_price_record(pr: dict, mc: dict, market: Optional[dict], prices: Optional[dict] = None) -> dict:
        date_val = pr.get("date")
        prices = prices if prices is not None else {
            k: _round2(pr.get(k)) for k in ("modal_price", "min_price", "max_price", "arrival_quantity")
        }
        product = WORDS.products.get(mc.get("product_id")) or {}
        record = {
            "date":             date_val.date().isoformat() if isinstance(date_val, datetime) else None,
            "state":            mc.get("state"),
            "market_name":      market.get("name") if market else mc.get("market_name"),
            "district":         market.get("district") if market else None,
            "commodity_name":   mc.get("commodity_name"),
            "product_name":     product.get("name"),
            "variety":          mc.get("variety"),
            "grade":            mc.get("grade"),
            "commodity_group":  mc.get("commodity_group"),
            "source_url":    mc.get("source_url"),
            "source_system": display_source_system(mc.get("source_system")),
            "price_unit":    product.get("price_unit") or "Rs/quintal",
            "ingested_at":   ingested_iso(pr.get("ingested_at")),
            **prices,
        }
        dist = _distance_km(market)
        if dist is not None:
            record["distance_km"] = dist
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
        """Farmer's words → products (v2), through the in-memory WORDS index:
        product / crop name, then approved farmer word, then approved source
        spelling, then a clear typo match. Only approved links and active
        crops/products count. Returns {name: [{"_id": product_id, "canonical_name": ..., "crop_name": ...}]}.
        """
        results: dict[str, list[dict]] = {}
        for raw in names:
            pids, how = WORDS.resolve(raw)
            docs = []
            for pid in pids:
                p = WORDS.products.get(pid) or {}
                docs.append({"_id": pid, "canonical_name": p.get("name"),
                             "crop_name": WORDS.crop_names.get(p.get("crop_id")), "matched_by": how})
            results[raw] = docs
            if docs:
                logger.info("Resolved commodity '%s' (%s) to products: %s", raw, how, [d["canonical_name"] for d in docs])
            else:
                logger.warning("No approved product for input name: '%s' (%s)", raw, how)
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
        today = today_ist()
        if lookback_days_arg is not None:
            first = today - timedelta(days=int(lookback_days_arg) - 1)
            return {"date": {"$gte": _day_start(first), "$lte": _day_end(today)}}, {
                "mode": "lookback",
                "lookback_days": lookback_days_arg,
                "from": first.isoformat(),
                "to": today.isoformat(),
                "today": today.isoformat(),
            }
        if from_date_arg or to_date_arg:
            fd = _parse_date(from_date_arg).date() if from_date_arg else None
            td = _parse_date(to_date_arg).date() if to_date_arg else None
            if fd and td and fd > td:
                fd, td = td, fd
            date_range: dict[str, Any] = {}
            if fd:
                date_range["$gte"] = _day_start(fd)
                date_meta["from_date"] = fd.isoformat()
            if td:
                date_range["$lte"] = _day_end(td)
                date_meta["to_date"] = td.isoformat()
            date_meta["mode"] = "range"
            date_meta["today"] = today.isoformat()
            return {"date": date_range}, date_meta
        return {}, {"mode": "all_dates", "today": today.isoformat()}

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
                    "error": f"I could not find a mandi called '{_display_place(market_name)}' in {_display_place(state)}.",
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
                "error": f"No mandi is listed for {_display_place(state)}.",
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
                    "error": f"No mandi was found within {radius_km:g} km of your location.",
                    "error_code": "MARKET_NOT_FOUND",
                    "reason": "no_mandi_nearby",
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
        search_by_apmc: Optional[bool] = None,
    ) -> dict:
        """
        Orchestrated flow (avoids $near hangs):
          1) Require standardized state (exact match).
          2) Resolve commodity aliases; narrow by state + crop (+ date).
          3) One location scope, never a fallback to another:
               the named mandi, or the named district (when no mandi has that name), or
               the mandis within DEFAULT_MAX_RADIUS_KM of lat/long, or (without lat/long)
               the whole state.
          4) Only the asked day or period. With no price there, a plain message is returned;
             an older price or another mandi's price is never shown in its place.

"""
        missing = _require_state(state)
        if missing:
            return missing

        # ── Step 1: resolve commodity ───────────────────────────────────
        resolved = _resolve_commodity_aliases(commodity_list)
        ambiguous = {name: docs for name, docs in resolved.items() if len(docs) > 1}
        if ambiguous:
            name, docs = next(iter(ambiguous.items()))
            options = [str(d.get("canonical_name")) for d in docs if d.get("canonical_name")]
            return {
                "error": (
                    f"The crop name '{_display_place(name)}' can mean {_join_display(options).replace(' and ', ' or ')}. "
                    "Please tell me which one you want the price of."
                ),
                "error_code": "COMMODITY_AMBIGUOUS",
                "reason": "crop_ambiguous",
                "options": options,
            }
        alias_ids = [doc["_id"] for docs in resolved.values() for doc in docs if doc]
        unmatched = [name for name, docs in resolved.items() if not docs]
        if not alias_ids:
            suggestions = {n: WORDS.suggestions(n) for n in unmatched}
            hints = [s for n in unmatched for s in suggestions.get(n) or []]
            names = _join_display(list(unmatched))
            error = f"I could not find a crop called '{names}'."
            if hints:
                error += f" Did you mean {_join_display(list(dict.fromkeys(hints))).replace(' and ', ' or ')}?"
            else:
                error += " Please check the crop name and ask again."
            return {
                "error": error,
                "error_code": "COMMODITY_NOT_AVAILABLE",
                "unresolved_commodities": unmatched,
                "reason": "crop_not_recognised",
                "did_you_mean": suggestions,
            }

        state_norm_values = _mc_state_values(state or "")
        mc_coll = markets_commodities_col()
        pr_coll = price_records_col()

        use_apmc_search = tool_search_by_apmc if search_by_apmc is None else bool(search_by_apmc)
        # Messages name the product the farmer's word resolved to ("dhan" -> "paddy").
        crop_label = ", ".join(dict.fromkeys(
            str(d.get("canonical_name") or name) for name, docs in resolved.items() for d in docs
        )) or ", ".join(str(c) for c in commodity_list)

        def _named_market_unavailable(*, market_not_found: bool, matched_docs: list[dict]) -> dict:
            market_label = (
                _join_display([d.get("name") for d in matched_docs])
                or _display_place(market_name)
                or "the requested market"
            )
            if market_not_found:
                error = f"I could not find a mandi called '{_display_place(market_name)}' in {_display_place(state)}."
            else:
                error = f"{_display_place(crop_label)} price {when_phrase(date_meta)} is not available at {market_label}."
            return {
                "error": " ".join(error.split()),
                "error_code": "MARKET_NOT_FOUND" if market_not_found else "NO_PRICE_DATA",
                "reason": "market_not_found" if market_not_found else "no_price_at_market",
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
                active_mc_ids = pr_coll.distinct("market_commodity_id", pr_filter, maxTimeMS=MONGO_MAX_TIME_MS)
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
        # A farmer-named mandi is looked up by name, then (only when no mandi has that name)
        # as a district. When it has no price, the farmer is told so: other mandis are never
        # shown in its place.
        named_mandi_query = use_apmc_search and named_requested
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

            if named_status == "not_found":
                # No mandi has that name; it may name a district ("Cuddalore mandi").
                _district_raw_docs = _resolve_district_markets(market_name, state)
                if _district_raw_docs:
                    logger.info("market_name=%r names a district with %d APMCs.", market_name, len(_district_raw_docs))
            if named_status and not _district_raw_docs:
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
                    "error": f"No mandi in {_display_place(state)} reports {_display_place(crop_label)} prices.",
                    "error_code": "COMMODITY_NOT_AVAILABLE",
                    "reason": "no_listings_in_state",
                }
            if not scope["market_ids"] and has_geo:
                # Listings exist but none is tied to a known mandi, so distance cannot be measured.
                return {
                    "error": (
                        f"{_display_place(crop_label)} prices are not available for mandis within "
                        f"{geo_radius_km:g} km of your location."
                    ),
                    "error_code": "NO_PRICE_DATA",
                    "reason": "no_mandi_nearby",
                }

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
            dropped = 0
            for pr in raw_records:
                prices = clean_price_values(pr)
                if prices is None:
                    dropped += 1  # zero, min above max, or modal outside min..max
                    continue
                mc = mc_by_id.get(pr.get("market_commodity_id"), {})
                mid = mc.get("mandi_id")
                mkt = mandi_by_id.get(mid) if mid else None
                formatted.append(_serialize_price_record(pr, mc, mkt, prices))
            if dropped:
                logger.info("Left out %d price record(s) that cannot be right.", dropped)
            if lat is not None and long is not None:
                # Newest first; on the same day, the nearest mandi first.
                formatted.sort(key=lambda r: (r.get("distance_km") is None, r.get("distance_km") or 0))
                formatted.sort(key=lambda r: r.get("date") or "", reverse=True)

            stats = _compute_stats(formatted)
            # The latest scrape that saved any of these rows (all rows, not only the 15 returned).
            updated = [r["ingested_at"] for r in formatted if r.get("ingested_at")]
            if updated:
                resolution_meta["data_updated_at"] = max(updated)
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

        def _fetch_stage(market_ids_arg: Optional[list], mandi_docs_arg: Optional[dict]) -> dict:
            """Prices for the asked day or period only. An older price is never shown in their place."""
            return _do_fetch(market_ids_arg, alias_ids, state, mandi_docs_arg)

        def _district_label() -> str:
            name = next((d.get("district") for d in _district_raw_docs if d.get("district")), None) or market_name
            return f"mandis in {_display_place(name)} district" if name else "the mandis you asked about"

        def _district_notice() -> str:
            """The farmer named a place that is a district, not a mandi: say which mandis answer."""
            return (
                f"No mandi is named '{_display_place(market_name)}', so prices from "
                f"{_district_label()} are shown."
            )

        stages: list[tuple[str, Optional[str], Optional[float], Optional[float], bool]] = []
        # (priority_label, market_name_arg, lat_arg, lon_arg, nearest_market_arg)
        # lat/long on the market_name stage only orders equally good name matches.
        if explicit_market_query:
            stages.append(("market_name", market_name, lat, long, False))
        else:
            if _district_raw_docs:
                # The farmer named a district: only its mandis answer.
                stages.append(("district_markets", market_name, lat, long, True))
            elif has_geo:
                stages.append(("lat_long", None, lat, long, True))
            else:
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
                stage_result = _fetch_stage(None, None)
                if _has_price_rows(stage_result):
                    result = stage_result
                    chosen_stage = priority_label
                    raw_docs = []
                    market_result = {"mode": "state_wide"}
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
                d_result = _fetch_stage(list(d_mandi.keys()), d_mandi)
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

            stage_result = _fetch_stage(stage_ids, stage_mandi)
            if _has_price_rows(stage_result):
                result = stage_result
                chosen_stage = priority_label
                raw_docs = stage_docs
                if explicit_market_query:
                    result.setdefault("resolution", {})["requested_market_name"] = market_name
                break
            logger.info(
                "Stage %s returned 0 price records; trying next priority.",
                priority_label,
            )
            if explicit_market_query and priority_label == "market_name":
                # The named mandi has no price for the asked day: say so, show no other mandi.
                named_status = "no_data"
                named_matched_docs = stage_docs
                result = _named_market_unavailable(market_not_found=False, matched_docs=stage_docs)
                chosen_stage = priority_label
                break
            result = stage_result
            raw_docs = stage_docs

        if named_mandi_query and named_status == "not_found" and _district_raw_docs and _has_price_rows(result):
            result.setdefault("resolution", {}).update(
                requested_market_name=market_name,
                market_fallback_notice=_district_notice(),
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

        if not _has_price_rows(result) and not result.get("reason"):
            # Nothing for the asked day or period: say so plainly, never an older price instead.
            if "district_markets" in tried:
                where = f"in {_district_label()}"
            elif has_geo:
                where = f"in mandis within {geo_radius_km:g} km of your location"
            else:
                where = f"in {_display_place(state)}"
            when = when_phrase(date_meta)
            result = {
                "error": " ".join(f"{_display_place(crop_label)} price {when} is not available {where}.".split()),
                "error_code": "NO_PRICE_DATA",
                "reason": "no_price_today" if when == "today" else "no_price_in_period",
                "resolution": {"requested_commodity": commodity_list, "requested_state": state},
            }

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

    def _commodity_required(action_name: str) -> dict:
        return {
            "error": "Please tell me which crop you want the price of.",
            "error_code": "COMMODITY_REQUIRED",
            "action": action_name,
        }

    def _period(default_days: Optional[int]) -> Optional[int]:
        """lookback_days to use: the caller's, else default_days when no dates were given."""
        if lookback_days is not None:
            return lookback_days
        return default_days if not from_date and not to_date else None

    def _fetch(days: Optional[int]) -> dict:
        c_list = [commodity_name] if isinstance(commodity_name, str) else commodity_name
        return _fetch_price_data(
            commodity_list=c_list,
            market_name=market_name, state=state,
            lat=lat, long=long,
            nearest_market=nearest_market, radius_km=radius_km,
            from_date=from_date if days is None else None,
            to_date=to_date if days is None else None,
            lookback_days=days,
        )

    # ======================================================================
    # ACTION 1: get_today_price — today's price only; no older price in its place
    # ======================================================================
    def _get_today_price() -> dict:
        if not commodity_name:
            return _commodity_required("get_today_price")
        result = _fetch(_period(1))
        if not result.get("error"):
            result["action"] = "get_today_price"
            result.pop("stats", None)
        return result

    # ======================================================================
    # ACTION 2: get_price_history
    # ======================================================================
    def _get_price_history() -> dict:
        if not commodity_name:
            return _commodity_required("get_price_history")
        result = _fetch(_period(7))
        if not result.get("error"):
            result["action"] = "get_price_history"
            result.pop("stats", None)
        return result

    # ======================================================================
    # ACTION 3: get_price_summary
    # ======================================================================
    def _get_price_summary() -> dict:
        if not commodity_name:
            return _commodity_required("get_price_summary")
        result = _fetch(_period(7))
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

    def _price_for_ranking(r: dict) -> Optional[float]:
        return r.get("modal_price") or r.get("max_price") or r.get("min_price")

    # ======================================================================
    # ACTION 4: get_highest_price (last 7 days unless a period is given)
    # ======================================================================
    def _get_highest_price() -> dict:
        if not commodity_name:
            return _commodity_required("get_highest_price")
        result = _fetch(_period(7))
        if result.get("error"):
            return result
        records = [r for r in result.get("price_records") or [] if _price_for_ranking(r)]
        best = sorted(records, key=lambda r: (_price_for_ranking(r) or 0, r.get("max_price") or 0), reverse=True)
        return {
            "action":            "get_highest_price",
            "highest_records":   best[:1],
            "resolution":        result.get("resolution"),
            "total_records_analysed": result.get("total_records_returned"),
        }

    # ======================================================================
    # ACTION 4B: get_lowest_price (last 7 days unless a period is given)
    # ======================================================================
    def _get_lowest_price() -> dict:
        if not commodity_name:
            return _commodity_required("get_lowest_price")
        result = _fetch(_period(7))
        if result.get("error"):
            return result
        records = [r for r in result.get("price_records") or [] if _price_for_ranking(r)]
        best = sorted(records, key=lambda r: (_price_for_ranking(r) or 0, r.get("min_price") or 0))
        return {
            "action":            "get_lowest_price",
            "lowest_records":    best[:1],
            "resolution":        result.get("resolution"),
            "total_records_analysed": result.get("total_records_returned"),
        }

    def _arrival_rows(records: list[dict]) -> list[dict]:
        return [
            {
                "date":             r.get("date"),
                "market_name":      r.get("market_name"),
                "state":            r.get("state"),
                "district":         r.get("district"),
                "commodity_name":   r.get("commodity_name"),
                "product_name":     r.get("product_name"),
                "variety":          r.get("variety"),
                "arrival_quantity": r.get("arrival_quantity"),
                "source_system":    r.get("source_system"),
                **({"distance_km": r["distance_km"]} if r.get("distance_km") is not None else {}),
            }
            for r in records
        ]

    def _arrival_response(action_name: str, result: dict) -> dict:
        rows = _arrival_rows(result.get("price_records") or [])
        stats = result.get("stats") or {}
        resp = {
            "action":            action_name,
            "arrival_records":   rows,
            "total_arrival_qty": (stats.get("overall") or {}).get("total_arrival_qty"),
            "avg_arrival_qty":   (stats.get("overall") or {}).get("avg_arrival_qty"),
            "resolution":        result.get("resolution"),
            "total_records_returned": len(rows),
        }
        if not rows or any(r.get("arrival_quantity") is None for r in rows):
            resp["message"] = ARRIVAL_AGMARKNET_NOTICE
            resp.setdefault("resolution", {})["arrival_notice"] = ARRIVAL_AGMARKNET_NOTICE
        return resp

    # ======================================================================
    # ACTION 5: get_today_arrival — today's arrivals only
    # ======================================================================
    def _get_today_arrival() -> dict:
        if not commodity_name:
            return _commodity_required("get_today_arrival")
        result = _fetch(_period(1))
        if result.get("error"):
            return result
        return _arrival_response("get_today_arrival", result)

    # ======================================================================
    # ACTION 6: get_arrival_history
    # ======================================================================
    def _get_arrival_history() -> dict:
        if not commodity_name:
            return _commodity_required("get_arrival_history")
        result = _fetch(_period(7))
        if result.get("error"):
            return result
        resp = _arrival_response("get_arrival_history", result)
        resp["total_records_returned"] = result.get("total_records_returned")
        return resp

    # ======================================================================
    # ACTION 7: get_extreme_arrival (last 7 days unless a period is given)
    # ======================================================================
    def _get_extreme_arrival() -> dict:
        if not commodity_name:
            return _commodity_required("get_extreme_arrival")
        result = _fetch(_period(7))
        if result.get("error"):
            return result
        records = result.get("price_records") or []
        with_arrival = [r for r in records if r.get("arrival_quantity") is not None]
        order = (sort_order or "highest").strip().lower()
        descending = order != "lowest"
        sorted_records = sorted(with_arrival, key=lambda r: r["arrival_quantity"], reverse=descending)
        label = "highest" if descending else "lowest"
        resp = {
            "action":              "get_extreme_arrival",
            "sort_order":          label,
            f"{label}_arrivals":   _arrival_rows(sorted_records[:5]),
            "resolution":          result.get("resolution"),
            "total_records_analysed": len(records),
        }
        if not sorted_records:
            resp["message"] = ARRIVAL_AGMARKNET_NOTICE
            resp.setdefault("resolution", {})["arrival_notice"] = ARRIVAL_AGMARKNET_NOTICE
        return resp

    # ======================================================================
    # ACTION 8: search_markets
    # ======================================================================
    def _action_search_markets() -> dict:
        has_geo = lat is not None and long is not None
        result = _do_search_markets(
            market_name=market_name, state=state,
            lat=lat, long=long,
            nearest_market=nearest_market,
            # "Mandis near me" lists only mandis within the radius, nearest first.
            radius_km=(radius_km or DEFAULT_MAX_RADIUS_KM) if has_geo and not market_name else radius_km,
        )
        result.pop("_raw_docs", None)
        result["action"] = "search_markets"
        return result

    # ======================================================================
    # ACTION 9: get_price_with_nearby
    # ======================================================================
    NEARBY_RADIUS_KM = DEFAULT_MAX_RADIUS_KM  # nearby mandis around the named one

    def _get_price_with_nearby() -> dict:
        """The named mandi's price and, alongside it, prices at mandis near it (asked day only).

        When the named mandi has no price, the answer is that message alone.
        """
        if not commodity_name:
            return _commodity_required("get_price_with_nearby")
        if not market_name:
            # No named mandi → fall back to regular get_today_price
            return _get_today_price()

        c_list = [commodity_name] if isinstance(commodity_name, str) else commodity_name

        eff_lookback = lookback_days if (from_date or to_date) is None else None
        if eff_lookback is None and not from_date and not to_date:
            eff_lookback = 1

        # ── Part 1: the named mandi's price for the asked day ───────────────
        named_result = _fetch_price_data(
            commodity_list=c_list,
            market_name=market_name, state=state,
            lat=lat, long=long,
            nearest_market=False, radius_km=radius_km,
            from_date=from_date, to_date=to_date,
            lookback_days=eff_lookback,
            # Respect the outer search_by_apmc flag: if the agent identified the
            # market_name as a district (search_by_apmc=False), honour that here
            # so district names like "Kallakurichi" resolve correctly instead of
            # being treated as APMC names that don't match anything.
            search_by_apmc=tool_search_by_apmc,
        )
        if named_result.get("error"):
            # The named mandi has no price (or no mandi has that name): only that message.
            # Other mandis' prices are never shown in its place.
            return {**named_result, "action": "get_price_with_nearby"}
        named_result["action"] = "get_today_price"
        named_result.pop("stats", None)

        # ── Part 2: other mandis near the named one, same day ───
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
        return {"error": "I could not tell what you want to know about mandi prices.", "error_code": "UNSUPPORTED_ACTION"}

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
            messages = list(dict.fromkeys(str(res.get("error")).strip() for res in results_by_crop.values() if res.get("error")))
            codes = list(dict.fromkeys(res.get("error_code") for res in results_by_crop.values() if res.get("error_code")))
            return {
                "error": " ".join(messages) or SERVICE_ERROR_MESSAGE,
                "error_code": codes[0] if len(codes) == 1 else "NO_PRICE_DATA",
                "details": {c: res.get("error") for c, res in results_by_crop.items()},
                "by_commodity": results_by_crop,
                "action": action_name,
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
        # Each crop's own message already names the crop ("Onion price today is not available ...").
        warnings = [str(res.get("error")).strip() for res in results_by_crop.values() if res.get("error")]

        combined_res_meta: dict[str, Any] = {}
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
                        "I can share today's mandi price, price history, average, highest or lowest "
                        "prices, arrivals and nearby mandis, but I could not tell which of these you want."
                    ),
                    "error_code": "UNSUPPORTED_ACTION",
                    "supported_actions": sorted(dispatch.keys()),
                }
            try:
                return handler()
            except FriendlyError as exc:
                return {**exc.payload(), "action": act_name}
            except Exception:
                logger.exception("mandi_price_tool action=%s crop=%s failed", act_name, commodity_name)
                return {"error": SERVICE_ERROR_MESSAGE, "error_code": "SERVICE_ERROR", "action": act_name}
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
        except Exception:
            logger.exception("mandi_price_tool action=%s failed", key)
            return {"error": SERVICE_ERROR_MESSAGE, "error_code": "SERVICE_ERROR", "action": key}

    results: dict[str, dict] = {}
    for key in actions:
        try:
            results[key] = _execute_action_with_multi_crop(key)
        except Exception:
            logger.exception("mandi_price_tool action=%s failed", key)
            results[key] = {"error": SERVICE_ERROR_MESSAGE, "error_code": "SERVICE_ERROR", "action": key}

    return {"actions": actions, "results": results}


# --------------------------------------------------------------------------
# Entrypoint
# --------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run(transport="streamable-http")
