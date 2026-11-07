from fastapi import APIRouter, Query
from helpers.weather_service import get_imd_agro_alerts, get_crop_smart_advisory, get_city_live_weather

router = APIRouter(prefix="/weather", tags=["IMD Weather"])

@router.get("/alerts")
def alerts():
    return get_imd_agro_alerts()

@router.get("/city")
def city_weather(city: str = Query("Ludhiana"), crop: str = Query("Wheat")):
    """
    Fetches real-time dynamic weather, 5-day forecast, and crop-specific advisory
    for any searched city or district using live Open-Meteo API.
    """
    return get_city_live_weather(city, crop=crop)

@router.get("/crop-advisory")
def advisory(crop: str = Query("Wheat"), city: str = Query("Ludhiana")):
    return get_crop_smart_advisory(crop, city=city)

