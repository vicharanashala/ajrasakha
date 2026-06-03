import pytest
from ajrasakha.agents.location_context import forward_geocode
from ajrasakha.agents.plan_executor import ensure_location_node, build_tool_calls_from_plan
from ajrasakha.agents.state import AjraSakhaState
from langchain_core.runnables import RunnableConfig

@pytest.mark.asyncio
async def test_forward_geocode_rohtak_haryana():
    res = await forward_geocode(state="Haryana", district="Rohtak")
    assert res is not None
    assert "latitude" in res
    assert "longitude" in res
    assert abs(res["latitude"] - 28.9) < 0.5
    assert abs(res["longitude"] - 76.6) < 0.5
    assert res["state"].lower() == "haryana"

@pytest.mark.asyncio
async def test_forward_geocode_ludhiana_punjab():
    res = await forward_geocode(state="Punjab", district="Ludhiana")
    assert res is not None
    assert abs(res["latitude"] - 30.9) < 0.5
    assert abs(res["longitude"] - 75.8) < 0.5
    assert res["state"].lower() == "punjab"

@pytest.mark.asyncio
async def test_forward_geocode_varanasi_up():
    res = await forward_geocode(state="Uttar Pradesh", district="Varanasi")
    assert res is not None
    assert abs(res["latitude"] - 25.3) < 0.5
    assert abs(res["longitude"] - 83.0) < 0.5
    assert res["state"].lower() == "uttar pradesh"

@pytest.mark.asyncio
async def test_ensure_location_node_registers_home_location():
    state: AjraSakhaState = {
        "messages": [],
        "location": None,  # Registration case: no coordinates
        "plan": {
            "is_complete": True,
            "entities": {"state": "Punjab", "district": "Ludhiana"}
        }
    }
    
    res = await ensure_location_node(state, RunnableConfig())
    assert "location" in res
    loc = res["location"]
    assert loc is not None
    assert abs(loc["latitude"] - 30.9) < 0.5
    assert abs(loc["longitude"] - 75.8) < 0.5
    assert loc["state"] == "Punjab"

@pytest.mark.asyncio
async def test_build_tool_calls_geocodes_transient_location():
    plan = {
        "weather": True,
        "mandi": False,
        "soil": False,
        "schemes": False,
        "chemical_checker": False,
        "knowledge_base": False,
        "is_complete": True,
        "entities": {"state": "Uttar Pradesh", "district": "Varanasi"}, # Transient Varanasi
    }
    
    home_loc = {"latitude": 28.4, "longitude": 77.3, "state": "Haryana", "city": "Faridabad"} # Home Faridabad
    
    calls = await build_tool_calls_from_plan(
        plan,
        "Weather in Varanasi",
        home_loc,
        location_tool_name="location_information_tool",
        reviewer_tool_name="upload_question_to_reviewer_system",
        question_source="WHATSAPP"
    )
    
    # Assert home location Faridabad remains completely untouched
    assert home_loc["latitude"] == 28.4
    assert home_loc["city"] == "Faridabad"
    
    names = [c["name"] for c in calls]
    assert "weather" in names
    
    weather_call = next(c for c in calls if c["name"] == "weather")
    # Verify Varanasi's resolved coordinates are injected into the weather call instead of Faridabad's!
    assert abs(weather_call["args"]["latitude"] - 25.3) < 0.5
    assert abs(weather_call["args"]["longitude"] - 83.0) < 0.5
