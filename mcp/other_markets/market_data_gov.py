from __future__ import annotations

import asyncio
from typing import Any

import httpx

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
        params["filters[District]"] = district

    if commodity:
        commodity = commodity.title()
        params["filters[Commodity]"] = commodity

    if arrival_date:
        params["filters[Arrival_Date]"] = arrival_date

    return await _request(params)