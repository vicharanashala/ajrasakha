"""Daily mandi price agent: MiniMax intent → programmatic mandi_price_tool → MiniMax answer."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Optional

from dotenv import load_dotenv
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langchain_mcp_adapters.client import MultiServerMCPClient
from pydantic import BaseModel

from ajrasakha.agents.config import MCP_URLS, MINIMAX_MODEL, get_minimax_chat_model
from ajrasakha.agents.llm_trace import trace_llm_error, trace_llm_request, trace_llm_response
from ajrasakha.agents.daily_price_formatter import (
    RenderedAnswer,
    arrival_unavailable_message,
    dedupe_and_sort_nearby_records as _dedupe_and_sort_nearby_records,
    extract_source_systems as _extract_source_systems_from_payload,
    fmt_price as _fmt_price,
    is_arrival_quantity_unavailable as _is_arrival_quantity_unavailable,
    render_daily_price_answer,
    summary_is_grounded,
)
from ajrasakha.agents.daily_price_support import (
    LLM_REPORTABLE_REASONS,
    MISSING_COMMODITY,
    MISSING_LOCATION,
    UNRECOGNIZED_REQUEST,
    clarify_reason_for_error,
    detect_unsupported_query,
    message_for,
    status_for,
)
from ajrasakha.agents.location_context import profile_location_note
from ajrasakha.agents.prompts import DAILY_PRICE_INTENT_PROMPT, DAILY_PRICE_SUMMARY_PROMPT

logger = logging.getLogger(__name__)

load_dotenv()


_FARMER_ACTIONS = frozenset({
    "get_today_price",
    "get_price_history",
    "get_price_summary",
    "get_highest_price",
    "get_lowest_price",
    "get_today_arrival",
    "get_arrival_history",
    "get_extreme_arrival",
    "search_markets",
    "get_price_with_nearby",
})

_COMMODITY_ACTIONS = frozenset({
    "get_today_price",
    "get_price_history",
    "get_price_summary",
    "get_highest_price",
    "get_lowest_price",
    "get_today_arrival",
    "get_arrival_history",
    "get_extreme_arrival",
    "get_price_with_nearby",
})

_GEO_ACTIONS = frozenset({
    "get_today_price",
    "get_price_history",
    "get_price_summary",
    "get_highest_price",
    "get_lowest_price",
    "get_today_arrival",
    "get_arrival_history",
    "get_extreme_arrival",
    "search_markets",
    "get_price_with_nearby",
})

_HISTORY_ACTIONS = frozenset({
    "get_price_history",
    "get_price_summary",
    "get_highest_price",
    "get_lowest_price",
    "get_arrival_history",
    "get_extreme_arrival",
})

# Old tool actions → new MCP actions (PR #1017 renamed the surface).
_LEGACY_ACTION_MAP = {
    "get_prices": "get_today_price",
    "lookup_commodity": "get_today_price",
    "get_unresolved_markets": "search_markets",
}

MAX_INTENT_ACTIONS = 3

_daily_price_mcp: MultiServerMCPClient | None = None
_mandi_price_tool = None


def _get_daily_price_mcp() -> MultiServerMCPClient:
    global _daily_price_mcp
    if _daily_price_mcp is None:
        _daily_price_mcp = MultiServerMCPClient(
            {
                "daily_price": {
                    "url": MCP_URLS["daily_price"],
                    "transport": "streamable_http",
                }
            }
        )
    return _daily_price_mcp


async def _get_mandi_price_tool():
    global _mandi_price_tool
    if _mandi_price_tool is None:
        tools = await _get_daily_price_mcp().get_tools()
        for t in tools:
            name = getattr(t, "name", None) or ""
            if name == "mandi_price_tool":
                _mandi_price_tool = t
                break
        if _mandi_price_tool is None and tools:
            _mandi_price_tool = tools[0]
    return _mandi_price_tool


def _empty_intent_fields() -> dict[str, Any]:
    return {
        "nearest_market": True,
        "radius_km": None,
        "lookback_days": None,
        "from_date": None,
        "to_date": None,
        "market_name": None,
        "search_by_apmc": False,
        "state": None,
        "sort_order": None,
    }


_MARKET_DISCOVERY_PHRASES = (
    "nearby market",
    "near market",
    "nearby mandi",
    "near mandi",
    "nearest market",
    "which market",
    "which mandi",
    "find market",
    "find mandi",
    "list market",
    "list mandi",
    "mandi near",
    "market near",
    "apmc near",
    "find apmc",
)

_HISTORICAL_PRICE_KEYWORDS = (
    "average",
    "avg",
    "summary",
    "statistics",
    "stats",
    "trend",
    "history",
    "week",
    "month",
    " days",
    "last ",
    "past ",
    "from ",
    "between",
)

_POINT_IN_TIME_PRICE_KEYWORDS = (
    "modal price",
    "modal rate",
    "min price",
    "minimum price",
    "min rate",
    "max price",
    "maximum price",
    "max rate",
    "minimum and maximum",
    "min and max",
    "min & max",
    "minimum & maximum",
    "min max",
)

def _is_market_discovery_query(query: str) -> bool:
    q = (query or "").lower()
    if any(k in q for k in ("arrival", "arrivals", "price", "rate", "modal", "highest", "lowest", "cost", "average", "avg")):
        return False
    return any(phrase in q for phrase in _MARKET_DISCOVERY_PHRASES)


def _asks_for_historical_or_summary_price(query: str) -> bool:
    q = (query or "").lower()
    return any(keyword in q for keyword in _HISTORICAL_PRICE_KEYWORDS)


def _asks_for_point_in_time_price(query: str) -> bool:
    q = (query or "").lower()
    return any(keyword in q for keyword in _POINT_IN_TIME_PRICE_KEYWORDS)


def _should_use_today_price_for_query(query: str) -> bool:
    """Modal/min/max price without a time period → today's price (latest fallback in tool)."""
    return _asks_for_point_in_time_price(query) and not _asks_for_historical_or_summary_price(query)


