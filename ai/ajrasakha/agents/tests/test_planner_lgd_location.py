"""LGD validation of the place a farmer names, and the profile location fallback."""

import pytest
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig

from ajrasakha.agents import lgd_location
from ajrasakha.agents.lgd_location import (
    ABSENT,
    AMBIGUOUS,
    INVALID,
    RESOLVED,
    UNAVAILABLE,
    lookup_location,
    reset_directory_cache,
    seed_directory_cache,
)
from ajrasakha.agents.plan_executor import (
    build_specialist_tool_calls_from_plan,
    ensure_location_node,
)
from ajrasakha.agents.planner_rules import (
    apply_planner_completeness_rules,
    merge_entities_from_rephrased_query,
    apply_sub_place_coordinates,
    resolve_weather_mandi_places,
)
from ajrasakha.agents.translation_catalog import (
    get_invalid_location_follow_up,
    get_state_follow_up,
)

_STATES = [
    {"stateCode": 3, "stateNameEnglish": "Punjab", "aliases": []},
    {"stateCode": 9, "stateNameEnglish": "Uttar Pradesh", "aliases": []},
    {"stateCode": 27, "stateNameEnglish": "Maharashtra", "aliases": []},
    {"stateCode": 10, "stateNameEnglish": "Bihar", "aliases": []},
    {"stateCode": 32, "stateNameEnglish": "Keralam", "aliases": ["Kerala"]},
]

_DISTRICTS = [
    {"districtNameEnglish": "Ludhiana", "stateName": "Punjab", "aliases": []},
    # LGD's own spelling, with no alias for the name farmers use.
    {"districtNameEnglish": "S.A.S Nagar", "stateName": "Punjab", "aliases": []},
    {"districtNameEnglish": "Prayagraj", "stateName": "Uttar Pradesh", "aliases": ["Allahabad"]},
    {"districtNameEnglish": "Aurangabad", "stateName": "Maharashtra", "aliases": []},
    {"districtNameEnglish": "Aurangabad", "stateName": "Bihar", "aliases": []},
    {"districtNameEnglish": "Palakkad", "stateName": "Keralam", "aliases": []},
]


@pytest.fixture(autouse=True)
def _lgd_directory():
    seed_directory_cache(_STATES, _DISTRICTS)
    yield
    reset_directory_cache()


def _plan(state=None, district=None, **overrides):
    plan = {
        "domain": "Plant Protection",
        "domains": ["Plant Protection"],
        "knowledge_base": True,
        "is_agriculture_related": True,
        "is_complete": True,
        "missing_info": [],
        "crop_required": False,
        "rephrased_query": "How do I control yellow rust in wheat?",
        "entities": {"crop": "Wheat", "state": state, "district": district},
        "script_language": "English",
        "vocal_language": "English",
    }
    plan.update(overrides)
    return plan


def _messages():
    return [HumanMessage(content="How do I control yellow rust in wheat?")]


# --- lookup_location ---------------------------------------------------------


def test_state_and_district_resolve_to_official_names():
    result = lookup_location("panjab", "ludhiyana")
    assert (result.status, result.state, result.district) == (RESOLVED, "Punjab", "Ludhiana")


def test_state_alone_sets_district_all():
    result = lookup_location("Punjab", None)
    assert (result.status, result.state, result.district) == (RESOLVED, "Punjab", "all")


def test_lgd_spelling_gives_way_to_the_name_the_pipeline_keys_on():
    # LGD's official name is "Keralam"; GDB filters, the weather state centres
    # and the mandi state list all key on "Kerala", which LGD carries as alias.
    result = lookup_location("Keralam", None)
    assert result.state == "Kerala"
    assert lookup_location(None, "Palakkad").state == "Kerala"


def test_district_alone_supplies_its_state():
    result = lookup_location(None, "Mohali")
    assert (result.status, result.state, result.district) == (
        RESOLVED,
        "Punjab",
        "S.A.S Nagar",
    )


def test_renamed_district_resolves_through_alias():
    result = lookup_location("Uttar Pradesh", "Allahabad")
    assert (result.state, result.district) == ("Uttar Pradesh", "Prayagraj")


def test_unknown_place_inside_a_real_state_keeps_the_state():
    # Kharar is a town, not a district — that is not a reason to re-ask.
    result = lookup_location("Punjab", "Kharar")
    assert (result.status, result.state, result.district) == (RESOLVED, "Punjab", "all")


