import asyncio
import httpx
import json

# -----------------------------------------------------------------------------
# PRIMARY INTERFACE: AGMARKNET (Directorate of Marketing & Inspection, GOI)
# -----------------------------------------------------------------------------
async def fetch_agmarknet(commodity: str, date: str) -> dict:
    """
    Retrieves market data from the Agmarknet API using a JSON-based POST request.
    State ID '14' corresponds specifically to Jammu & Kashmir.
    """
    url = "https://api.agmarknet.gov.in/v1/dashboard-data/"
    
    # Metadata headers required to bypass standard anti-bot filtering.
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/147.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
        'Origin': 'https://agmarknet.gov.in',
        'Referer': 'https://agmarknet.gov.in/'
    }
    
    # Encapsulated payload mapping state, commodity, and variety IDs.
    payload = {
        "dashboard": "marketwise_price_arrival", "date": date, "group": [100000],
        "commodity": [100001], "district": [100007], "format": "json",
        "grades": [4], "limit": 50, "state": 14, "variety": 100021
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers, timeout=15.0)
            response.raise_for_status()
            records = response.json().get("data", {}).get("records", [])
            
            # Post-processing: Filter records locally by commodity name string matching.
            matched = []
            for r in records:
                if commodity.lower() in str(r.get("cmdt_name", "")).lower():
                    matched.append({
                        "source": "Agmarknet",
                        "commodity": r.get("cmdt_name"),
                        "commodity_group": r.get("cmdt_grp_name"),
                        "modal_price": r.get("as_on_price", "N/A"),
                        "arrival_tonnes": r.get("as_on_arrival", "0"),
                        "date": r.get("reported_date", date)
                    })
            return {"status": "success", "data": matched} if matched else {"status": "empty"}
    except Exception as e:
        return {"status": "error", "message": f"Agmarknet Protocol Failure: {str(e)}"}

# -----------------------------------------------------------------------------
# REDUNDANCY LAYER: eNAM (Electronic National Agriculture Market)
# -----------------------------------------------------------------------------
async def fetch_enam(commodity: str, date: str) -> dict:
    """
    Secondary extraction engine utilizing the eNAM AJAX controller.
    Uses x-www-form-urlencoded data encoding for state-wide queries.
    """
    url = "https://enam.gov.in/web/Ajax_ctrl/trade_data_list"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/147.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': 'https://enam.gov.in',
        'X-Requested-With': 'XMLHttpRequest'
    }
    
    data_payload = {
        "language": "en",
        "stateName": "JAMMU AND KASHMIR",
        "apmcName": "-- Select APMCs --", 
        "commodityName": "-- Select Commodity --",
        "fromDate": date,
        "toDate": date
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, data=data_payload, headers=headers, timeout=15.0)
            
            # Handle server-side 500 status payload within a 200 HTTP response.
            if "500" in response.text:
                 return {"status": "error", "message": "eNAM Exception: Internal Server Data Mismatch."}
                 
            response.raise_for_status()
            records = response.json().get("data", [])
            matched = []
            for r in records:
                if commodity.lower() in str(r.get("commodity", "")).lower():
                    matched.append({
                        "source": "eNAM",
                        "commodity": r.get("commodity"),
                        "modal_price": r.get("modal_price", "N/A"),
                        "arrival_tonnes": r.get("total_arrival", "0"),
                        "date": date
                    })
            return {"status": "success", "data": matched} if matched else {"status": "empty"}
    except Exception as e:
        return {"status": "error", "message": f"eNAM Protocol Failure: {str(e)}"}

# -----------------------------------------------------------------------------
# AGGREGATION ORCHESTRATOR
# -----------------------------------------------------------------------------
async def get_jk_prices_master(commodity: str, date: str) -> dict:
    """
    Coordinates the dual-source extraction logic for Jammu & Kashmir.
    Implements a sequential failover strategy: Agmarknet (Primary) -> eNAM (Secondary).
    """
    print(f"[STATUS] Querying Primary Source (Agmarknet) for {commodity}...")
    agmarknet_result = await fetch_agmarknet(commodity, date)
    
    if agmarknet_result["status"] == "success":
        return {"status": "success", "state": "Jammu and Kashmir", "data": agmarknet_result["data"]}
        
    print(f"[STATUS] Primary failed/empty. Diverting to Redundancy Layer (eNAM)...")
    enam_result = await fetch_enam(commodity, date)
    
    if enam_result["status"] == "success":
        return {"status": "success", "state": "Jammu and Kashmir", "data": enam_result["data"]}
        
    return {
        "status": "error", 
        "message": f"Data retrieval failed across all configured nodes."
    }