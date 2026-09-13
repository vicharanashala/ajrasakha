from __future__ import annotations

import os

MONGO_URI = os.getenv("MONGO_URI")

DATABASE_NAME = os.getenv(
    "MONGO_DB_NAME",
    "agriai",
)

GDB_COLLECTION = os.getenv(
    "GDB_COLLECTION",
    "agriai_questions",
)

GAP_EVENTS_COLLECTION = os.getenv(
    "GAP_EVENTS_COLLECTION",
    "gap_events",
)

GAP_CLUSTER_COLLECTION = os.getenv(
    "GAP_CLUSTER_COLLECTION",
    "gap_clusters",
)

VECTOR_INDEX = os.getenv(
    "VECTOR_INDEX",
    "question_vector_index",
)