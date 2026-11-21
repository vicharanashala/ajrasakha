"""Source adapters: turn the platform's collections into the pipeline's normalised row shape.

questions        - reviewer-app `questions` collection (chatbot-originated sources).
disclaimer_logs  - `farmer_feedback.disclaimer_logs` (explicit log of disclaimer-triggered queries)
                   + `gdb_entries` (what the GDB can already answer).
"""
from __future__ import annotations

import re
from collections import Counter
from datetime import datetime, timedelta

from .config import settings
from .normalize import UNKNOWN, classify_intent, infer_crop, norm_crop, norm_domain, norm_state


def _utc(d):
    from .pipeline import _utc as u
    return u(d)


def _key(text: str) -> str:
    return re.sub(r"\W+", " ", (text or "").lower()).strip()


def latest_timestamp(src) -> datetime | None:
    if settings.source_mode == "disclaimer_logs":
        doc = src[settings.source_collection].find_one({}, {"timestamp": 1}, sort=[("timestamp", -1)])
        return _utc(doc["timestamp"]) if doc else None
    doc = src[settings.questions_collection].find_one({}, {"createdAt": 1}, sort=[("createdAt", -1)])
    return _utc(doc["createdAt"]) if doc else None


def gdb_covered_questions(src) -> list[dict]:
    """GDB entries that can actually answer farmers (curated, approved or published; not awaiting review)."""
    cur = src[settings.gdb_collection].find({"status": {"$nin": ["pending_review", "rejected"]}})
    return [d for d in cur if d.get("question")]


def extract_disclaimer_logs(src, now: datetime) -> list[dict]:
    since = now - timedelta(days=settings.lookback_days)
    covered = {_key(d["question"]) for d in gdb_covered_questions(src)}
    rows = []
    for d in src[settings.source_collection].find({"timestamp": {"$gte": since - timedelta(days=1), "$lte": now + timedelta(days=1)}}):
        ts = _utc(d.get("timestamp"))
        text = (d.get("query") or "").strip()
        if not ts or not text or ts < since:
            continue
        if d.get("is_off_topic") or str(d.get("domain", "")).lower() == "off-topic":
            continue
        if d.get("source") in settings.ignored_log_sources:
            continue
        hit = _key(text) in covered
        rows.append({
            "id": str(d["_id"]), "text": text, "created": ts,
            "status": "closed" if hit else "open",  # open == still unanswered
            "source": str(d.get("source", "")),
            "crop": infer_crop(text), "state": norm_state(d.get("state")), "district": "Unknown",
            "domain": norm_domain(d.get("domain")), "intent": classify_intent(text),
        })
    return rows


def extract_gdb_cells_from_entries(src) -> Counter:
    cells: Counter = Counter()
    for d in gdb_covered_questions(src):
        cells[(infer_crop(d["question"]), norm_state(d.get("state")), norm_domain(d.get("domain")))] += 1
    return cells
