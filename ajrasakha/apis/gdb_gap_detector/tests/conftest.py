from datetime import datetime, timezone
import pytest
from mongomock_motor import AsyncMongoMockClient
from gdb_gap_detector.core import MongoDB, settings

# Sample Fixture Documents derived from farmer_feedback DB
SAMPLE_DISCLAIMERS = [
    {
        "_id": "6a5379dff7700a9ca2940a17",
        "query": "How to control aphids in mustard crop?",
        "query_hash": "bcbcb8bb9b2c1473f894f91c0f552a79",
        "query_normalized": "how to control aphids in mustard crop?",
        "farmer_id": "+919876500084",  # Phone PII!
        "source": "telegram",
        "language": "English",
        "state": "Rajasthan",
        "domain": "Pest Control",
        "confidence": 0.85,
        "best_match_id": None,
        "best_match_score": 0.48,  # near_miss
        "timestamp": datetime(2026, 7, 12, 11, 26, 23, tzinfo=timezone.utc),
        "status": "unanswered",
        "metadata": {},
    },
    {
        "_id": "6a5379dff7700a9ca2940a18",
        "query": "How to control aphids in mustard crop?",
        "query_hash": "bcbcb8bb9b2c1473f894f91c0f552a79",
        "query_normalized": "how to control aphids in mustard crop?",
        "farmer_id": "+919876500026",  # Phone PII!
        "source": "telegram",
        "language": "English",
        "state": "Punjab",
        "domain": "Pest Control",
        "confidence": 0.90,
        "best_match_id": None,
        "best_match_score": 0.21,  # real_gap
        "timestamp": datetime(2026, 7, 12, 11, 26, 23, tzinfo=timezone.utc),
        "status": "unanswered",
        "metadata": {},
    },
    {
        "_id": "6a5379dff7700a9ca2940a19",
        "query": "How to make vermicompost at home?",
        "query_hash": "a1b2c3d4e5f67890",
        "query_normalized": "how to make vermicompost at home?",
        "farmer_id": "+919876500007",
        "source": "chat",
        "language": "English",
        "state": "Maharashtra",
        "domain": "Organic Farming",
        "confidence": 0.95,
        "best_match_id": None,
        "best_match_score": 0.15,  # real_gap
        "timestamp": datetime(2026, 7, 12, 11, 26, 23, tzinfo=timezone.utc),
        "status": "unanswered",
        "metadata": {},
    },
    {
        "_id": "6a5379dff7700a9ca2940a20",
        "query": "How to make vermicompost at home?",
        "query_hash": "a1b2c3d4e5f67890",
        "query_normalized": "how to make vermicompost at home?",
        "farmer_id": "+919876500099",
        "source": "web",
        "language": "English",
        "state": "Madhya Pradesh",
        "domain": "Organic Farming",
        "confidence": 0.92,
        "best_match_id": None,
        "best_match_score": 0.18,
        "timestamp": datetime(2026, 7, 12, 11, 26, 24, tzinfo=timezone.utc),
        "status": "unanswered",
        "metadata": {},
    },
    {
        "_id": "6a5379dff7700a9ca2940a21",
        "query": "How to make vermicompost at home?",
        "query_hash": "a1b2c3d4e5f67890",
        "query_normalized": "how to make vermicompost at home?",
        "farmer_id": "+919876500111",
        "source": "web",
        "language": "English",
        "state": "Tamil Nadu",
        "domain": "Organic Farming",
        "confidence": 0.88,
        "best_match_id": None,
        "best_match_score": 0.12,
        "timestamp": datetime(2026, 7, 12, 11, 26, 25, tzinfo=timezone.utc),
        "status": "unanswered",
        "metadata": {},
    },
    # Noise/Off-Topic document that should be dropped
    {
        "_id": "6a5379dff7700a9ca2940a99",
        "query": "who won the cricket match today?",
        "query_hash": "offtopic123",
        "farmer_id": "+919876500000",
        "source": "web",
        "domain": "Off-topic",
        "confidence": 0.05,
        "timestamp": datetime(2026, 7, 12, 11, 26, 25, tzinfo=timezone.utc),
        "status": "unanswered",
        "is_off_topic": True,
    },
]

SAMPLE_GDB_ENTRIES = [
    {
        "_id": "gdb_pest_control_001",
        "question": "How to control aphids in mustard crop?",
        "answer": "Spray Imidacloprid 17.8 SL @ 1ml/3 liters of water.",
        "domain": "Pest Control",
        "language": "English",
        "state": "Rajasthan",
        "keywords": ["aphid", "mustard", "control"],
    },
    {
        "_id": "gdb_crop_disease_001",
        "question": "How to control powdery mildew in grapes?",
        "answer": "Apply fungicide containing Carbendazim.",
        "domain": "Crop Disease",
        "language": "English",
        "state": "Uttar Pradesh",
        "keywords": ["powdery", "mildew", "grapes"],
    },
]

SAMPLE_FLAGGED_ENTRIES = [
    {
        "_id": "6a525006f1694e01b5a7b609",
        "gdb_entry_id": "gdb_pest_control_001",
        "domain": "Pest Control",
        "language": "English",
        "helpfulness_score": 25.0,
        "status": "flagged",
    }
]


@pytest.fixture
async def mock_mongo_db():
    """Async mongomock database populated with sample test data."""
    client = AsyncMongoMockClient()
    db = client[settings.feedback_db_name]

    # Seed collections
    await db[settings.disclaimer_collection].insert_many(SAMPLE_DISCLAIMERS)
    await db[settings.gdb_entries_collection].insert_many(SAMPLE_GDB_ENTRIES)
    await db[settings.flagged_entries_collection].insert_many(SAMPLE_FLAGGED_ENTRIES)

    # Set as active MongoDB client
    MongoDB.client = client
    MongoDB.db = db

    yield db

    MongoDB.disconnect()
