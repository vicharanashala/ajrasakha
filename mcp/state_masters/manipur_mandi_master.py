import asyncio
import httpx
import json

async def fetch_agmarknet(commodity: str, date: str) -> dict:
    """Primary Agmarknet interface for Manipur (State ID 21)."""
    # Logic remains consistent with Module 1/2 using State ID 21
    pass 

async def fetch_datagov(commodity: str, date: str) -> dict:
    """
    Open Government Data (OGD) REST API interface.
    Utilizes GET parameters and API-Key authentication for data retrieval.
    """
    url = "https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24"
    params = {
        "format": "json",
        "api-key": "579b464db66ec23bdd000001cdc3b564546246a772a26393094f5645",
        "filters[State]": "Manipur", "limit": 100
    }

    try:
        async with httpx.AsyncClient() as client:
            # Increased timeout to 30s because Data.gov API is occasionally slow
            response = await client.get(url, params=params, timeout=30.0)
            records = response.json().get("records", [])
            matched = [{"source": "Data.gov.in", "commodity": r["Commodity"], "modal_price": r["Modal_Price"], "date": r["Arrival_Date"]} 
                       for r in records if commodity.lower() in r["Commodity"].lower()]
            return {"status": "success", "data": matched} if matched else {"status": "empty"}
    except Exception as e:
        return {"status": "error", "message": f"OGD API Failure: {str(e)}"}