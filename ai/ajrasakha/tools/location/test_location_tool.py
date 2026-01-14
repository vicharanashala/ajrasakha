import pytest
import aiohttp
from .location_tool import location_information_tool


@pytest.mark.asyncio
async def test_location_information_tool_real_api():
    # Pune, India coordinates
    lat = 18.5204
    lon = 73.8567

    result = await location_information_tool.ainvoke({"latitude": lat, "longitude": lon})

    assert result["country"] is not None
    assert result["state"] is not None
    assert result["display_name"] is not None

    # City name may vary (Pune / Pune City / etc)
    assert result["city"] is not None

    print("Result:", result)