def test_place_that_does_not_exist_is_invalid():
    assert lookup_location("Xyzabad", None).status == INVALID
    assert lookup_location(None, "Xyzabad").status == INVALID


def test_district_in_two_states_without_a_state_is_ambiguous():
    assert lookup_location(None, "Aurangabad").status == AMBIGUOUS


def test_no_place_named_is_absent():
    assert lookup_location(None, None).status == ABSENT
    assert lookup_location("all", "all").status == ABSENT


def test_unloaded_directory_fails_open():
    reset_directory_cache()
    result = lookup_location("Xyzabad", None)
    assert result.status == UNAVAILABLE
    assert result.state == "Xyzabad"


def test_validation_can_be_switched_off(monkeypatch):
    monkeypatch.setenv("LGD_VALIDATION_ENABLED", "false")
    assert lookup_location("Xyzabad", None).status == UNAVAILABLE


# --- planner entity merge ----------------------------------------------------


def test_query_location_is_replaced_by_its_official_name():
    plan = _plan(state="panjab", district="ludhiyana")
    entities = merge_entities_from_rephrased_query(plan, _messages(), None, None)
    assert entities["state"] == "Punjab"
    assert entities["district"] == "Ludhiana"
    assert plan.get("location_check") is None


def test_no_location_in_query_uses_the_farmer_profile():
    plan = _plan()
    entities = merge_entities_from_rephrased_query(
        plan,
        _messages(),
        None,
        None,
        stored_location={"state": "Uttar Pradesh", "district": "Prayagraj"},
    )
    assert entities["state"] == "Uttar Pradesh"
    assert entities["district"] == "Prayagraj"


def test_query_location_overrides_the_farmer_profile():
    plan = _plan(state="Punjab", district="Ludhiana")
    entities = merge_entities_from_rephrased_query(
        plan,
        _messages(),
        None,
        None,
        stored_location={"state": "Uttar Pradesh", "district": "Prayagraj"},
    )
    assert entities["state"] == "Punjab"
    assert entities["district"] == "Ludhiana"


def test_invalid_location_does_not_fall_back_to_the_profile():
    plan = _plan(state="Xyzabad")
    entities = merge_entities_from_rephrased_query(
        plan,
        _messages(),
        None,
        None,
        stored_location={"state": "Uttar Pradesh", "district": "Prayagraj"},
    )
    assert "state" not in entities
    assert plan["location_check"] == INVALID


# --- completeness ------------------------------------------------------------


def test_invalid_location_asks_again_with_the_not_found_wording():
    out = apply_planner_completeness_rules(
        _plan(state="Xyzabad"),
        _messages(),
        None,
        None,
        stored_location={"state": "Uttar Pradesh", "district": "Prayagraj"},
    )
    assert out["is_complete"] is False
    assert out["missing_info"] == ["location"]
    assert out["follow_up_question"] == get_invalid_location_follow_up("English", "English")


def test_ambiguous_district_asks_the_plain_location_question():
    out = apply_planner_completeness_rules(
        _plan(district="Aurangabad"),
        _messages(),
        None,
        None,
    )
    assert out["is_complete"] is False
    assert out["follow_up_question"] == get_state_follow_up("English", "English")


def test_valid_location_stays_complete():
    out = apply_planner_completeness_rules(
        _plan(state="Punjab", district="Ludhiana"),
        _messages(),
        None,
        None,
    )
    assert out["is_complete"] is True
    assert out["entities"]["state"] == "Punjab"
    assert out["entities"]["district"] == "Ludhiana"


def test_profile_location_keeps_the_turn_complete():
    out = apply_planner_completeness_rules(
        _plan(),
        _messages(),
        None,
        None,
        stored_location={"state": "Punjab", "district": "Ludhiana"},
    )
    assert out["is_complete"] is True
    assert out["entities"]["district"] == "Ludhiana"


def test_lgd_outage_keeps_the_farmer_moving():
    reset_directory_cache()
    out = apply_planner_completeness_rules(
        _plan(state="Punjab", district="Ludhiana"),
        _messages(),
        None,
        None,
    )
    assert out["is_complete"] is True
    assert out["entities"]["state"] == "Punjab"


