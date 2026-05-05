import asyncio
import aiohttp
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def fetch_maharashtra_mandi_prices(
    state: str,
    commodity: str,
    district: str=None,
    date: str=None
) -> list:
    """
    Fetch mandi prices for Maharashtra state from MSAMB or official state portals.
    """
    if date is None:
        date_str=datetime.now().strftime("%d-%m-%Y")
    else:
        try:
            dt=datetime.strptime(date,"%Y-%m-%d")
            date_str=dt.strftime("%d-%m-%Y")
        except ValueError:
                date_str=date

    if state.lower() not in "maharashtra":
        return {"success": False, "error": "This fetcher is specific to Maharashtra state."}

    source_url = "https://www.msamb.com/ApmcDetail/APMCPriceInformation"
    api_url = "https://www.msamb.com/ApmcDetail/DataGridBind"

    headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...',
    'Cookie': 'ASP.NET_SessionId=cj4npmtgnyxnppamsu5wjrn0; kcsremuser=Language=E&username=Administrator',
    'Accept-Language': 'en-US,en;q=0.9',
    'X-Requested-With': 'XMLHttpRequest'
                
    }

    unique_results_map = {}

    try:
        async with aiohttp.ClientSession(headers=headers) as session:
            #Fetch main page to get cookies and the commodity code(s)
            async with session.get(source_url, headers=headers, timeout=15.0) as resp_main:
                if resp_main.status != 200:
                    return [{"error": "Failed to load MSAMB main portal"}]
                main_html = await resp_main.text()
            
            from bs4 import BeautifulSoup
            soup_main = BeautifulSoup(main_html, 'html.parser')
            
            # Find commodity codes from dropdown options
            codes_to_fetch = []
            for option in soup_main.find_all('option'):
                val = option.get('value')
                text = option.text.strip() if option.text else ""
                
                # Skip invalid/placeholder options
                if not val or val in ["0", "null", ""] or "select" in text.lower():
                    continue
                    
                if commodity: # If a specific commodity was requested
                    if commodity.lower() in text.lower():
                        codes_to_fetch.append({"code": val, "name": text})
                        break
                else: # If empty, fetch all commodities
                    codes_to_fetch.append({"code": val, "name": text})
                    
            if not codes_to_fetch:
                 return [{"error": "No valid commodity codes found to fetch."}]

            results: List[Dict[str, Any]] = []

            # Function to fetch and parse a single commodity
            async def fetch_and_parse(comm_obj):
                params = {
                    "commodityCode": comm_obj["code"],
                    "apmcCode": "null" 
                }
                
                api_headers = headers.copy()
                api_headers["Referer"] = source_url
                
                try:
                    async with session.get(api_url, params=params, headers=api_headers, timeout=20.0) as response:
                        if response.status != 200:
                            return
                        raw_text = await response.text()
                        
                        # Parse HTML fragment
                        soup = BeautifulSoup(raw_text, 'html.parser')
                        current_table_date = None

                        for row in soup.find_all('tr'):
                            tds = row.find_all('td')
                            if not tds:
                                continue

                            cols = [td.text.strip() for td in tds]
                            
                            if len(cols) == 1 or "/" in cols[0]:
                                current_table_date = cols[0]
                                continue

                            if len(cols) >= 6:
                                if not current_table_date:
                                    continue    

                            crop_name = comm_obj["name"]
                            mkt = cols[0]

                            unique_key = f"{crop_name}_{current_table_date}"
                            
                            # Deduplication Logic
                            if unique_key not in unique_results_map:
                                unique_results_map[unique_key] = {
                                    "commodity": crop_name,
                                    "market": mkt,
                                    "variety": cols[1],
                                    "min_price": cols[-3],
                                    "max_price": cols[-2],
                                    "modal_price": cols[-1],
                                    "date": current_table_date
                                }
                except Exception as e:
                    logger.error(f"Error fetching {comm_obj['name']}: {e}")

            # Fetching data for all requested commodities concurrently in chunks to avoid overwhelming server
            chunk_size = 10
            for i in range(0, len(codes_to_fetch), chunk_size):
                chunk = codes_to_fetch[i:i+chunk_size]
                await asyncio.gather(*(fetch_and_parse(c) for c in chunk))

            return list(unique_results_map.values())

    except aiohttp.ClientError as e:
        return [{"error": f"Network error occurred: {str(e)}"}]
    except Exception as e:
        return {
            "success": False,
            "error": f"An unexpected error occurred: {str(e)}",
            "source_url": source_url
        }
    return list(unique_results_map.values())

