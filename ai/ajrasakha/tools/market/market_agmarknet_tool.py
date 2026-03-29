from __future__ import annotations

import asyncio
import os
from datetime import date as date_type
from typing import Any

import httpx
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

load_dotenv()

BASE_URL = os.getenv("AGMARKNET_BASE_URL", "https://api.agmarknet.gov.in/v1").rstrip("/")
TIMEOUT = float(os.getenv("AGMARKNET_TIMEOUT_SECONDS", "30"))
RETRIES = int(os.getenv("AGMARKNET_MAX_RETRIES", "3"))

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Origin": "https://www.agmarknet.gov.in",
    "Referer": "https://www.agmarknet.gov.in/",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
}

mcp_agmarknet = FastMCP("ajrasakha-agmarknet-mcp")

_filters_cache: dict[str, Any] = {}


async def _request(path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{BASE_URL}/{path.lstrip('/')}"
    for i in range(RETRIES):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT, headers=HEADERS) as client:
                res = await client.get(url, params=params)
                res.raise_for_status()
                return {"success": True, "data": res.json()}
        except Exception as e:
            if i == RETRIES - 1:
                return {"success": False, "error": str(e)}
            await asyncio.sleep(0.5 * (2**i))


async def _request_raw_url(url: str) -> dict[str, Any]:
    """For requests that need literal bracket notation in query string."""
    for i in range(RETRIES):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT, headers=HEADERS) as client:
                res = await client.get(url)
                res.raise_for_status()
                return {"success": True, "data": res.json()}
        except Exception as e:
            if i == RETRIES - 1:
                return {"success": False, "error": str(e)}
            await asyncio.sleep(0.5 * (2**i))


async def _get_filters(dashboard: str = "marketwise_price_arrival") -> dict[str, Any]:
    if dashboard not in _filters_cache:
        result = await _request("dashboard-filters/", {"dashboard_name": dashboard})
        if not result["success"]:
            raise RuntimeError(f"Failed to fetch filters: {result['error']}")
        _filters_cache[dashboard] = result["data"]["data"]
    return _filters_cache[dashboard]



@mcp_agmarknet.tool()
async def get_states(dashboard: str = "marketwise_price_arrival") -> dict[str, Any]:
    """
    Get all available states. Always call this first to resolve a state name to its ID.
    Returns list of {id, name}.
    """
    try:
        filters = await _get_filters(dashboard)
        return {
            "success": True,
            "data": [
                {"id": s["state_id"], "name": s["state_name"]}
                for s in filters["state_data"]
                if s["state_id"] != 100006  # skip "All States"
            ],
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@mcp_agmarknet.tool()
async def get_districts(state_id: int, dashboard: str = "marketwise_price_arrival") -> dict[str, Any]:
    """
    Get districts for a given state_id. Call after get_states.
    Returns list of {id, name}.
    """
    try:
        filters = await _get_filters(dashboard)
        return {
            "success": True,
            "data": [
                {"id": d["id"], "name": d["district_name"]}
                for d in filters["district_data"]
                if d["state_id"] == state_id
            ],
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@mcp_agmarknet.tool()
async def get_markets(
    state_id: int,
    district_id: int | None = None,
    dashboard: str = "marketwise_price_arrival",
) -> dict[str, Any]:
    """
    Get markets for a state, optionally filtered by district_id. Call after get_districts.
    Returns list of {id, name}.
    """
    try:
        filters = await _get_filters(dashboard)
        return {
            "success": True,
            "data": [
                {"id": m["id"], "name": m["mkt_name"]}
                for m in filters["market_data"]
                if m["state_id"] == state_id
                and (district_id is None or m.get("district_id") == district_id)
            ],
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@mcp_agmarknet.tool()
async def get_commodities(dashboard: str = "marketwise_price_arrival") -> dict[str, Any]:
    """
    Get all available commodities. Can be called in parallel with get_states.
    Returns list of {id, name}.
    """
    try:
        filters = await _get_filters(dashboard)
        return {
            "success": True,
            "data": [
                {"id": c["cmdt_id"], "name": c["cmdt_name"]}
                for c in filters["cmdt_data"]
                if c["cmdt_id"] != 100001  # skip "All Commodities"
            ],
        }
    except Exception as e:
        return {"success": False, "error": str(e)}



@mcp_agmarknet.tool()
async def get_price_arrivals(
    dashboard: str = "marketwise_price_arrival",
    date: str | None = None,
    state: int = 100006,
    district: int = 100007,
    market: int = 100009,
    commodity: int = 100001,
    group: int = 100000,
    variety: int = 100021,
    grades: int = 4,
    limit: int = 10,
) -> dict[str, Any]:
    """
    Fetch price and arrival data. Call this last, after resolving IDs from
    get_states, get_districts, get_markets, get_commodities.

    Defaults to all states/districts/markets/commodities if no filters given.
    date format: YYYY-MM-DD (defaults to today).

    Typical flow for a user query:
        1. get_states() → resolve state name to state_id
        2. get_districts(state_id) → resolve district name to district_id
        3. get_commodities() → resolve commodity name to commodity_id
        4. get_price_arrivals(state=state_id, district=district_id, commodity=commodity_id)
    """
    if date is None:
        date = date_type.today().isoformat()

    parts = [
        f"dashboard={dashboard}",
        f"date={date}",
        f"limit={limit}",
        f"format=json",
        f"variety={variety}",
        f"state={state}",
        f"group=[{group}]",
        f"grades=[{grades}]",
        f"market=[{market}]",
        f"district=[{district}]",
        f"commodity=[{commodity}]",
    ]
    url = f"{BASE_URL}/dashboard-data/?{'&'.join(parts)}"
    return await _request_raw_url(url)