# --- tool location -----------------------------------------------------------


def _tool_plan(**overrides):
    plan = _plan(
        state="Andhra Pradesh",
        district="Visakhapatnam",
        weather=True,
        mandi=True,
        knowledge_base=False,
        rephrased_query="How do I control fruit borer in brinjal?",
    )
    plan["entities"]["crop"] = "Brinjal"
    plan.update(overrides)
    return plan


def _args(calls, name):
    return next(c["args"] for c in calls if c["name"] == name)


@pytest.mark.asyncio
async def test_weather_and_mandi_get_the_planner_location_and_profile_coordinates():
    plan = _tool_plan(profile_coordinates={"latitude": 17.7, "longitude": 83.3})
    calls, _ = await build_specialist_tool_calls_from_plan(plan, "How do I control fruit borer in brinjal?", {})
    weather, mandi = _args(calls, "new_weather"), _args(calls, "daily_price")
    # "in brinjal" is a crop, not a place: nothing from the query text overrides the planner.
    assert (weather["state"], weather["district"], weather["location"]) == ("Andhra Pradesh", "Visakhapatnam", None)
    assert (weather["latitude"], weather["longitude"]) == (17.7, 83.3)
    assert (mandi["state"], mandi["district"]) == ("Andhra Pradesh", "Visakhapatnam")
    assert (mandi["latitude"], mandi["longitude"]) == (17.7, 83.3)


@pytest.mark.asyncio
async def test_place_from_the_query_leaves_coordinates_to_the_tools():
    plan = _tool_plan(profile_coordinates=None)
    plan["entities"].update(state="Punjab", district="Ludhiana")
    calls, _ = await build_specialist_tool_calls_from_plan(plan, "Weather in Ludhiana, Punjab?", {"latitude": 10.0, "longitude": 76.4})
    weather = _args(calls, "new_weather")
    assert (weather["state"], weather["district"]) == ("Punjab", "Ludhiana")
    # Neither thread GPS nor a geocode of the query: the weather tool resolves the district itself.
    assert (weather["latitude"], weather["longitude"]) == (None, None)


@pytest.mark.asyncio
async def test_ensure_location_never_rewrites_the_plan_location():
    state = {"messages": [HumanMessage(content="How do I control fruit borer in brinjal?")], "plan": _tool_plan()}
    assert await ensure_location_node(state, RunnableConfig()) == {}


# --- weather / mandi places ----------------------------------------------------


def _weather_plan(state=None, district=None, places=()):
    return _plan(
        state=state,
        district=district,
        domain="Weather",
        domains=["Weather"],
        weather=True,
        crop_required=False,
        places=list(places),
        rephrased_query="Will it rain tomorrow?",
    )


def test_first_verified_place_is_the_location_and_the_rest_are_sub_places():
    assert resolve_weather_mandi_places(None, None, ["Kharar", "Mohali"]) == (
        "Punjab",
        "S.A.S Nagar",
        ["Kharar"],
    )
    assert resolve_weather_mandi_places(None, None, ["Ludhiana", "Allahabad"]) == (
        "Punjab",
        "Ludhiana",
        ["Allahabad"],
    )


def test_town_inside_a_state_keeps_the_state_and_becomes_a_sub_place():
    assert resolve_weather_mandi_places("Punjab", "Kharar", ["Kharar", "Punjab"]) == ("Punjab", "all", ["Kharar"])


def test_state_and_district_are_not_sub_places_when_lgd_is_unavailable(monkeypatch):
    from ajrasakha.agents import planner_rules
    from ajrasakha.agents.lgd_location import LgdLookup, UNAVAILABLE

    monkeypatch.setattr(
        planner_rules,
        "lookup_location",
        lambda s, d: LgdLookup(UNAVAILABLE, state=s, district=d, reason="directory not loaded"),
    )
    # The state is never a sub-place; the district is left for the geocoder to judge.
    assert resolve_weather_mandi_places("Bihar", "Patna", ["Bihar", "Patna"]) == ("Bihar", "Patna", ["Patna"])
    assert resolve_weather_mandi_places("Bihar", "Gandhi Ghat", ["Bihar", "Gandhi Ghat"]) == (
        "Bihar",
        "Gandhi Ghat",
        ["Gandhi Ghat"],
    )


