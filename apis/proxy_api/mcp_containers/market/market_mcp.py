


from typing import List
import aiohttp
import json
import difflib
from datetime import datetime, timedelta
from fastmcp import FastMCP

# -------------------------------------------------------------------
# MCP setup
# -------------------------------------------------------------------

mcp = FastMCP("Market")

# -------------------------------------------------------------------
# Constants & mappings
# -------------------------------------------------------------------

STATE_NAME_TO_ID = {
    "andaman and nicobar islands": "37",
    "andhra pradesh": "276",
    "assam": "38",
    "bihar": "33",
    "chandigarh": "526",
    "chhattisgarh": "100",
    "goa": "34",
    "gujarat": "22",
    "haryana": "32",
    "himachal pradesh": "43",
    "jammu and kashmir": "696",
    "jharkhand": "47",
    "karnataka": "695",
    "kerala": "694",
    "madhya pradesh": "20",
    "maharashtra": "296",
    "nagaland": "35",
    "odisha": "384",
    "puducherry": "599",
    "punjab": "602",
    "rajasthan": "26",
    "tamil nadu": "509",
    "telangana": "28",
    "tripura": "36",
    "uttar pradesh": "46",
    "uttarakhand": "385",
    "west bengal": "569",
}

STATE_ALIASES = {
    "up": "uttar pradesh",
    "u.p": "uttar pradesh",
    "mp": "madhya pradesh",
    "m.p": "madhya pradesh",
    "tn": "tamil nadu",
    "t.n": "tamil nadu",
    "wb": "west bengal",
    "ap": "andhra pradesh",
    "ts": "telangana",
    "jk": "jammu and kashmir",
}

MAX_LOOKBACK_DAYS = 7

# -------------------------------------------------------------------
# Helpers (pure Python)
# -------------------------------------------------------------------

def resolve_state_name(state_name: str) -> tuple[str | None, list[str]]:
    name = state_name.strip().lower().replace(".", "")
    name = STATE_ALIASES.get(name, name)

    if name in STATE_NAME_TO_ID:
        return name, []

    suggestions = difflib.get_close_matches(
        name, STATE_NAME_TO_ID.keys(), n=3, cutoff=0.6
    )
    return None, suggestions


# -------------------------------------------------------------------
# Internal business logic (NO decorators)
# -------------------------------------------------------------------

async def _get_apmc_list_from_enam(state_name: str) -> dict:
    resolved_state, suggestions = resolve_state_name(state_name)
    if not resolved_state:
        return {
            "status": 400,
            "error": f"Invalid state name: '{state_name}'",
            "suggestions": suggestions,
        }

    url = "https://enam.gov.in/web/Ajax_ctrl/apmc_list"
    form = aiohttp.FormData()
    form.add_field("state_id", STATE_NAME_TO_ID[resolved_state])

    async with aiohttp.ClientSession() as session:
        async with session.post(url, data=form) as response:
            response.raise_for_status()
            payload = json.loads(await response.text())

            apmcs = [
                item["apmc_name"]
                for item in payload.get("data", [])
                if "apmc_name" in item
            ]

            return {
                "status": 200,
                "state": resolved_state,
                "count": len(apmcs),
                "apmcs": apmcs,
            }


