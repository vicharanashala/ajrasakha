import sys
from pathlib import Path
from typing import Dict, Any

root_dir = Path(__file__).resolve().parent.parent.parent.parent.parent
if str(root_dir) not in sys.path:
    sys.path.append(str(root_dir))

from langchain_core.tools import tool
from mcp.state_masters.manipur_mandi_master import fetch_agmarknet, fetch_datagov

@tool
async def manipur_mandi_tool(commodity: str, date: str) -> Dict[str, Any]:
    """
    Primary tool for fetching market mandi prices for the state of Manipur.
    Always use this tool when the user asks for market data or prices in Manipur.
    Accepts commodity (e.g. 'Paddy', 'Rice') and date (e.g. 'YYYY-MM-DD').
    """
    print(f"[STATUS] Querying Primary Source (Agmarknet) for {commodity} in Manipur...")
    agmarknet_result = await fetch_agmarknet(commodity, date)
    
    if agmarknet_result and isinstance(agmarknet_result, dict) and agmarknet_result.get("status") == "success":
        return {"status": "success", "state": "Manipur", "data": agmarknet_result["data"]}
        
    print(f"[STATUS] Primary failed/empty. Diverting to Redundancy Layer (Data.gov.in)...")
    datagov_result = await fetch_datagov(commodity, date)
    
    if datagov_result and isinstance(datagov_result, dict) and datagov_result.get("status") == "success":
        return {"status": "success", "state": "Manipur", "data": datagov_result["data"]}
        
    return {
        "status": "error", 
        "message": f"Data retrieval failed across all configured nodes for Manipur."
    }
