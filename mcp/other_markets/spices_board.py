# import asyncio
# import logging
# from typing import Dict, List

# import aiohttp
# from bs4 import BeautifulSoup
# from fastmcp import FastMCP

# # Configure logging
# logging.basicConfig(level=logging.INFO)
# logger = logging.getLogger(__name__)

# mcp = FastMCP("SpicesBoard")


# def safe_float(value: str) -> float:
#     """
#     Safely convert a string to a float, returning 0.0 on failure.
#     """
#     try:
#         return float(value.strip())
#     except (ValueError, AttributeError):
#         return 0.0


# @mcp.tool()
# async def get_spices_board_prices(state: str, spice: str = "") -> Dict:
#     """
#     Fetches and parses spices market data from the Indian Spices Board website.

#     Args:
#         state: The state to filter by (e.g., "ANDHRA PRADESH").
#         spice: The spice to filter by (optional).

#     Returns:
#         A dictionary containing the status and a list of parsed data.
#     """
#     base_url = "https://www.indianspices.com/marketing/price/domestic/current-market-price.html"
#     params = {"filterState": state, "filterSpice": spice, "dateFrom": "", "dateTo": ""}
#     max_retries = 3
#     timeout = aiohttp.ClientTimeout(total=10)  # 10-second timeout

#     for attempt in range(max_retries):
#         try:
#             async with aiohttp.ClientSession(timeout=timeout) as session:
#                 async with session.get(base_url, params=params) as response:
#                     response.raise_for_status()
#                     html_content = await response.text()
#                     soup = BeautifulSoup(html_content, "html.parser")
#                     table = soup.find("table")

#                     if not table:
#                         logger.warning("No data table found on the page.")
#                         return {"status": 404, "data": [], "error": "Data table not found"}

#                     headers = [
#                         "date",
#                         "spice",
#                         "market",
#                         "state",
#                         "grade",
#                         "source",
#                         "min_price",
#                         "max_price",
#                         "avg_price",
#                     ]
#                     parsed_data = []

#                     for row in table.find_all("tr")[1:]:  # Skip header row
#                         cells = [cell.text.strip() for cell in row.find_all("td")]

#                         if len(cells) != 9:
#                             logger.warning(f"Skipping malformed row: {cells}")
#                             continue

#                         row_data = dict(zip(headers, cells))

#                         # Clean and convert numeric fields
#                         row_data["min_price"] = safe_float(row_data["min_price"])
#                         row_data["max_price"] = safe_float(row_data["max_price"])
#                         row_data["avg_price"] = safe_float(row_data["avg_price"])

#                         parsed_data.append(row_data)

#                     return {"status": 200, "data": parsed_data}

#         except aiohttp.ClientError as e:
#             logger.error(f"Attempt {attempt + 1} failed: {e}")
#             if attempt < max_retries - 1:
#                 await asyncio.sleep(2**attempt)  # Exponential backoff
#             else:
#                 return {"status": 500, "data": [], "error": str(e)}
#         except Exception as e:
#             logger.exception(f"An unexpected error occurred: {e}")
#             return {"status": 500, "data": [], "error": "An unexpected error occurred"}

#     return {"status": 500, "data": [], "error": "All retries failed"}


# if __name__ == "__main__":
#     # To run this file directly for testing
#     async def main():
#         # Example usage:
#         data = await get_spices_board_prices(state="BIHAR")
#         import json
#         print(json.dumps(data, indent=2))

#     asyncio.run(main())


from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx
from bs4 import BeautifulSoup

# ================= MCP (OPTIONAL) =================
try:
    from mcp.server.fastmcp import FastMCP
    mcp = FastMCP("ajrasakha-spices-board-mcp")
except ImportError:
    mcp = None


# ================= LOGGING =================

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ================= CONFIG =================

BASE_URL = (
    "https://www.indianspices.com/marketing/price/"
    "domestic/current-market-price.html"
)