# Words that make a place a market ("Bilasipara APMC", "Azadpur mandi", "Sonarpur haat").
# The planner normally sends an English query; romanized words cover translations that
# keep the local word, and the Indian-script words cover queries that reach us untranslated.
_MARKET_KEYWORDS_LATIN = (
    "apmc", "apmcs", "mandi", "mandis", "mandai", "mand", "market", "markets",
    "hat", "hats", "haat", "haats", "bazar", "bazaar", "bazars", "bajar",
    "sandhai", "santhe", "shandy", "chantha",
)
_MARKET_KEYWORDS_NATIVE = (
    # Hindi / Marathi (Devanagari)
    "मंडी", "मण्डी", "मंडई", "बाजार", "बाज़ार", "हाट", "मार्केट", "एपीएमसी",
    # Bengali / Assamese
    "মণ্ডি", "মন্ডি", "বাজার", "বজাৰ", "হাট", "মার্কেট",
    # Punjabi
    "ਮੰਡੀ", "ਬਾਜ਼ਾਰ", "ਬਾਜਾਰ",
    # Gujarati
    "મંડી", "બજાર", "માર્કેટ",
    # Odia
    "ମଣ୍ଡି", "ବଜାର", "ହାଟ",
    # Tamil
    "சந்தை", "மண்டி", "மார்க்கெட்",
    # Telugu
    "మార్కెట్", "మండి", "సంత",
    # Kannada
    "ಮಾರುಕಟ್ಟೆ", "ಮಂಡಿ", "ಸಂತೆ", "ಎಪಿಎಂಸಿ",
    # Malayalam
    "ചന്ത", "മാർക്കറ്റ്", "മണ്ടി",
    # Urdu
    "منڈی", "بازار",
)
_LATIN_MARKET_ALT = "|".join(sorted(_MARKET_KEYWORDS_LATIN, key=len, reverse=True))
# Indic words take case endings ("बाजार में", "বাজারে", "சந்தையில்") and \b is unreliable
# around their vowel signs, so only the start of the word is anchored.
_NATIVE_MARKET_ALT = "|".join(sorted(_MARKET_KEYWORDS_NATIVE, key=len, reverse=True))
_LATIN_MARKET_RE = re.compile(rf"(?<![a-z0-9])(?:{_LATIN_MARKET_ALT})(?![a-z0-9])", re.IGNORECASE)
_NATIVE_MARKET_RE = re.compile(rf"(?:^|(?<=[\s,.;:!?()\"'/-]))(?:{_NATIVE_MARKET_ALT})")
_ANY_MARKET_ALT = rf"(?<![a-z0-9])(?:{_LATIN_MARKET_ALT})(?![a-z0-9])|(?:{_NATIVE_MARKET_ALT})"

# "market price", "mandi rate", "mandi bhav", "बाजार भाव": the market word describes the
# price, it does not name a market.
_GENERIC_MARKET_PHRASE_RE = re.compile(
    rf"(?<![a-z0-9])(?:{_LATIN_MARKET_ALT})\s+(?:prices?|rates?|bhaa?v|value|dar|arrivals?|summary|trends?)(?![a-z0-9])"
    r"|(?:मंडी|मण्डी|बाजार|बाज़ार|मार्केट)\s*(?:भाव|रेट|दर|मूल्य)"
    r"|(?:বাজার|বজাৰ)\s*(?:দর|দাম|মূল্য)"
    r"|ਮੰਡੀ\s*(?:ਭਾਅ|ਰੇਟ)|(?:મંડી|બજાર)\s*(?:ભાવ|રેટ)"
    r"|(?:சந்தை|மார்க்கெட்)\s*விலை|మార్కెట్\s*ధర|ಮಾರುಕಟ್ಟೆ\s*(?:ಬೆಲೆ|ದರ)",
    re.IGNORECASE,
)
_DISTRICT_WORDS = r"district|dist|zila|zilla|jila|jilla|जिला|जिले|জেলা|ਜ਼ਿਲ੍ਹਾ|જિલ્લો|ଜିଲ୍ଲା|மாவட்டம்|జిల్లా|ಜಿಲ್ಲೆ|ജില്ല"

# Words that cannot be (part of) a mandi name pulled out of a query.
_NOT_MARKET_NAME_WORDS = frozenset({
    "district", "state", "price", "prices", "rate", "rates", "cost", "modal", "bhav", "bhaav",
    "today", "todays", "yesterday", "current", "latest", "nearby", "nearest", "near", "local",
    "my", "which", "any", "all", "this", "that", "the", "a", "an", "what", "is", "for",
})
_STOP_AFTER_MARKET_WORD = (
    r"(?:prices?|rates?|bhaa?v|value|dar|arrivals?|summary|trends?|in|at|of|for|near|nearby|"
    r"today|yesterday|now|on|from|and|or|with|is|was|the|a|an)"
)
# 1-4 words of a place name; a preposition ends the name ("of coconut at X mandi" -> "X mandi").
_NAME_WORD = r"(?!(?:in|at|from|of|for|on|near|the|and|or|to|is)\b)[a-z][a-z0-9.'&-]*"
_NAME_WORDS = rf"{_NAME_WORD}(?:\s+{_NAME_WORD}){{0,3}}?"
# "... in/at/from Bilasipara APMC", "... in Kurnool rythu bazar"
_MARKET_AFTER_PREP_RE = re.compile(
    rf"\b(?:in|at|from|of)\s+({_NAME_WORDS}\s+(?:{_LATIN_MARKET_ALT}))(?![a-z0-9])",
    re.IGNORECASE,
)
# "Bilasipara mandi onion price" (name opens the query)
_MARKET_AT_START_RE = re.compile(
    rf"^\s*({_NAME_WORDS}\s+(?:{_LATIN_MARKET_ALT}))(?![a-z0-9])",
    re.IGNORECASE,
)
# "onion price at APMC Bilasipara", "rate in mandi Azadpur"
_MARKET_WORD_FIRST_RE = re.compile(
    rf"(?<![a-z0-9])((?:{_LATIN_MARKET_ALT})\s+(?!{_STOP_AFTER_MARKET_WORD}\b){_NAME_WORDS})(?=\s*(?:$|[,.?!]|\b(?:in|at|for|on|today|yesterday|district)\b))",
    re.IGNORECASE,
)


def _strip_market_keywords(text: str) -> str:
    """Name without market words: "apmc bilasipara" -> "bilasipara"."""
    stripped = _NATIVE_MARKET_RE.sub(" ", _LATIN_MARKET_RE.sub(" ", text or ""))
    return re.sub(r"\s+", " ", stripped).strip(" ,.-")


def _names_a_market(text: str) -> bool:
    """True if a market word is used as a market, not only in "market price" / "mandi bhav"."""
    cleaned = _GENERIC_MARKET_PHRASE_RE.sub(" ", text or "")
    return bool(_LATIN_MARKET_RE.search(cleaned) or _NATIVE_MARKET_RE.search(cleaned))


def _detect_search_by_apmc(query: str, market_name: str | None = None) -> bool:
    """True when the farmer named a specific APMC/mandi/market/haat, False for a plain place/district."""
    if not query:
        return False
    q = query.lower()
    if not market_name:
        return _names_a_market(q)

    mn = str(market_name).strip().lower()
    if re.search(rf"(?:^|\s)(?:{_DISTRICT_WORDS})(?:\s|$)", mn):
        return False
    if _LATIN_MARKET_RE.search(mn) or _NATIVE_MARKET_RE.search(mn):
        # The extracted name already carries the market word ("Bilasipara APMC", "आज़ादपुर मंडी").
        return True
    core = _strip_market_keywords(mn)
    if not core:
        return False
    core_re = re.escape(core)
    if re.search(rf"{core_re}[\s,]+(?:{_DISTRICT_WORDS})", q):
        return False  # "Cuddalore district"
    if core in q:
        return bool(
            # "Bilasipara mandi", "Kurnool rythu bazar", "Bilasipara regulated market"
            re.search(rf"{core_re}[\s,]*(?:[^\W\d_]+\s+){{0,2}}(?:{_ANY_MARKET_ALT})", q)
            # "APMC Bilasipara", "market at Aluva", "mandi of Azadpur"
            or re.search(rf"(?:{_ANY_MARKET_ALT})\s+(?:(?:at|in|of)\s+)?{core_re}", q)
        )
    # The name was transliterated by the LLM ("Azadpur" for "आज़ादपुर मंडी"), so it cannot be
    # located in the query text: any market word in the query decides.
    return bool(_LATIN_MARKET_RE.search(q) or _NATIVE_MARKET_RE.search(q))


