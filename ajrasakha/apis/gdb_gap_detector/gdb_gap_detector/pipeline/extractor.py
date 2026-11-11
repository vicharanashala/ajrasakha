from datetime import datetime, timedelta, timezone
import hashlib
import logging
from typing import Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from gdb_gap_detector.core import settings
from gdb_gap_detector.models import DisclaimerLog

logger = logging.getLogger("gdb_gap_detector.extractor")


def generate_query_hash(query: str) -> str:
    """Generate MD5 hash for query normalization if query_hash missing."""
    normalized = " ".join(query.strip().lower().split())
    return hashlib.md5(normalized.encode("utf-8")).hexdigest()


async def extract_disclaimer_queries(
    db: AsyncIOMotorDatabase,
    period_days: int | None = None,
    collection_name: str | None = None,
) -> tuple[list[DisclaimerLog], dict[str, dict[str, Any]]]:
    """Stage 1: Extract disclaimer queries from MongoDB, applying PII projection and noise filters.

    Returns:
        tuple containing:
        - list[DisclaimerLog]: Filtered disclaimer log objects (PII-stripped).
        - dict[str, dict[str, Any]]: Map of unique query hashes to aggregated metrics:
          {query_hash: {
              'query': str, 'count': int, 'first_seen': datetime, 'last_seen': datetime,
              'domains': set, 'states': set, 'languages': set, 'scores': list[float],
              'logs': list[DisclaimerLog]
          }}
    """
    days = period_days or settings.period_days
    coll_name = collection_name or settings.disclaimer_collection
    collection = db[coll_name]

    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
    logger.info(f"Extracting disclaimer logs from {coll_name} since {cutoff_date.isoformat()}")

    # Build Mongo query filter
    query_filter: dict[str, Any] = {
        "status": "unanswered",
    }
    # Optional date filter if timestamp exists
    date_filter = {"$gte": cutoff_date}
    query_filter["$or"] = [
        {"timestamp": date_filter},
        {"timestamp": {"$exists": False}},  # Defensive fallback for seeded data without timestamp
    ]

    # CRITICAL SECURITY DIRECTIVE: Strip farmer_id PII at projection level!
    projection = {"farmer_id": 0}

    cursor = collection.find(query_filter, projection)
    extracted_logs: list[DisclaimerLog] = []
    unique_map: dict[str, dict[str, Any]] = {}

    async for doc in cursor:
        # Convert Mongo _id to string
        if "_id" in doc:
            doc["_id"] = str(doc["_id"])

        # Pre-clustering Noise Filter Checks
        query_text = (doc.get("query") or "").strip()
        if len(query_text) < 5:
            continue

        if doc.get("is_off_topic") is True:
            continue

        domain_val = str(doc.get("domain") or "").strip()
        if domain_val.lower() in ["off-topic", "offtopic"]:
            continue

        confidence = doc.get("confidence")
        if confidence is not None and isinstance(confidence, (int, float)):
            if confidence < settings.noise_confidence_threshold:
                continue

        # Parse model safely
        try:
            log_item = DisclaimerLog(**doc)
        except Exception as err:
            logger.warning(f"Skipping malformed disclaimer doc {doc.get('_id')}: {err}")
            continue

        extracted_logs.append(log_item)

        # Deduplicate & Aggregate by query_hash
        q_hash = log_item.query_hash or generate_query_hash(log_item.query)
        ts = log_item.timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)

        if q_hash not in unique_map:
            unique_map[q_hash] = {
                "query_hash": q_hash,
                "query": log_item.query,
                "count": 0,
                "first_seen": ts,
                "last_seen": ts,
                "domains": set(),
                "states": set(),
                "languages": set(),
                "best_match_scores": [],
                "logs": [],
            }

        entry = unique_map[q_hash]
        entry["count"] += 1
        entry["first_seen"] = min(entry["first_seen"], ts)
        entry["last_seen"] = max(entry["last_seen"], ts)
        if log_item.domain:
            entry["domains"].add(log_item.domain)
        if log_item.state:
            entry["states"].add(log_item.state)
        if log_item.language:
            entry["languages"].add(log_item.language)
        if log_item.best_match_score is not None:
            entry["best_match_scores"].append(log_item.best_match_score)
        entry["logs"].append(log_item)

    logger.info(f"Extracted {len(extracted_logs)} disclaimer logs across {len(unique_map)} unique queries.")
    return extracted_logs, unique_map