def test_weather_never_asks_for_an_unverified_place_and_keeps_the_profile():
    out = apply_planner_completeness_rules(
        _weather_plan(district="Xyzabad", places=["Xyzabad"]),
        _messages(),
        None,
        None,
        stored_location={"state": "Uttar Pradesh", "district": "Prayagraj"},
    )
    assert out["is_complete"] is True
    assert out["follow_up_question"] is None
    assert (out["entities"]["state"], out["entities"]["district"]) == ("Uttar Pradesh", "Prayagraj")
    assert out["sub_places"] == ["Xyzabad"]


def test_ambiguous_district_on_weather_is_a_sub_place_not_a_question():
    out = apply_planner_completeness_rules(
        _weather_plan(district="Aurangabad", places=["Aurangabad"]), _messages(), None, None
    )
    assert out["is_complete"] is True
    assert out["sub_places"] == ["Aurangabad"]


def test_weather_without_any_location_still_runs():
    out = apply_planner_completeness_rules(_weather_plan(), _messages(), None, None)
    assert out["is_complete"] is True
    assert out["missing_info"] == []


def test_verified_place_overrides_the_profile_on_weather():
    out = apply_planner_completeness_rules(
        _weather_plan(district="Mohali", places=["Mohali", "Kharar"]),
        _messages(),
        None,
        None,
        stored_location={"state": "Uttar Pradesh", "district": "Prayagraj"},
    )
    assert (out["entities"]["state"], out["entities"]["district"]) == ("Punjab", "S.A.S Nagar")
    assert out["sub_places"] == ["Kharar"]


@pytest.mark.asyncio
async def test_sub_places_reach_the_weather_and_mandi_tools():
    plan = _tool_plan(sub_places=["Kharar", "Mohali"], profile_coordinates={"latitude": 17.7, "longitude": 83.3})
    calls, _ = await build_specialist_tool_calls_from_plan(plan, "Rain and tomato price in Kharar and Mohali?", {})
    weather, mandi = _args(calls, "new_weather"), _args(calls, "daily_price")
    assert weather["sub_places"] == ["Kharar", "Mohali"]
    assert weather["location"] == "Kharar"
    assert mandi["sub_places"] == ["Kharar", "Mohali"]
    assert (weather["latitude"], mandi["latitude"]) == (17.7, 17.7)


@pytest.mark.asyncio
async def test_state_only_location_never_borrows_the_profile_district():
    plan = _tool_plan(sub_places=["Kharar"])
    plan["entities"].update(state="Punjab", district="all")
    thread_location = {"state": "Andhra Pradesh", "district": "Visakhapatnam"}
    calls, resolved = await build_specialist_tool_calls_from_plan(plan, "Will it rain in Kharar?", thread_location)
    assert (resolved.state, resolved.district) == ("Punjab", "all")
    assert _args(calls, "new_weather")["district"] is None


@pytest.mark.asyncio
async def test_tools_get_the_profile_flag_and_the_sub_place_coordinates():
    plan = _tool_plan(
        location_from_profile=False,
        sub_places=["Kharar"],
        sub_place_location={"latitude": 30.75, "longitude": 76.64, "state": "Punjab", "district": "Sahibzada Ajit Singh Nagar"},
        profile_coordinates={"latitude": 17.7, "longitude": 83.3},
    )
    calls, _ = await build_specialist_tool_calls_from_plan(plan, "Will it rain in Kharar?", {})
    for name in ("new_weather", "daily_price"):
        args = _args(calls, name)
        assert args["location_from_profile"] is False
        assert (args["sub_place_latitude"], args["sub_place_longitude"]) == (30.75, 76.64)
        assert (args["sub_place_state"], args["sub_place_district"]) == ("Punjab", "Sahibzada Ajit Singh Nagar")
        assert (args["latitude"], args["longitude"]) == (17.7, 83.3)


# --- sub-place lookup in the planner --------------------------------------------


KHARAR = {"latitude": 30.75, "longitude": 76.64, "state": "Punjab", "district": "Sahibzada Ajit Singh Nagar", "name": "Kharar, Punjab"}
KHARAR_LOCATION = {k: KHARAR[k] for k in ("latitude", "longitude", "state", "district")}


