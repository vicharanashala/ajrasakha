from __future__ import annotations

import asyncio
import re
from typing import Any

import httpx

# ================= MCP (OPTIONAL) =================
try:
    from mcp.server.fastmcp import FastMCP
    mcp = FastMCP("ajrasakha-azadpur-mandi-mcp")
except ImportError:
    mcp = None


# ================= CONFIG =================

BASE_URL = "https://www.apmcazadpurdelhi.com/"

TIMEOUT = 30
RETRIES = 3


# ================= HELPERS =================

def safe_float(value: str) -> float:
    """
    Safely convert string to float.
    Returns 0.0 if conversion fails.
    """
    if not value:
        return 0.0

    try:
        return float(value.strip())
    except (ValueError, AttributeError):
        return 0.0


def extract_date(text: str) -> str:
    """
    Extract date like:
    Dated:23/04/2026
    """
    match = re.search(r"Dated:(\d{2}/\d{2}/\d{4})", text)

    if match:
        return match.group(1)

    return ""


# ================= CORE REQUEST =================

async def _request() -> dict[str, Any]:
    for i in range(RETRIES):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                response = await client.get(BASE_URL)
                response.raise_for_status()

                html = response.text

                from bs4 import BeautifulSoup
                soup = BeautifulSoup(html, "html.parser")

                parsed_data = []

                body = soup.find("body")
                body_text = body.get_text(" ", strip=True) if body else ""

                arrival_date = extract_date(body_text)

                price_items = soup.select(".price-item")

                for item in price_items:
                    commodity_tag = item.select_one(".comm-name")
                    min_tag = item.select_one(".comm-min")
                    max_tag = item.select_one(".comm-max")

                    commodity = (
                        commodity_tag.get_text(strip=True)
                        if commodity_tag
                        else ""
                    )

                    min_price = safe_float(
                        min_tag.get_text(strip=True)
                        if min_tag
                        else ""
                    )

                    max_price = safe_float(
                        max_tag.get_text(strip=True)
                        if max_tag
                        else ""
                    )

                    modal_price = round(
                        (min_price + max_price) / 2,
                        2
                    )

                    parsed_data.append(
                        {
                            "state": "Delhi",
                            "district": "Azadpur",
                            "market": "Azadpur Mandi",
                            "commodity": commodity,
                            "arrival_date": arrival_date,
                            "min_price": min_price,
                            "max_price": max_price,
                            "modal_price": modal_price,
                            "source": "APMC Azadpur",
                        }
                    )

                return {
                    "success": True,
                    "count": len(parsed_data),
                    "data": parsed_data,
                }

        except Exception as e:
            if i == RETRIES - 1:
                return {
                    "success": False,
                    "error": str(e),
                    "data": [],
                }

            await asyncio.sleep(0.5 * (2 ** i))


# ================= BUSINESS LOGIC =================

async def fetch_azadpur_mandi_prices(
    commodity: str | None = None,
) -> dict[str, Any]:
    """
    Fetch mandi price data from APMC Azadpur.

    This source does NOT accept:
    - state
    - district
    - date filters

    It returns the full daily list.

    Filtering is done locally by commodity.

    Parameters:
    - commodity (e.g. "Brinjal", "Tomato")

    """

    response = await _request()

    if not response.get("success"):
        return response

    data = response.get("data", [])

    if commodity:
        filtered = [
            item
            for item in data
            if commodity.lower()
            in item.get("commodity", "").lower()
        ]

        return {
            "success": True,
            "count": len(filtered),
            "data": filtered,
        }

    return response


if mcp:
    mcp.tool()(fetch_azadpur_mandi_prices)


# ================= RUN SERVER =================

if __name__ == "__main__" and mcp:
    mcp.run(transport="streamable-http")