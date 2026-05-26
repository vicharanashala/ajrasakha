"""FastMCP server (streamable HTTP) — same `fetch_by_type` logic as the FastAPI app."""

from __future__ import annotations

import asyncio
import logging
import os
import sys

from dotenv import load_dotenv
from fastmcp import FastMCP

from common import get_service

load_dotenv()

if sys.stdout.encoding != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

mcp = FastMCP(
    "imd-india-weather",
    instructions="IMD India mirror weather: pass latitude, longitude, and data_type.",
)


@mcp.tool()
async def imd_weather(
    latitude: float,
    longitude: float,
    data_type: str,
) -> dict:
    """
    Fetch India Meteorological Department (IMD) mirror data using coordinates.

    data_type (string, case-insensitive; hyphens or underscores accepted):

    - **forecast** — 7-day city/station forecast from lat/lon (`cityweather_loc.php`).
    - **current_aws** — Nearest automatic weather station observation (needs OSM geocode → state sid).
      Aliases: `current`, `aws`, `live`.
    - **district_warnings** — 5-day district warning codes for the geocoded district.
      Aliases: `warnings`.
    - **district_rainfall** — District rainfall statistics vs normal.
      Aliases: `rainfall`.
    - **district** — Both district warnings and rainfall.
      Alias: `district_all`.
    - **subdivision_warnings** — All-India meteorological subdivision warnings (7 days); coordinates ignored.
      Aliases: `sub_warnings`, `subdivision_warning`.
    - **subdivision_rainfall** — All-India subdivision rainfall distribution forecast; coordinates ignored.
      Aliases: `sub_rainfall`, `subdivision_rf`.
    - **bundle** — Forecast + nearest AWS + district warnings/rainfall in one payload.
      Aliases: `all`, `full`.

    Environment: `IMD_CITY_BASE`, `IMD_MAUSAM_BASE`, optional `NOMINATIM_USER_AGENT`.
    """
    svc = get_service()

    def _run():
        return svc.fetch_by_type(latitude, longitude, data_type)

    try:
        return await asyncio.to_thread(_run)
    except Exception as e:
        logger.exception("imd_weather failed")
        return {
            "success": False,
            "latitude": latitude,
            "longitude": longitude,
            "data_type": data_type,
            "error": str(e),
        }


def run_mcp_server() -> None:
    host = os.getenv("IMD_MCP_HOST", os.getenv("MCP_HOST", "0.0.0.0")).strip()
    port = int(os.getenv("IMD_MCP_PORT", os.getenv("MCP_PORT", "9005")))
    path = os.getenv("IMD_MCP_PATH", "/mcp").strip() or "/mcp"
    mcp.run(
        transport="streamable-http",
        host=host,
        port=port,
        path=path,
    )


if __name__ == "__main__":
    run_mcp_server()