def _extract_market_name_from_query(query: str) -> str | None:
    """A mandi the query names with a market word ("Aluva market", "APMC Bilasipara"), else None.

    A plain place ("in Pune") is not a mandi: location comes from the farmer profile,
    so it is not extracted here. The LLM intent is the primary extractor; this only
    fills in when it returned no market_name.
    """
    if not query:
        return None
    for pattern in (_MARKET_AFTER_PREP_RE, _MARKET_AT_START_RE, _MARKET_WORD_FIRST_RE):
        for match in pattern.finditer(query):
            name = re.sub(r"\s+", " ", match.group(1)).strip(" ,.-")
            core_words = set(_strip_market_keywords(name.lower()).split())
            if not core_words or core_words & _NOT_MARKET_NAME_WORDS:
                continue
            rest = query[match.end(1):]
            if re.match(rf"\s*(?:{_DISTRICT_WORDS})(?![a-z])", rest, re.IGNORECASE):
                continue  # "APMC Dhubri district" names a district
            if pattern is _MARKET_AT_START_RE and re.match(
                r"\s*(?:prices?|rates?|bhaa?v|value|dar)\b", rest, re.IGNORECASE,
            ):
                continue  # "onion mandi bhav", "rice market price": the crop's market rate
            return name
    return None


_MONTH_NAME_MAP = {
    "jan": "Jan", "january": "Jan",
    "feb": "Feb", "february": "Feb",
    "mar": "Mar", "march": "Mar",
    "apr": "Apr", "april": "Apr",
    "may": "May",
    "jun": "Jun", "june": "Jun",
    "jul": "Jul", "july": "Jul",
    "aug": "Aug", "august": "Aug",
    "sep": "Sep", "sept": "Sep", "september": "Sep",
    "oct": "Oct", "october": "Oct",
    "nov": "Nov", "november": "Nov",
    "dec": "Dec", "december": "Dec",
}

_SPECIFIC_DATE_REGEX_1 = re.compile(
    r"\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?\b",
    re.IGNORECASE,
)
_SPECIFIC_DATE_REGEX_2 = re.compile(
    r"\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?\b",
    re.IGNORECASE,
)


def _extract_date_from_query(query: str) -> str | None:
    if not query:
        return None
    from datetime import datetime
    current_year = datetime.now().year

    m1 = _SPECIFIC_DATE_REGEX_1.search(query)
    if m1:
        day = int(m1.group(1))
        mon = _MONTH_NAME_MAP.get(m1.group(2).lower())
        year = int(m1.group(3)) if m1.group(3) else current_year
        if mon and 1 <= day <= 31:
            return f"{day:02d}-{mon}-{year}"

    m2 = _SPECIFIC_DATE_REGEX_2.search(query)
    if m2:
        mon = _MONTH_NAME_MAP.get(m2.group(1).lower())
        day = int(m2.group(2))
        year = int(m2.group(3)) if m2.group(3) else current_year
        if mon and 1 <= day <= 31:
            return f"{day:02d}-{mon}-{year}"

    return None


# Matches "from <date1> to <date2>" and "between <date1> and <date2>" patterns
_DATE_RANGE_PATTERNS = [
    re.compile(
        r"\bfrom\s+"
        r"(\d{1,2})(?:st|nd|rd|th)?\s+"
        r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
        r"(?:\s+(\d{4}))?"
        r"\s+to\s+"
        r"(\d{1,2})(?:st|nd|rd|th)?\s+"
        r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
        r"(?:\s+(\d{4}))?",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bbetween\s+"
        r"(\d{1,2})(?:st|nd|rd|th)?\s+"
        r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
        r"(?:\s+(\d{4}))?"
        r"\s+and\s+"
        r"(\d{1,2})(?:st|nd|rd|th)?\s+"
        r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
        r"(?:\s+(\d{4}))?",
        re.IGNORECASE,
    ),
    # "between 1st and 10th august" — shared month at the end
    re.compile(
        r"\bbetween\s+"
        r"(\d{1,2})(?:st|nd|rd|th)?"
        r"\s+and\s+"
        r"(\d{1,2})(?:st|nd|rd|th)?\s+"
        r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
        r"(?:\s+(\d{4}))?",
        re.IGNORECASE,
    ),
]


def _extract_date_range_from_query(query: str) -> tuple[str | None, str | None]:
    """Extract (from_date, to_date) from 'from X to Y' / 'between X and Y' patterns.
    Returns (None, None) if no range found.
    """
    if not query:
        return None, None
    from datetime import datetime
    current_year = datetime.now().year

    # First two patterns: 6 capture groups (day1, mon1, yr1, day2, mon2, yr2)
    for pattern in _DATE_RANGE_PATTERNS[:2]:
        m = pattern.search(query)
        if m:
            day1 = int(m.group(1))
            mon1_str = m.group(2)
            yr1 = int(m.group(3)) if m.group(3) else current_year
            day2 = int(m.group(4))
            mon2_str = m.group(5)
            yr2 = int(m.group(6)) if m.group(6) else current_year
            mon1 = _MONTH_NAME_MAP.get(mon1_str.lower())
            mon2 = _MONTH_NAME_MAP.get(mon2_str.lower())
            if mon1 and mon2 and 1 <= day1 <= 31 and 1 <= day2 <= 31:
                return f"{day1:02d}-{mon1}-{yr1}", f"{day2:02d}-{mon2}-{yr2}"

    # Third pattern: "between D1 and D2 Mon" — 4 groups (day1, day2, mon, yr)
    m = _DATE_RANGE_PATTERNS[2].search(query)
    if m:
        day1 = int(m.group(1))
        day2 = int(m.group(2))
        mon_str = m.group(3)
        yr = int(m.group(4)) if m.group(4) else current_year
        mon = _MONTH_NAME_MAP.get(mon_str.lower())
        if mon and 1 <= day1 <= 31 and 1 <= day2 <= 31:
            return f"{day1:02d}-{mon}-{yr}", f"{day2:02d}-{mon}-{yr}"

    return None, None


_RELATIVE_DAY_PATTERNS = [
    # (compiled regex, days_back)
    (re.compile(r"\b(day before yesterday|2 days ago|two days ago|parso|परसों)\b", re.IGNORECASE), 2),
    (re.compile(r"\b(yesterday|kal|कल)\b", re.IGNORECASE), 1),
]


