from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import httpx
from commodities import commodities

# ================= MCP (OPTIONAL) =================
try:
    from mcp.server.fastmcp import FastMCP
    mcp = FastMCP("ajrasakha-data-gov-mcp")
except ImportError:
    mcp = None


# ================= CONFIG =================

API_KEY = "579b464db66ec23bdd000001d7142eeff5b24f194f92d9870b3571fd"
RESOURCE_ID = "35985678-0d79-46b4-9ed6-6f13308a1d24"

BASE_URL = f"https://api.data.gov.in/resource/{RESOURCE_ID}"

TIMEOUT = 30
RETRIES = 3


# ================= VALIDATION =================

VALID_COMMODITIES = sorted(set(commodities))
DISTRICTS_FILE = Path(__file__).with_name("districts.json")
try:
    DISTRICT_CONFIG = json.loads(DISTRICTS_FILE.read_text(encoding="utf-8"))
except Exception:
    DISTRICT_CONFIG = {}
KARNATAKA_DISTRICTS = DISTRICT_CONFIG.get("Karnataka", [])


def _normalize(value: str) -> str:
    return " ".join(value.strip().lower().split())


def _match_key(value: str) -> str:
    return "".join(ch for ch in _normalize(value) if ch.isalnum())


def _validate_and_correct_commodity(commodity: str) -> tuple[str | None, dict[str, Any] | None]:
    retry_message = "tool call again with available commodity name"
    requested = _normalize(commodity)
    if not requested:
        return None, None

    exact_map = {_normalize(item): item for item in VALID_COMMODITIES}
    exact_match = exact_map.get(requested)
    if exact_match:
        return exact_match, None

    matches: list[dict[str, Any]] = []
    for item in VALID_COMMODITIES:
        score = SequenceMatcher(None, requested, _normalize(item)).ratio() * 100
        if score > 70:
            matches.append({"commodity": item, "score": round(score, 2)})

    matches.sort(key=lambda x: x["score"], reverse=True)

    if len(matches) >= 2:
        return None, {
            "success": False,
            "error_type": "commodity_validation_failed",
            "error": retry_message,
            "available_commodities": VALID_COMMODITIES,
        }

    if len(matches) == 1:
        top_match = matches[0]
        if top_match["score"] > 90:
            return top_match["commodity"], None
        return None, {
            "success": False,
            "error_type": "commodity_validation_failed",
            "error": retry_message,
            "available_commodities": VALID_COMMODITIES,
        }

    return None, {
        "success": False,
        "error_type": "commodity_validation_failed",
        "error": retry_message,
        "matched_candidates": [],
        "available_commodities": VALID_COMMODITIES,
    }


def _validate_karnataka_district(state: str, district: str) -> dict[str, Any] | None:
    if _normalize(state) != "karnataka" or not district:
        return None

    district_match_map = {_match_key(item): item for item in KARNATAKA_DISTRICTS}
    matched = district_match_map.get(_match_key(district))
    if matched:
        return {"matched_district": matched}

    return {
        "success": False,
        "error_type": "district_validation_failed",
        "error": f'District "{district}" is invalid for Karnataka in data.gov.in.',
        "input_state": state,
        "input_district": district,
        "available_districts": KARNATAKA_DISTRICTS,
    }


def _parse_dd_mm_yyyy(value: str) -> datetime | None:
    try:
        return datetime.strptime(value, "%d/%m/%Y")
    except ValueError:
        return None


# ================= CORE REQUEST =================

