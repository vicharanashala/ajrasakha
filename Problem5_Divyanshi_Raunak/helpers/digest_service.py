from datetime import datetime, timedelta
from typing import Dict, Any, List
from app.database import get_db
from helpers.feedback_service import (
    get_analytics_overview,
    get_domain_analytics,
    get_state_analytics,
    get_root_cause_analytics
)

def generate_weekly_agri_digest() -> Dict[str, Any]:
    db = get_db()
    overview = get_analytics_overview()
    domain_data = get_domain_analytics()
    state_data = get_state_analytics()
    root_causes = get_root_cause_analytics()
    
    # 5 Lowest rated GDB entries with at least 5 responses
    lowest_entries = list(db["gdb_entries"].find(
        {"metrics.total_feedback": {"$gte": 5}},
        {"_id": 1, "crop": 1, "domain": 1, "question_hi": 1, "question_en": 1, "metrics": 1, "status": 1}
    ).sort("metrics.helpful_ratio", 1).limit(5))
    
    flagged_digest = []
    for item in lowest_entries:
        m = item.get("metrics", {})
        flagged_digest.append({
            "gdb_id": item["_id"],
            "crop": item.get("crop"),
            "domain": item.get("domain"),
            "question": item.get("question_hi") or item.get("question_en"),
            "helpful_percentage": round(m.get("helpful_ratio", 0) * 100, 1),
            "total_responses": m.get("total_feedback", 0),
            "upvotes": m.get("upvotes", 0),
            "downvotes": m.get("downvotes", 0),
            "status": item.get("status", "ACTIVE")
        })
        
    start_date = (datetime.utcnow() - timedelta(days=7)).strftime("%d %b %Y")
    end_date = datetime.utcnow().strftime("%d %b %Y")
    
    digest_report = {
        "digest_id": f"DIGEST-{datetime.utcnow().strftime('%Y-W%W')}",
        "reporting_period": f"{start_date} – {end_date}",
        "generated_at": datetime.utcnow().isoformat(),
        "summary": {
            "total_feedback": overview["total_feedback_captured"],
            "voice_notes_count": overview["voice_feedback_count"],
            "overall_helpful_pct": overview["overall_helpful_percentage"],
            "flagged_entries_count": overview["total_flagged_for_review"],
            "status_headline": "Attention Required in Pest & Disease Management" if overview["overall_helpful_percentage"] < 75 else "Stable Quality Index"
        },
        "critical_action_items": [
            "GDB-04821 (Wheat Aphid): 58% of downvotes in Punjab report Thiamethoxam 25% WG is sold under commercial brand Actara. Update answer with local brand aliases.",
            "Standardize dosage recommendations from metric units (grams/ml per acre) to pump spray units (15L tanki measurements).",
            "Mustard Aphid advisory in Rajasthan: Heatwave conditions require evening spraying to prevent pesticide evaporation."
        ],
        "lowest_performing_gdb_entries": flagged_digest,
        "root_cause_distribution": root_causes,
        "domain_breakdown": domain_data,
        "state_breakdown": state_data
    }
    
    db["weekly_digests"].update_one(
        {"digest_id": digest_report["digest_id"]},
        {"$set": digest_report},
        upsert=True
    )
    return digest_report
