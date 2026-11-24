from datetime import datetime, timedelta, timezone
import pytest
from mongomock_motor import AsyncMongoMockClient
from gdb_gap_detector.pipeline.extractor import extract_disclaimer_queries, generate_query_hash


def test_generate_query_hash():
    """Test query normalization and MD5 hash generation."""
    h1 = generate_query_hash("  How to CONTROL   Aphids?  ")
    h2 = generate_query_hash("how to control aphids?")
    assert h1 == h2
    assert len(h1) == 32


@pytest.mark.asyncio
async def test_extractor_drops_noise_and_off_topic(mock_mongo_db):
    """Test noise pre-filtering (confidence < 0.15, length < 5, off-topic)."""
    logs, unique_map = await extract_disclaimer_queries(mock_mongo_db)

    # 6 documents in fixture, 1 is cricket match (off-topic), 5 should be extracted
    assert len(logs) == 5
    queries = [log.query for log in logs]
    assert "who won the cricket match today?" not in queries


@pytest.mark.asyncio
async def test_extractor_deduplicates_by_hash(mock_mongo_db):
    """Test deduplication and aggregation of queries with identical query_hash."""
    _, unique_map = await extract_disclaimer_queries(mock_mongo_db)

    # "How to make vermicompost at home?" appears 3 times in fixtures
    vermi_hash = "a1b2c3d4e5f67890"
    assert vermi_hash in unique_map
    assert unique_map[vermi_hash]["count"] == 3
    assert len(unique_map[vermi_hash]["states"]) == 3  # MH, MP, TN


@pytest.mark.asyncio
async def test_extractor_empty_collection():
    """Test extractor behavior on empty database collection."""
    client = AsyncMongoMockClient()
    db = client["empty_db"]
    logs, unique_map = await extract_disclaimer_queries(db, period_days=30, collection_name="disclaimer_logs")
    assert logs == []
    assert unique_map == {}


@pytest.mark.asyncio
async def test_extractor_date_cutoff_filter():
    """Test extractor drops queries older than period_days."""
    client = AsyncMongoMockClient()
    db = client["test_cutoff_db"]
    old_date = datetime.now(timezone.utc) - timedelta(days=60)
    recent_date = datetime.now(timezone.utc) - timedelta(days=5)

    sample_docs = [
        {
            "_id": "old_1",
            "query": "Old query about paddy blast",
            "confidence": 0.9,
            "status": "unanswered",
            "timestamp": old_date,
        },
        {
            "_id": "new_1",
            "query": "Recent query about wheat rust",
            "confidence": 0.9,
            "status": "unanswered",
            "timestamp": recent_date,
        },
    ]
    await db["disclaimer_logs"].insert_many(sample_docs)

    logs, unique_map = await extract_disclaimer_queries(db, period_days=30, collection_name="disclaimer_logs")
    assert len(logs) == 1
    assert logs[0].query == "Recent query about wheat rust"


@pytest.mark.asyncio
async def test_extractor_short_query_filtering():
    """Test extractor drops queries with length < 5 characters."""
    client = AsyncMongoMockClient()
    db = client["test_short_db"]
    sample_docs = [
        {"_id": "s1", "query": "hi", "status": "unanswered", "confidence": 0.9},
        {"_id": "s2", "query": "pest?", "status": "unanswered", "confidence": 0.9},
        {"_id": "s3", "query": "How to control stem borer?", "status": "unanswered", "confidence": 0.9},
    ]
    await db["disclaimer_logs"].insert_many(sample_docs)

    logs, _ = await extract_disclaimer_queries(db, period_days=30, collection_name="disclaimer_logs")
    assert len(logs) == 2


@pytest.mark.asyncio
async def test_extractor_custom_collection_parameter():
    """Test custom collection name override parameter."""
    client = AsyncMongoMockClient()
    db = client["test_custom_coll_db"]
    await db["custom_disclaimers"].insert_one(
        {"_id": "c1", "query": "Custom collection query test", "status": "unanswered", "confidence": 0.9}
    )
    logs, _ = await extract_disclaimer_queries(db, period_days=30, collection_name="custom_disclaimers")
    assert len(logs) == 1
    assert logs[0].query == "Custom collection query test"
