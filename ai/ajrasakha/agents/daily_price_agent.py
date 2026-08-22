"""Daily mandi price agent: Anthropic intent → programmatic mandi_price_tool → Anthropic answer."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Optional

from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langchain_mcp_adapters.client import MultiServerMCPClient
from pydantic import BaseModel

from ajrasakha.agents.config import DAILY_PRICE_MODEL, MCP_URLS
from ajrasakha.agents.llm_trace import trace_llm_error, trace_llm_request, trace_llm_response
from ajrasakha.agents.prompts import DAILY_PRICE_ANSWER_PROMPT, DAILY_PRICE_INTENT_PROMPT

logger = logging.getLogger(__name__)

load_dotenv()


_FARMER_ACTIONS = frozenset({
    "get_today_price",
    "get_price_history",
    "get_price_summary",
    "get_highest_price",
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
    "min max",
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
)

_NAMED_MARKET_QUERY = re.compile(
    r"\b(?:in|at)\s+(.+?\s+(?:apmc|mandi|market))\b",
    re.IGNORECASE,
)
_NAMED_MARKET_QUERY_SHORT = re.compile(
    r"\b(?:in|at)\s+([a-z0-9][a-z0-9\s\-']{0,40}?)\s*(?:apmc|mandi|market)\b",
    re.IGNORECASE,
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


def _extract_market_name_from_query(query: str) -> str | None:
    for pattern in (_NAMED_MARKET_QUERY, _NAMED_MARKET_QUERY_SHORT):
        match = pattern.search(query or "")
        if match:
            name = match.group(1).strip()
            if name:
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


def _heuristic_intent(query: str) -> dict[str, Any]:
    """Fallback intent when Anthropic is unavailable."""
    q = (query or "").lower()
    base = _empty_intent_fields()

    specific_date = _extract_date_from_query(query)
    if specific_date:
        base["from_date"] = specific_date
        base["to_date"] = specific_date

    if _is_market_discovery_query(query):
        return {**base, "action": "search_markets", "nearest_market": True, "radius_km": 50}

    if "arrival" in q:
        if "lowest" in q or "least" in q:
            return {**base, "action": "get_extreme_arrival", "sort_order": "lowest", "lookback_days": 7}
        if "highest" in q or "maximum" in q or "most" in q:
            return {**base, "action": "get_extreme_arrival", "sort_order": "highest", "lookback_days": 7}
        if any(k in q for k in ("history", "week", "month", "days", "last ", "past ")):
            lookback = 30 if "month" in q else 7
            return {**base, "action": "get_arrival_history", "lookback_days": lookback}
        return {**base, "action": "get_today_arrival"}

    if any(k in q for k in ("average", "avg", "summary", "min max", "statistics", "stats")):
        lookback = 30 if "month" in q else 7
        return {**base, "action": "get_price_summary", "lookback_days": lookback}

    # get_highest_price only when the query clearly refers to a historical period,
    # e.g. "highest price last week", "maximum price last month".
    # A bare "best price" / "where to sell" without a past-period keyword means today's price.
    _historical_keywords = ("last ", "past ", "week", "month", "days", "history")
    _highest_price_keywords = ("highest price", "maximum price", "max price", "highest rate")
    if any(k in q for k in _highest_price_keywords) and any(hk in q for hk in _historical_keywords):
        lookback = 30 if "month" in q else 7
        return {**base, "action": "get_highest_price", "lookback_days": lookback}

    if any(k in q for k in ("history", "week", "month", "days", "last ", "past ", "from ", "between")):
        if "month" in q or "30 day" in q:
            lookback = 30
        elif "week" in q or "7 day" in q:
            lookback = 7
        else:
            lookback = 7
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


def _map_action(action: str) -> str:
    key = (action or "").strip().lower()
    key = _LEGACY_ACTION_MAP.get(key, key)
    if key not in _FARMER_ACTIONS:
        return "get_today_price"
    return key


def _normalize_action_list(raw_action: Any, fallback: str) -> list[str]:
    """Map LLM/heuristic action(s) to a deduped list (max MAX_INTENT_ACTIONS)."""
    candidates: list[Any] = []
    if isinstance(raw_action, list):
        candidates = raw_action
    elif raw_action is not None and str(raw_action).strip():
        candidates = [raw_action]
    else:
        candidates = [fallback]

    seen: set[str] = set()
    out: list[str] = []
    for item in candidates:
        mapped = _map_action(str(item))
        if mapped in seen:
            continue
        seen.add(mapped)
        out.append(mapped)
        if len(out) >= MAX_INTENT_ACTIONS:
            break
    return out or [_map_action(fallback)]


def _normalize_intent(
    raw: dict[str, Any] | None,
    query: str,
    *,
    llm_succeeded: bool = False,
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
    raw_action_str = str(raw_action or "").strip().lower() if not isinstance(raw_action, list) else ""
    if raw_action_str in {"get_prices", "lookup_commodity"} and (
        raw_dict.get("lookback_days") or raw_dict.get("from_date") or raw_dict.get("to_date")
    ):
        action = "get_price_history"
        actions = ["get_price_history"] + [a for a in actions if a != "get_price_history"]

    out = {
        "action": action,
        "actions": actions,
        "nearest_market": bool(raw_dict.get("nearest_market", base.get("nearest_market", True))),
        "radius_km": raw_dict.get("radius_km", base.get("radius_km")),
        "lookback_days": raw_dict.get("lookback_days", base.get("lookback_days")),
        "from_date": raw_dict.get("from_date", base.get("from_date")),
        "to_date": raw_dict.get("to_date", base.get("to_date")),
        "market_name": raw_dict.get("market_name", base.get("market_name")),
        "state": raw_dict.get("state", base.get("state")),
        "sort_order": raw_dict.get("sort_order", base.get("sort_order")),
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
        out["action"] in {"get_extreme_arrival", "get_highest_price"}
        and out.get("lookback_days") is None
        and not out.get("from_date")
        and not out.get("to_date")
    ):
        out["lookback_days"] = 7

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

    # Auto-upgrade: when a specific mandi is named and action is today's price (or single date),
    # enrich the response with nearby markets' prices.
    if out.get("market_name") and (
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


async def _anthropic_chat(
    *,
    trace_name: str,
    system_prompt: str | None = None,
    user_content: str,
    max_tokens: int = 512,
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
        model=DAILY_PRICE_MODEL,
        messages=messages,
        query=query,
    )
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        logger.warning("ANTHROPIC_API_KEY not set; skipping Anthropic %s", trace_name)
        trace_llm_error(trace_name, error="ANTHROPIC_API_KEY not set")
        return None

    try:
        timeout_s = float(os.getenv("ANTHROPIC_TIMEOUT_SECONDS", "30"))
        max_retries = int(os.getenv("ANTHROPIC_MAX_RETRIES", "2"))
        llm = ChatAnthropic(
            model=DAILY_PRICE_MODEL,
            api_key=api_key,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=timeout_s,
            max_retries=max_retries,
        )
        response = await llm.ainvoke(messages, config=config)
        content = response.content if isinstance(response.content, str) else str(response.content or "")
        content = content.strip()
        trace_llm_response(trace_name, output=content, source="anthropic")
        return content
    except Exception as exc:
        logger.warning("Anthropic %s failed: %s", trace_name, exc)
        trace_llm_error(trace_name, error=f"{type(exc).__name__}: {exc}")
        return None


async def extract_daily_price_intent(query: str, config: RunnableConfig | None = None) -> dict[str, Any]:
    """Ask Anthropic for mandi_price_tool params; fall back to heuristics."""
    from datetime import datetime
    today_str = datetime.now().strftime("%d-%b-%Y")
    user_content = f"Today's Date: {today_str}\nQuery: {query}\nJSON:"
    raw_text = await _anthropic_chat(
        trace_name="daily_price_intent",
        system_prompt=DAILY_PRICE_INTENT_PROMPT,
        user_content=user_content,
        max_tokens=256,
        temperature=0.0,
        query=query,
        config=config,
    )
    parsed = _extract_json_object(raw_text or "")
    anthropic_succeeded = parsed is not None
    intent = _normalize_intent(parsed, query, llm_succeeded=anthropic_succeeded)
    if not anthropic_succeeded:
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


def _build_tool_args(
    intent: dict[str, Any],
    *,
    lat: float | None,
    lon: float | None,
    crop: str,
    state: str | None,
) -> dict[str, Any]:
    actions = intent.get("actions") or [intent["action"]]
    tool_action: str | list[str] = actions[0] if len(actions) == 1 else actions
    args: dict[str, Any] = {"action": tool_action}
    tool_state = intent.get("state") or state
    if tool_state and str(tool_state).strip().lower() not in {"all", "not specified", "unknown"}:
        args["state"] = str(tool_state).strip()

    if any(a in _COMMODITY_ACTIONS for a in actions):
        crop_clean = (crop or "").strip()
        if crop_clean and crop_clean.lower() not in {"all", "any", "general"}:
            args["commodity_name"] = [crop_clean]

    if any(a in _GEO_ACTIONS for a in actions):
        if lat is not None and lon is not None:
            args["lat"] = float(lat)
            args["long"] = float(lon)
        args["nearest_market"] = bool(intent.get("nearest_market", True))
        if intent.get("radius_km") is not None:
            args["radius_km"] = intent["radius_km"]
        if intent.get("market_name"):
            args["market_name"] = intent["market_name"]

    # LLM sometimes puts the crop name in market_name (e.g. rice) — never treat crop as mandi name.
    mn = (args.get("market_name") or "").strip().lower()
    cr = (crop or "").strip().lower()
    if mn and cr and (mn == cr or mn in {"rice", "paddy"} and cr in {"rice", "paddy"}):
        args.pop("market_name", None)

    if intent.get("lookback_days") is not None:
        args["lookback_days"] = intent["lookback_days"]
    else:
        if intent.get("from_date"):
            args["from_date"] = intent["from_date"]
        if intent.get("to_date"):
            args["to_date"] = intent["to_date"]

    if "get_extreme_arrival" in actions and intent.get("sort_order"):
        args["sort_order"] = intent["sort_order"]

    if args.get("market_name"):
        args["nearest_market"] = False

    return args


def _fallback_unavailable_answer(
    payload: Any,
    *,
    crop: str | None = None,
    state: str | None = None,
    market_name: str | None = None,
) -> str:
    """Deterministic English reply when Anthropic cannot phrase an unavailable result."""
    if isinstance(payload, dict) and payload.get("error"):
        return str(payload["error"]).strip()

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


def _extract_source_systems_from_payload(payload: Any) -> list[str]:
    """Find all unique non-empty source_system strings in tool payload."""
    sources: list[str] = []
    seen: set[str] = set()

    def _traverse(obj: Any):
        if isinstance(obj, dict):
            val = obj.get("source_system")
            if val:
                val_str = str(val).strip()
                if val_str and val_str.lower() not in {"none", "null", "unknown"}:
                    for s in [x.strip() for x in val_str.split(",") if x.strip()]:
                        if s and s not in seen:
                            seen.add(s)
                            sources.append(s)
            for v in obj.values():
                _traverse(v)
        elif isinstance(obj, list):
            for item in obj:
                _traverse(item)

    _traverse(payload)
    return sources


def _ensure_source_line(answer: str, payload: Any) -> str:
    """Ensure the answer ends with source attribution when data is available."""
    ans = (answer or "").strip()
    if not ans or _tool_result_is_empty(payload):
        return ans

    sources = _extract_source_systems_from_payload(payload)
    if not sources:
        return ans

    ans_lower = ans.lower()
    if any(s.lower() in ans_lower for s in sources) or "fetched from the following source" in ans_lower:
        return ans

    source_text = ", ".join(sources)
    if len(sources) > 1:
        source_line = f"This information is fetched from the following sources: {source_text}."
    else:
        source_line = f"This information is fetched from the following source: {source_text}."

    return f"{ans}\n\n{source_line}"


def _ensure_latest_notice(answer: str, payload: Any) -> str:
    """If the tool payload indicates today's data was not found and shows latest data,
    ensure the answer starts with that notice."""
    ans = (answer or "").strip()
    if not ans or not isinstance(payload, dict):
        return ans

    notice = None

    # get_price_with_nearby composite response: only propagate named_market's notice
    # when nearby_markets has NO records for the requested date. If nearby markets
    # successfully returned data, the named market's fallback notice is irrelevant
    # to the main body of the answer (which is about nearby markets).
    if payload.get("action") == "get_price_with_nearby" or (
        isinstance(payload.get("named_market"), dict)
        and payload.get("nearby_markets") is not None
    ):
        nearby = payload.get("nearby_markets")
        nearby_has_records = (
            isinstance(nearby, dict)
            and int(nearby.get("total_records_returned") or 0) > 0
        )
        if not nearby_has_records:
            # Named market is the primary answer — propagate its notice
            named = payload.get("named_market") or {}
            if isinstance(named.get("resolution"), dict):
                notice = named["resolution"].get("latest_price_notice")
        # If nearby HAS records, don't show Pampady's fallback notice as a header
        return _apply_notice(ans, notice)

    if isinstance(payload.get("resolution"), dict):
        notice = payload["resolution"].get("latest_price_notice")
    elif isinstance(payload.get("results"), dict):
        for sub in payload["results"].values():
            if isinstance(sub, dict) and isinstance(sub.get("resolution"), dict):
                n = sub["resolution"].get("latest_price_notice")
                if n:
                    notice = n
                    break

    # Auto-detect: records are from a past date compared to today.
    # Only fire when NO explicit date was requested (i.e. this is a true "today" request
    # that fell back). If from_date/to_date were set, the data IS for the requested date.
    if not notice:
        resolution = payload.get("resolution") or {}
        date_filter = resolution.get("date_filter") or {} if isinstance(resolution, dict) else {}
        explicit_date = date_filter.get("from_date") or date_filter.get("to_date")
        if not explicit_date:
            from datetime import datetime, timezone
            today_str = datetime.now(timezone.utc).date().isoformat()
            records = (
                payload.get("highest_arrivals")
                or payload.get("price_records")
                or payload.get("arrival_records")
                or payload.get("highest_records")
                or []
            )
            if records and isinstance(records, list) and isinstance(records[0], dict):
                rec_date = records[0].get("date")
                if rec_date and str(rec_date) != today_str:
                    notice = f"Today's price / arrival quantity is not available. Showing the latest available data (as of {rec_date}):"

    return _apply_notice(ans, notice)


def _apply_notice(ans: str, notice: Any) -> str:
    """Prepend notice to answer if not already present."""
    if not notice:
        return ans
    notice_str = str(notice).strip()
    ans_lower = ans.lower()
    first_line = ans_lower.split("\n")[0]
    if (
        "today's price" not in first_line
        and "today's arrival" not in first_line
        and "latest available" not in first_line
        and "no price data found" not in first_line
        and "price data for" not in first_line
    ):
        return f"{notice_str}\n\n{ans}"
    return ans


def _format_price_fallback(payload: Any, *, crop: str | None = None) -> str:
    """Deterministic price answer from tool JSON when LLM is unavailable."""
    if not isinstance(payload, dict):
        return ""

    # Handle get_price_with_nearby composite response
    named = payload.get("named_market")
    nearby = payload.get("nearby_markets")
    if named is not None:
        named_part = _format_price_fallback(named, crop=crop)
        # If named market has an error or no data, show a clear explanation
        if not named_part and isinstance(named, dict):
            err = named.get("error") or ""
            resolution = named.get("resolution") or {}
            requested_mkt = resolution.get("requested_market_name") or ""
            notice = (named.get("resolution") or {}).get("latest_price_notice") or ""
            if err:
                named_part = str(err).strip()
            elif notice:
                named_part = str(notice).strip()
            elif requested_mkt:
                named_part = f"Price data is not available for {crop.title() if crop else 'this commodity'} at {requested_mkt.title()}."
        nearby_part = ""
        if isinstance(nearby, dict) and nearby.get("price_records"):
            nearby_records = nearby.get("price_records") or []
            if nearby_records:
                date_val = nearby_records[0].get("date") or ""
                commodity = (crop or nearby_records[0].get("commodity_name") or "commodity").title()
                nearby_inner = _format_price_fallback(nearby, crop=crop)
                # Add "nearby markets" header
                if nearby_inner:
                    nearby_part = f"Nearby markets' {commodity} prices on {date_val}:\n{nearby_inner}"
        return "\n\n".join(p for p in [named_part, nearby_part] if p)

    # Handle multi-action response
    if "results" in payload:
        parts = []
        for sub in payload["results"].values():
            p = _format_price_fallback(sub, crop=crop)
            if p:
                parts.append(p)
        return "\n\n".join(parts)

    # Resolution notice (latest price / fallback market)
    notice = ""
    resolution = payload.get("resolution") or {}
    if isinstance(resolution, dict):
        notice = resolution.get("latest_price_notice") or ""

    records = (
        payload.get("price_records")
        or payload.get("highest_records")
        or payload.get("arrival_records")
        or payload.get("highest_arrivals")
        or payload.get("lowest_arrivals")
        or []
    )
    if not records:
        return ""

    commodity = (crop or records[0].get("commodity_name") or "commodity").title()
    date_val = records[0].get("date") or ""
    sources = list({r.get("source_system") for r in records if r.get("source_system")})

    lines: list[str] = []
    if notice:
        lines.append(notice)

    if len(records) == 1:
        r = records[0]
        mkt = r.get("market_name") or ""
        modal = r.get("modal_price")
        mn = r.get("min_price")
        mx = r.get("max_price")
        aq = r.get("arrival_quantity")
        price_str = " | ".join(filter(None, [
            f"Modal: Rs {modal}/quintal" if modal is not None else None,
            f"Min: Rs {mn}" if mn is not None else None,
            f"Max: Rs {mx}" if mx is not None else None,
            f"Arrival: {aq} tonnes" if aq is not None else None,
        ]))
        lines.append(f"{commodity} price at {mkt} on {date_val}:")
        lines.append(price_str)
    else:
        lines.append(f"{commodity} prices on {date_val}:")
        for i, r in enumerate(records, 1):
            mkt = r.get("market_name") or f"Market {i}"
            variety = r.get("variety") or ""
            grade = r.get("grade") or ""
            label = mkt
            suffix = ", ".join(filter(None, [variety, grade]))
            if suffix and suffix.lower() not in ("faq", variety.lower() if variety else ""):
                label = f"{mkt} ({suffix})"
            modal = r.get("modal_price")
            mn = r.get("min_price")
            mx = r.get("max_price")
            aq = r.get("arrival_quantity")
            price_str = " | ".join(filter(None, [
                f"Modal: Rs {modal}/quintal" if modal is not None else None,
                f"Min: Rs {mn}" if mn is not None else None,
                f"Max: Rs {mx}" if mx is not None else None,
                f"Arrival: {aq} tonnes" if aq is not None else None,
            ]))
            lines.append(f"{i}) {label}")
            lines.append(f"   {price_str}")

    if sources:
        src_str = ", ".join(sources)
        lines.append(f"\nThis information is fetched from the following source: {src_str}.")

    return "\n".join(lines)


async def synthesize_daily_price_answer(
    query: str,
    tool_result: Any,
    *,
    crop: str | None = None,
    state: str | None = None,
    market_name: str | None = None,
    config: RunnableConfig | None = None,
) -> str:
    """Ask Anthropic to turn tool JSON into a farmer-facing English answer."""
    payload = _unwrap_tool_payload(tool_result)
    if isinstance(payload, (dict, list)):
        tool_text = json.dumps(payload, ensure_ascii=False, default=str, separators=(",", ":"))
    else:
        tool_text = str(payload)
    user_content = (
        f"Farmer query: {query}\n\n"
        f"Tool response JSON:\n{tool_text}\n\n"
        "Answer:"
    )
    answer = await _anthropic_chat(
        trace_name="daily_price_answer",
        system_prompt=DAILY_PRICE_ANSWER_PROMPT,
        user_content=user_content,
        max_tokens=700,
        temperature=0.2,
        query=query,
        config=config,
    )
    if answer and answer.strip():
        ans_with_source = _ensure_source_line(answer.strip(), payload)
        return _ensure_latest_notice(ans_with_source, payload)
    if _tool_result_is_empty(payload):
        return _fallback_unavailable_answer(
            payload,
            crop=crop,
            state=state,
            market_name=market_name,
        )
    # LLM unavailable but data exists — build a deterministic answer so the farmer
    # always sees prices instead of triggering the "2-hour" fallback upstream.
    logger.warning(
        "synthesize_daily_price_answer: Anthropic returned empty — using deterministic fallback formatter"
    )
    fallback = _format_price_fallback(payload, crop=crop)
    if fallback:
        return _ensure_latest_notice(fallback, payload)
    return ""



class DailyPriceInput(BaseModel):
    query: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    crop: str
    state: Optional[str] = None


@tool(args_schema=DailyPriceInput)
async def daily_price(
    query: str,
    latitude: Optional[float],
    longitude: Optional[float],
    crop: str,
    state: Optional[str] = None,
    config: RunnableConfig = None,
) -> str:
    """
    Query daily mandi / commodity prices near the farmer.
    Use when the user asks for crop market prices, mandi rates, or nearest APMC prices.
    Requires crop name and resolved latitude/longitude when possible.
    """
    try:
        lat = latitude
        lon = longitude
        if (lat is None or lon is None) and state:
            from ajrasakha.agents.location_context import forward_geocode

            geocode_result = await forward_geocode(state=state, district=None)
            if geocode_result and geocode_result.get("latitude") and geocode_result.get("longitude"):
                lat = geocode_result.get("latitude")
                lon = geocode_result.get("longitude")
                logger.info(
                    "daily_price_agent: forward geocoded state %r to %s, %s",
                    state,
                    lat,
                    lon,
                )

        intent = await extract_daily_price_intent(query, config=config)
        logger.info("Daily price intent: %s", intent)

        tool_args = _build_tool_args(
            intent,
            lat=lat,
            lon=lon,
            crop=crop,
            state=state,
        )
        actions = intent.get("actions") or [intent["action"]]

        if any(a in _COMMODITY_ACTIONS for a in actions) and not tool_args.get("commodity_name"):
            logger.warning("daily_price_agent: missing commodity_name for actions=%s", actions)
            return ""

        if any(a in _GEO_ACTIONS for a in actions) and (
            tool_args.get("lat") is None or tool_args.get("long") is None
        ):
            if not tool_args.get("state") and not tool_args.get("market_name"):
                logger.warning("daily_price_agent: missing lat/long and state for geo/price query")
                return ""

        tool_result = await call_mandi_price_tool(tool_args)
        tool_payload = _unwrap_tool_payload(tool_result)
        # Keep raw tool payload on the return envelope for logs only (not used in farmer answer).
        logger.info(
            "daily_price_agent tool_data: %s",
            json.dumps(tool_payload, ensure_ascii=False, default=str)[:8000],
        )

        # Always ask Anthropic — including error/empty payloads — so farmers get a clear "not available".
        answer = await synthesize_daily_price_answer(
            query,
            tool_result,
            crop=crop,
            state=tool_args.get("state") or state,
            market_name=tool_args.get("market_name"),
            config=config,
        )
        return json.dumps(
            {"answer": answer or "", "tool_data": tool_payload},
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
