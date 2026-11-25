"""MongoDB access. `mongomock://` gives an in-memory DB for demos and tests."""
from __future__ import annotations

from functools import lru_cache

from .config import settings


@lru_cache(maxsize=1)
def get_client():
    if settings.mongo_uri.startswith("mongomock://"):
        import mongomock

        return mongomock.MongoClient()
    from pymongo import MongoClient

    return MongoClient(settings.mongo_uri, serverSelectionTimeoutMS=8000, tz_aware=True)


def get_db():
    return get_client()[settings.mongo_db]


def is_demo() -> bool:
    return settings.mongo_uri.startswith("mongomock://")


def get_out_db():
    return get_client()[settings.out_db or settings.mongo_db]


def get_source_db():
    name = settings.source_db if settings.source_mode == "disclaimer_logs" else settings.mongo_db
    return get_client()[name]
