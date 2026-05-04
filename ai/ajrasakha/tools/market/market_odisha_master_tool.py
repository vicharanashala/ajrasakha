import sys
from pathlib import Path
from typing import Dict, Any

root_dir = Path(__file__).resolve().parent.parent.parent.parent.parent
if str(root_dir) not in sys.path:
    sys.path.append(str(root_dir))

from langchain_core.tools import tool
from mcp.state_masters.odisha_mandi_master import get_odisha_prices_master

@tool
async def odisha_mandi_tool(commodity: str, district: str, date: str) -> Dict[str, Any]:
    """
    Primary tool for fetching market mandi prices for the state of Odisha.
    Always use this tool when the user asks for market data or prices in Odisha.
    Accepts commodity (e.g. 'Tomato', 'Rice'), district (e.g. 'All'), and date (e.g. 'YYYY-MM-DD').
    """
    result = await get_odisha_prices_master("Odisha", commodity, district, date)
    return result
