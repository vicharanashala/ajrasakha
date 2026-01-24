from typing import Dict, Any

import aiohttp
from langchain.tools import tool


@tool
async def location_information_tool(latitude: float, longitude: float) -> Dict[str, Any]:
    """
    Reverse geocode lat/lon to city, state, country
    Uses OpenStreetMap Nominatim
    """
    url = "https://nominatim.openstreetmap.org/reverse"
    params = {
        "lat": latitude,
        "lon": longitude,
        "format": "json",
        "zoom": 10,
    }

    headers = {
        "User-Agent": "AjraSakha-Agent/1.0"
    }

    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(
                    url,
                    params=params,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                response.raise_for_status()
                data = await response.json()

                address = data.get("address", {})

                return {
                    "city": address.get("city") or address.get("town") or address.get("village"),
                    "state": address.get("state"),
                    "country": address.get("country"),
                    "display_name": data.get("display_name"),
                }
        except Exception as e:
            return {"status": "error", "error": str(e)}
