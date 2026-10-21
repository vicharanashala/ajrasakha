"""
FastAPI backend for the GDB Coverage Gap Detector.

GET /api/gap-report  - ranked list of top coverage gaps
GET /api/heatmap     - domain x state coverage %

Reads from MongoDB when MONGODB_URI is set, otherwise falls back to
synthetic demo data so this works before DB access is set up.
"""

from __future__ import annotations
import os
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.clustering import cluster_gap_questions, rank_gap_report, build_coverage_heatmap
from app.synthetic_data import generate_synthetic_questions, generate_synthetic_gdb_entry_counts

load_dotenv()

app = FastAPI(title="GDB Coverage Gap Detector")

# open CORS for local dev only, tighten this before any real deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

MONGODB_URI = os.getenv("MONGODB_URI", "").strip()
USING_REAL_DB = bool(MONGODB_URI)


def _fetch_disclaimer_questions() -> list[dict[str, Any]]:
    """
    Pulls disclaimer-triggered questions from gdb_gap_detector.raw_queries,
    filtered on disclaimer_triggered=True. That collection doesn't have a
    stored embedding field so we compute one locally per question (see
    embeddings.py).

    Doesn't touch gdb_gap_detector.clusters - that looks like it already
    has another student's computed output sitting in the same DB.
    """
    if not USING_REAL_DB:
        return generate_synthetic_questions(weeks_of_history=6, growth_topics=(0,))

    from pymongo import MongoClient
    from app.embeddings import compute_embeddings

    client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
    db = client["gdb_gap_detector"]

    raw = list(db.raw_queries.find(
        {"disclaimer_triggered": True},
        {"question": 1, "crop": 1, "state": 1, "domain": 1, "timestamp": 1},
    ))
    client.close()

    if not raw:
        return []

    texts = [doc.get("question", "") for doc in raw]
    vectors = compute_embeddings(texts)

    questions = []
    for doc, vector in zip(raw, vectors):
        timestamp = doc.get("timestamp")
        if timestamp and timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        questions.append({
            "question": doc.get("question", ""),
            "crop": doc.get("crop") or "Unknown",
            "state": doc.get("state") or "Unknown",
            "domain": doc.get("domain") or "Unknown",
            "embedding": vector,
            "created_at": timestamp or datetime.now(timezone.utc),
        })
    return questions


def _fetch_gdb_entry_counts() -> dict[tuple[str, str], int]:
    """
    Counts verified GDB entries per (domain, state) from
    farmer_feedback.gdb_entries, for the coverage ratio calculation.

    That collection has domain and state but no crop field, so this is
    domain+state grouping, not domain+state+crop. The gap report keeps
    crop detail separately since it comes from raw_queries which does
    have it.
    """
    if not USING_REAL_DB:
        return generate_synthetic_gdb_entry_counts()

    from pymongo import MongoClient
    client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
    db = client["farmer_feedback"]

    pipeline = [
        {"$group": {
            "_id": {"domain": "$domain", "state": "$state"},
            "count": {"$sum": 1},
        }},
    ]
    results = list(db.gdb_entries.aggregate(pipeline))
    client.close()

    counts: dict[tuple[str, str], int] = {}
    for row in results:
        domain = row["_id"].get("domain") or "Unknown"
        state = row["_id"].get("state") or "Unknown"
        counts[(domain, state)] = row["count"]
    return counts


@app.get("/api/health")
def health():
    return {"status": "ok", "using_real_db": USING_REAL_DB}


@app.get("/api/gap-report")
def gap_report(top_n: int = 20):
    questions = _fetch_disclaimer_questions()
    clusters = cluster_gap_questions(questions)
    ranked = rank_gap_report(clusters, top_n=top_n)
    return {
        "using_real_db": USING_REAL_DB,
        "total_disclaimer_questions_analyzed": len(questions),
        "gaps_found": len(clusters),
        "report": [
            {
                "rank": i + 1,
                "crop": c.crop,
                "state": c.state,
                "domain": c.domain,
                "farmer_count": c.total_count,
                "growth_rate": round(c.growth_rate, 2),
                "priority_score": round(c.priority_score(), 1),
                "sample_questions": c.sample_questions,
            }
            for i, c in enumerate(ranked)
        ],
    }


@app.get("/api/heatmap")
def heatmap():
    questions = _fetch_disclaimer_questions()
    gdb_entry_counts = _fetch_gdb_entry_counts()
    clusters = cluster_gap_questions(questions)
    return {
        "using_real_db": USING_REAL_DB,
        "cells": build_coverage_heatmap(clusters, gdb_entry_counts),
    }
