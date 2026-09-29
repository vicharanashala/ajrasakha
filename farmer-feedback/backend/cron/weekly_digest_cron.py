import sys
from pathlib import Path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from datetime import datetime, timedelta
from shared.mongodb import get_db


def generate_weekly_digest():
    print(f"[{datetime.utcnow()}] Generating weekly digest...")

    db = get_db()

    today = datetime.utcnow()
    week_start = today - timedelta(days=today.weekday() + 7)
    week_end = week_start + timedelta(days=6, hours=23, minutes=59, seconds=59)

    week_feedback = list(db.feedback.find({
        "timestamp": {"$gte": week_start, "$lte": week_end}
    }))

    total = len(week_feedback)
    if total == 0:
        print(f"No feedback received this week")
        return None

    helpful = sum(1 for f in week_feedback if f["response"] == "1")
    not_helpful = sum(1 for f in week_feedback if f["response"] == "2")

    domain_breakdown = _get_breakdown(week_feedback, "domain")
    language_breakdown = _get_breakdown(week_feedback, "language")
    state_breakdown = _get_breakdown(week_feedback, "state")

    entry_scores = {}
    for f in week_feedback:
        eid = f["gdb_entry_id"]
        if eid not in entry_scores:
            entry_scores[eid] = {"total": 0, "helpful": 0, "domain": f.get("domain")}
        entry_scores[eid]["total"] += 1
        if f["response"] == "1":
            entry_scores[eid]["helpful"] += 1

    lowest_rated = []
    for eid, data in entry_scores.items():
        score = (data["helpful"] / data["total"]) * 100 if data["total"] > 0 else 0
        lowest_rated.append({
            "gdb_entry_id": eid,
            "domain": data.get("domain"),
            "total_responses": data["total"],
            "helpfulness_score": round(score, 2)
        })

    lowest_rated.sort(key=lambda x: x["helpfulness_score"])
    lowest_rated = lowest_rated[:10]

    digest = {
        "week_start": week_start,
        "week_end": week_end,
        "total_feedback_count": total,
        "total_helpful": helpful,
        "total_not_helpful": not_helpful,
        "overall_helpfulness_score": round((helpful / total) * 100, 2),
        "lowest_rated_entries": lowest_rated,
        "domain_breakdown": domain_breakdown,
        "language_breakdown": language_breakdown,
        "state_breakdown": state_breakdown,
        "created_at": datetime.utcnow()
    }

    result = db.weekly_digest.insert_one(digest)

    print(f"[{datetime.utcnow()}] Weekly digest created: {result.inserted_id}")
    return str(result.inserted_id)


def _get_breakdown(feedback_list, field):
    counts = {}
    for f in feedback_list:
        val = f.get(field)
        if val:
            if val not in counts:
                counts[val] = {"total": 0, "helpful": 0}
            counts[val]["total"] += 1
            if f["response"] == "1":
                counts[val]["helpful"] += 1

    breakdown = []
    for val, data in counts.items():
        score = (data["helpful"] / data["total"]) * 100 if data["total"] > 0 else 0
        breakdown.append({
            "name": val,
            "total_responses": data["total"],
            "helpful_count": data["helpful"],
            "not_helpful_count": data["total"] - data["helpful"],
            "helpfulness_score": round(score, 2)
        })

    breakdown.sort(key=lambda x: x["total_responses"], reverse=True)
    return breakdown


if __name__ == "__main__":
    generate_weekly_digest()