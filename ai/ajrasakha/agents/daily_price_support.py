"""What the daily-price agent can and cannot answer, and what to tell the user when it cannot.

Single source of truth for:
  * the supported action registry (also checked against the intent prompt in tests),
  * code-side detection of questions we do not serve (before any LLM/tool call),
  * the fixed user-facing messages for unsupported / clarify / tool-error cases.
"""

from __future__ import annotations

import re
from typing import Any

# --------------------------------------------------------------------------
# Capability registry
# --------------------------------------------------------------------------

CAPABILITIES: dict[str, dict[str, str]] = {
    "get_today_price": {
        "summary": "today's (or the latest) price of a crop",
        "example": "Onion price in Azadpur mandi today",
    },
    "get_price_with_nearby": {
        "summary": "a named mandi's price together with nearby mandis",
        "example": "Wheat price in Ludhiana mandi",
    },
    "get_price_history": {
        "summary": "price history for a date or period",
        "example": "Tomato price in Assam last 15 days",
    },
    "get_price_summary": {
        "summary": "average / summary of prices over a period",
        "example": "Average potato price this week",
    },
    "get_highest_price": {
        "summary": "the highest price of a crop",
        "example": "Highest price of onion in Maharashtra",
    },
    "get_lowest_price": {
        "summary": "the lowest price of a crop",
        "example": "Lowest wheat price in Punjab last week",
    },
    "get_today_arrival": {"summary": "arrival quantity today", "example": "Cotton arrival in Adoni today"},
    "get_arrival_history": {"summary": "arrival quantity history", "example": "Onion arrival last 7 days"},
    "get_extreme_arrival": {"summary": "highest / lowest arrival", "example": "Highest arrival of cotton"},
    "search_markets": {"summary": "mandis near a place", "example": "Which mandis are near me?"},
}
SUPPORTED_ACTIONS = frozenset(CAPABILITIES)

# Unsupported reasons (declined, nothing is fetched)
MULTI_MARKET_COMPARISON = "multi_market_comparison"
FORECAST_OR_ADVICE = "forecast_or_advice"
MSP_OR_COST = "msp_or_cost"
UNRECOGNIZED_REQUEST = "unrecognized_request"
PERIOD_COMPARISON = "period_comparison"
# Clarify reasons (we need one more detail)
MISSING_COMMODITY = "missing_commodity"
MISSING_LOCATION = "missing_location"

UNSUPPORTED_REASONS = frozenset({MULTI_MARKET_COMPARISON, FORECAST_OR_ADVICE, MSP_OR_COST, UNRECOGNIZED_REQUEST, PERIOD_COMPARISON})
CLARIFY_REASONS = frozenset({MISSING_COMMODITY, MISSING_LOCATION})

# Reasons the LLM may report in its intent JSON.
LLM_REPORTABLE_REASONS = UNSUPPORTED_REASONS


def _examples(*actions: str) -> str:
    return " or ".join(f'"{CAPABILITIES[a]["example"]}"' for a in actions)


def capability_menu() -> str:
    items = ", ".join(CAPABILITIES[a]["summary"] for a in (
        "get_today_price", "get_price_history", "get_price_summary", "get_highest_price",
        "search_markets"))
    return f"I can help with: {items}."


_SUGGESTED_ACTIONS = (
    "get_today_price",
    "get_price_history",
    "get_price_summary",
    "get_highest_price",
    "get_lowest_price",
    "search_markets",
)


def suggested_questions() -> str:
    """Bulleted list of sample questions the daily-price tool can answer."""
    return "\n".join(f"- {CAPABILITIES[a]['example']}" for a in _SUGGESTED_ACTIONS)


def _with_suggestions(message: str) -> str:
    return f"{message}\n\nYou can ask questions like:\n{suggested_questions()}"