@pytest.fixture
def geocoder(monkeypatch):
    """Fake geocode_sub_place: knows Kharar; records every lookup."""
    from ajrasakha.agents import location_extractor

    lookups = []

    async def fake(place, *, state=None, district=None, **_):
        lookups.append((place, state, district))
        return KHARAR if place == "Kharar" else None

    monkeypatch.setattr(location_extractor, "geocode_sub_place", fake)
    return lookups


def _sub_place_plan(sub_places, state="Punjab", district="all"):
    plan = _plan(state=state, district=district, weather=True, knowledge_base=False)
    plan.update(is_complete=True, missing_info=[], follow_up_question=None, sub_places=sub_places)
    return plan


@pytest.mark.asyncio
async def test_a_found_sub_place_gets_coordinates_searched_in_the_plan_state(geocoder):
    out = await apply_sub_place_coordinates(_sub_place_plan(["Kharar", "Mohali"]))
    assert out["sub_place_location"] == KHARAR_LOCATION
    assert out["entities"]["district"] == "all"  # the plan's own state/district stay as they were
    assert out["is_complete"] is True
    assert geocoder == [("Kharar", "Punjab", "all")]  # only sub_places[0]


@pytest.mark.asyncio
async def test_a_named_district_without_a_sub_place_becomes_the_sub_place_location(monkeypatch):
    from ajrasakha.agents import location_extractor

    calls = []

    async def fake(**kwargs):
        calls.append(kwargs)
        return 25.59, 85.13, "Patna, Bihar"

    monkeypatch.setattr(location_extractor, "get_lat_long", fake)
    plan = _sub_place_plan([], state="Bihar", district="Patna")
    plan["places"] = ["Patna", "Bihar"]
    out = await apply_sub_place_coordinates(plan)
    assert out["sub_place_location"] == {"latitude": 25.59, "longitude": 85.13, "state": "Bihar", "district": "Patna"}
    assert calls == [{"district": "Patna", "state": "Bihar"}]


@pytest.mark.asyncio
async def test_no_named_place_leaves_the_sub_place_location_empty(geocoder):
    out = await apply_sub_place_coordinates(_sub_place_plan([], state="Bihar", district="Patna"))
    assert out["sub_place_location"] is None


@pytest.mark.asyncio
async def test_sub_place_without_geocoder_state_uses_the_query_state(monkeypatch):
    from ajrasakha.agents import location_extractor

    async def fake(place, **_):
        return {"latitude": 1.0, "longitude": 2.0, "state": None, "district": None, "name": place}

    monkeypatch.setattr(location_extractor, "geocode_sub_place", fake)
    out = await apply_sub_place_coordinates(_sub_place_plan(["Gandhi Ghat"], state="Bihar", district="Patna"))
    assert out["sub_place_location"] == {"latitude": 1.0, "longitude": 2.0, "state": "Bihar", "district": "Patna"}


@pytest.mark.asyncio
async def test_town_in_the_district_field_gets_the_geocoders_district(monkeypatch):
    from ajrasakha.agents import location_extractor

    async def fake(place, **_):
        return {"latitude": 25.62, "longitude": 85.17, "state": "Bihar", "district": "Patna", "name": place}

    monkeypatch.setattr(location_extractor, "geocode_sub_place", fake)
    out = await apply_sub_place_coordinates(_sub_place_plan(["Gandhi Ghat"], state="Bihar", district="Gandhi Ghat"))
    assert out["sub_places"] == ["Gandhi Ghat"]
    assert out["entities"]["district"] == "Patna"
    assert out["sub_place_location"]["district"] == "Patna"


@pytest.mark.asyncio
async def test_a_place_that_is_the_geocoded_district_is_not_a_sub_place(monkeypatch):
    from ajrasakha.agents import location_extractor

    async def fake(place, **_):
        return {"latitude": 25.59, "longitude": 85.13, "state": "Bihar", "district": "Patna", "name": place}

    monkeypatch.setattr(location_extractor, "geocode_sub_place", fake)
    out = await apply_sub_place_coordinates(_sub_place_plan(["Patna"], state="Bihar", district="Patna"))
    assert out["sub_places"] == []
    assert out["sub_place_location"]["district"] == "Patna"