def _resolve_relative_dates(
    query: str,
    from_date: str | None,
    to_date: str | None,
) -> tuple[str | None, str | None, bool]:
    """Detect relative day references in query and return (from_date, to_date, was_resolved).

    Returns original dates unchanged if no relative keyword found.
    was_resolved=True means the query explicitly named a past relative date.
    """
    if not query:
        return from_date, to_date, False
    from datetime import datetime, timezone, timedelta
    today = datetime.now(timezone.utc).date()
    for pattern, days_back in _RELATIVE_DAY_PATTERNS:
        if pattern.search(query):
            target = today - timedelta(days=days_back)
            # Format as DD-Mon-YYYY to match existing date helpers
            date_str = target.strftime("%d-%b-%Y")
            return date_str, date_str, True
    return from_date, to_date, False


def _fix_date_year(date_str: str | None, query: str) -> str | None:
    if not date_str:
        return None
    from datetime import datetime
    current_year = str(datetime.now().year)
    m = re.search(r"[-/\s](\d{4})$", date_str.strip())
    if m:
        year_found = m.group(1)
        if year_found not in query:
            return date_str.strip()[: m.start(1)] + current_year
    return date_str.strip()


_INDIAN_STATES = (
    "andaman and nicobar", "andhra pradesh", "arunachal pradesh", "assam",
    "bihar", "chandigarh", "chhattisgarh", "dadra and nagar haveli",
    "daman and diu", "delhi", "goa", "gujarat", "haryana", "himachal pradesh",
    "jammu and kashmir", "jharkhand", "karnataka", "kerala", "ladakh",
    "lakshadweep", "madhya pradesh", "maharashtra", "manipur", "meghalaya",
    "mizoram", "nagaland", "odisha", "puducherry", "punjab", "rajasthan",
    "sikkim", "tamil nadu", "telangana", "tripura", "uttar pradesh",
    "uttarakhand", "west bengal",
)


def _extract_state_from_query(query: str) -> str | None:
    if not query:
        return None
    q = f" {query.lower()} "
    for st in _INDIAN_STATES:
        if f" {st} " in q or f" in {st}" in q or f" {st}," in q or f" of {st}" in q or f" from {st}" in q:
            return st.title()
    return None


def _extract_lookback_days_from_query(query: str) -> int | None:
    if not query:
        return None
    q = query.lower()

    # Explicit day count: e.g. "15 days", "last 15 days", "past 10 days", "15-day", "15 d"
    m_days = re.search(r"\b(\d+)\s*-?\s*(?:days?|d)\b", q)
    if m_days:
        try:
            val = int(m_days.group(1))
            if 1 <= val <= 365:
                return val
        except (ValueError, TypeError):
            pass

    # Explicit week count: e.g. "2 weeks", "3 weeks"
    m_weeks = re.search(r"\b(\d+)\s*-?\s*weeks?\b", q)
    if m_weeks:
        try:
            val = int(m_weeks.group(1)) * 7
            if 1 <= val <= 365:
                return val
        except (ValueError, TypeError):
            pass

    # Explicit month count: e.g. "2 months", "3 months"
    m_months = re.search(r"\b(\d+)\s*-?\s*months?\b", q)
    if m_months:
        try:
            val = int(m_months.group(1)) * 30
            if 1 <= val <= 365:
                return val
        except (ValueError, TypeError):
            pass

    if "fortnight" in q:
        return 14
    if "month" in q:
        return 30
    if "week" in q:
        return 7
    return None


def _heuristic_intent(query: str) -> dict[str, Any]:
    """Fallback intent when LLM is unavailable."""
    q = (query or "").lower()
    base = _empty_intent_fields()

    specific_date = _extract_date_from_query(query)
    if specific_date:
        base["from_date"] = specific_date
        base["to_date"] = specific_date

    state = _extract_state_from_query(query)
    if state:
        base["state"] = state

    if _is_market_discovery_query(query):
        return {**base, "action": "search_markets", "nearest_market": True, "radius_km": 50}

    parsed_lookback = _extract_lookback_days_from_query(query)

    if "arrival" in q:
        if "lowest" in q or "least" in q:
            return {**base, "action": "get_extreme_arrival", "sort_order": "lowest", "lookback_days": parsed_lookback or 7}
        if "highest" in q or "maximum" in q or "most" in q:
            return {**base, "action": "get_extreme_arrival", "sort_order": "highest", "lookback_days": parsed_lookback or 7}
        if any(k in q for k in ("history", "week", "month", "days", "last ", "past ")) or parsed_lookback is not None:
            lookback = parsed_lookback if parsed_lookback is not None else 7
            return {**base, "action": "get_arrival_history", "lookback_days": lookback}
        return {**base, "action": "get_today_arrival"}

    has_min = any(k in q for k in ("minimum", "min", "lowest", "least", "bottom"))
    has_max = any(k in q for k in ("maximum", "max", "highest", "peak", "most", "top"))
    is_historical = any(k in q for k in ("history", "week", "month", "days", "last ", "past ", "from ", "between", "average", "avg", "summary", "stats", "statistics", "trend")) or parsed_lookback is not None

    if has_min and has_max and not is_historical:
        return {**base, "action": "get_today_price"}

    if any(k in q for k in ("highest", "maximum", "max", "best price", "best rate", "peak price", "highest modal")):
        lookback = parsed_lookback if parsed_lookback is not None else (None if specific_date else 7)
        return {**base, "action": "get_highest_price", "lookback_days": lookback}

    if any(k in q for k in ("lowest", "minimum", "min", "cheapest", "least price", "bottom price", "lowest modal")):
        lookback = parsed_lookback if parsed_lookback is not None else (None if specific_date else 7)
        return {**base, "action": "get_lowest_price", "lookback_days": lookback}

    if any(k in q for k in ("average", "avg", "summary", "statistics", "stats")):
        lookback = parsed_lookback if parsed_lookback is not None else 7
        return {**base, "action": "get_price_summary", "lookback_days": lookback}

    if any(k in q for k in ("history", "week", "month", "days", "last ", "past ", "from ", "between")) or parsed_lookback is not None:
        lookback = parsed_lookback if parsed_lookback is not None else 7
        return {**base, "action": "get_price_history", "lookback_days": lookback}

    return {**base, "action": "get_today_price"}


def _extract_json_object(text: str) -> dict[str, Any] | None:
    if not text:
        return None
    json_blocks = re.findall(r"```(?:json)?(.*?)```", text, re.DOTALL)
    if json_blocks:
        candidate = json_blocks[0].strip()
    else:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        candidate = match.group(0).strip() if match else text.strip()
    try:
        data = json.loads(candidate)
    except (json.JSONDecodeError, TypeError):
        return None
    return data if isinstance(data, dict) else None


def _map_action(action: str) -> str | None:
    """Canonical supported action, or None when the name is not one we serve."""
    key = re.sub(r"[\s\-]+", "_", (action or "").strip().lower())
    key = _LEGACY_ACTION_MAP.get(key, key)
    return key if key in _FARMER_ACTIONS else None


def _raw_action_candidates(raw_action: Any) -> list[Any]:
    if isinstance(raw_action, list):
        return [a for a in raw_action if a is not None and str(a).strip()]
    if raw_action is not None and str(raw_action).strip():
        return [raw_action]
    return []


