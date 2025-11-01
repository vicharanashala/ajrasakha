from typing import List
import aiohttp
from fastmcp import FastMCP
import asyncio
import pandas as pd

mcp = FastMCP("GD")


@mcp.tool()
async def get_today_date_for_enam() -> str:
    """
    Get today's date in DD-MM-YYYY format for usage in eNAM API calls.
    """
    from datetime import datetime

    return datetime.now().strftime("%d-%m-%Y")


@mcp.tool()
async def get_state_list_from_enam() -> dict:
    """
    Fetch the list of states from eNAM portal.
    Returns:
        Raw response text from the API (since it sometimes returns HTML instead of JSON).
    """
    url = "https://enam.gov.in/web/Ajax_ctrl/states_name"

    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(url, data=aiohttp.FormData()) as response:
                response.raise_for_status()
                return {"status": response.status, "text": await response.text()}
        except Exception as e:
            return [{"error": str(e)}]


@mcp.tool()
async def get_apmc_list_from_enam(state_id: str) -> dict:
    """
    Fetch the list of APMCs for a given state from eNAM portal.
    Returns:
        Raw response text (for debugging and flexibility).
    """
    url = "https://enam.gov.in/web/Ajax_ctrl/apmc_list"
    form = aiohttp.FormData()
    form.add_field("state_id", state_id)

    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(url, data=form) as response:
                response.raise_for_status()
                return {"status": response.status, "text": await response.text()}
        except Exception as e:
            return [f"Error: {str(e)}"]


@mcp.tool()
async def get_commodity_list_from_enam(state_name: str, apmc_name: str, from_date: str, to_date: str) -> dict:
    """
    Fetch the list of commodities traded in a given APMC for a specific date range.
    Date in "YYYY-MM-DD" format.
    """
    url = "https://enam.gov.in/web/Ajax_ctrl/commodity_list"
    form = aiohttp.FormData()
    form.add_field("language", "en")
    form.add_field("stateName", state_name)
    form.add_field("apmcName", apmc_name)
    form.add_field("fromDate", from_date)
    form.add_field("toDate", to_date)

    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(url, data=form) as response:
                response.raise_for_status()
                return {"status": response.status, "text": await response.text()}
        except Exception as e:
            return [{"error": str(e)}]


@mcp.tool()
async def get_trade_data_list(state_name: str, apmc_name: str, commodity_name: str, from_date: str, to_date: str) -> dict:
    """
    Fetch detailed trade data for a specific state, APMC, and commodity within a date range.
    Date in "YYYY-MM-DD" format.
    """
    url = "https://enam.gov.in/web/Ajax_ctrl/trade_data_list"
    form = aiohttp.FormData()
    form.add_field("language", "en")
    form.add_field("stateName", state_name)
    form.add_field("apmcName", apmc_name)
    form.add_field("commodityName", commodity_name)
    form.add_field("fromDate", from_date)
    form.add_field("toDate", to_date)

    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(url, data=form) as response:
                response.raise_for_status()
                return {"status": response.status, "text": await response.text()}
        except Exception as e:
            return [{"error": str(e)}]


#For karnataka market data
@mcp.tool()
async def get_latest_date_for_market() -> dict:
    """
    Fetch the latest market report date from the Krama Karnataka website.
    Returns the date and total markets reported for that date.
    """
    url = "https://krama.karnataka.gov.in/Home"

    try:
        # Pandas read_html is blocking, so use asyncio.to_thread to offload
        tables = await asyncio.to_thread(pd.read_html, url)

        if not tables or len(tables) < 2:
            return {"status": 500, "error": "Unexpected table structure from source"}

        df = tables[1]  # Second table contains date info
        result_row = df.iloc[1]  # Extract the row with date info

        latest_report = {
            "status": 200,
            "date_text": result_row[1],  # e.g. "Markets Reported For 01/11/2025: 1"
        }
        return latest_report

    except Exception as e:
        return {"status": 500, "error": str(e)}


if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=9010)
