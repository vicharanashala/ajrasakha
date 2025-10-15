from typing import List, Dict, Any
import aiohttp
from datetime import datetime
from .models import State, APMC, MarketPrice


async def get_state_list() -> List[State]:
    """
    Fetch the list of states from eNAM portal.
    Returns:
        List of State objects with state_id and state_name.
    """
    url = "https://enam.gov.in/web/Ajax_ctrl/states_name"

    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(url, data=aiohttp.FormData()) as response:
                response.raise_for_status()
                data = await response.json()
                return [
                    State(state_id=state["state_id"], state_name=state["state_name"])
                    for state in data.get("data", [])
                ]
        except Exception as e:
            raise Exception(f"Failed to fetch state list: {str(e)}")


async def get_apmc_list(state_id: str) -> List[APMC]:
    """
    Fetch the list of APMCs for a given state from eNAM portal.
    Args:
        state_id: The ID of the state to get APMCs for
    Returns:
        List of APMC objects with apmc_id and apmc_name.
    """
    url = "https://enam.gov.in/web/Ajax_ctrl/apmc_list"
    form = aiohttp.FormData()
    form.add_field("state_id", state_id)

    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(url, data=form) as response:
                response.raise_for_status()
                data = await response.json()
                return [
                    APMC(apmc_id=apmc["apmc_id"], apmc_name=apmc["apmc_name"])
                    for apmc in data.get("data", [])
                ]
        except Exception as e:
            raise Exception(f"Failed to fetch APMC list: {str(e)}")


async def get_commodity_list(
    state_name: str,
    apmc_name: str,
    from_date: str,
    to_date: str
) -> List[MarketPrice]:
    """
    Fetch the list of commodities traded in a given APMC for a specific date range.
    Args:
        state_name: The name of the state
        apmc_name: The name of the APMC
        from_date: Start date in YYYY-MM-DD format
        to_date: End date in YYYY-MM-DD format
    Returns:
        List of MarketPrice objects with price and trade information.
    """
    url = "https://enam.gov.in/web/Ajax_ctrl/trade_data_list"
    form = aiohttp.FormData()
    form.add_field("state_name", state_name)
    form.add_field("apmc_name", apmc_name)
    form.add_field("from_date", from_date)
    form.add_field("to_date", to_date)

    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(url, data=form) as response:
                response.raise_for_status()
                data = await response.json()
                return [
                    MarketPrice(
                        min_price=float(item["min_price"]),
                        modal_price=float(item["modal_price"]),
                        max_price=float(item["max_price"]),
                        commodity_arrivals=float(item["commodity_arrivals"]),
                        commodity_traded=float(item["commodity_traded"]),
                        created_at=datetime.strptime(item["created_at"], "%Y-%m-%d").date(),
                        commodity_uom=item["Commodity_Uom"]
                    )
                    for item in data.get("data", [])
                ]
        except Exception as e:
            raise Exception(f"Failed to fetch commodity list: {str(e)}")