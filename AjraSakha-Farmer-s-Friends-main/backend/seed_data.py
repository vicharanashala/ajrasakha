import sys
from pathlib import Path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

import os
from datetime import datetime, timedelta
import random
from dotenv import load_dotenv

load_dotenv()

from shared.mongodb import get_db
from shared.utils import Config

STATES = ["Maharashtra", "Karnataka", "Punjab", "Haryana", "Tamil Nadu", "Uttar Pradesh", "Rajasthan", "Gujarat"]
LANGUAGES = ["English", "Hindi", "Marathi", "Kannada", "Tamil", "Punjabi", "Gujarati"]
DOMAINS = ["Crop Disease", "Irrigation", "Pest Control", "Fertilizers", "Weather", "Soil Health", "Harvesting", "Seeds"]
FARMer_IDS = [f"+91{farmer:010d}" for farmer in range(9000000000, 9000000100)]

QUESTIONS = {
    "Crop Disease": [
        "How to control powdery mildew in grapes?",
        "What is the best treatment for rice blast?",
        "My wheat crop has yellow spots, what to do?",
        "Cotton leaf curl virus treatment",
        "Tomato blight prevention methods"
    ],
    "Irrigation": [
        "Drip irrigation scheduling for sugarcane",
        "Best time to irrigate paddy fields",
        "Water saving techniques for drought",
        "Sprinkler system maintenance tips",
        "Flood irrigation vs drip irrigation"
    ],
    "Pest Control": [
        "How to control brown planthopper in rice?",
        "Pink bollworm management in cotton",
        "Natural pest control for vegetables",
        "Fruit fly traps effectiveness",
        "Armyworm control in maize"
    ],
    "Fertilizers": [
        "Urea application timing for wheat",
        "NPK ratio for sugarcane",
        "Organic fertilizer alternatives",
        "Micronutrient deficiency symptoms",
        "Vermicompost preparation method"
    ],
    "Weather": [
        "Ideal sowing time for kharif crops",
        "How to protect crops from frost?",
        "Monsoon prediction for farming",
        "Heat stress management in crops",
        "Rainfall pattern analysis"
    ],
    "Soil Health": [
        "Soil testing procedures",
        "pH adjustment for acidic soil",
        "Crop rotation benefits",
        "Organic matter addition methods",
        "Salt-affected soil reclamation"
    ],
    "Harvesting": [
        "Optimal harvest time for paddy",
        "Post-harvest loss reduction techniques",
        "Storage methods for grains",
        "Mechanical harvesting advantages",
        "Crop cutting experiment methodology"
    ],
    "Seeds": [
        "Certified seed identification",
        "Seed treatment for better germination",
        "Hybrid vs open-pollinated seeds",
        "Seed storage best practices",
        "Seed replacement rate guidelines"
    ]
}

