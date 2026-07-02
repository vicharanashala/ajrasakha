"""Structured logging for state / district / lat-long / crop / domain resolution."""

from __future__ import annotations

from typing import Any

from ajrasakha.agents.thread_trace import trace_event

_ENTITY_FIELDS = ("state", "district", "crop", "domain")


def _fmt_resolved(value: Any, source: str | None) -> Any:
    if source:
        return f"{value!r} ← {source}" if value is not None else f"(unset) ← {source}"
    return value


def trace_thread_location(
    stage: str,
    loc: dict[str, Any] | None,
    *,
    plan_entities: dict[str, Any] | None = None,
    note: str | None = None,
    **extra: Any,
) -> None:
    """Log raw thread ``location`` and ``plan.entities`` (always, including nulls)."""
    loc = loc or {}
    entities = plan_entities or {}
    payload: dict[str, Any] = {
        "thread_latitude": loc.get("latitude"),
        "thread_longitude": loc.get("longitude"),
        "thread_state": loc.get("state"),
        "thread_city": loc.get("city"),
        "thread_district": loc.get("district"),
        "thread_address": loc.get("address"),
        "plan_entities_state": entities.get("state"),
        "plan_entities_district": entities.get("district"),
        "plan_entities_crop": entities.get("crop"),
    }
    payload.update(extra)
    if note:
        payload["note"] = note
    trace_event(f"resolve_{stage}", **payload)


def trace_resolution(stage: str, **fields: Any) -> None:
    """Log resolved values with ``value_source`` provenance at a pipeline stage."""
    payload: dict[str, Any] = {}

    for key in _ENTITY_FIELDS:
        value = fields.get(key)
        source = fields.get(f"{key}_source")
        if value is None and source is None:
            continue
        payload[key] = _fmt_resolved(value, source)

    lat = fields.get("latitude")
    lon = fields.get("longitude")
    lat_long_src = fields.get("lat_long_source")
    if lat is not None or lon is not None or lat_long_src:
        payload["latitude"] = _fmt_resolved(lat, lat_long_src)
        payload["longitude"] = _fmt_resolved(lon, lat_long_src)

    _reserved = {*_ENTITY_FIELDS, "latitude", "longitude", "lat_long_source"}
    _reserved |= {f"{k}_source" for k in _ENTITY_FIELDS}
    _reserved |= {f"{k}_source" for k in ("latitude", "longitude")}

    for key, value in fields.items():
        if key in _reserved:
            continue
        if value is not None:
            payload[key] = value

    if payload:
        trace_event(f"resolve_{stage}", **payload)