GANDHI_NAGAR = {
    "latitude": 12.9, "longitude": 77.5, "state": "Karnataka", "district": "Ballari", "name": "Gandhi Nagar, Ballari",
    "alternatives": [
        {"latitude": 28.6, "longitude": 77.2, "state": "Delhi", "district": "East Delhi", "name": "Gandhi Nagar, Delhi"},
        {"latitude": 13.0, "longitude": 80.2, "state": "Tamil Nadu", "district": "Chennai", "name": "Gandhi Nagar, Chennai"},
    ],
}


@pytest.fixture
def ambiguous_geocoder(monkeypatch):
    from ajrasakha.agents import location_extractor

    async def fake(place, **_):
        return GANDHI_NAGAR

    monkeypatch.setattr(location_extractor, "geocode_sub_place", fake)


@pytest.mark.asyncio
async def test_a_place_in_several_districts_asks_which_one(ambiguous_geocoder):
    out = await apply_sub_place_coordinates(_sub_place_plan(["Gandhi Nagar"], state="all", district="all"))
    assert out["is_complete"] is False
    assert out["missing_info"] == ["location"]
    for option in ("Ballari, Karnataka", "East Delhi, Delhi", "Chennai, Tamil Nadu"):
        assert option in out["follow_up_question"]
    assert out["ambiguous_places"] == ["Gandhi Nagar"]
    assert out["sub_place_location"] is None


@pytest.mark.asyncio
async def test_an_ambiguous_place_is_asked_only_once(ambiguous_geocoder):
    prev = {"ambiguous_places": ["Gandhi Nagar"]}
    out = await apply_sub_place_coordinates(_sub_place_plan(["Gandhi Nagar"]), prev)
    assert out["is_complete"] is True
    assert out["sub_place_location"]["district"] == "Ballari"
    assert out["ambiguous_places"] == []


@pytest.fixture
def ballari_geocoder(monkeypatch):
    from ajrasakha.agents import location_extractor

    async def fake(place, **_):
        return {"latitude": 15.14, "longitude": 76.92, "state": "Karnataka", "district": "Ballari", "name": place}

    monkeypatch.setattr(location_extractor, "geocode_sub_place", fake)


def _delhi_ballari_plan():
    plan = _sub_place_plan(["Ballari"], state="Delhi", district="Ballari")
    plan["places"] = ["Delhi", "Ballari"]
    return plan


@pytest.mark.asyncio
async def test_a_place_outside_the_state_the_farmer_named_asks_first(ballari_geocoder):
    out = await apply_sub_place_coordinates(_delhi_ballari_plan())
    assert out["is_complete"] is False
    assert "Ballari in Delhi" in out["follow_up_question"]
    assert "Ballari, Karnataka" in out["follow_up_question"]
    assert out["ambiguous_places"] == ["Ballari"]


@pytest.mark.asyncio
async def test_the_state_conflict_is_asked_only_once(ballari_geocoder):
    out = await apply_sub_place_coordinates(_delhi_ballari_plan(), {"ambiguous_places": ["Ballari"]})
    assert out["is_complete"] is True
    assert (out["entities"]["state"], out["entities"]["district"]) == ("Karnataka", "Ballari")
    assert out["sub_place_location"]["state"] == "Karnataka"


@pytest.mark.asyncio
async def test_a_profile_state_never_triggers_the_state_conflict_question(ballari_geocoder):
    plan = _delhi_ballari_plan()
    plan["places"] = ["Ballari"]  # the state came from the farmer profile, not the query
    out = await apply_sub_place_coordinates(plan)
    assert out["is_complete"] is True


@pytest.mark.asyncio
async def test_a_sub_place_found_nowhere_asks_the_farmer_again(geocoder):
    out = await apply_sub_place_coordinates(_sub_place_plan(["Xyzabad"]))
    assert out["is_complete"] is False
    assert out["missing_info"] == ["location"]
    assert "Xyzabad" in out["follow_up_question"]
    assert out["rejected_places"] == ["Xyzabad"]
    assert out["sub_place_location"] is None


@pytest.mark.asyncio
async def test_the_reply_turn_skips_the_place_already_not_found(geocoder):
    # The reply is merged onto "...in Xyzabad", so Xyzabad is still named.
    prev = {"rejected_places": ["Xyzabad"]}
    out = await apply_sub_place_coordinates(_sub_place_plan(["Xyzabad", "Kharar"]), prev)
    assert out["sub_places"] == ["Kharar"]
    assert out["sub_place_location"] == KHARAR_LOCATION
    assert out["rejected_places"] == []


