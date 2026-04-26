from __future__ import annotations

from typing import Any

from datetime import datetime

# ================= MCP =================

from fastmcp import FastMCP
mcp = FastMCP("ajrasakha-unified-mandi-mcp")



# ================= IMPORT SERVICES =================

# import from your existing files

from market_data_gov import fetch_mandi_prices
from spices_board import fetch_spices_board_prices
from azadpur_apmc import fetch_azadpur_mandi_prices


# ================= HELPERS =================

def to_yyyy_mm_dd(date_str: str) -> str:
    """
    Convert:
    23/04/2026 -> 2026-04-23
    2026-04-23 -> 2026-04-23
    """

    if not date_str:
        return ""

    formats = [
        "%d/%m/%Y",
        "%Y-%m-%d",
    ]

    for fmt in formats:
        try:
            parsed = datetime.strptime(date_str, fmt)
            return parsed.strftime("%Y-%m-%d")
        except ValueError:
            continue

    return ""


def to_dd_mm_yyyy(date_str: str) -> str:
    """
    Convert:
    2026-04-23 -> 23/04/2026
    23/04/2026 -> 23/04/2026
    """

    if not date_str:
        return ""

    formats = [
        "%Y-%m-%d",
        "%d/%m/%Y",
    ]

    for fmt in formats:
        try:
            parsed = datetime.strptime(date_str, fmt)
            return parsed.strftime("%d/%m/%Y")
        except ValueError:
            continue

    return ""


def normalize_data(data: list[dict[str, Any]], source: str):
    """
    Normalize response shape across all sources
    """

    normalized = []

    for item in data:
        min_price = item.get("min_price")
        max_price = item.get("max_price")
        modal_price = item.get("modal_price")

        normalized.append(
            {
                "state": item.get("state", ""),
                "district": item.get("district", ""),
                "market": item.get("market", ""),
                "commodity": item.get("commodity", ""),
                "arrival_date": item.get("arrival_date", ""),

                "min_price": (
                    float(min_price)
                    if min_price not in [None, ""]
                    else None
                ),

                "max_price": (
                    float(max_price)
                    if max_price not in [None, ""]
                    else None
                ),

                "modal_price": (
                    float(modal_price)
                    if modal_price not in [None, ""]
                    else None
                ),

                "source": source,
            }
        )

    return normalized


def filter_by_commodity(
    data: list[dict[str, Any]],
    commodity: str,
):
    """
    Filter results using partial match
    """

    if not commodity:
        return data

    commodity = commodity.lower()

    return [
        item
        for item in data
        if commodity in item.get("commodity", "").lower()
    ]


# ================= BUSINESS LOGIC =================
@mcp.tool()
async def unified_mandi_prices(
    state: str,
    district: str = "",
    commodity: str = "",
    arrival_date: str = "",
) -> dict[str, Any]:
    """
    Unified mandi price fetcher across:

    - data.gov.in
    - Indian Spices Board
    - Azadpur Mandi

    Returns best match + alternatives
    """

    # -----------------------------
    # Call all services
    # -----------------------------

    spices_arrival_date = to_yyyy_mm_dd(arrival_date)
    data_gov_arrival_date = to_dd_mm_yyyy(arrival_date)
    state = state.title()
    commodity = commodity.title()
    district = district.title()
    data_gov_state = state
 
    if state == "Delhi":
        data_gov_state = "NCT of Delhi"
    data_gov_response = await fetch_mandi_prices(
        state=data_gov_state,
        district=district,
        commodity=commodity,
        arrival_date=data_gov_arrival_date,
    )

    spices_response = await fetch_spices_board_prices(
        state=state,
        spice=commodity,
        arrival_date=spices_arrival_date,
    )
    
    if state == 'Delhi' or district == 'Azadpur':
        azadpur_response = await fetch_azadpur_mandi_prices(
            commodity=commodity,
    )
    else:
        azadpur_response = {"data": []}

    # -----------------------------
    # Normalize all responses
    # -----------------------------

    normalized_data_gov = normalize_data(
        data_gov_response.get("data", []),
        "data.gov.in",
    )

    normalized_spices = normalize_data(
        spices_response.get("data", []),
        "Indian Spices Board",
    )

    normalized_azadpur = normalize_data(
        azadpur_response.get("data", []),
        "Azadpur Mandi",
    )

    # -----------------------------
    # Merge
    # -----------------------------

    combined = (
        normalized_data_gov
        + normalized_spices
        + normalized_azadpur
    )

    # -----------------------------
    # Filter by commodity
    # -----------------------------

    filtered_results = filter_by_commodity(
        combined,
        commodity,
    )

    final_results = (
        filtered_results
        if filtered_results
        else combined
    )

    # -----------------------------
    # Best Match
    # -----------------------------

    best_match = final_results[0] if final_results else None
    error_msg='No Error'
    flag=True
    if len(final_results)==0:
        error_msg= f'No Data Found for State : {state}, Commodity : {commodity}, Arrival Data : {arrival_date}. Check for other related mandi prices.'
        flag= False

    return {
        "success": flag,
        "best_match": best_match,
        "total_results": len(final_results),
        "Error Message": error_msg,
        "alternatives": final_results[1:5],
    }



if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
