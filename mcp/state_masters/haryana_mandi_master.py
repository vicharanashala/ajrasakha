import asyncio
import httpx
import json

async def fetch_agmarknet(commodity: str, date: str) -> dict:
    """Interface for Haryana (State ID 12) via Agmarknet JSON Endpoint."""
    url = "https://api.agmarknet.gov.in/v1/dashboard-data/"
    headers = {'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
    
    payload = {
        "dashboard": "marketwise_price_arrival", "date": date, "group": [100000],
        "commodity": [100001], "district": [100007], "format": "json",
        "grades": [4], "limit": 50, "state": 12, "variety": 100021
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers, timeout=15.0)
            records = response.json().get("data", {}).get("records", [])
            matched = [{"source": "Agmarknet", "commodity": r["cmdt_name"], "modal_price": r["as_on_price"], "date": date} 
                       for r in records if commodity.lower() in r["cmdt_name"].lower()]
            return {"status": "success", "data": matched} if matched else {"status": "empty"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

async def fetch_enam(commodity: str, date: str) -> dict:
    """Sleeper Redundancy Layer for Haryana using Form Data encoding."""
    url = "https://enam.gov.in/web/Ajax_ctrl/trade_data_list"
    data_payload = {"language": "en", "stateName": "HARYANA", "apmcName": "-- Select APMCs --", "fromDate": date, "toDate": date}
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, data=data_payload, timeout=15.0)
            records = response.json().get("data", [])
            matched = [{"source": "eNAM", "commodity": r["commodity"], "modal_price": r["modal_price"], "date": date} 
                       for r in records if commodity.lower() in r["commodity"].lower()]
            return {"status": "success", "data": matched} if matched else {"status": "empty"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

async def get_haryana_prices_master(state: str, commodity: str, district: str, date: str) -> dict:
    """Service Layer implementing sequential data validation for Haryana."""
    if "haryana" not in state.lower(): return {"status": "error", "message": "Scope Mismatch."}
    
    res = await fetch_agmarknet(commodity, date)
    if res["status"] == "success": return {"status": "success", "data": res["data"]}
    
    res = await fetch_enam(commodity, date)
    return {"status": "success", "data": res["data"]} if res["status"] == "success" else res