def _valid_actions(raw_action: Any) -> list[str]:
    """All supported actions named by the LLM/heuristic, deduped, order kept (not capped)."""
    seen: set[str] = set()
    out: list[str] = []
    for item in _raw_action_candidates(raw_action):
        mapped = _map_action(str(item))
        if mapped and mapped not in seen:
            seen.add(mapped)
            out.append(mapped)
    return out


def _normalize_action_list(raw_action: Any, fallback: str) -> list[str]:
    """Map LLM/heuristic action(s) to a deduped list (max MAX_INTENT_ACTIONS)."""
    valid = _valid_actions(raw_action)[:MAX_INTENT_ACTIONS]
    return valid or [_map_action(fallback) or "get_today_price"]


def _clean_crop_tokens(val: Any) -> list[str]:
    if not val:
        return []
    items = val if isinstance(val, list) else [val]
    res: list[str] = []
    for item in items:
        if item is None:
            continue
        s = str(item).strip()
        if not s or s.lower() in {"all", "any", "general", "none", "null"}:
            continue
        parts = re.split(r",|\s+and\s+|\s*&\s*|\s+vs\s+", s, flags=re.I)
        for p in parts:
            clean = p.strip()
            if clean and clean.lower() not in {"all", "any", "general", "none", "null"}:
                res.append(clean)
    seen: set[str] = set()
    unique_res: list[str] = []
    for r in res:
        k = r.lower()
        if k not in seen:
            seen.add(k)
            unique_res.append(r)
    return unique_res


def _normalize_intent(
    raw: dict[str, Any] | None,
    query: str,
    *,
    llm_succeeded: bool = False,
    crop: str | None = None,
) -> dict[str, Any]:
    base = _heuristic_intent(query)
    raw_dict = raw if isinstance(raw, dict) else {}
    raw_actions = raw_dict.get("actions")
    raw_action = raw_dict.get("action")
    actions = _normalize_action_list(
        raw_actions if raw_actions is not None else raw_action,
        base["action"],
    )
    action = actions[0]

    # Questions we do not serve: an explicit LLM verdict, or an action name that is not ours
    # (never silently coerced into a different question).
    raw_candidates = raw_actions if raw_actions is not None else raw_action
    valid_all = _valid_actions(raw_candidates)
    unsupported_reason = str(raw_dict.get("unsupported_reason") or "").strip().lower()
    if unsupported_reason not in LLM_REPORTABLE_REASONS:
        unsupported_reason = ""
    if llm_succeeded and not unsupported_reason and _raw_action_candidates(raw_candidates) and not valid_all:
        unsupported_reason = UNRECOGNIZED_REQUEST
    dropped_actions = valid_all[MAX_INTENT_ACTIONS:]

    raw_action_str =str(raw_action or "").strip().lower() if not isinstance(raw_action, list) else ""
    if raw_action_str in {"get_prices", "lookup_commodity"} and (
        raw_dict.get("lookback_days") or raw_dict.get("from_date") or raw_dict.get("to_date")
    ):
        action = "get_price_history"
        actions = ["get_price_history"] + [a for a in actions if a != "get_price_history"]

    # Commodity name extraction: MiniMax 1st priority, Heuristics fallback
    raw_commodity = raw_dict.get("commodity_name")
    crops_from_llm = _clean_crop_tokens(raw_commodity)
    if crops_from_llm:
        commodity_val: Union[str, list[str], None] = (
            crops_from_llm[0] if len(crops_from_llm) == 1 else crops_from_llm
        )
    else:
        crops_heuristic = _clean_crop_tokens(crop)
        commodity_val = (
            crops_heuristic[0] if len(crops_heuristic) == 1 else crops_heuristic
        ) if crops_heuristic else None

    out = {
        "action": action,
        "actions": actions,
        "commodity_name": commodity_val,
        "nearest_market": bool(raw_dict.get("nearest_market", base.get("nearest_market", True))),
        "radius_km": raw_dict.get("radius_km", base.get("radius_km")),
        "lookback_days": raw_dict.get("lookback_days", base.get("lookback_days")),
        "from_date": raw_dict.get("from_date", base.get("from_date")),
        "to_date": raw_dict.get("to_date", base.get("to_date")),
        "market_name": raw_dict.get("market_name", base.get("market_name")),
        "search_by_apmc": bool(raw_dict.get("search_by_apmc", base.get("search_by_apmc", False))),
        "state": raw_dict.get("state", base.get("state")),
        "sort_order": raw_dict.get("sort_order", base.get("sort_order")),
        "unsupported_reason": unsupported_reason or None,
        "dropped_actions": dropped_actions,
    }
    for key in ("radius_km", "lookback_days"):
        val = out.get(key)
        if val is None or val == "":
            out[key] = None
            continue
        try:
            out[key] = float(val) if key == "radius_km" else int(val)
        except (TypeError, ValueError):
            out[key] = base.get(key)
    for key in ("from_date", "to_date", "market_name", "state", "sort_order"):
        val = out.get(key)
        if val is None or str(val).strip().lower() in {"", "null", "none"}:
            out[key] = None
        else:
            out[key] = str(val).strip().lower() if key == "sort_order" else str(val).strip()

    # Fix or backfill specific dates with current year
    if out.get("from_date"):
        out["from_date"] = _fix_date_year(out["from_date"], query)
    if out.get("to_date"):
        out["to_date"] = _fix_date_year(out["to_date"], query)

    if not out.get("from_date") and not out.get("to_date"):
        extracted_date = _extract_date_from_query(query)
        if extracted_date:
            out["from_date"] = extracted_date
            out["to_date"] = extracted_date

    # ── Date range correction: if LLM set from_date == to_date but the query
    # has a "from X to Y" / "between X and Y" pattern, extract the real range. ──
    range_fd, range_td = _extract_date_range_from_query(query)
    if range_fd and range_td and range_fd != range_td:
        # Always trust the heuristic range if LLM misses the second date
        out["from_date"] = range_fd
        out["to_date"] = range_td
        out["lookback_days"] = None
        if out["action"] in {"get_today_price", "get_price_with_nearby"}:
            out["action"] = "get_price_history"
            out["actions"] = ["get_price_history"]

    # ── Bug 2 Fix: Resolve relative day references (yesterday, day before yesterday, etc.) ──
    # This runs after LLM/heuristic dates are loaded so it can override them correctly.
    resolved_from, resolved_to, relative_was_resolved = _resolve_relative_dates(
        query, out.get("from_date"), out.get("to_date")
    )
    if relative_was_resolved:
        out["from_date"] = resolved_from
        out["to_date"] = resolved_to
        out["lookback_days"] = None  # specific date takes priority over lookback
        # If LLM guessed get_today_price for a past relative date, correct it.
        if out["action"] in {"get_today_price", "get_price_with_nearby"}:
            if out.get("market_name"):
                out["action"] = "get_price_with_nearby"
                out["actions"] = ["get_price_with_nearby"]
            else:
                out["action"] = "get_price_history"
                out["actions"] = ["get_price_history"]

    # ── Bug 3 Fix: Default 7-day lookback for highest/lowest queries with no date given ──
    if (
        out["action"] in {"get_extreme_arrival", "get_highest_price", "get_lowest_price"}
        and out.get("lookback_days") is None
        and not out.get("from_date")
        and not out.get("to_date")
    ):
        parsed_lb = _extract_lookback_days_from_query(query)
        out["lookback_days"] = parsed_lb if parsed_lb is not None else 7

    if (
        out["action"] in {"get_price_history", "get_price_summary", "get_arrival_history"}
        and out.get("lookback_days") is None
        and not out.get("from_date")
        and not out.get("to_date")
    ):
        parsed_lb = _extract_lookback_days_from_query(query)
        if parsed_lb is not None:
            out["lookback_days"] = parsed_lb

    if out["action"] == "get_extreme_arrival" and out["sort_order"] not in {"highest", "lowest"}:
        out["sort_order"] = "highest"

    # ── Bug 1 Fix: Only apply heuristic overrides when LLM did NOT succeed ──
    # If LLM successfully extracted intent, trust it; only apply safety-critical corrections.
    if not llm_succeeded:
        # Heuristic: market discovery query override
        if _is_market_discovery_query(query):
            out["action"] = "search_markets"
            out["actions"] = ["search_markets"]
            out["market_name"] = None
            out["nearest_market"] = True
            if out.get("radius_km") is None:
                out["radius_km"] = 50
        # Heuristic: modal/min/max without a period → today's price
        if (
            _should_use_today_price_for_query(query)
            and out["action"] in {"get_price_summary", "get_price_history"}
            and not out.get("from_date") and not out.get("to_date")
        ):
            out["action"] = "get_today_price"
            out["actions"] = ["get_today_price"]
            out["lookback_days"] = None
            out["from_date"] = None
            out["to_date"] = None
    else:
        # Even when LLM succeeded, apply the market-discovery override only when LLM
        # itself chose a price action for a pure discovery query (LLM can mis-classify).
        if _is_market_discovery_query(query) and out["action"] not in {
            "search_markets",
            "get_today_price",
            "get_price_with_nearby",
        }:
            out["action"] = "search_markets"
            out["actions"] = ["search_markets"]
            out["market_name"] = None
            out["nearest_market"] = True
            if out.get("radius_km") is None:
                out["radius_km"] = 50


    if not out.get("market_name"):
        extracted_market = _extract_market_name_from_query(query)
        if extracted_market:
            out["market_name"] = extracted_market

    if out.get("market_name"):
        mn_clean = str(out["market_name"]).strip()
        mn_clean = re.sub(r"\s+district\b", "", mn_clean, flags=re.IGNORECASE).strip()
        mn_lower = mn_clean.lower()
        if any(mn_lower == st for st in _INDIAN_STATES):
            if not out.get("state"):
                out["state"] = mn_clean.title()
            out["market_name"] = None
        else:
            out["market_name"] = mn_clean

    # search_by_apmc is decided from the query itself, not the LLM's flag: only a place
    # named with a market word (APMC/mandi/market/haat/bazar, in any script) is a mandi;
    # a plain place or "<place> district" stays on the farmer's profile location.
    out["search_by_apmc"] = bool(out.get("market_name")) and _detect_search_by_apmc(query, out["market_name"])
    if not out["search_by_apmc"] and out["action"] == "get_price_with_nearby":
        out["action"] = "get_today_price"
        out["actions"] = list(dict.fromkeys(
            "get_today_price" if a == "get_price_with_nearby" else a for a in out["actions"]
        ))

    # Auto-upgrade: when a specific mandi is named (with search_by_apmc=True) and action is today's price (or single date),
    # enrich the response with nearby markets' prices.
    if out.get("market_name") and out.get("search_by_apmc") and (
        out["action"] == "get_today_price"
        or (
            out["action"] in {"get_price_history", "get_price_with_nearby"}
            and out.get("from_date") == out.get("to_date")
            and out.get("from_date") is not None
        )
    ):
        out["action"] = "get_price_with_nearby"
        out["actions"] = ["get_price_with_nearby"]
    # ── Date priority: explicit from_date/to_date always wins over lookback_days ──
    # The tool gives lookback_days priority in _date_query; if the user specified an
    # explicit date range, we must clear lookback_days so it is not sent to the tool.
    if out.get("from_date") or out.get("to_date"):
        out["lookback_days"] = None

    return out


