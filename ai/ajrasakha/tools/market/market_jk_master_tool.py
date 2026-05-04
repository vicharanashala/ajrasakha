import sys
from pathlib import Path
from typing import Dict, Any

root_dir = Path(__file__).resolve().parent.parent.parent.parent.parent
if str(root_dir) not in sys.path:
    sys.path.append(str(root_dir))

from langchain_core.tools import tool
from mcp.state_masters.jk_mandi_master import get_jk_prices_master

@tool
async def jk_mandi_tool(commodity: str, date: str) -> Dict[str, Any]:
    """
    Primary tool for fetching market mandi prices for the state of Jammu & Kashmir (J&K).
    Always use this tool when the user asks for market data or prices in Jammu and Kashmir.
    Accepts commodity (e.g. 'Apple') and date (e.g. 'YYYY-MM-DD').
    """
    result = await get_jk_prices_master(commodity, date)
    return result
