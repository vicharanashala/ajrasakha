"""Shared fixtures. Tests never touch the network: everything runs on the synthetic
JSON samples in tests/fixtures, mongomock, and the hash embedder."""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"

# Deterministic settings regardless of the developer's .env
os.environ["MONGODB_URI"] = "mongodb://localhost:27017"
os.environ["ACE_PROFILE"] = "demo"
os.environ["EMBEDDING_BACKEND"] = "hash"
os.environ["FARMER_KEY_SALT"] = "test-salt"


def load_fixture(name: str) -> list[dict]:
    with open(FIXTURES / f"{name}.json", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def disclaimer_docs() -> list[dict]:
    return load_fixture("farmer_feedback__disclaimer_logs")


@pytest.fixture
def raw_query_docs() -> list[dict]:
    return load_fixture("gdb_gap_detector__raw_queries")


@pytest.fixture
def gdb_docs() -> list[dict]:
    return load_fixture("farmer_feedback__gdb_entries")


@pytest.fixture
def mongo():
    """An in-memory MongoClient (mongomock) pre-loaded with the seed fixtures."""
    import mongomock

    client = mongomock.MongoClient()
    client["farmer_feedback"]["disclaimer_logs"].insert_many(
        load_fixture("farmer_feedback__disclaimer_logs")
    )
    client["farmer_feedback"]["gdb_entries"].insert_many(
        load_fixture("farmer_feedback__gdb_entries")
    )
    client["gdb_gap_detector"]["raw_queries"].insert_many(
        load_fixture("gdb_gap_detector__raw_queries")
    )
    return client
