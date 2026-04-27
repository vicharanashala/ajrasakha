from __future__ import annotations

import asyncio
import os
from datetime import datetime
from typing import Any

import httpx
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

load_dotenv()

ENAM_BASE = os.getenv("ENAM_BASE_URL", "https://enam.gov.in/web/Ajax_ctrl").rstrip("/")
TIMEOUT = float(os.getenv("ENAM_TIMEOUT_SECONDS", "30"))
RETRIES = int(os.getenv("ENAM_MAX_RETRIES", "3"))

mcp = FastMCP(
    "ajrasakha-enam-mcp",
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=False
    )
)

async def _post(path: str, data: dict[str, str] | None = None) -> dict[str, Any]:
    url = f"{ENAM_BASE}/{path.lstrip('/')}"
    for i in range(RETRIES):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                res = await client.post(url, data=data or {})
                res.raise_for_status()
                # eNAM sometimes returns HTML instead of JSON
                try:
                    return {"success": True, "data": res.json()}
                except Exception:
                    return {"success": True, "data": res.text}
        except Exception as e:
            if i == RETRIES - 1:
                return {"success": False, "error": str(e)}
            await asyncio.sleep(0.5 * (2**i))

@mcp.tool()
def get_today_date_for_enam() -> str:
    """
    Get today's date in DD-MM-YYYY format for use in eNAM API calls.
    Call this first whenever you need to pass a date to other eNAM tools.
    """
    return datetime.now().strftime("%d-%m-%Y")


@mcp.tool()
async def get_state_list_from_enam() -> dict[str, Any]:
    """
    Fetch the list of all states available on the eNAM portal.
    Call this first to resolve a state name to the correct state_id
    before calling get_apmc_list_from_enam.
    """
    return await _post("states_name")


@mcp.tool()
async def get_apmc_list_from_enam(state_id: str) -> dict[str, Any]:
    """
    Fetch the list of APMCs (mandis) for a given state from eNAM.
    Call after get_state_list_from_enam to resolve state_id.
    Returns APMC names needed for commodity and trade data queries.
    """
    return await _post("apmc_list", {"state_id": state_id})


@mcp.tool()
async def get_commodity_list_from_enam(
    state_name: str,
    apmc_name: str,
    from_date: str,
    to_date: str,
) -> dict[str, Any]:
    """
    Fetch commodities traded in a given APMC for a date range.
    Dates in YYYY-MM-DD format.
    Call after get_apmc_list_from_enam to get valid apmc_name.
    Use get_today_date_for_enam to get today's date if needed.
    """
    return await _post("commodity_list", {
        "language": "en",
        "stateName": state_name,
        "apmcName": apmc_name,
        "fromDate": from_date,
        "toDate": to_date,
    })


@mcp.tool()
async def get_trade_data_from_enam(
    state_name: str,
    apmc_name: str,
    commodity_name: str,
    from_date: str,
    to_date: str,
) -> dict[str, Any]:
    """
    Fetch detailed trade data for a specific state, APMC, and commodity within a date range.
    Dates in YYYY-MM-DD format.
    Returns price, arrival, and trade volume data.

    Typical flow:
        1. get_state_list_from_enam() → resolve state name
        2. get_apmc_list_from_enam(state_id) → resolve APMC name
        3. get_commodity_list_from_enam(...) → resolve commodity name
        4. get_trade_data_from_enam(...) → get actual trade data
    """
    return await _post("trade_data_list", {
        "language": "en",
        "stateName": state_name,
        "apmcName": apmc_name,
        "commodityName": commodity_name,
        "fromDate": from_date,
        "toDate": to_date,
    })

if __name__ == "__main__":
    mcp.run(transport="streamable-http")