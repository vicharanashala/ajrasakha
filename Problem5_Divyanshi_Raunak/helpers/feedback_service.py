from typing import Dict, Any, List
from app.database import get_db

def get_analytics_overview() -> Dict[str, Any]:
    db = get_db()
    total_gdb = db["gdb_entries"].count_documents({})
    total_fb = db["farmer_feedback"].count_documents({})
    flagged = db["gdb_entries"].count_documents({
        "$or": [
            {"status": {"$in": ["FLAGGED", "FLAGGED_REVIEW"]}},
            {"flag_info.review_status": {"$in": ["PENDING_REVIEW", "PENDING_AGRI_REVIEW"]}},
            {"is_flagged": True}
        ],
        "flag_info.is_resolved": {"$ne": True},
        "status": {"$nin": ["RE_VALIDATED", "RESOLVED", "RETIRED"]}
    })
    voice_count = db["farmer_feedback"].count_documents({"input_channel": "WHATSAPP_VOICE"})
    
    pipeline = [
        {
            "$group": {
                "_id": None,
                "total_upvotes": {"$sum": {"$cond": [{"$eq": ["$rating", 1]}, 1, 0]}},
                "total_downvotes": {"$sum": {"$cond": [{"$eq": ["$rating", 2]}, 1, 0]}}
            }
        }
    ]
    fb_agg = list(db["farmer_feedback"].aggregate(pipeline))
    upvotes = fb_agg[0]["total_upvotes"] if fb_agg else 0
    downvotes = fb_agg[0]["total_downvotes"] if fb_agg else 0
    tot = upvotes + downvotes
    overall_ratio = round(upvotes / tot, 3) if tot > 0 else 0.0
    
    return {
        "total_gdb_entries": total_gdb,
        "total_feedback_captured": total_fb,
        "voice_feedback_count": voice_count,
        "overall_upvotes": upvotes,
        "overall_downvotes": downvotes,
        "overall_helpful_ratio": overall_ratio,
        "overall_helpful_percentage": round(overall_ratio * 100, 1),
        "total_flagged_for_review": flagged,
        "active_threshold": 0.60,
        "min_response_criteria": 10
    }

def get_domain_analytics() -> List[Dict[str, Any]]:
    db = get_db()
    pipeline = [
        {
            "$lookup": {
                "from": "gdb_entries",
                "localField": "gdb_id",
                "foreignField": "_id",
                "as": "gdb"
            }
        },
        {"$unwind": "$gdb"},
        {
            "$group": {
                "_id": "$gdb.domain",
                "total_feedbacks": {"$sum": 1},
                "upvotes": {"$sum": {"$cond": [{"$eq": ["$rating", 1]}, 1, 0]}},
                "downvotes": {"$sum": {"$cond": [{"$eq": ["$rating", 2]}, 1, 0]}}
            }
        },
        {"$sort": {"total_feedbacks": -1}}
    ]
    results = list(db["farmer_feedback"].aggregate(pipeline))
    analytics = []
    for r in results:
        tot = r["total_feedbacks"]
        up = r["upvotes"]
        down = r["downvotes"]
        ratio = round(up / tot, 3) if tot > 0 else 0
        analytics.append({
            "domain": r["_id"] or "General Agronomy",
            "total_feedbacks": tot,
            "upvotes": up,
            "downvotes": down,
            "helpful_percentage": round(ratio * 100, 1)
        })
    return analytics

def get_state_analytics() -> List[Dict[str, Any]]:
    db = get_db()
    pipeline = [
        {
            "$group": {
                "_id": "$farmer_state",
                "total_feedbacks": {"$sum": 1},
                "upvotes": {"$sum": {"$cond": [{"$eq": ["$rating", 1]}, 1, 0]}},
                "downvotes": {"$sum": {"$cond": [{"$eq": ["$rating", 2]}, 1, 0]}}
            }
        },
        {"$sort": {"total_feedbacks": -1}}
    ]
    results = list(db["farmer_feedback"].aggregate(pipeline))
    analytics = []
    for r in results:
        tot = r["total_feedbacks"]
        up = r["upvotes"]
        ratio = round(up / tot, 3) if tot > 0 else 0
        analytics.append({
            "state": r["_id"] or "Other",
            "total_feedbacks": tot,
            "upvotes": up,
            "downvotes": r["downvotes"],
            "helpful_percentage": round(ratio * 100, 1)
        })
    return analytics

def get_root_cause_analytics() -> List[Dict[str, Any]]:
    db = get_db()
    pipeline = [
        {"$match": {"rating": 2, "root_cause_category": {"$ne": None}}},
        {
            "$group": {
                "_id": "$root_cause_category",
                "count": {"$sum": 1}
            }
        },
        {"$sort": {"count": -1}}
    ]
    labels = {
        "TOO_TECHNICAL": "Language Too Technical / Academic Jargon",
        "MEDICINE_UNAVAILABLE_LOCALLY": "Medicine Not Available in Local Shops",
        "UNCLEAR_DOSAGE": "Dosage / Tank Measurement Unclear",
        "INEFFECTIVE": "Treatment Ineffective Against Pest/Disease"
    }
    results = list(db["farmer_feedback"].aggregate(pipeline))
    tot = sum(r["count"] for r in results) or 1
    return [
        {
            "category": r["_id"],
            "label": labels.get(r["_id"], r["_id"]),
            "count": r["count"],
            "percentage": round((r["count"] / tot) * 100, 1)
        }
        for r in results
    ]
