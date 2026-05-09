"""
Unified Mandi Price Fetching Logic
===================================
Consolidates 4 standalone scripts (AP, Assam, TN, Sikkim) into two
async functions that the MCP tool layer can call.

- get_agmarknet_data()  → Andhra Pradesh (2), Assam (4), Tamil Nadu (31)
- get_indian_spices_data() → Sikkim (Indian Spices Board, HTML scraping)
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date as date_type
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

AGMARKNET_API_URL = "https://api.agmarknet.gov.in/v1/dashboard-data/"
INDIAN_SPICES_URL = (
    "https://www.indianspices.com/marketing/price/domestic/current-market-price.html"
)

AGMARKNET_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "Origin": "https://agmarknet.gov.in",
    "Referer": "https://agmarknet.gov.in/",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/147.0.0.0 Safari/537.36"
    ),
}

SPICES_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;"
        "q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
}

# State name → Agmarknet state_id mapping (for the 3 supported states)
AGMARKNET_STATE_IDS: dict[str, int] = {
    "andhra pradesh": 2,
    "assam": 4,
    "tamil nadu": 31,
}

MAX_RETRIES = 3
TIMEOUT_SECONDS = 30.0
INITIAL_BACKOFF = 0.5


# ---------------------------------------------------------------------------
# Agmarknet POST API  (AP, Assam, TN)
# ---------------------------------------------------------------------------

async def get_agmarknet_data(
    state_id: int,
    commodity: int = 100001,
    district: int = 100007,
    date: Optional[str] = None,
    *,
    group: int = 100000,
    variety: int = 100021,
    grades: int = 4,
    limit: int = 10,
) -> dict[str, Any]:
    """
    Fetch mandi price data from the Agmarknet hidden POST API.

    Parameters
    ----------
    state_id : int
        Agmarknet numeric state code (e.g. 2=AP, 4=Assam, 31=TN).
    commodity : int
        Commodity code (100001 = All Commodities by default).
    district : int
        District code (100007 = All Districts by default).
    date : str | None
        Date in YYYY-MM-DD format. Defaults to today.
    group, variety, grades, limit : int
        Additional API parameters with sensible defaults.

    Returns
    -------
    dict with keys: success (bool), records (list[dict]), meta (dict)
    """
    if date is None:
        date = date_type.today().isoformat()

    payload = {
        "dashboard": "marketwise_price_arrival",
        "date": date,
        "group": [group],
        "commodity": [commodity],
        "district": [district],
        "format": "json",
        "grades": [grades],
        "limit": limit,
        "state": state_id,
        "variety": variety,
    }

    last_error: str | None = None

    for attempt in range(MAX_RETRIES):
        try:
            async with httpx.AsyncClient(
                timeout=TIMEOUT_SECONDS, headers=AGMARKNET_HEADERS
            ) as client:
                response = await client.post(
                    AGMARKNET_API_URL, json=payload
                )
                response.raise_for_status()
                res_json = response.json()

                status = res_json.get("status")
                if status is True or status == "success":
                    records = res_json.get("data", {}).get("records", [])

                    # Normalise each record into a clean, consistent shape
                    cleaned: list[dict[str, Any]] = []
                    for r in records:
                        cleaned.append({
                            "reported_date": r.get("reported_date", ""),
                            "market_name": r.get("mkt_name", ""),
                            "commodity": r.get("cmdt_name", ""),
                            "variety": r.get("variety", ""),
                            "grade": r.get("grade", ""),
                            "min_price": r.get("min_price", r.get("as_on_price", "")),
                            "max_price": r.get("max_price", ""),
                            "modal_price": r.get("modal_price", ""),
                            "arrival": r.get("as_on_arrival", ""),
                        })

                    return {
                        "success": True,
                        "state_id": state_id,
                        "date": date,
                        "total_records": len(cleaned),
                        "records": cleaned,
                    }
                else:
                    return {
                        "success": False,
                        "error": res_json.get(
                            "message", "No data available for the given filters."
                        ),
                        "state_id": state_id,
                        "date": date,
                    }

        except (httpx.HTTPStatusError, httpx.RequestError, Exception) as exc:
            last_error = str(exc)
            logger.warning(
                "Agmarknet attempt %d/%d failed: %s",
                attempt + 1,
                MAX_RETRIES,
                last_error,
            )
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(INITIAL_BACKOFF * (2 ** attempt))

    return {
        "success": False,
        "error": f"All {MAX_RETRIES} attempts failed. Last error: {last_error}",
        "state_id": state_id,
        "date": date,
    }


# ---------------------------------------------------------------------------
# Indian Spices Board GET + HTML scraping  (Sikkim)
# ---------------------------------------------------------------------------

async def get_indian_spices_data(
    state_name: str = "SIKKIM",
    spice_name: str = "",
    date_from: str = "",
    date_to: str = "",
) -> dict[str, Any]:
    """
    Fetch domestic spice market prices from the Indian Spices Board website.

    Uses GET request with query params, then parses the resulting HTML table.

    Parameters
    ----------
    state_name : str
        State name in UPPERCASE (e.g. "SIKKIM").
    spice_name : str
        Filter by spice name (empty = all spices).
    date_from, date_to : str
        Date range in DD-MM-YYYY format (empty = current/default).

    Returns
    -------
    dict with keys: success (bool), records (list[dict]), meta (dict)
    """
    params = {
        "filterState": state_name,
        "filterSpice": spice_name,
        "dateFrom": date_from,
        "dateTo": date_to,
    }

    try:
        async with httpx.AsyncClient(
            timeout=TIMEOUT_SECONDS, headers=SPICES_HEADERS
        ) as client:
            response = await client.get(INDIAN_SPICES_URL, params=params)
            response.raise_for_status()

            html_text = response.text

            # Parse HTML tables using BeautifulSoup
            try:
                from bs4 import BeautifulSoup
            except ImportError:
                return {
                    "success": False,
                    "error": (
                        "beautifulsoup4 is not installed. "
                        "Run: pip install beautifulsoup4"
                    ),
                }

            soup = BeautifulSoup(html_text, "html.parser")
            tables = soup.find_all("table")

            if not tables:
                return {
                    "success": False,
                    "error": (
                        "No data tables found on the page. "
                        "The state might not have data for the selected dates."
                    ),
                    "state": state_name,
                }

            # Parse the first (main) data table
            table = tables[0]
            headers_row = table.find("thead")
            if headers_row:
                col_names = [
                    th.get_text(strip=True) for th in headers_row.find_all("th")
                ]
            else:
                # Fallback: use first row as headers
                first_row = table.find("tr")
                col_names = [
                    td.get_text(strip=True) for td in first_row.find_all(["th", "td"])
                ]

            tbody = table.find("tbody")
            rows = tbody.find_all("tr") if tbody else table.find_all("tr")[1:]

            records: list[dict[str, str]] = []
            for row in rows:
                cells = [td.get_text(strip=True) for td in row.find_all("td")]
                if cells and len(cells) == len(col_names):
                    records.append(dict(zip(col_names, cells)))
                elif cells:
                    # Mismatched columns — store raw cells with index keys
                    records.append(
                        {f"col_{i}": c for i, c in enumerate(cells)}
                    )

            return {
                "success": True,
                "state": state_name,
                "spice_filter": spice_name or "all",
                "total_records": len(records),
                "columns": col_names,
                "records": records,
            }

    except Exception as exc:
        logger.error("Indian Spices Board fetch failed: %s", exc)
        return {
            "success": False,
            "error": str(exc),
            "state": state_name,
        }
