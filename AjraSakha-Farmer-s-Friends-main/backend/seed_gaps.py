#!/usr/bin/env python3
"""
Seed disclaimer logs to test the GDB Coverage Gap Detector
"""

import sys
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from datetime import datetime, timedelta
import random

from shared.mongodb import get_db
from services.disclaimer_tracker import tracker
from services.gap_detector import detector

db = get_db()

print("="*60)
print("GDB Coverage Gap Detector - Seeding Sample Data")
print("="*60)

# Sample disclaimer queries grouped by topic
DISCLAIMER_GROUPS = [
    {
        "topic": "Mustard aphid control",
        "queries": [
            "How to control aphids in mustard crop?",
            "Best pesticide for mustard aphid",
            "Aphid attack in mustard - treatment?",
            "How to manage mustard aphid organically?",
            "When to spray for mustard aphid?",
        ],
        "domain": "Pest Control",
        "states": ["Rajasthan", "Haryana", "Punjab"]
    },
    {
        "topic": "Banana bunchy top virus",
        "queries": [
            "What is the best treatment for banana bunchy top virus?",
            "How to identify banana bunchy top virus?",
            "Banana bunchy top disease control methods",
        ],
        "domain": "Crop Disease",
        "states": ["Tamil Nadu", "Kerala", "Maharashtra"]
    },
    {
        "topic": "Drip irrigation timing",
        "queries": [
            "Best time for drip irrigation in grapes",
            "Drip irrigation schedule for pomegranate",
            "How often to run drip irrigation in summer?",
            "Drip irrigation frequency for banana",
        ],
        "domain": "Irrigation",
        "states": ["Maharashtra", "Karnataka"]
    },
    {
        "topic": "Wheat yellow rust",
        "queries": [
            "Yellow rust in wheat - treatment",
            "How to control stripe rust in wheat?",
            "Wheat yellow rust fungicide",
            "Yellow rust symptoms in wheat",
        ],
        "domain": "Crop Disease",
        "states": ["Punjab", "Haryana", "Uttar Pradesh"]
    },
    {
        "topic": "Soil salinity management",
        "queries": [
            "How to reduce soil salinity?",
            "Salt affected soil reclamation",
            "Crops for saline soil",
            "Gypsum application for saline soil",
        ],
        "domain": "Soil Health",
        "states": ["Rajasthan", "Gujarat", "Haryana"]
    },
    {
        "topic": "Organic pest control",
        "queries": [
            "How to make organic pesticide at home?",
            "Neem oil preparation for pest control",
            "Organic farming pest management",
            "Best organic pesticide for vegetables",
        ],
        "domain": "Pest Control",
        "states": ["Maharashtra", "Karnataka", "Tamil Nadu"]
    },
    {
        "topic": "Drought-resistant crops",
        "queries": [
            "Best crops for drought conditions",
            "Drought resistant varieties of maize",
            "Crops that need less water",
            "Farming in drought prone areas",
        ],
        "domain": "Crop Selection",
        "states": ["Rajasthan", "Maharashtra", "Karnataka"]
    },
    {
        "topic": "Greenhouse cultivation",
        "queries": [
            "How to start greenhouse farming?",
            "Greenhouse tomato cultivation",
            "Polyhouse farming setup cost",
            "Greenhouse cucumber growing",
        ],
        "domain": "Protected Cultivation",
        "states": ["Maharashtra", "Karnataka"]
    },
    {
        "topic": "Vermicompost making",
        "queries": [
            "How to make vermicompost at home?",
            "Vermicompost preparation steps",
            "Best worms for vermicomposting",
            "Vermicompost unit setup cost",
        ],
        "domain": "Organic Farming",
        "states": ["Maharashtra", "Madhya Pradesh"]
    },
    {
        "topic": "Mango fruit fly",
        "queries": [
            "Mango fruit fly control methods",
            "How to trap fruit flies in mango?",
            "Fruit fly management in mango orchard",
        ],
        "domain": "Pest Control",
        "states": ["Maharashtra", "Gujarat", "Uttar Pradesh"]
    },
]

FARMER_IDS = [f"+91{farmer:010d}" for farmer in range(9876500000, 9876500100)]

print("\n📝 Seeding disclaimer logs...")

total_seeded = 0
for group in DISCLAIMER_GROUPS:
    domain = group["domain"]
    states = group["states"]

    # Each query in group gets multiple logs
    for query in group["queries"]:
        # Generate 3-8 logs per query
        num_logs = random.randint(3, 8)
        for _ in range(num_logs):
            days_ago = random.randint(0, 14)  # Last 2 weeks
            state = random.choice(states)

            # Use farmer ID
            farmer_id = random.choice(FARMER_IDS)

            # Log the disclaimer
            tracker.log_disclaimer(
                query=query,
                farmer_id=farmer_id,
                source=random.choice(["telegram", "web", "chat"]),
                language="English",
                state=state,
                domain=domain,
                confidence=random.uniform(0.1, 0.5),
                best_match_score=random.uniform(0.1, 0.5)
            )
            total_seeded += 1

print(f"✅ Seeded {total_seeded} disclaimer logs across {len(DISCLAIMER_GROUPS)} topics")

# Generate initial gap report
print("\n📊 Generating initial gap report...")
report = detector.generate_weekly_report(days=14, top_n=20)

print(f"\n✅ Report generated!")
print(f"   Total disclaimers analyzed: {report.get('total_disclaimers', 0)}")
print(f"   Clusters found: {report.get('clusters_found', 0)}")
print(f"   Top gaps identified: {len(report.get('top_gaps', []))}")

if report.get('top_gaps'):
    print("\n🔥 Top 5 Priority Gaps:")
    for i, gap in enumerate(report['top_gaps'][:5], 1):
        print(f"   {i}. {gap['cluster_name']} ({gap['priority_level']})")
        print(f"      Farmers affected: {gap['farmer_demand']}")
        print(f"      Action: {gap['recommended_action']}")
        print()

print("="*60)
print("Now visit http://localhost:3000/gaps to see the dashboard!")
print("="*60)