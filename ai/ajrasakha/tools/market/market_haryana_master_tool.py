import sys
from pathlib import Path
from typing import Dict, Any

root_dir = Path(__file__).resolve().parent.parent.parent.parent.parent
if str(root_dir) not in sys.path:
    sys.path.append(str(root_dir))

from langchain_core.tools import tool
from mcp.state_masters.haryana_mandi_master import get_haryana_prices_master

@tool
async def haryana_mandi_tool(commodity: str, district: str, date: str) -> Dict[str, Any]:
    """
    Primary tool for fetching market mandi prices for the state of Haryana.
    Always use this tool when the user asks for market data or prices in Haryana.
    Accepts commodity (e.g. 'Wheat'), district (e.g. 'Ambala'), and date (e.g. 'YYYY-MM-DD').
    """
    result = await get_haryana_prices_master("Haryana", commodity, district, date)
    return result