@pytest.mark.asyncio
async def test_questions_other_than_weather_or_mandi_are_never_geocoded(geocoder):
    plan = _sub_place_plan(["Xyzabad"])
    plan.update(weather=False, domain="Crop Protection", domains=["Crop Protection"])
    out = await apply_sub_place_coordinates(plan)
    assert out["is_complete"] is True and geocoder == []


# --- the geocoder's search order -------------------------------------------------


@pytest.mark.asyncio
async def test_sub_place_search_goes_state_then_india_then_openstreetmap(monkeypatch):
    from ajrasakha.agents import location_extractor as lx

    calls = []

    def fake(source, hit_on):
        async def _f(place, *, state=None, **_):
            calls.append((source, state))
            return {"latitude": 1.0} if (source, state) == hit_on else None
        return _f

    for hit_on, expected in [
        (("google", "Punjab"), [("google", "Punjab")]),
        (("google", None), [("google", "Punjab"), ("google", None)]),
        (("osm", None), [("google", "Punjab"), ("google", None), ("osm", "Punjab"), ("osm", None)]),
    ]:
        calls.clear()
        monkeypatch.setattr(lx, "_google_place", fake("google", hit_on))
        monkeypatch.setattr(lx, "_nominatim_place", fake("osm", hit_on))
        assert await lx.geocode_sub_place("Kharar", state="Punjab") == {"latitude": 1.0}
        assert calls == expected


# --- answer only for the profile location ---------------------------

from ajrasakha.agents.planner_rules import ask_to_change_profile_location

_PROFILE = {"state": "Andhra Pradesh", "district": "Visakhapatnam", "block": "seethammadhara", "village": "chinnawaltair"}


def _weather_plan_naming(*places):
    plan = _plan(state="Andhra Pradesh", district="Visakhapatnam", weather=True, knowledge_base=False)
    plan.update(is_complete=True, missing_info=[], follow_up_question=None, places=list(places))
    return plan


def test_weather_naming_another_place_asks_to_change_the_profile_location():
    out = ask_to_change_profile_location(_weather_plan_naming("Kharar"), _PROFILE)
    assert out["is_complete"] is False
    assert out["missing_info"] == []  # the next message is a new question
    assert out["follow_up_question"] == "Please change your location and ask the question again."


def test_naming_no_place_goes_ahead():
    out = ask_to_change_profile_location(_weather_plan_naming(), _PROFILE)
    assert out["is_complete"] is True and out["places_outside_profile"] == []


def test_naming_the_profile_own_place_goes_ahead_with_the_location_prefix():
    for place in ("Visakhapatnam", "Chinnawaltair", "seethamadhara", "andhra pradesh"):
        out = ask_to_change_profile_location(_weather_plan_naming(place), _PROFILE)
        assert out["is_complete"] is True, place
        assert out["profile_location_prefix"] == (
            "The below answer is provided for the location: Andhra Pradesh, Visakhapatnam, "
            "chinnawaltair, seethammadhara. If this is not your preferred location, "
            "please change it and ask again."
        )


def test_naming_the_profile_place_and_another_asks_to_change_the_location():
    out = ask_to_change_profile_location(_weather_plan_naming("Visakhapatnam", "Kharar"), _PROFILE)
    assert out["is_complete"] is False and out["places_outside_profile"] == ["Kharar"]


def test_any_question_naming_another_place_asks_to_change_the_profile_location():
    plan = _weather_plan_naming("Kharar")
    plan.update(weather=False, domain="Crop Protection", domains=["Crop Protection"])
    out = ask_to_change_profile_location(plan, _PROFILE)
    assert out["is_complete"] is False and out["places_outside_profile"] == ["Kharar"]


def test_a_farmer_without_a_profile_location_is_asked_to_set_it():
    for places in ([], ["Kharar"]):
        out = ask_to_change_profile_location(_weather_plan_naming(*places), None)
        assert out["is_complete"] is False and out["missing_info"] == []
        assert out["follow_up_question"] == "Please set your location."


def test_greetings_need_no_location():
    plan = _weather_plan_naming()
    plan["is_greeting"] = True
    assert ask_to_change_profile_location(plan, None)["is_complete"] is True