ANSWERS = {
    "Crop Disease": [
        "Apply fungicide containing Carbendazim @ 0.5g/liter. Spray twice at 15-day interval. Remove infected plant parts.",
        "Use Tricyclazole 75% WP @ 0.6g/liter. Ensure proper drainage. Apply at disease onset.",
        "Apply Mancozeb 75% WP @ 2.5g/liter. Increase potassium application. Remove infected leaves.",
        "Use Imidacloprid 17.8% SL for vector control. Remove infected plants. Use resistant varieties.",
        "Apply Metalaxyl + Mancozeb @ 2.5g/liter. Improve air circulation. Avoid overhead irrigation."
    ],
    "Irrigation": [
        "Apply 4-6 irrigations for sugarcane. Critical stages: tillering, grand growth, maturity. Use tensiometer.",
        "Irrigate at 50% field capacity. Morning irrigation preferred. Avoid midday watering.",
        "Use micro-irrigation systems. Mulching to reduce evaporation. Harvest rainwater.",
        "Check sprinklers monthly. Clean filters regularly. Replace worn nozzles.",
        "Drip irrigation saves 40-60% water. Fertigation possible. Initial cost high but long-term benefits."
    ],
    "Pest Control": [
        "Apply Imidacloprid or Ethofenprox. Use light traps. Drain fields periodically.",
        "Apply Pyriproxyfen or Spinosad. Install pheromone traps. Remove crop residues.",
        "Use neem oil 5ml/liter. Introduce beneficial insects. IPM practices recommended.",
        "Use methyl eugenol traps. Remove fallen fruits. Bagging techniques effective.",
        "Apply Chlorantraniliprole. Use pheromone traps. Early morning spray effective."
    ],
    "Fertilizers": [
        "Apply in 2 doses: 50% basal, 50% at first node. Incorporate into soil. Avoid broadcast on foliage.",
        "Apply NPK 150:60:60 for sugarcane. Split nitrogen application. Add zinc sulfate.",
        "Use vermicompost 5t/ha. Farmyard manure 10t/ha. Green manuring effective.",
        "Zinc deficiency: Apply ZnSO4 25kg/ha. Iron deficiency: FeSO4 spray 0.5%.",
        "Use earthworms for vermicompost. Add crop residues. Maintain moisture 40-50%."
    ],
    "Weather": [
        "Kharif sowing: June-July with monsoon onset. Adjust based on local conditions.",
        "Use straw mulch. Irrigate before frost. Smoke screens help. Cover young plants.",
        "Follow IMD updates. Use weather-based agro advisories. Crop insurance recommended.",
        "Provide shade nets. Increase irrigation frequency. Spray anti-transpirants.",
        "Analyze last 10 years data. Use satellite images. Local observations important."
    ],
    "Soil Health": [
        "Collect samples from 15-20 spots in zigzag pattern. Air dry. Test at soil lab.",
        "Apply lime 2-3t/ha for pH 5.5. Dolomite for magnesium deficiency. Mix thoroughly.",
        "Follow 3-year rotation: cereals-legumes-oilseeds. Break disease cycles. Improve soil biology.",
        "Add organic matter 2-3% annually. Use cover crops. Reduce tillage operations.",
        "Apply gypsum 10t/ha for sodic soil. Add organic matter. Grow salt-tolerant varieties initially."
    ],
    "Harvesting": [
        "Harvest when moisture 20-22%. Golden yellow color. Grain hardens. Panicle bends.",
        "Winnow immediately. Dry to 12-14% moisture. Use hermetic storage. Avoid plastic bags.",
        "Use metal godowns. Dry before storage. Check moisture regularly. Use aeration.",
        "Mechanical harvest saves time. Adjust combine speed. Reduce losses below 5%.",
        "Random sampling method. 1m x 1m quadrate. Weigh produce. Calculate yield."
    ],
    "Seeds": [
        "Look for blue tag. Check certification. Buy from authorized dealers. Avoid loose seeds.",
        "Treat with Thiram 3g/kg or Carbendazim 2g/kg. Dry before sowing. Use organic coating.",
        "Hybrid: higher yield, cannot reuse. OP varieties: stable, can reuse. Choose based on resources.",
        "Store in cool, dry place. Use airtight containers. Add dry neem leaves. Check monthly.",
        "Replace 25% seed annually. Use certified seeds. Participate in seed programs."
    ]
}


def clear_existing_data():
    db = get_db()
    print("Clearing existing data...")
    db.feedback.delete_many({})
    db.message_tracking.delete_many({})
    db.flagged_entries.delete_many({})
    db.weekly_digest.delete_many({})
    db.gdb_entries.delete_many({})
    print("Cleared all collections")


def seed_gdb_entries():
    db = get_db()
    entries = []

    for domain in DOMAINS:
        for i, question in enumerate(QUESTIONS[domain]):
            entry = {
                "_id": f"gdb_{domain.lower().replace(' ', '_')}_{i+1:03d}",
                "question": question,
                "answer": ANSWERS[domain][i],
                "domain": domain,
                "language": random.choice(LANGUAGES),
                "state": random.choice(STATES),
                "keywords": question.lower().split()[:5],
                "created_at": datetime.utcnow() - timedelta(days=random.randint(30, 180)),
                "updated_at": datetime.utcnow() - timedelta(days=random.randint(0, 30))
            }
            entries.append(entry)

    db.gdb_entries.insert_many(entries)
    print(f"Created {len(entries)} GDB entries")
    return [e["_id"] for e in entries]


def seed_feedback(gdb_entry_ids):
    db = get_db()
    feedbacks = []
    now = datetime.utcnow()

    for entry_id in gdb_entry_ids:
        entry = db.gdb_entries.find_one({"_id": entry_id})
        if not entry:
            continue

        num_feedback = random.randint(5, 25)
        helpful_count = random.randint(1, num_feedback)

        feedback_responses = ["1"] * helpful_count + ["2"] * (num_feedback - helpful_count)
        random.shuffle(feedback_responses)

        for i, response in enumerate(feedback_responses):
            days_ago = random.randint(0, 60)
            feedback = {
                "_id": f"fb_{entry_id}_{i+1:04d}",
                "gdb_entry_id": entry_id,
                "farmer_id": random.choice(FARMer_IDS),
                "message_id": f"msg_{entry_id}_{i+1:04d}",
                "response": response,
                "state": entry.get("state", random.choice(STATES)),
                "language": entry.get("language", random.choice(LANGUAGES)),
                "domain": entry.get("domain"),
                "timestamp": now - timedelta(days=days_ago, hours=random.randint(0, 23)),
                "status": "captured"
            }
            feedbacks.append(feedback)

    if feedbacks:
        db.feedback.insert_many(feedbacks)
    print(f"Created {len(feedbacks)} feedback entries")