_MESSAGES: dict[str, str] = {
    MULTI_MARKET_COMPARISON: _with_suggestions(
        "I can show the price for one mandi at a time (along with its nearby mandis), so I cannot compare "
        "two mandis in a single answer. Please ask for each mandi separately, for example: "
        '"Onion price in Azadpur mandi" and then "Onion price in Ludhiana mandi".'
    ),
    FORECAST_OR_ADVICE: _with_suggestions(
        "I only share prices that were actually recorded in mandis (today, a past date or a past period). "
        "I cannot predict future prices or advise when to sell."
    ),
    MSP_OR_COST: _with_suggestions(
        "I provide recorded mandi market prices only. MSP, cost of cultivation and similar details are not "
        "available here."
    ),
    PERIOD_COMPARISON: _with_suggestions(
        "I cannot tell whether a price went up or down compared to another period. I can share the recorded "
        "prices for one date or period at a time, so you can compare them yourself."
    ),
    UNRECOGNIZED_REQUEST: _with_suggestions(
        "I could not match this question to the daily mandi price information I provide. " + capability_menu()
    ),
    MISSING_COMMODITY: (
        "Which crop would you like the price of? For example: " + _examples("get_today_price") + "."
    ),
    MISSING_LOCATION: (
        "I could not find your location. Please set your state and district in your profile so I can look "
        "up mandi prices near you."
    ),
}


def message_for(reason: str) -> str:
    return _MESSAGES.get(reason) or _MESSAGES[UNRECOGNIZED_REQUEST]


def status_for(reason: str) -> str:
    return "clarify" if reason in CLARIFY_REASONS else "unsupported"


# --------------------------------------------------------------------------
# Code-side detection (runs before the LLM / tool call)
# --------------------------------------------------------------------------

_MARKET_WORDS = r"(?:apmc|mandi|mandis|market|markets|haat|haats|hat|bazar|bazaar)"
_COMPARE_WORDS = re.compile(r"\b(compare|comparison|versus|vs\.?|difference between|better than|which is higher)\b", re.I)
_CONNECTORS = re.compile(r"\b(and|or|vs\.?|versus|&|with)\b|,", re.I)
_MARKET_PRICE_PHRASE = re.compile(
    r"\b(?:market|mandi)\s+(?:price|rate|bhav|arrival|summary|trend|data)s?\b", re.I,
)
_PLURAL_PAIR = re.compile(
    rf"\b[a-z][\w'\-]*\s+(?:and|&|vs\.?|versus|or)\s+"
    rf"(?!(?:which|nearby|near|nearest|my|the|all|any|other|local)\b)[a-z][\w'\-]*\s+{_MARKET_WORDS}\b", re.I,
)
_BETWEEN_MARKETS = re.compile(
    rf"\bbetween\s+[a-z][\w'\-]*(?:\s+{_MARKET_WORDS})?\s+and\s+[a-z][\w'\-]*\s+{_MARKET_WORDS}\b", re.I,
)
_MARKET_HIT = re.compile(rf"\b{_MARKET_WORDS}\b", re.I)
# "which mandis are near me", "nearby markets": the market word is generic, not a named market.
_GENERIC_BEFORE = re.compile(r"\b(?:which|nearby|near|nearest|my|the|all|any|other|find|list|local)\s+$", re.I)
_GENERIC_AFTER = re.compile(r"^\s*(?:are\s+)?(?:near|nearby|nearest|around|close)\b", re.I)

_FORECAST = re.compile(
    r"\b(will|would|forecast|predict(?:ion|ed)?|expected|expect|going to|tomorrow|next\s+(?:day|week|month|year)|"
    r"future|outlook|should i (?:sell|buy|hold|store|wait)|when (?:to|should i) sell|best time to (?:sell|buy)|"
    r"kab bechu|kal ka bhav)\b",
    re.I,
)
_MSP_COST = re.compile(
    r"\b(msp|minimum support price|support price|cost of (?:cultivation|production)|input cost|"
    r"production cost|subsidy|loan)\b",
    re.I,
)