async def _minimax_chat(
    *,
    trace_name: str,
    system_prompt: str | None = None,
    user_content: str,
    max_tokens: int = 2048,
    temperature: float = 0.0,
    query: str | None = None,
    config: RunnableConfig | None = None,
) -> str | None:
    messages: list[BaseMessage] = []
    if system_prompt:
        messages.append(SystemMessage(content=system_prompt))
    messages.append(HumanMessage(content=user_content))

    trace_llm_request(
        trace_name,
        model=MINIMAX_MODEL,
        messages=messages,
        query=query,
    )

    try:
        llm = get_minimax_chat_model(
            temperature=temperature,
            max_tokens=max_tokens,
        )
        response = await llm.ainvoke(messages, config=config)
        content = response.content if isinstance(response.content, str) else str(response.content or "")
        content = content.strip()
        trace_llm_response(trace_name, output=content, source="minimax")
        return content
    except Exception as exc:
        logger.warning("MiniMax %s failed: %s", trace_name, exc)
        trace_llm_error(trace_name, error=f"{type(exc).__name__}: {exc}")
        return None


async def extract_daily_price_intent(
    query: str,
    *,
    crop: str | None = None,
    state: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    config: RunnableConfig | None = None,
) -> dict[str, Any]:
    """Ask MiniMax for mandi_price_tool params; fall back to heuristics."""
    from datetime import datetime
    today_str = datetime.now().strftime("%d-%b-%Y")
    ctx_lines = [f"Today's Date: {today_str}"]
    if crop and str(crop).strip() and str(crop).strip().lower() not in {"all", "any", "general"}:
        ctx_lines.append(f"Crop Context (fallback only; ignore if the query names a crop): {str(crop).strip()}")
    if state and str(state).strip() and str(state).strip().lower() not in {"all", "not specified", "unknown"}:
        ctx_lines.append(f"State Context: {str(state).strip()}")
    if lat is not None and lon is not None:
        ctx_lines.append(f"Location Coordinates: lat={lat}, lon={lon}")
    ctx_lines.append(f"Query: {query}")
    ctx_lines.append("JSON:")
    user_content = "\n".join(ctx_lines)
    raw_text = await _minimax_chat(
        trace_name="daily_price_intent",
        system_prompt=DAILY_PRICE_INTENT_PROMPT,
        user_content=user_content,
        max_tokens=1024,
        temperature=0.0,
        query=query,
        config=config,
    )
    parsed = _extract_json_object(raw_text or "")
    llm_succeeded = parsed is not None
    intent = _normalize_intent(parsed, query, llm_succeeded=llm_succeeded, crop=crop)
    if not llm_succeeded:
        trace_llm_response(
            "daily_price_intent",
            output=json.dumps(intent),
            source="heuristic_fallback",
        )
    return intent



