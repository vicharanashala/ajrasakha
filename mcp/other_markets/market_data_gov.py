from __future__ import annotations

import asyncio
from typing import Any
from dotenv import load_dotenv
import httpx
import os

# ================= MCP (OPTIONAL) =================
try:
    from mcp.server.fastmcp import FastMCP
    mcp = FastMCP("ajrasakha-data-gov-mcp")
except ImportError:
    mcp = None


# ================= CONFIG =================

load_dotenv()
API_KEY = os.getenv("DATA_GOV_API_KEY")
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
                return {
                    "success": True,
                    "data": response.json(),
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
    limit: int = 10,
    offset: int = 0,
) -> dict[str, Any]:
    """
    Fetch mandi price data from Data.gov API.

    Parameters:
    - state (e.g. "Madhya Pradesh")
    - district (e.g. "Hoshangabad")
    - commodity (e.g. "Wheat")
    - arrival_date (YYYY-MM-DD)
    - limit (default 10)
    - offset (default 0)
    """

    params: dict[str, Any] = {
        "limit": limit,
        "offset": offset,
        # "sort[arrival_date]": "desc",
    }

    if state:
        params["filters[state]"] = state

    if district:
        params["filters[district]"] = district

    if commodity:
        params["filters[commodity]"] = commodity

    if arrival_date:
        params["filters[arrival_date]"] = arrival_date

    return await _request(params)


# ================= CLEAN RESPONSE (OPTIONAL) =================

# async def fetch_clean_prices(
#     state: str | None = None,
#     district: str | None = None,
#     commodity: str | None = None,
#     arrival_date: str | None = None,
#     limit: int = 10,
# ) -> dict[str, Any]:
#     raw = await fetch_mandi_prices(
#         state=state,
#         district=district,
#         commodity=commodity,
#         arrival_date=arrival_date,
#         limit=limit,
#     )

#     if not raw.get("success"):
#         return raw

#     records = raw["data"].get("records", [])

#     cleaned = [
#         {
#             "state": r.get("State"),
#             "district": r.get("District"),
#             "market": r.get("Market"),
#             "commodity": r.get("Commodity"),
#             "arrival_date": r.get("Arrival_Date"),
#             "min_price": r.get("Min_Price"),
#             "max_price": r.get("Max_Price"),
#             "modal_price": r.get("Modal_Price"),
#         }
#         for r in records
#     ]
#     return {
#         "success": True,
#         "count": len(cleaned),
#         "data": cleaned,
#     }


# ================= MCP REGISTRATION =================

if mcp:
    mcp.tool()(fetch_mandi_prices)


# ================= RUN SERVER =================

if __name__ == "__main__" and mcp:
    mcp.run(transport="streamable-http")