_PERIOD_COMPARISON = re.compile(
    r"\b(compared?\s+(?:to|with)|comparison|than\s+(?:last|previous|earlier|yesterday)|"
    r"(?:increase[ds]?|decrease[ds]?|rise[ns]?|rose|fall(?:en|s)?|fell|drop(?:ped|s)?|"
    r"gone\s+(?:up|down)|go(?:es)?\s+(?:up|down)|up\s+or\s+down|higher\s+or\s+lower)\b.*\b(?:last|previous|earlier|ago)\b|"
    r"(?:last|previous|earlier)\b.*\b(?:increase[ds]?|decrease[ds]?|rise[ns]?|rose|fall(?:en|s)?|fell|dropped|up\s+or\s+down|higher\s+or\s+lower))\b",
    re.I,
)


def _is_multi_market_comparison(query: str) -> bool:
    q = _MARKET_PRICE_PHRASE.sub(" ", query or "")
    if _PLURAL_PAIR.search(q) or _BETWEEN_MARKETS.search(q):
        return True
    hits = [
        m for m in _MARKET_HIT.finditer(q)
        if not _GENERIC_BEFORE.search(q[: m.start()]) and not _GENERIC_AFTER.search(q[m.end():])
    ]
    if len(hits) >= 2:
        between = q[hits[0].end(): hits[-1].start()]
        if _CONNECTORS.search(between):
            return True
    if _COMPARE_WORDS.search(q) and hits:
        return True
    return False


def detect_unsupported_query(query: str) -> str | None:
    """Reason code if the question is one we deliberately do not serve, else None."""
    q = (query or "").strip()
    if not q:
        return None
    if _MSP_COST.search(q):
        return MSP_OR_COST
    if _FORECAST.search(q):
        return FORECAST_OR_ADVICE
    if _is_multi_market_comparison(q):
        return MULTI_MARKET_COMPARISON
    if _PERIOD_COMPARISON.search(q):
        return PERIOD_COMPARISON
    return None


# --------------------------------------------------------------------------
# Tool error classification
# --------------------------------------------------------------------------

COMMODITY_NOT_AVAILABLE = "COMMODITY_NOT_AVAILABLE"
MARKET_NOT_FOUND = "MARKET_NOT_FOUND"
NO_PRICE_DATA = "NO_PRICE_DATA"
STATE_REQUIRED = "STATE_REQUIRED"
COMMODITY_REQUIRED = "COMMODITY_REQUIRED"
UNSUPPORTED_ACTION = "UNSUPPORTED_ACTION"

# Text fallbacks so an older tool server (without ``error_code``) still classifies.
_ERROR_TEXT_RULES: tuple[tuple[str, str], ...] = (
    ("state name is not present", STATE_REQUIRED),
    ("commodity_name is required", COMMODITY_REQUIRED),
    ("unknown action", UNSUPPORTED_ACTION),
    ("we do not have", COMMODITY_NOT_AVAILABLE),
    ("no markets_commodities entries matched crop", COMMODITY_NOT_AVAILABLE),
    ("was not found in", MARKET_NOT_FOUND),
    ("apmc not available", MARKET_NOT_FOUND),
    ("mandi price data is not available", NO_PRICE_DATA),
    ("no price records", NO_PRICE_DATA),
)


def classify_tool_error(payload: Any) -> str | None:
    """Error code for a failed tool payload (explicit ``error_code`` first, then message text)."""
    if not isinstance(payload, dict):
        return None
    if isinstance(payload.get("results"), dict):
        return None
    code = payload.get("error_code")
    if code:
        return str(code)
    err = str(payload.get("error") or "").lower()
    if not err:
        return None
    for needle, rule_code in _ERROR_TEXT_RULES:
        if needle in err:
            return rule_code
    return None


def clarify_reason_for_error(payload: Any) -> str | None:
    """Tool errors that mean 'ask the user for a missing detail' rather than 'no data'."""
    code = classify_tool_error(payload)
    if code == STATE_REQUIRED:
        return MISSING_LOCATION
    if code == COMMODITY_REQUIRED:
        return MISSING_COMMODITY
    if code == UNSUPPORTED_ACTION:
        return UNRECOGNIZED_REQUEST
    return None
