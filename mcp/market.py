from typing import List
import aiohttp
from fastmcp import FastMCP
import asyncio
import pandas as pd
import re
from bs4 import BeautifulSoup
import requests
import html
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



#Function to extract commodity table from html

def extract_commodity_table(html: str):
    soup = BeautifulSoup(html, "html.parser")

    data = []
    current_category = None
    current_commodity = None

    def clean_text(text: str):
        # Keep only English and basic punctuation before Kannada part
        if "/" in text:
            text = text.split("/")[0]
        text = re.sub(r"[^A-Za-z0-9\s\-\(\)\*]", "", text)
        return text.strip()

    for tr in soup.select("table#_ctl0_MainContent_Table2 tr"):
        tds = tr.find_all("td")
        if not tds:
            continue

        # Detect category rows (bold text, no prices)
        if len(tds) == 3 and tds[0].find("strong") and not tds[1].text.strip():
            current_category = clean_text(tds[0].get_text(strip=True))
            continue

        # Commodity row (bold, no prices)
        if len(tds) == 3 and tds[0].find("a") and not tds[1].text.strip():
            current_commodity = clean_text(tds[0].get_text(strip=True))
            continue

        # Variety rows (have <a> + prices)
        if len(tds) == 3 and tds[0].find("a") and (tds[1].text.strip() or tds[2].text.strip()):
            variety = clean_text(tds[0].get_text(strip=True))
            min_price = tds[1].get_text(strip=True)
            max_price = tds[2].get_text(strip=True)

            data.append({
                "Category": current_category,
                "Commodity": current_commodity,
                "Variety": variety,
                "Min_Price": min_price,
                "Max_Price": max_price
            })

    return data



@mcp.tool()
async def get_commodities_available_for_KA() -> dict:
    """
    Fetch all commodities and their varieties for Karnataka
    from the Krama Karnataka website for the latest reported date.

    Cleans Kannada text and extra symbols or slashes.
    Returns: {status, source, entries, data}
    """

    try:
        url = "https://krama.karnataka.gov.in/Home"
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                html = await response.text()

        # Run parsing in thread to avoid blocking event loop
        extracted_data = await asyncio.to_thread(extract_commodity_table, html)

        return {
            "status": 200,
            "source": url,
            "entries": len(extracted_data),
            "data": extracted_data
        }

    except Exception as e:
        return {"status": 500, "error": str(e)}

BASE_URL = "https://krama.karnataka.gov.in/"


@mcp.tool()
async def get_commodity_details(commodity_name: str) -> dict:
    """
    Get market price details for a specific commodity from Krama Karnataka portal.
    
    Args:
        commodity_name: Name of the commodity (e.g., 'Wheat', 'Rice', 'Onion', 'Tomato')
    
    Returns:
        Dictionary containing commodity market data with prices, arrivals, and market details.
        
    Available commodities include:
    Wheat, Paddy, Rice, Maize, Jowar, Bajra, Ragi, Navane, Same, Sajje, Cashewnut, Dry Grapes, Cotton, Lint, All Flowers, Rose, Chrysanthamum, Marygold, Tamarind Seed, Tamarind Fruit, Apple, Orange, Banana, Mango, Pine Apple, Grapes, Chikoos (Sapota), Papaya, Water Melon, Mousambi, Guava, Karbuja, Pomagranate, Seethaphal, Cow (For Each), Ox (For Each), Bull (For Each), Calf (For Each), He Baffalo (For Each), She Baffalo (For Each), Sheep (For Each), Goat (For Each), Groundnut, Sesamum, Mustard, Soyabeen, Sunflower, Safflower, Linseed, Cotton Seed, Gingelly, Castor Seed, Copra, Groundnut Seed, Gurellu, Coconut (Per 1000), Jaggery, Tender Coconut, Coco Brooms, Arecanut, Betal Leaves, Bengalgram, Blackgram, Greengram, Arhar, Green Peas, Avare, Cowpea, Mataki, Moath, Horse Gram, Tur Dal, Bengal Gramdal, Black Gramdal, Green Gramdal, Tur, Alasande Gram, Chennangidal, Garlic, Ginger, Pepper, Turmeric, Methi Seeds, Coriander Seed, Dry Chillies, Onion, Potato, Cauliflower, Brinjal, Corander, Tomato, Bitter Gourd, Bottle Gourd, Ash Gourd, Green Chilly, Chilly Capsicum, Banana Green, Beans, Green Ginger, Sweet Potato, Carrot, Cabbage, Ladies Finger, Snakeguard, Beetroot, White Pumpkin, Cucumbar, Ridgeguard, Raddish, Thondekai, Capsicum, Green Avare (W), Alasandikai, Drum Stick, Chapparada Avare, Thogarikai, Leafy Vegetables, Sweet Pumpkin, Peas Wet, Seemebadanekai, Knool Khol, Suvarnagadde, Lime (Lemon), Bunch Beans.
    """
    try:
        # Step 1: Get commodity link
        link_result = await asyncio.to_thread(_get_commodity_link, commodity_name)
        
        if link_result["status"] != 200:
            return link_result
        
        # Step 2: Extract market data
        market_data = await asyncio.to_thread(
            _extract_market_table, 
            link_result["link"]
        )
        
        if market_data["status"] != 200:
            return market_data
        
        # Return combined result
        return {
            "status": 200,
            "commodity": link_result["commodity"],
            "source_url": link_result["link"],
            "total_entries": market_data["entries"],
            "market_data": market_data["data"]
        }
        
    except Exception as e:
        return {
            "status": 500,
            "error": f"Unexpected error: {str(e)}"
        }


def _get_commodity_link(commodity_name: str) -> dict:
    """Internal function to fetch commodity link."""
    try:
        html_text = requests.get(BASE_URL, timeout=10).text
        soup = BeautifulSoup(html_text, "html.parser")

        for a_tag in soup.find_all("a", onclick=True):
            raw_html = str(a_tag)
            match = re.search(r"window\.open\('([^']+Rep=Com[^']+)'\)", raw_html)
            if not match:
                continue

            partial_link = html.unescape(match.group(1))
            full_link = BASE_URL + partial_link.lstrip("/")
            visible_text = a_tag.get_text(strip=True)
            english_name = visible_text.split("/")[0].strip()

            if english_name.lower() == commodity_name.lower():
                return {
                    "status": 200,
                    "commodity": english_name,
                    "link": full_link
                }

        return {
            "status": 404,
            "error": f"Commodity '{commodity_name}' not found"
        }
    except Exception as e:
        return {
            "status": 500,
            "error": f"Error fetching commodity link: {str(e)}"
        }


def _extract_market_table(url: str) -> dict:
    """Internal function to extract market data."""
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")
        table = soup.find("table", id="_ctl0_MainContent_Table1")
        
        if not table:
            return {
                "status": 404,
                "error": "No market data table found"
            }

        data = []
        rows = table.find_all("tr")[1:]  # skip header

        for tr in rows:
            tds = [td.get_text(strip=True) for td in tr.find_all("td")]
            if len(tds) == 7:
                data.append({
                    "Market": tds[0],
                    "Market_Date": tds[1],
                    "Variety": tds[2],
                    "Arrivals": tds[3],
                    "Min_Price": tds[4],
                    "Max_Price": tds[5],
                    "Modal_Price": tds[6],
                })

        return {
            "status": 200,
            "entries": len(data),
            "data": data
        }
        
    except Exception as e:
        return {
            "status": 500,
            "error": f"Error extracting data: {str(e)}"
        }


if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=9003)
