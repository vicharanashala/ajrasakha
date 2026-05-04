import asyncio
import httpx
import json
import re

# ---------------------------------------------------------
# WEAPON 1: AGMARKNET (Primary Engine)
# ---------------------------------------------------------
async def fetch_agmarknet(commodity: str, date: str) -> dict:
    url = "https://api.agmarknet.gov.in/v1/dashboard-data/"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/147.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
        'Origin': 'https://agmarknet.gov.in',
        'Referer': 'https://agmarknet.gov.in/'
    }
    
    # Confirmed State ID for Odisha: 26
    payload = {
        "dashboard": "marketwise_price_arrival", "date": date, "group": [100000],
        "commodity": [100001], "district": [100007], "format": "json",
        "grades": [4], "limit": 50, "state": 26, "variety": 100021
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers, timeout=15.0)
            response.raise_for_status()
            records = response.json().get("data", {}).get("records", [])
            
            matched = []
            for r in records:
                if commodity.lower() in str(r.get("cmdt_name", "")).lower():
                    matched.append({
                        "source": "Agmarknet",
                        "commodity": r.get("cmdt_name"),
                        "modal_price": r.get("as_on_price", "N/A"),
                        "arrival_tonnes": r.get("as_on_arrival", "0"),
                        "date": r.get("reported_date", date)
                    })
            return {"status": "success", "data": matched} if matched else {"status": "empty"}
    except Exception as e:
        return {"status": "error", "message": f"Agmarknet Error: {str(e)}"}

# ---------------------------------------------------------
# WEAPON 2: OSAMB (Secondary Engine / Failsafe)
# ---------------------------------------------------------
async def fetch_osamb(commodity: str, date: str) -> dict:
    # Phase 1: Hit the public page to grab session cookies and CSRF token
    public_url = "https://osamb.odisha.gov.in/Grievance/home/public_price_trend_view"
    api_url = "https://osamb.odisha.gov.in/Grievance/api_controller/get_public_price_trend/rmc_price_trend"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/147.0.0.0 Safari/537.36',
    }

    try:
        # verify=False because the OSAMB site has SSL issues sometimes
        async with httpx.AsyncClient(verify=False) as client:
            # Step 1: Initialize session and extract token
            resp1 = await client.get(public_url, headers=headers, timeout=15.0)
            resp1.raise_for_status()
            
            # Use regex to find the hidden csrf input value
            match = re.search(r'name="csrf_price_token"\s+value="([^"]+)"', resp1.text)
            token = match.group(1) if match else ""
            
            if not token:
                return {"status": "error", "message": "OSAMB Error: Failed to extract Anti-CSRF token."}
            
            # Step 2: Inject token into payload and pass the session cookies
            api_headers = headers.copy()
            api_headers.update({
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Origin': 'https://osamb.odisha.gov.in',
                'Referer': public_url,
                'X-Requested-With': 'XMLHttpRequest'
            })
            
            data_payload = {
                "draw": "1",
                "start": "0",
                "length": "100", 
                "search[value]": commodity, 
                "search[regex]": "false",
                "csrf_price_token": token  # Critical injection!
            }
            
            response = await client.post(api_url, data=data_payload, headers=api_headers, cookies=resp1.cookies, timeout=15.0)
            response.raise_for_status()
            
            records = response.json().get("aaData", [])
            matched = []
            
            for r in records:
                if commodity.lower() in str(r.get("description", "")).lower():
                    matched.append({
                        "source": "OSAMB",
                        "commodity": r.get("description"),
                        "modal_price": str(r.get("modal_price", "N/A")),
                        "arrival_tonnes": "N/A", 
                        "date": r.get("price_date", date)
                    })
            return {"status": "success", "data": matched} if matched else {"status": "empty"}
    except Exception as e:
        return {"status": "error", "message": f"OSAMB Error: {str(e)}"}

# ---------------------------------------------------------
# THE ORCHESTRATOR
# ---------------------------------------------------------
async def get_odisha_prices_master(state: str, commodity: str, district: str, date: str) -> dict:
    """
    Main entry point for Odisha. Strikes Agmarknet first, fails over to OSAMB.
    """
    if "odisha" not in state.lower():
        return {"status": "error", "message": "This module exclusively processes Odisha data."}

    print(f"\n[INFO] Fetching primary market data from Agmarknet for '{commodity}' in Odisha...")
    agmarknet_result = await fetch_agmarknet(commodity, date)
    
    if agmarknet_result["status"] == "success":
        print("[INFO] Successfully retrieved primary data from Agmarknet.")
        return {"status": "success", "state": "Odisha", "district_requested": district, "data": agmarknet_result["data"]}
        
    print(f"[WARN] Agmarknet data unavailable. Initiating failover to secondary source (OSAMB) for '{commodity}'...")
    osamb_result = await fetch_osamb(commodity, date)
    
    if osamb_result["status"] == "success":
        print("[INFO] Successfully retrieved fallback data from OSAMB.")
        return {"status": "success", "state": "Odisha", "district_requested": district, "data": osamb_result["data"]}
        
    return {
        "status": "error", 
        "message": f"Data unavailable. Agmarknet: {agmarknet_result.get('message', 'Empty')} | OSAMB: {osamb_result.get('message', 'Empty')}"
    }

# ==========================================
# LOCAL TESTING
# ==========================================
if __name__ == "__main__":
    print("=== TEST 1: ODISHA TOMATO EXTRACTION ===")
    result_1 = asyncio.run(get_odisha_prices_master(
        state="Odisha",
        commodity="Tomato", 
        district="All", 
        date="2026-04-26" 
    ))
    print(json.dumps(result_1, indent=2))