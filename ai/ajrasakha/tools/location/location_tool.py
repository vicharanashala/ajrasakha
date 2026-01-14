import requests
from langchain.tools import tool

@tool
def location_information_tool(latitude: float, longitude: float):
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

    response = requests.get(url, params=params, headers=headers, timeout=10)
    response.raise_for_status()

    data = response.json()
    address = data.get("address", {})

    return {
        "city": address.get("city") or address.get("town") or address.get("village"),
        "state": address.get("state"),
        "country": address.get("country"),
        "display_name": data.get("display_name"),
    }


