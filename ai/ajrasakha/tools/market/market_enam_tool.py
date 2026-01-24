import aiohttp
from langchain.tools import tool


@tool
async def get_today_date_for_enam() -> str:
    """
    Get today's date in DD-MM-YYYY format for usage in eNAM API calls.
    """
    from datetime import datetime

    return datetime.now().strftime("%d-%m-%Y")


@tool
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


@tool
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


@tool
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


@tool
async def get_trade_data_list(state_name: str, apmc_name: str, commodity_name: str, from_date: str,
                              to_date: str) -> dict:
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