def _unwrap_tool_payload(result: Any) -> Any:
    """Normalize MCP content wrappers like [{'type':'text','text':'{...}'}]."""
    if isinstance(result, str):
        try:
            return json.loads(result)
        except (json.JSONDecodeError, TypeError):
            return result
    if isinstance(result, list) and result:
        first = result[0]
        if isinstance(first, dict) and isinstance(first.get("text"), str):
            try:
                return json.loads(first["text"])
            except (json.JSONDecodeError, TypeError):
                return first["text"]
    return result


def _tool_result_is_empty(result: Any) -> bool:
    result = _unwrap_tool_payload(result)
    if result is None or result == "":
        return True
    if isinstance(result, str):
        return not result.strip()
    if not isinstance(result, dict):
        return False
    if result.get("error") and "results" not in result:
        return True

    if isinstance(result.get("results"), dict):
        per_action = result["results"]
        if not per_action:
            return True
        return all(_tool_result_is_empty(v) for v in per_action.values())

    if result.get("error"):
        return True

    list_keys = (
        "price_records",
        "markets",
        "highest_records",
        "arrival_records",
        "highest_arrivals",
        "lowest_arrivals",
    )
    for key in list_keys:
        if key in result:
            return len(result.get(key) or []) == 0

    if "stats" in result:
        stats = result.get("stats")
        return not bool(stats)

    if result.get("count") == 0:
        return True
    return False


async def call_mandi_price_tool(args: dict[str, Any]) -> Any:
    """Programmatic MCP invoke of mandi_price_tool."""
    tool_obj = await _get_mandi_price_tool()
    if tool_obj is None:
        logger.error("mandi_price_tool unavailable from daily_price MCP")
        return {"error": "mandi_price_tool unavailable"}
    try:
        return await tool_obj.ainvoke(args)
    except Exception as exc:
        logger.error("mandi_price_tool invoke failed: %s", exc, exc_info=True)
        return {"error": str(exc)}


def _named_market_for_tool(intent: dict[str, Any], commodities: list[str]) -> str | None:
    """The mandi name to send to the tool, or None when the query named no mandi."""
    name = str(intent.get("market_name") or "").strip()
    if not name or not intent.get("search_by_apmc"):
        return None
    core = _strip_market_keywords(name.lower())
    if not core or core in {str(c).strip().lower() for c in commodities}:
        return None  # "rice market" names the crop, not a mandi
    return name


def _build_tool_args(
    intent: dict[str, Any],
    *,
    lat: float | None,
    lon: float | None,
    crop: str,
    state: str | None,
    district: str | None = None,
) -> dict[str, Any]:
    actions = intent.get("actions") or [intent["action"]]
    args: dict[str, Any] = {}
    # The location (state, lat/long) is the farmer profile's only; a state, district or
    # city named in the query is never used. A mandi the farmer names with a market word
    # is passed by name: the tool looks it up in the profile state and, if it is not
    # found or has no price, falls back to the mandis nearest the profile location.
    tool_state = state
    if tool_state and str(tool_state).strip().lower() not in {"all", "not specified", "unknown"}:
        args["state"] = str(tool_state).strip()

    if any(a in _COMMODITY_ACTIONS for a in actions):
        cn = intent.get("commodity_name")
        if cn:
            args["commodity_name"] = [cn] if isinstance(cn, str) else list(cn)
        else:
            crop_clean = (crop or "").strip()
            if crop_clean and crop_clean.lower() not in {"all", "any", "general"}:
                args["commodity_name"] = [crop_clean]

    named_market = _named_market_for_tool(intent, args.get("commodity_name") or [])
    if not named_market:
        # "With nearby" needs a named mandi; without one it is today's price near the profile.
        actions = list(dict.fromkeys("get_today_price" if a == "get_price_with_nearby" else a for a in actions))
    args["action"] = actions[0] if len(actions) == 1 else actions

    if any(a in _GEO_ACTIONS for a in actions):
        if lat is not None and lon is not None:
            args["lat"] = float(lat)
            args["long"] = float(lon)
        args["nearest_market"] = bool(intent.get("nearest_market", True))
        if intent.get("radius_km") is not None:
            args["radius_km"] = intent["radius_km"]

    if named_market:
        args["market_name"] = named_market
        # The farmer may only see mandis in their own district; the tool refuses others.
        if district and str(district).strip().lower() not in {"all", "not specified", "unknown"}:
            args["district"] = str(district).strip()
    args["search_by_apmc"] = bool(named_market)

    if intent.get("lookback_days") is not None:
        args["lookback_days"] = intent["lookback_days"]
    else:
        if intent.get("from_date"):
            args["from_date"] = intent["from_date"]
        if intent.get("to_date"):
            args["to_date"] = intent["to_date"]

    if "get_extreme_arrival" in actions and intent.get("sort_order"):
        args["sort_order"] = intent["sort_order"]

    return args


def _fallback_unavailable_answer(
    payload: Any,
    *,
    crop: str | None = None,
    state: str | None = None,
    market_name: str | None = None,
) -> str:
    """Deterministic English reply when the tool returned no usable data."""
    if isinstance(payload, dict) and payload.get("error"):
        return str(payload["error"]).strip()

    if _is_arrival_quantity_unavailable(payload):
        return arrival_unavailable_message(payload, crop=crop, market_name=market_name, state=state)

    parts = ["Mandi price data is not available"]
    crop_clean = (crop or "").strip()
    market_clean = (market_name or "").strip()
    state_clean = (state or "").strip()
    if crop_clean and crop_clean.lower() not in {"all", "any", "general"}:
        parts.append(f"for {crop_clean}")
    if market_clean:
        parts.append(f"in {market_clean}")
    elif state_clean and state_clean.lower() not in {"all", "not specified", "unknown"}:
        parts.append(f"in {state_clean}")
    parts.append("right now.")
    return " ".join(parts)


def _sanitize_payload_for_synthesis(payload: Any) -> Any:
    """Keep the nearby-markets block concise: one record per market, highest first."""
    if not isinstance(payload, dict):
        return payload
    data = dict(payload)
    if "nearby_markets" in data and isinstance(data["nearby_markets"], dict):
        nearby = dict(data["nearby_markets"])
        records = nearby.get("price_records") or []
        if isinstance(records, list):
            nearby["price_records"] = _dedupe_and_sort_nearby_records(records, top_n=3)
            nearby["total_records_returned"] = len(nearby["price_records"])
        data["nearby_markets"] = nearby
    return data


def _format_price_fallback(payload: Any, *, crop: str | None = None) -> str:
    """Fixed-structure answer built purely from the tool JSON ('' when nothing is renderable)."""
    rendered = render_daily_price_answer(payload, crop=crop)
    return rendered.text() if rendered else ""


_THINK_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


def _llm_summary_enabled() -> bool:
    return os.getenv("DAILY_PRICE_LLM_SUMMARY", "1").strip().lower() not in {"0", "false", "no", "off"}


