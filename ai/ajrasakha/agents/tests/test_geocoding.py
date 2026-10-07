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
async def test_forward_geocode_chintapally_ap():
    res = await forward_geocode(state="Andhra Pradesh", district="Chintapally")
    assert res is not None
    assert abs(res["latitude"] - 17.87) < 0.5
    assert abs(res["longitude"] - 82.35) < 0.5
    assert res["state"].lower() == "andhra pradesh"

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
    assert any(n in names for n in ("weather", "new_weather"))

    weather_call = next(c for c in calls if c["name"] in ("weather", "new_weather"))
    # Verify Varanasi's resolved coordinates are injected into the weather call instead of Faridabad's!
    assert abs(weather_call["args"]["latitude"] - 25.3) < 0.5
    assert abs(weather_call["args"]["longitude"] - 83.0) < 0.5


@pytest.mark.asyncio
async def test_merge_location_dict_clears_stale_district_on_state_change():
    from ajrasakha.agents.location_context import merge_location_dict

    left = {"state": "Andhra Pradesh", "district": "Chintapally", "city": "Chintapally", "latitude": 16.5, "longitude": 80.6}
    right = {"state": "Bihar", "city": "Patna", "latitude": 25.59, "longitude": 85.13}

    merged = merge_location_dict(left, right)
    assert merged["state"] == "Bihar"
    assert "district" not in merged
    assert merged["city"] == "Patna"
    assert merged["latitude"] == 25.59


@pytest.mark.asyncio
async def test_ensure_location_node_regeocodes_on_location_change():
    state: AjraSakhaState = {
        "messages": [],
        "location": {"state": "Andhra Pradesh", "district": "Chintapally", "latitude": 16.5, "longitude": 80.6},
        "plan": {
            "is_complete": True,
            "entities": {"state": "Kerala", "district": "Kakkanad"}
        }
    }

    res = await ensure_location_node(state, RunnableConfig())
    assert "location" in res
    loc = res["location"]
    assert loc["state"] == "Kerala"
    assert loc["district"] == "Ernakulam"
    assert res["plan"]["entities"]["district"] == "Ernakulam"
    assert abs(loc["latitude"] - 10.0) < 1.0


@pytest.mark.asyncio
async def test_forward_geocode_official_districts():
    res_kodungoor = await forward_geocode(state="Kerala", district="Kodungoor")
    assert res_kodungoor is not None
    assert res_kodungoor["district"] == "Kottayam"
    assert res_kodungoor["city"] == "Kodungoor"

    res_kakkanad = await forward_geocode(state="Kerala", district="Kakkanad")
    assert res_kakkanad is not None
    assert res_kakkanad["district"] == "Ernakulam"
    assert res_kakkanad["city"] == "Kakkanad"

    res_bihar = await forward_geocode(state="Bihar", district=None)
    assert res_bihar is not None
    assert res_bihar["district"] is None
    assert res_bihar["state"] == "Bihar"


@pytest.mark.asyncio
async def test_build_specialist_tool_calls_official_districts():
    from ajrasakha.agents.plan_executor import build_specialist_tool_calls_from_plan

    # 1. Chintapally -> Alluri Sitharama Raju
    p1 = {"domain": "Weather", "weather": True, "entities": {"state": "Andhra Pradesh", "district": "Chintapally"}}
    calls1, _ = await build_specialist_tool_calls_from_plan(p1, "Is fog or reduced visibility expected in Chintapally tomorrow morning?", {})
    args1 = calls1[0]["args"]
    assert args1["district"] == "Alluri Sitharama Raju"
    assert args1["location"] in ("Chintapally", "Chintapalle")
    assert args1["state"] == "Andhra Pradesh"

    # 2. Kakkanad -> Ernakulam
    p2 = {"domain": "Weather", "weather": True, "entities": {"state": "Kerala", "district": "Kakkanad"}}
    calls2, _ = await build_specialist_tool_calls_from_plan(p2, "Is fog or reduced visibility expected in Kakkanad tomorrow morning?", {})
    args2 = calls2[0]["args"]
    assert args2["district"] == "Ernakulam"
    assert args2["location"] == "Kakkanad"
    assert args2["state"] == "Kerala"

    # 3. Manarcad -> Kottayam
    p_m = {"domain": "Weather", "weather": True, "entities": {"state": "Kerala", "district": "Kottayam"}}
    calls_m, _ = await build_specialist_tool_calls_from_plan(p_m, "Is there any rainfall expected in manarcad?", {})
    args_m = calls_m[0]["args"]
    assert args_m["district"] == "Kottayam"
    assert args_m["location"] == "Manarcad"
    assert args_m["state"] == "Kerala"

    # 4. Bihar -> state center, district is None
    p3 = {"domain": "Weather", "weather": True, "entities": {"state": "Bihar"}}
    calls3, _ = await build_specialist_tool_calls_from_plan(p3, "Is fog or reduced visibility expected in Bihar tomorrow morning?", {})
    args3 = calls3[0]["args"]
    assert args3["district"] is None
    assert args3["state"] == "Bihar"
    assert args3["location"] is None

    # 5. Bhadrachalam -> Bhadradri Kothagudem
    p4 = {"domain": "Weather", "weather": True, "entities": {"state": "Telangana", "district": "Bhadrachalam"}}
    calls4, _ = await build_specialist_tool_calls_from_plan(p4, "Are there any chances of thunderstorm in Bhadrachalam in the next few hours?", {})
    args4 = calls4[0]["args"]
    assert args4["district"] == "Bhadradri Kothagudem"
    assert args4["location"] == "Bhadrachalam"
    assert args4["state"] == "Telangana"

    # 6. Yelamanchili -> Anakapalli
    p5 = {"domain": "Weather", "weather": True, "entities": {"state": "Andhra Pradesh", "district": "Yelamanchili"}}
    calls5, _ = await build_specialist_tool_calls_from_plan(p5, "What are the chances of rain in Yelamanchili?", {})
    args5 = calls5[0]["args"]
    assert args5["district"] == "Anakapalli"
    assert args5["location"] == "Yelamanchili"
    assert args5["state"] == "Andhra Pradesh"
