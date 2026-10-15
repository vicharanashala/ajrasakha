import pytest
from ajrasakha.agents.location_context import forward_geocode

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