TIMEOUT = 30
RETRIES = 3


# ================= HELPERS =================

def safe_float(value: str):
    """
    Return float if value exists,
    otherwise return None
    """

    if value in [None, ""]:
        return None

    try:
        cleaned = value.replace(",", "").strip()
        return float(cleaned)
    except (ValueError, AttributeError):
        return None


def normalize_row(row_data: dict[str, Any]) -> dict[str, Any]:
    """
    Standardized response format for unified mandi engine.
    """

    return {
        "state": row_data.get("state", ""),
        "district": "",
        "market": row_data.get("market", ""),
        "commodity": row_data.get("spice", ""),
        "arrival_date": row_data.get("date", ""),
        "min_price": safe_float(row_data.get("min_price", "")),
        "max_price": safe_float(row_data.get("max_price", "")),
        "modal_price": safe_float(row_data.get("avg_price", "")),
        "grade": row_data.get("grade", ""),
        "price_source": row_data.get("price_source", ""),
        "source": "Indian Spices Board",
    }


# ================= CORE REQUEST =================

async def _request(
    state: str,
    spice: str = "",
    arrival_date: str = "",
) -> dict[str, Any]:
    """
    Internal request handler for Indian Spices Board.
    """

    params = {
        "filterState": state,
        "filterSpice": spice,
        "dateFrom": arrival_date,
        "dateTo": "",
    }

    headers = [
        "date",
        "spice",
        "market",
        "state",
        "grade",
        "price_source",
        "min_price",
        "max_price",
        "avg_price",
    ]

    for attempt in range(RETRIES):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                response = await client.get(
                    BASE_URL,
                    params=params,
                )

                response.raise_for_status()

                html_content = response.text

                soup = BeautifulSoup(
                    html_content,
                    "html.parser"
                )

                table = soup.find("table")

                if not table:
                    logger.warning(
                        "No data table found on Spices Board page"
                    )
                    return {
                        "success": False,
                        "count": 0,
                        "data": [],
                        "error": "Data table not found",
                    }

                parsed_data = []

                rows = table.find_all("tr")[1:]

                for row in rows:
                    cells = [
                        cell.text.strip()
                        for cell in row.find_all("td")
                    ]

                    if len(cells) != 9:
                        logger.warning(
                            f"Skipping malformed row: {cells}"
                        )
                        continue

                    raw_row = dict(zip(headers, cells))

                    normalized = normalize_row(raw_row)

                    parsed_data.append(normalized)

                return {
                    "success": True,
                    "count": len(parsed_data),
                    "data": parsed_data,
                    "source": "Indian Spices Board",
                }

        except Exception as e:
            logger.error(
                f"Attempt {attempt + 1} failed: {str(e)}"
            )

            if attempt == RETRIES - 1:
                return {
                    "success": False,
                    "count": 0,
                    "data": [],
                    "error": str(e),
                }

            await asyncio.sleep(
                0.5 * (2 ** attempt)
            )

    return {
        "success": False,
        "count": 0,
        "data": [],
        "error": "All retries failed",
    }


# ================= BUSINESS LOGIC =================

async def fetch_spices_board_prices(
    state: str,
    spice: str = "",
    arrival_date: str = "",
) -> dict[str, Any]:
    """
    Fetch mandi prices from Indian Spices Board.

    Parameters:
    - state (required)
      Example: "BIHAR", "KERALA"

    - spice (optional)
      Example: "Pepper", "Cardamom"

    Returns:
    {
        success: bool,
        count: int,
        data: list
    }
    """

    if not state:
        return {
            "success": False,
            "count": 0,
            "data": [],
            "error": "State is required",
        }

    return await _request(
        state=state,
        spice=spice,
        arrival_date=arrival_date,
    )


if mcp:
    mcp.tool()(fetch_spices_board_prices)


# ================= RUN SERVER =================

if __name__ == "__main__" and mcp:
    mcp.run(transport="streamable-http")