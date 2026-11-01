from fastapi import APIRouter, Query
from helpers.weather_service import get_imd_agro_alerts, get_crop_smart_advisory

router = APIRouter(prefix="/weather", tags=["IMD Weather"])

@router.get("/alerts")
def alerts():
    return get_imd_agro_alerts()

@router.get("/crop-advisory")
def advisory(crop: str = Query("Wheat")):
    return get_crop_smart_advisory(crop)
