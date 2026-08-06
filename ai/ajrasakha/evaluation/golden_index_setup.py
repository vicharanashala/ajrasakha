"""Golden DB Atlas Search index readiness and creation helpers.

The evaluation dashboard uses these helpers to show whether live GDB
retrieval is ready. Creating indexes is explicit; importing this module never
modifies MongoDB.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from dotenv import load_dotenv

load_dotenv()


DEFAULT_DATABASE = "agriai"
QUESTIONS_COLLECTION = "questions"
ANSWERS_COLLECTION = "answers"
QUESTION_VECTOR_INDEX = "review_questions_vector_index"
ANSWER_VECTOR_INDEX = "review_answers_vector_index"
QUESTION_TEXT_INDEX = "review_questions_search_index"
VECTOR_DIMENSIONS = 1024


@dataclass(frozen=True)
class RequiredSearchIndex:
    """Atlas Search index definition required by Golden DB retrieval."""

    collection: str
    name: str
    kind: str
    definition: dict[str, Any]


REQUIRED_INDEXES = [
    RequiredSearchIndex(
        collection=QUESTIONS_COLLECTION,
        name=QUESTION_VECTOR_INDEX,
        kind="vectorSearch",
        definition={
            "fields": [
                {
                    "type": "vector",
                    "path": "embedding",
                    "numDimensions": VECTOR_DIMENSIONS,
                    "similarity": "cosine",
                },
                {"type": "filter", "path": "status"},
                {"type": "filter", "path": "details.normalised_crop"},
                {"type": "filter", "path": "details.state"},
                {"type": "filter", "path": "details.season"},
                {"type": "filter", "path": "details.domain"},
            ]
        },
    ),
    RequiredSearchIndex(
        collection=ANSWERS_COLLECTION,
        name=ANSWER_VECTOR_INDEX,
        kind="vectorSearch",
        definition={
            "fields": [
                {
                    "type": "vector",
                    "path": "embedding",
                    "numDimensions": VECTOR_DIMENSIONS,
                    "similarity": "cosine",
                },
                {"type": "filter", "path": "questionId"},
                {"type": "filter", "path": "isFinalAnswer"},
            ]
        },
    ),
    RequiredSearchIndex(
        collection=QUESTIONS_COLLECTION,
        name=QUESTION_TEXT_INDEX,
        kind="search",
        definition={
            "mappings": {
                "dynamic": False,
                "fields": {
                    "question": {"type": "string"},
                    "text": {"type": "string"},
                    "status": {"type": "string"},
                    "details": {
                        "type": "document",
                        "fields": {
                            "normalised_crop": {"type": "string"},
                            "state": {"type": "string"},
                            "season": {"type": "string"},
                            "domain": {"type": "string"},
                        },
                    },
                },
            }
        },
    ),
]


def golden_index_env_values() -> dict[str, str]:
    """Return env values consumed by Golden DB retrieval."""

    return {
        "GOLDEN_MONGODB_DATABASE": os.getenv("GOLDEN_MONGODB_DATABASE", DEFAULT_DATABASE),
        "GOLDEN_MONGODB_INDEX": os.getenv("GOLDEN_MONGODB_INDEX", QUESTION_VECTOR_INDEX),
        "GOLDEN_MONGODB_ANSWERS_INDEX": os.getenv(
            "GOLDEN_MONGODB_ANSWERS_INDEX",
            ANSWER_VECTOR_INDEX,
        ),
        "GOLDEN_MONGODB_SEARCH_INDEX": os.getenv(
            "GOLDEN_MONGODB_SEARCH_INDEX",
            QUESTION_TEXT_INDEX,
        ),
    }


def _pymongo():
    try:
        from pymongo import MongoClient
        from pymongo.operations import SearchIndexModel
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "pymongo is required for Golden DB index checks. "
            "Install project dependencies before checking or creating indexes."
        ) from exc
    return MongoClient, SearchIndexModel


def _client(uri: str | None = None):
    mongo_uri = uri or os.getenv("GOLDEN_MONGODB_URI") or os.getenv("MONGODB_URI")
    if not mongo_uri:
        raise RuntimeError("GOLDEN_MONGODB_URI is not set")
    MongoClient, _ = _pymongo()
    return MongoClient(mongo_uri, serverSelectionTimeoutMS=15000)


def list_existing_search_indexes(uri: str | None = None, database: str | None = None) -> dict[str, list[str]]:
    """List Atlas Search index names for each required Golden DB collection."""

    db_name = database or golden_index_env_values()["GOLDEN_MONGODB_DATABASE"]
    client = _client(uri)
    db = client[db_name]
    existing: dict[str, list[str]] = {}

    for collection in sorted({item.collection for item in REQUIRED_INDEXES}):
        existing[collection] = [
            str(index.get("name"))
            for index in db[collection].list_search_indexes()
            if index.get("name")
        ]

    return existing


def golden_index_readiness(uri: str | None = None, database: str | None = None) -> dict[str, Any]:
    """Return a human-readable readiness payload for required Golden DB indexes."""

    env_values = golden_index_env_values()
    db_name = database or env_values["GOLDEN_MONGODB_DATABASE"]
    existing = list_existing_search_indexes(uri=uri, database=db_name)
    required = [
        {
            "collection": item.collection,
            "name": item.name,
            "kind": item.kind,
            "exists": item.name in existing.get(item.collection, []),
        }
        for item in REQUIRED_INDEXES
    ]
    missing = [item for item in required if not item["exists"]]

    return {
        "database": db_name,
        "env": env_values,
        "collections": existing,
        "required_indexes": required,
        "ready": not missing,
        "missing_indexes": missing,
    }


def create_required_search_indexes(uri: str | None = None, database: str | None = None) -> dict[str, Any]:
    """Create missing Atlas Search indexes required by Golden DB retrieval."""

    db_name = database or golden_index_env_values()["GOLDEN_MONGODB_DATABASE"]
    _, SearchIndexModel = _pymongo()
    client = _client(uri)
    db = client[db_name]
    existing = list_existing_search_indexes(uri=uri, database=db_name)
    created: list[dict[str, str]] = []
    skipped: list[dict[str, str]] = []

    for item in REQUIRED_INDEXES:
        if item.name in existing.get(item.collection, []):
            skipped.append({"collection": item.collection, "name": item.name})
            continue

        model = SearchIndexModel(
            definition=item.definition,
            name=item.name,
            type=item.kind,
        )
        db[item.collection].create_search_index(model)
        created.append({"collection": item.collection, "name": item.name})

    return {
        "database": db_name,
        "created": created,
        "skipped_existing": skipped,
    }
