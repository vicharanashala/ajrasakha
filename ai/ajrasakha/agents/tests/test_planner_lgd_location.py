"""LGD validation of the place a farmer names, and the profile location fallback."""

import pytest
from langchain_core.messages import HumanMessage

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
from ajrasakha.agents.planner_rules import (
    apply_planner_completeness_rules,
    merge_entities_from_rephrased_query,
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