def seed_flagged_entries():
    db = get_db()
    flagged = []

    low_score_entries = [
        ("gdb_pest_control_003", 8, 2, 6, "Pest Control"),
        ("gdb_crop_disease_002", 12, 4, 8, "Crop Disease"),
        ("gdb_fertilizers_004", 15, 5, 10, "Fertilizers"),
    ]

    for entry_id, total, helpful, not_helpful, domain in low_score_entries:
        score = (helpful / total) * 100
        priority = (60 - score) * total

        doc = {
            "gdb_entry_id": entry_id,
            "domain": domain,
            "language": "English",
            "total_responses": total,
            "helpful_count": helpful,
            "not_helpful_count": not_helpful,
            "helpfulness_score": score,
            "priority_score": priority,
            "status": "flagged",
            "flagged_at": datetime.utcnow() - timedelta(days=random.randint(1, 7)),
            "last_feedback_at": datetime.utcnow() - timedelta(days=random.randint(0, 3)),
            "review_notes": None
        }
        flagged.append(doc)

    if flagged:
        db.flagged_entries.insert_many(flagged)
    print(f"Created {len(flagged)} flagged entries")


def seed_weekly_digest():
    db = get_db()
    now = datetime.utcnow()
    week_start = now - timedelta(days=now.weekday() + 7)
    week_end = week_start + timedelta(days=6, hours=23, minutes=59, seconds=59)

    pipeline = [
        {"$match": {"timestamp": {"$gte": week_start, "$lte": week_end}}},
        {"$group": {
            "_id": "$domain",
            "total": {"$sum": 1},
            "helpful": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}}
        }}
    ]
    domain_stats = list(db.feedback.aggregate(pipeline))

    total = sum(s["total"] for s in domain_stats)
    helpful = sum(s["helpful"] for s in domain_stats)

    digest = {
        "week_start": week_start,
        "week_end": week_end,
        "total_feedback_count": total,
        "total_helpful": helpful,
        "total_not_helpful": total - helpful,
        "overall_helpfulness_score": round((helpful / total) * 100, 2) if total > 0 else 0,
        "lowest_rated_entries": [
            {"gdb_entry_id": "gdb_pest_control_003", "domain": "Pest Control", "total_responses": 8, "helpfulness_score": 25.0},
            {"gdb_entry_id": "gdb_crop_disease_002", "domain": "Crop Disease", "total_responses": 12, "helpfulness_score": 33.33},
        ],
        "domain_breakdown": [
            {"name": s["_id"], "total_responses": s["total"], "helpful_count": s["helpful"], "not_helpful_count": s["total"] - s["helpful"], "helpfulness_score": round((s["helpful"]/s["total"])*100, 2)}
            for s in domain_stats
        ],
        "language_breakdown": [
            {"name": "English", "total_responses": total, "helpful_count": helpful, "not_helpful_count": total - helpful, "helpfulness_score": round((helpful/total)*100, 2)}
        ],
        "state_breakdown": [
            {"name": "Maharashtra", "total_responses": total//3, "helpful_count": helpful//3, "not_helpful_count": (total-helpful)//3, "helpfulness_score": round((helpful/total)*100, 2)}
        ],
        "created_at": now
    }

    db.weekly_digest.insert_one(digest)
    print(f"Created weekly digest for {week_start.date()} to {week_end.date()}")


def main():
    print("="*60)
    print("AjraSakha Farmer Feedback - Synthetic Data Seeder")
    print("="*60)

    clear_existing_data()
    gdb_entry_ids = seed_gdb_entries()
    seed_feedback(gdb_entry_ids)
    seed_flagged_entries()
    seed_weekly_digest()

    print("="*60)
    print("Synthetic data created successfully!")
    print("="*60)
    print(f"\nGDB Entries: {len(gdb_entry_ids)}")
    print(f"States: {', '.join(STATES)}")
    print(f"Languages: {', '.join(LANGUAGES)}")
    print(f"Domains: {', '.join(DOMAINS)}")
    print("\nNext steps:")
    print("1. Start backend: cd backend && uvicorn main:app --reload --port 8000")
    print("2. Start frontend: cd frontend && npm start")
    print("3. Open http://localhost:3000 to view dashboard")


if __name__ == "__main__":
    main()