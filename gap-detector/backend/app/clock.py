"""Naive-UTC clock helper. All timestamps in this project are naive UTC datetimes
(Mongo stores them that way and the seed data is naive), so this is the single
place that knows how to produce "now"."""

from __future__ import annotations

from datetime import UTC, datetime


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)
