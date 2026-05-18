from fastmcp import FastMCP
import aiohttp
from playwright.async_api import async_playwright
from get_data import parse_mandi_html

# Initialize the FastMCP server
mcp = FastMCP("AnnamServer")
@mcp.tool()
async def get_crop_variety(crop: str, year: str, season: str) -> list:
    """
    Fetch crop variety data from OSSC Payment Portal API.

    🔹 Purpose:
    This function retrieves available crop varieties based on crop code, year, and season.

    🔹 API Endpoint:
    GET https://osscpayment.nic.in/transferPortal/api/loadVariety

    🔹 Required Parameters:
    - crop (str): Crop code (NOT crop name)
    - year (str): Financial year in format "YYYY-YY" (e.g., "2024-25")
    - season (str): Season name (e.g., "KHARIF", "RABI")

    🔹 Supported Crop Codes:
    - "C011" → Black gram (Biri)
    - "C005" → Finger millet (Ragi)
    - "C015" → Green Gram (Mung)
    - "C026" → Groundnut (Peanut / Mung phalli)
    - "C027" → Indian Rape Seeds and Mustard
    - "C007" → Little millet (Samai/Kutki)
    - "C029" → Niger (Ramtil)
    - "C002" → Paddy (Dhan)
    - "C022" → Pigeon pea (Red gram/Arhar)
    - "C039" → Sesame (Gingelly/Til)
    - "C092" → Sorghum (Jowar)
    - "C036" → Toria

    ⚠️ Important:
    - You can provide either crop codes (e.g., "C011") or common crop names (e.g., "Black gram", "Biri")
    - Season values are typically uppercase: "KHARIF" or "RABI"
    - Year must match API format exactly

    🔹 Example Usage:
    await get_crop_variety(
        crop="Black gram",
        year="2024-25",
        season="KHARIF"
    )

    🔹 Expected Output:
    - Returns JSON response from API containing crop varieties
    - If error occurs, returns:
      [{"error": "<error_message>"}]
    """
    print("--- Received Request ---")
    print(f"Crop Input: {crop}")
    
    crop_mapping = {
        "black gram": "C011", "biri": "C011",
        "finger millet": "C005", "ragi": "C005",
        "green gram": "C015", "mung": "C015",
        "groundnut": "C026", "peanut": "C026", "mung phalli": "C026",
        "indian rape seeds and mustard": "C027", "mustard": "C027", "rape seeds": "C027",
        "little millet": "C007", "samai": "C007", "kutki": "C007",
        "niger": "C029", "ramtil": "C029",
        "paddy": "C002", "dhan": "C002",
        "pigeon pea": "C022", "red gram": "C022", "arhar": "C022",
        "sesame": "C039", "gingelly": "C039", "til": "C039",
        "sorghum": "C092", "jowar": "C092",
        "toria": "C036"
    }
    
    crop_normalized = crop.lower().strip()
    
    # Check if the input is already a known code (e.g., 'C011' or 'c011')
    if crop_normalized.upper() in crop_mapping.values():
        crop_code = crop_normalized.upper()
    else:
        # Match name to code
        crop_code = None
        for key, value in crop_mapping.items():
            if key in crop_normalized or crop_normalized in key:
                crop_code = value
                break
                
        if not crop_code:
            return [{"error": f"Unknown crop name: '{crop}'. Please provide a valid crop name or code."}]

    print(f"Mapped Crop Code: {crop_code}")
    print(f"Year: {year}")
    print(f"Season: {season}")
    
    url = "https://osscpayment.nic.in/transferPortal/api/loadVariety"
    params = {
        "crop": crop_code,
        "year": year,
        "season": season
    }
    
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(url, params=params) as response:
                response.raise_for_status()
                text_response = await response.text()
                
                if not text_response.strip():
                    return [{"error": "Empty response received. Please check if the query parameters (crop, year, season) are correct."}]
                
                try:
                    data = await response.json()
                except Exception:
                    # In case the response is not valid JSON
                    return [{"error": "Invalid response format. Please check if the query parameters are correct."}]
                    
                if not data:
                    return [{"error": "No varieties found. Please check if the query parameters (crop, year, season) are correct."}]
                    
                return data
        except Exception as e:
            return [{"error": str(e)}]


# Official apis exists

@mcp.tool()
async def get_daily_market_prices(
    state: str = None, 
    district: str = None, 
    commodity: str = None, 
    arrival_date: str = None, 
    limit: int = 10
) -> dict:
    """
    Fetch Variety-wise Daily Market Prices Data of Commodity from data.gov.in.
    
    Parameters:
    - state: State name (e.g. "West Bengal")
    - district: District name (e.g. "Coochbehar")
    - commodity: Commodity name (e.g. "Pointed gourd (Parval)")
    - arrival_date: Arrival Date in "dd/MM/yyyy" format (e.g. "18/06/2010")
    - limit: Number of records to return (default 10)
    """
    url = "https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24"
    import urllib.parse
    import yarl
    
    query = f"api-key=579b464db66ec23bdd0000019caa65074d924b6d6b8473dc337b0bca&format=json&limit={limit}"
    
    if state:
        query += f"&filters[State]={urllib.parse.quote(state)}"
    if district:
        query += f"&filters[District]={urllib.parse.quote(district)}"
    if commodity:
        query += f"&filters[Commodity]={urllib.parse.quote(commodity)}"
    if arrival_date:
        query += f"&filters[Arrival_Date]={urllib.parse.quote(arrival_date)}"
        
    full_url = f"{url}?{query}"
    
    headers = {
        "accept": "application/json",
        "User-Agent": "curl/7.68.0"
    }
    
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(yarl.URL(full_url, encoded=True), headers=headers) as response:
                response.raise_for_status()
                text_response = await response.text()
                
                if not text_response.strip():
                    return {"error": "Empty response received from data.gov.in API."}
                
                try:
                    data = await response.json()
                except Exception:
                    return {"error": "Invalid JSON response format from data.gov.in API."}
                    
                if not data or "records" not in data:
                    return {"error": "No records found or unexpected response format.", "raw": data}
                    
                return data
        except Exception as e:
            return {"error": str(e)}

@mcp.tool()
async def get_mandi_data_playwright() -> str:
    """
    Extract mandi data using browser automation.
    """
    playwright = None
    browser = None

    try:
        # ✅ Use start()/stop() instead of async context manager
        # This avoids premature cleanup in long-running server environments
        playwright = await async_playwright().start()

        browser = await playwright.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",               # ✅ Helps in containerized envs
                "--single-process",            # ✅ Reduces crash risk in MCP servers
            ]
        )

        context = await browser.new_context(
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
        )
        page = await context.new_page()

        await page.goto(
            "https://delagrimarket.nic.in/dambcrateb.asp?comName=4&submit=Select",
            timeout=60000,
            wait_until="domcontentloaded"
        )
        import os
        html_content = await page.content()
        # ✅ Save to same folder as this script
        # script_dir = os.path.dirname(os.path.abspath(__file__))
        # output_path = os.path.join(script_dir, "mandi_data.html")

        # with open(output_path, "w", encoding="utf-8") as f:
        #     f.write(html_content)

        return parse_mandi_html(html_content)
        

    except Exception as e:
        return f"Error occurred: {str(e)}"

    finally:
        # ✅ Explicit ordered cleanup — page/context are garbage collected,
        #    but browser and playwright must be closed manually
        if browser:
            await browser.close()
        if playwright:
            await playwright.stop()   # ✅ Critical: stop() instead of relying on __aexit__

if __name__ == "__main__":
    # Run the server using stdio transport
    mcp.run(transport='stdio')