async def _request(params: dict[str, Any]) -> dict[str, Any]:
    query = {
        "api-key": API_KEY,
        "format": "json",
        **params,
    }

    for i in range(RETRIES):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                response = await client.get(BASE_URL, params=query)
                response.raise_for_status()

                api_response = response.json()
                if api_response.get("error"):
                    return {
                        "success": False,
                        "error_type": "data_gov_api_error",
                        "error": api_response.get("error"),
                        "api_response": api_response,
                    }

                # Correct key from API response
                records = api_response.get("records", [])

                cleaned = [
                    {
                        "state": r.get("State"),
                        "district": r.get("District"),
                        "market": r.get("Market"),
                        "commodity": r.get("Commodity"),
                        "arrival_date": r.get("Arrival_Date"),
                        "min_price": r.get("Min_Price"),
                        "max_price": r.get("Max_Price"),
                        "modal_price": r.get("Modal_Price"),
                    }
                    for r in records
                ]
                requested_arrival_date = params.get("filters[Arrival_Date]")
                if requested_arrival_date:
                    cleaned = [
                        row
                        for row in cleaned
                        if row.get("arrival_date") == requested_arrival_date
                    ]

                return {
                    "success": True,
                    "total": api_response.get("total", 0),
                    "count": len(cleaned),
                    "data": cleaned,
                }

        except Exception as e:
            if i == RETRIES - 1:
                return {
                    "success": False,
                    "error_type": "request_failed",
                    "error": str(e),
                }

            await asyncio.sleep(0.5 * (2 ** i))

# ================= BUSINESS LOGIC =================

async def fetch_mandi_prices(
    state: str | None = None,
    district: str | None = None,
    commodity: str | None = None,
    arrival_date: str | None = None,
    offset: int = 0,
) -> dict[str, Any]:
    """
    Fetch mandi price data from Data.gov API.

    Parameters:
    - state (e.g. "Madhya Pradesh")
    - district (e.g. "Hoshangabad")
    - commodity (e.g. "Wheat")
    - arrival_date (YYYY-MM-DD)
    - offset (default 0)
    """

    params: dict[str, Any] = {
        "offset": offset,
        # "sort[arrival_date]": "desc",
    }

    if state:
        state = state.title()
        params["filters[State]"] = state

    if district:
        district = district.title()
        district_validation = _validate_karnataka_district(state or "", district)
        if district_validation:
            if district_validation.get("success") is False:
                return district_validation
            district = district_validation["matched_district"]
        params["filters[District]"] = district

    if commodity:
        validated_commodity, validation_error = _validate_and_correct_commodity(commodity)
        if validation_error:
            return validation_error
        commodity = validated_commodity
        params["filters[Commodity]"] = commodity

    effective_arrival_date = arrival_date or datetime.now().strftime("%d/%m/%Y")
    params["filters[Arrival_Date]"] = effective_arrival_date

    response = await _request(params)
    if effective_arrival_date and response.get("success") and not response.get("data"):
        requested_date = _parse_dd_mm_yyyy(effective_arrival_date)
        if requested_date:
            fallback_queries: list[tuple[int, str, dict[str, Any]]] = []
            for day_delta in range(1, 8):
                fallback_date = (
                    requested_date - timedelta(days=day_delta)
                ).strftime("%d/%m/%Y")
                query_params = dict(params)
                query_params["filters[Arrival_Date]"] = fallback_date
                fallback_queries.append((day_delta, fallback_date, query_params))

            fallback_results = await asyncio.gather(
                *[_request(query_params) for _, _, query_params in fallback_queries]
            )

            for (day_delta, fallback_date, _), fallback_response in zip(
                fallback_queries, fallback_results
            ):
                if fallback_response.get("success") and fallback_response.get("data"):
                    fallback_response["fallback_info"] = {
                        "requested_arrival_date": effective_arrival_date,
                        "fallback_arrival_date": fallback_date,
                        "days_back": day_delta,
                        "message": (
                            f"Data not available for {effective_arrival_date} on data.gov.in. "
                            f"Showing latest available prior date: {fallback_date}."
                        ),
                    }
                    return fallback_response
            response["date_check_info"] = {
                "requested_arrival_date": effective_arrival_date,
                "checked_until_date": (requested_date - timedelta(days=7)).strftime("%d/%m/%Y"),
                "days_checked": 7,
            }
    return response