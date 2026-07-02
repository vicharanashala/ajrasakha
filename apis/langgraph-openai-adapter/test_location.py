"""Tests for live GPS parsing and location merge priority."""

from langgraph_bridge import (
    _coords_from_text,
    _merge_location,
    _parse_location_from_messages,
    build_run_input,
)


def test_coords_from_client_injection_format():
    text = "AjraSakha agent\n\nLocation:\nLatitude:27.160044\nLongitude:83.570131"
    coords = _coords_from_text(text)
    assert coords is not None
    assert abs(coords["latitude"] - 27.160044) < 1e-6
    assert abs(coords["longitude"] - 83.570131) < 1e-6


def test_parse_location_from_system_message():
    messages = [
        {
            "role": "system",
            "content": "Prefix\n\nLocation:\nLatitude:12.5\nLongitude:77.5",
        },
        {"role": "user", "content": "hello"},
    ]
    loc = _parse_location_from_messages(messages)
    assert loc == {"latitude": 12.5, "longitude": 77.5}


def test_merge_prefers_live_over_mongo():
    live = {"latitude": 12.5, "longitude": 77.5}
    mongo = {"X-Latitude": "27.0", "X-Longitude": "83.0", "X-State": "Uttar Pradesh"}
    merged = _merge_location(live, None, mongo)
    assert merged is not None
    assert merged == {"latitude": 12.5, "longitude": 77.5}
    assert "state" not in merged


def test_merge_falls_back_to_mongo_without_live():
    mongo = {"X-Latitude": "27.0", "X-Longitude": "83.0"}
    merged = _merge_location(None, None, mongo)
    assert merged == {"latitude": 27.0, "longitude": 83.0}


def test_build_run_input_sets_location_from_system():
    body = {
        "messages": [
            {
                "role": "system",
                "content": "x\n\nLocation:\nLatitude:19.0\nLongitude:72.0",
            },
            {"role": "user", "content": "crop question"},
        ],
    }
    run_input = build_run_input(
        body,
        {"X-Latitude": "27.0", "X-Longitude": "83.0"},
        append_only=False,
        request_headers=None,
    )
    assert run_input["location"]["latitude"] == 19.0
    assert run_input["location"]["longitude"] == 72.0
