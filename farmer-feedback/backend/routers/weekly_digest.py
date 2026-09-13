import sys
from pathlib import Path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query
from shared.mongodb import get_db

router = APIRouter()


@router.get("/latest")
def get_latest_digest():
    db = get_db()

    digest = db.weekly_digest.find_one({}, sort=[("created_at", -1)])

    if not digest:
        raise HTTPException(status_code=404, detail="No weekly digest found")

    return _format_digest(digest)


@router.get("/")
def get_digests(
    limit: int = 10,
    offset: int = 0
):
    db = get_db()

    digests = list(
        db.weekly_digest.find({})
        .sort("week_start", -1)
        .skip(offset)
        .limit(limit)
    )

    return [_format_digest(d) for d in digests]


@router.get("/by-week")
def get_digest_by_week(week_start: str, week_end: str):
    db = get_db()

    try:
        start = datetime.strptime(week_start, "%Y-%m-%d")
        end = datetime.strptime(week_end, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    digest = db.weekly_digest.find_one({
        "week_start": start,
        "week_end": end
    })

    if not digest:
        raise HTTPException(status_code=404, detail="No digest found for this week")

    return _format_digest(digest)


def _format_digest(digest: dict) -> dict:
    return {
        "id": str(digest["_id"]),
        "week_start": digest["week_start"],
        "week_end": digest["week_end"],
        "total_feedback_count": digest["total_feedback_count"],
        "total_helpful": digest["total_helpful"],
        "total_not_helpful": digest["total_not_helpful"],
        "overall_helpfulness_score": digest["overall_helpfulness_score"],
        "lowest_rated_entries": digest.get("lowest_rated_entries", []),
        "domain_breakdown": digest.get("domain_breakdown", []),
        "language_breakdown": digest.get("language_breakdown", []),
        "state_breakdown": digest.get("state_breakdown", []),
        "created_at": digest["created_at"]
    }