async def _get_commodity_list_from_enam(
    state_name: str, apmc_name: str, from_date: str, to_date: str
) -> dict:

    resolved_state, suggestions = resolve_state_name(state_name)
    if not resolved_state:
        return {
            "status": 400,
            "error": f"Invalid state name: '{state_name}'",
            "suggestions": suggestions,
        }

    apmc_resp = await _get_apmc_list_from_enam(resolved_state)
    if apmc_resp["status"] != 200:
        return apmc_resp

    apmc_lookup = {a.lower(): a for a in apmc_resp["apmcs"]}
    apmc_key = apmc_name.strip().lower()

    if apmc_key not in apmc_lookup:
        return {
            "status": 400,
            "error": f"APMC '{apmc_name}' not available",
            "available_apmcs": apmc_resp["apmcs"],
        }

    standard_apmc = apmc_lookup[apmc_key]
    standard_state = resolved_state.upper()

    url = "https://enam.gov.in/web/Ajax_ctrl/commodity_list"

    found_data = []
    missing_dates = []
    found_date = None

    start_dt = datetime.strptime(to_date, "%Y-%m-%d")

    async with aiohttp.ClientSession() as session:
        for i in range(MAX_LOOKBACK_DAYS):
            date = (start_dt - timedelta(days=i)).strftime("%Y-%m-%d")

            form = aiohttp.FormData()
            form.add_field("language", "en")
            form.add_field("stateName", standard_state)
            form.add_field("apmcName", standard_apmc)
            form.add_field("fromDate", date)
            form.add_field("toDate", date)

            async with session.post(url, data=form) as response:
                payload = json.loads(await response.text())
                rows = payload.get("data", [])

                if rows:
                    found_data = rows
                    found_date = date
                    break
                missing_dates.append(date)

    if not found_data:
        return {
            "status": 204,
            "state": standard_state,
            "apmc": standard_apmc,
            "checked_dates": missing_dates,
        }

    return {
        "status": 200,
        "state": standard_state,
        "apmc": standard_apmc,
        "available_date": found_date,
        "missing_dates": missing_dates,
        "commodities": found_data,
    }


async def _get_trade_data_list(
    state_name: str,
    apmc_name: str,
    commodity_name: str,
    from_date: str,
    to_date: str,
) -> dict:

    commodity_resp = await _get_commodity_list_from_enam(
        state_name, apmc_name, from_date, to_date
    )

    if commodity_resp.get("status") != 200:
        return commodity_resp

    available = {
        c["commodity"].lower(): c["commodity"]
        for c in commodity_resp["commodities"]
    }

    key = commodity_name.strip().lower()
    if key not in available:
        return {
            "status": 400,
            "error": f"Commodity '{commodity_name}' not available",
            "available_commodities": sorted(available.values()),
        }

    standard_commodity = available[key]
    standard_state = commodity_resp["state"]
    standard_apmc = commodity_resp["apmc"]

    url = "https://enam.gov.in/web/Ajax_ctrl/trade_data_list"

    start_dt = datetime.strptime(to_date, "%Y-%m-%d")
    missing_dates = []

    async with aiohttp.ClientSession() as session:
        for i in range(MAX_LOOKBACK_DAYS):
            date = (start_dt - timedelta(days=i)).strftime("%Y-%m-%d")

            form = aiohttp.FormData()
            form.add_field("language", "en")
            form.add_field("stateName", standard_state)
            form.add_field("apmcName", standard_apmc)
            form.add_field("commodityName", standard_commodity)
            form.add_field("fromDate", date)
            form.add_field("toDate", date)

            async with session.post(url, data=form) as response:
                payload = json.loads(await response.text())
                rows = payload.get("data", [])

                if rows:
                    return {
                        "status": 200,
                        "state": standard_state,
                        "apmc": standard_apmc,
                        "commodity": standard_commodity,
                        "available_date": date,
                        "missing_dates": missing_dates,
                        "trade_data": rows,
                    }

                missing_dates.append(date)

    return {
        "status": 204,
        "state": standard_state,
        "apmc": standard_apmc,
        "commodity": standard_commodity,
        "checked_dates": missing_dates,
    }


# -------------------------------------------------------------------
# MCP tool wrappers (THIN ONLY)
# -------------------------------------------------------------------

@mcp.tool()
async def get_apmc_list_from_enam(state_name: str) -> dict:
    return await _get_apmc_list_from_enam(state_name)


@mcp.tool()
async def get_commodity_list_from_enam(
    state_name: str, apmc_name: str, from_date: str, to_date: str
) -> dict:
    return await _get_commodity_list_from_enam(
        state_name, apmc_name, from_date, to_date
    )


@mcp.tool()
async def get_trade_data_list(
    state_name: str,
    apmc_name: str,
    commodity_name: str,
    from_date: str,
    to_date: str,
) -> dict:
    return await _get_trade_data_list(
        state_name, apmc_name, commodity_name, from_date, to_date
    )


# -------------------------------------------------------------------
# Entry point
# -------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run(
        transport="streamable-http",
        host="0.0.0.0",
        port=9022,
    )
