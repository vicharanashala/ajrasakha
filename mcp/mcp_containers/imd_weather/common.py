"""Shared LatLonWeatherService singleton for API and MCP."""

from __future__ import annotations

from service import LatLonWeatherService

_service: LatLonWeatherService | None = None


def get_service() -> LatLonWeatherService:
    global _service
    if _service is None:
        _service = LatLonWeatherService()
    return _service