async def _llm_summary(
    query: str,
    rendered: RenderedAnswer,
    *,
    config: RunnableConfig | None = None,
) -> str | None:
    """One-sentence summary written by the LLM, kept only if every number is in the rendered answer."""
    raw = await _minimax_chat(
        trace_name="daily_price_summary",
        system_prompt=DAILY_PRICE_SUMMARY_PROMPT,
        user_content=f"Farmer query: {query}\n\nAnswer data:\n{rendered.head}\n\nSummary:",
        max_tokens=200,
        temperature=0.0,
        query=query,
        config=config,
    )
    summary = _THINK_BLOCK.sub("", raw or "").strip()
    if not summary:
        return None
    if not summary_is_grounded(summary, rendered.head):
        logger.warning("daily_price summary rejected (numbers not grounded in tool data): %r", summary)
        return None
    return summary


async def synthesize_daily_price_answer(
    query: str,
    tool_result: Any,
    *,
    crop: str | None = None,
    state: str | None = None,
    market_name: str | None = None,
    config: RunnableConfig | None = None,
) -> str:
    """Fixed-structure answer from the tool JSON, plus an optional grounded LLM summary line."""
    payload = _sanitize_payload_for_synthesis(_unwrap_tool_payload(tool_result))
    if _tool_result_is_empty(payload):
        return _fallback_unavailable_answer(payload, crop=crop, state=state, market_name=market_name)

    rendered = render_daily_price_answer(payload, crop=crop, market_name=market_name, state=state)
    if rendered is None:
        return _fallback_unavailable_answer(payload, crop=crop, state=state, market_name=market_name)

    summary = None
    if rendered.has_data and _llm_summary_enabled() and not _is_arrival_quantity_unavailable(payload):
        summary = await _llm_summary(query, rendered, config=config)
    return rendered.text(summary)




def _decline_envelope(reason: str) -> str:
    """Reply for a question we do not serve (status 'unsupported') or need a detail for ('clarify')."""
    status = status_for(reason)
    return json.dumps(
        {
            "answer": message_for(reason),
            "tool_data": {"status": status, "reason": reason},
            "status": status,
            "reason": reason,
        },
        ensure_ascii=False,
    )


class DailyPriceInput(BaseModel):
    query: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    crop: str
    state: Optional[str] = None
    district: Optional[str] = None
    location_from_profile: Optional[bool] = None  # True when state/district/latitude/longitude are the farmer's profile location (answer adds a "change it in the profile section" note)
    # Planner-supplied place details; accepted so the planner's tool call validates.
    village: Optional[str] = None
    block: Optional[str] = None


@tool(args_schema=DailyPriceInput)
async def daily_price(
    query: str,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    crop: str = "all",
    state: Optional[str] = None,
    district: Optional[str] = None,
    location_from_profile: Optional[bool] = None,
    village: Optional[str] = None,
    block: Optional[str] = None,
    config: RunnableConfig = None,
) -> str:
    """
    Query daily mandi / commodity prices near the farmer.
    Use when the user asks for crop market prices, mandi rates, or nearest APMC prices.
    Requires crop name and resolved latitude/longitude when possible.
    """
    try:
        # Questions we deliberately do not serve are declined before any geocoding/LLM/tool call.
        declined = detect_unsupported_query(query)
        if declined:
            logger.info("daily_price_agent: declining query (reason=%s): %s", declined, query)
            return _decline_envelope(declined)

        # The location is always the farmer's profile location (state, district,
        # lat/long) passed in by the planner; nothing is read from the query.
        lat, lon = latitude, longitude
        if lat is None or lon is None:
            from ajrasakha.agents.location_extractor import get_lat_long as _get_lat_long

            _lat, _lon, _resolved_name = await _get_lat_long(
                district=district,
                subdistrict=None,
                state=state,
            )
            if _lat is not None and _lon is not None:
                lat = _lat
                lon = _lon
                logger.info(
                    "daily_price_agent: geocoded state=%r district=%r -> lat=%s, lon=%s (%s)",
                    state,
                    district,
                    lat,
                    lon,
                    _resolved_name,
                )

        intent = await extract_daily_price_intent(
            query,
            crop=crop,
            state=state,
            lat=lat,
            lon=lon,
            config=config,
        )
        logger.info("Daily price intent: %s", intent)

        if intent.get("unsupported_reason"):
            logger.info("daily_price_agent: declining query (intent reason=%s)", intent["unsupported_reason"])
            return _decline_envelope(intent["unsupported_reason"])

        tool_args = _build_tool_args(
            intent,
            lat=lat,
            lon=lon,
            crop=crop,
            state=state,
            district=district,
        )
        actions = intent.get("actions") or [intent["action"]]

        if any(a in _COMMODITY_ACTIONS for a in actions) and not tool_args.get("commodity_name"):
            logger.warning("daily_price_agent: missing commodity_name for actions=%s", actions)
            return _decline_envelope(MISSING_COMMODITY)

        if any(a in _GEO_ACTIONS for a in actions) and (
            tool_args.get("lat") is None or tool_args.get("long") is None
        ):
            if not tool_args.get("state") and not tool_args.get("market_name"):
                logger.warning("daily_price_agent: missing lat/long and state for geo/price query")
                return _decline_envelope(MISSING_LOCATION)

        tool_result = await call_mandi_price_tool(tool_args)
        tool_payload = _unwrap_tool_payload(tool_result)
        # Keep raw tool payload on the return envelope for logs only (not used in farmer answer).
        logger.info(
            "daily_price_agent tool_data: %s",
            json.dumps(tool_payload, ensure_ascii=False, default=str)[:8000],
        )

        # The tool needs a detail the farmer has not given (e.g. state): ask for it.
        clarify = clarify_reason_for_error(tool_payload)
        if clarify:
            return _decline_envelope(clarify)

        effective_crop = (
            ", ".join(tool_args["commodity_name"])
            if isinstance(tool_args.get("commodity_name"), list)
            else (tool_args.get("commodity_name") or crop)
        )
        answer = await synthesize_daily_price_answer(
            query,
            tool_result,
            crop=effective_crop,
            state=tool_args.get("state") or state,
            market_name=tool_args.get("market_name"),
            config=config,
        )
        answer = answer or ""
        if answer and location_from_profile and not _tool_result_is_empty(tool_payload):
            answer += f"\n\n{profile_location_note('mandi price', state, district)}"
        if answer and intent.get("dropped_actions"):
            answer += (
                f"\n\nNote: I answered the first {MAX_INTENT_ACTIONS} parts of your question. "
                "Please ask the remaining part separately."
            )
        return json.dumps(
            {
                "answer": answer,
                "tool_data": tool_payload,
                "status": "no_data" if _tool_result_is_empty(tool_payload) else "ok",
                "reason": None,
            },
            ensure_ascii=False,
            default=str,
        )
    except Exception as exc:
        logger.error("daily_price agent failed: %s", exc, exc_info=True)
        return json.dumps(
            {
                "answer": _fallback_unavailable_answer(
                    {"error": str(exc)},
                    crop=crop,
                    state=state,
                ),
                "tool_data": {"error": str(exc)},
            },
            default=str,
        )
