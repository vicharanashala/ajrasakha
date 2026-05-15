"""FastAPI REST server (IMD weather by lat/lon + data_type)."""

from __future__ import annotations

import asyncio
import logging
import os
import sys

from dotenv import load_dotenv
from fastapi import Body, FastAPI, Query
from pydantic import BaseModel, Field

from common import get_service

load_dotenv()

if sys.stdout.encoding != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="IMD India Weather API",
    version="1.0.0",
    description=(
        "REST access to IMD mirror data. "
        "Use **GET /imd/weather** with query parameters, or **POST /imd/weather** with a JSON body "
        "(same fields). "
        "FastMCP runs as a separate process (see `run.sh`); default MCP URL port `IMD_MCP_PORT`."
    ),
)


class ImdWeatherRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90, description="WGS84 latitude")
    longitude: float = Field(..., ge=-180, le=180, description="WGS84 longitude")
    data_type: str = Field(
        ...,
        description=(
            "forecast | current_aws | district_warnings | district_rainfall | district | "
            "subdivision_warnings | subdivision_rainfall | bundle (+ aliases)"
        ),
    )


async def _imd_weather(latitude: float, longitude: float, data_type: str):
    svc = get_service()
    return await asyncio.to_thread(svc.fetch_by_type, latitude, longitude, data_type)


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok", "service": "imd-india-weather", "component": "fastapi"}


@app.get(
    "/imd/weather",
    tags=["weather"],
    summary="IMD data by latitude, longitude, and data_type",
    response_description="Same JSON shape as the `imd_weather` MCP tool (`fetch_by_type`).",
)
async def imd_weather_http(
    latitude: float = Query(..., ge=-90, le=90, description="WGS84 latitude"),
    longitude: float = Query(..., ge=-180, le=180, description="WGS84 longitude"),
    data_type: str = Query(
        ...,
        description=(
            "forecast | current_aws | district_warnings | district_rainfall | district | "
            "subdivision_warnings | subdivision_rainfall | bundle (+ aliases, see MCP tool doc)"
        ),
    ),
):
    return await _imd_weather(latitude, longitude, data_type)


@app.post(
    "/imd/weather",
    tags=["weather"],
    summary="IMD data (JSON body — same behaviour as GET /imd/weather)",
    response_description="Same JSON shape as GET and the `imd_weather` MCP tool.",
)
async def imd_weather_post(body: ImdWeatherRequest = Body(...)):
    return await _imd_weather(body.latitude, body.longitude, body.data_type)
