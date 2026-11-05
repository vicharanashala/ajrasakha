import sys
from pathlib import Path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from datetime import datetime
from shared.mongodb import get_db
from shared.utils import Config


def flag_low_rated_entries():
    print(f"[{datetime.utcnow()}] Running auto-flag cron job...")

    db = get_db()

    pipeline = [
        {"$group": {
            "_id": "$gdb_entry_id",
            "total_responses": {"$sum": 1},
            "helpful_count": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}},
            "not_helpful_count": {"$sum": {"$cond": [{"$eq": ["$response", "2"]}, 1, 0]}},
            "helpfulness_score": {
                "$avg": {"$cond": [{"$eq": ["$response", "1"]}, 100, 0]}
            },
            "domain": {"$first": "$domain"},
            "language": {"$first": "$language"},
            "last_feedback_at": {"$max": "$timestamp"}
        }},
        {"$match": {
            "total_responses": {"$gte": Config.AUTO_FLAG_MIN_RESPONSES},
            "helpfulness_score": {"$lt": Config.AUTO_FLAG_THRESHOLD * 100}
        }}
    ]

    low_rated = list(db.feedback.aggregate(pipeline))

    flagged_count = 0
    for entry in low_rated:
        priority_score = (Config.AUTO_FLAG_THRESHOLD * 100 - entry["helpfulness_score"]) * entry["total_responses"]

        existing = db.flagged_entries.find_one({"gdb_entry_id": entry["_id"]})

        if existing:
            if existing["status"] == "resolved":
                db.flagged_entries.update_one(
                    {"gdb_entry_id": entry["_id"]},
                    {"$set": {
                        "status": "flagged",
                        "total_responses": entry["total_responses"],
                        "helpful_count": entry["helpful_count"],
                        "not_helpful_count": entry["not_helpful_count"],
                        "helpfulness_score": entry["helpfulness_score"],
                        "priority_score": priority_score,
                        "flagged_at": datetime.utcnow(),
                        "last_feedback_at": entry["last_feedback_at"]
                    }}
                )
                flagged_count += 1
        else:
            db.flagged_entries.insert_one({
                "gdb_entry_id": entry["_id"],
                "domain": entry.get("domain"),
                "language": entry.get("language"),
                "total_responses": entry["total_responses"],
                "helpful_count": entry["helpful_count"],
                "not_helpful_count": entry["not_helpful_count"],
                "helpfulness_score": entry["helpfulness_score"],
                "priority_score": priority_score,
                "status": "flagged",
                "flagged_at": datetime.utcnow(),
                "last_feedback_at": entry["last_feedback_at"],
                "review_notes": None
            })
            flagged_count += 1

    print(f"[{datetime.utcnow()}] Flagged {flagged_count} entries for re-review")
    return flagged_count


if __name__ == "__main__":
    flag_low_rated_entries()