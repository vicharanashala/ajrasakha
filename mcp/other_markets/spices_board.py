import asyncio
import logging
from typing import Dict, List

import aiohttp
from bs4 import BeautifulSoup
from fastmcp import FastMCP

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

mcp = FastMCP("SpicesBoard")


def safe_float(value: str) -> float:
    """
    Safely convert a string to a float, returning 0.0 on failure.
    """
    try:
        return float(value.strip())
    except (ValueError, AttributeError):
        return 0.0


@mcp.tool()
async def get_spices_board_prices(state: str, spice: str = "") -> Dict:
    """
    Fetches and parses spices market data from the Indian Spices Board website.

    Args:
        state: The state to filter by (e.g., "ANDHRA PRADESH").
        spice: The spice to filter by (optional).

    Returns:
        A dictionary containing the status and a list of parsed data.
    """
    base_url = "https://www.indianspices.com/marketing/price/domestic/current-market-price.html"
    params = {"filterState": state, "filterSpice": spice, "dateFrom": "", "dateTo": ""}
    max_retries = 3
    timeout = aiohttp.ClientTimeout(total=10)  # 10-second timeout

    for attempt in range(max_retries):
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(base_url, params=params) as response:
                    response.raise_for_status()
                    html_content = await response.text()
                    soup = BeautifulSoup(html_content, "html.parser")
                    table = soup.find("table")

                    if not table:
                        logger.warning("No data table found on the page.")
                        return {"status": 404, "data": [], "error": "Data table not found"}

                    headers = [
                        "date",
                        "spice",
                        "market",
                        "state",
                        "grade",
                        "source",
                        "min_price",
                        "max_price",
                        "avg_price",
                    ]
                    parsed_data = []

                    for row in table.find_all("tr")[1:]:  # Skip header row
                        cells = [cell.text.strip() for cell in row.find_all("td")]

                        if len(cells) != 9:
                            logger.warning(f"Skipping malformed row: {cells}")
                            continue

                        row_data = dict(zip(headers, cells))

                        # Clean and convert numeric fields
                        row_data["min_price"] = safe_float(row_data["min_price"])
                        row_data["max_price"] = safe_float(row_data["max_price"])
                        row_data["avg_price"] = safe_float(row_data["avg_price"])

                        parsed_data.append(row_data)

                    return {"status": 200, "data": parsed_data}

        except aiohttp.ClientError as e:
            logger.error(f"Attempt {attempt + 1} failed: {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(2**attempt)  # Exponential backoff
            else:
                return {"status": 500, "data": [], "error": str(e)}
        except Exception as e:
            logger.exception(f"An unexpected error occurred: {e}")
            return {"status": 500, "data": [], "error": "An unexpected error occurred"}

    return {"status": 500, "data": [], "error": "All retries failed"}


if __name__ == "__main__":
    # To run this file directly for testing
    async def main():
        # Example usage:
        data = await get_spices_board_prices(state="BIHAR")
        import json
        print(json.dumps(data, indent=2))

    asyncio.run(main())