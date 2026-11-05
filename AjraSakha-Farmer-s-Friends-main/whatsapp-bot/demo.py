#!/usr/bin/env python3
"""
AjraSakha WhatsApp Bot - Demo Mode
Run this to test the feedback system without Twilio credentials.

This demo simulates farmer interactions with the WhatsApp bot.
"""

import sys
from pathlib import Path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from datetime import datetime, timedelta
import random
from shared.mongodb import get_db


FARMerS = [
    {"phone": "+919000000001", "name": "Ramesh Kumar", "state": "Maharashtra"},
    {"phone": "+919000000002", "name": "Suresh Patel", "state": "Gujarat"},
    {"phone": "+919000000003", "name": "Mahesh Reddy", "state": "Karnataka"},
    {"phone": "+919000000004", "name": "Ravi Singh", "state": "Punjab"},
    {"phone": "+919000000005", "name": "Anil Sharma", "state": "Haryana"},
]

SAMPLE_QUESTIONS = [
    "How to control powdery mildew in grapes?",
    "Best drip irrigation schedule for sugarcane",
    "How to control brown planthopper in rice?",
    "When to apply urea for wheat?",
    "How to protect crops from frost?",
]

FEEDBACK_OPTIONS = ["1", "2"]


def get_gdb_entries():
    db = get_db()
    return list(db.gdb_entries.find().limit(10))


def simulate_farmer_interaction(farmer, gdb_entry, db):
    """Simulate a farmer asking a question and providing feedback."""

    print(f"\n{'='*60}")
    print(f"👤 FARMER: {farmer['name']} ({farmer['phone']})")
    print(f"   State: {farmer['state']}")
    print(f"{'='*60}")

    # Simulate question
    print(f"\n📱 Farmer sends message:")
    print(f"   '{random.choice(SAMPLE_QUESTIONS)}'")

    # Get answer from GDB
    answer = gdb_entry.get("answer", "No answer found")[:200]
    print(f"\n🤖 Bot responds with answer from GDB entry:")
    print(f"   Entry ID: {gdb_entry['_id']}")
    print(f"   Domain: {gdb_entry.get('domain', 'N/A')}")
    print(f"   Answer: {answer}...")

    # Ask for feedback
    print(f"\n📋 Bot asks for feedback:")
    print(f"   'Was this helpful? Reply 1 for Yes, 2 for No'")

    # Simulate farmer response (70% helpful, 30% not helpful)
    is_helpful = random.random() < 0.7
    response = "1" if is_helpful else "2"

    print(f"\n📱 Farmer replies: {response}")
    print(f"   ({'Helpful ✓' if is_helpful else 'Not Helpful ✗'})")

    # Store feedback
    feedback_doc = {
        "gdb_entry_id": gdb_entry["_id"],
        "farmer_id": farmer["phone"],
        "message_id": f"demo_msg_{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "response": response,
        "state": farmer["state"],
        "language": gdb_entry.get("language", "English"),
        "domain": gdb_entry.get("domain"),
        "timestamp": datetime.utcnow(),
        "status": "captured"
    }

    db.feedback.insert_one(feedback_doc)

    print(f"\n✅ Feedback stored in MongoDB")
    print(f"   - GDB Entry: {gdb_entry['_id']}")
    print(f"   - Response: {response}")
    print(f"   - State: {farmer['state']}")

    return response == "1"


def run_demo(num_interactions=5):
    """Run the demo with specified number of farmer interactions."""

    print("\n" + "="*70)
    print("🌾  AJRASAKHA WhatsApp Bot - Demo Mode  🌾")
    print("="*70)
    print("\nThis demo simulates farmer interactions and collects feedback.")
    print(f"Will simulate {num_interactions} farmer interactions.\n")

    db = get_db()
    gdb_entries = get_gdb_entries()

    if not gdb_entries:
        print("❌ No GDB entries found. Please run seed_data.py first.")
        return

    print(f"Found {len(gdb_entries)} GDB entries in database.\n")

    stats = {"helpful": 0, "not_helpful": 0}

    for i in range(num_interactions):
        print(f"\n{'='*70}")
        print(f"INTERACTION {i+1}/{num_interactions}")
        print(f"{'='*70}")

        farmer = random.choice(FARMerS)
        gdb_entry = random.choice(gdb_entries)

        is_helpful = simulate_farmer_interaction(farmer, gdb_entry, db)
        if is_helpful:
            stats["helpful"] += 1
        else:
            stats["not_helpful"] += 1

    # Summary
    print(f"\n\n{'='*70}")
    print("📊 DEMO SUMMARY")
    print(f"{'='*70}")
    print(f"\nTotal interactions: {num_interactions}")
    print(f"Helpful (1): {stats['helpful']} ({stats['helpful']/num_interactions*100:.1f}%)")
    print(f"Not Helpful (2): {stats['not_helpful']} ({stats['not_helpful']/num_interactions*100:.1f}%)")

    # Check stats from database
    total = db.feedback.count_documents({})
    helpful = db.feedback.count_documents({"response": "1"})
    not_helpful = db.feedback.count_documents({"response": "2"})

    print(f"\n📈 Total feedback in database: {total}")
    print(f"   Helpful: {helpful}")
    print(f"   Not Helpful: {not_helpful}")

    print(f"\n{'='*70}")
    print("✅ Demo complete! Check the dashboard at http://localhost:3000")
    print(f"{'='*70}\n")


def show_current_stats():
    """Show current feedback statistics."""

    db = get_db()

    print("\n" + "="*60)
    print("📊 CURRENT FEEDBACK STATISTICS")
    print("="*60)

    total = db.feedback.count_documents({})
    helpful = db.feedback.count_documents({"response": "1"})
    not_helpful = db.feedback.count_documents({"response": "2"})

    print(f"\nTotal feedback: {total}")
    print(f"Helpful: {helpful} ({helpful/total*100:.1f}%)" if total > 0 else "Helpful: 0")
    print(f"Not Helpful: {not_helpful} ({not_helpful/total*100:.1f}%)" if total > 0 else "Not Helpful: 0")

    # Domain breakdown
    print("\n📂 By Domain:")
    pipeline = [
        {"$match": {"domain": {"$ne": None}}},
        {"$group": {"_id": "$domain", "count": {"$sum": 1}}}
    ]
    for doc in db.feedback.aggregate(pipeline):
        print(f"   {doc['_id']}: {doc['count']}")

    # State breakdown
    print("\n📍 By State:")
    pipeline = [
        {"$match": {"state": {"$ne": None}}},
        {"$group": {"_id": "$state", "count": {"$sum": 1}}}
    ]
    for doc in db.feedback.aggregate(pipeline):
        print(f"   {doc['_id']}: {doc['count']}")

    print("\n" + "="*60)


def interactive_mode():
    """Interactive mode for manual testing."""

    db = get_db()
    gdb_entries = get_gdb_entries()

    print("\n" + "="*60)
    print("🎮 INTERACTIVE MODE")
    print("="*60)
    print("\nChoose an option:")
    print("  1. Simulate random interaction")
    print("  2. Show current stats")
    print("  3. Add custom feedback")
    print("  4. Exit")

    while True:
        choice = input("\nEnter choice (1-4): ").strip()

        if choice == "1":
            farmer = random.choice(FARMerS)
            gdb_entry = random.choice(gdb_entries)
            simulate_farmer_interaction(farmer, gdb_entry, db)

        elif choice == "2":
            show_current_stats()

        elif choice == "3":
            print("\nCustom feedback:")
            entry_id = input("  GDB Entry ID: ").strip()
            response = input("  Response (1=helpful, 2=not helpful): ").strip()

            if entry_id and response in ["1", "2"]:
                db.feedback.insert_one({
                    "gdb_entry_id": entry_id,
                    "farmer_id": "+919000000000",
                    "message_id": f"custom_{datetime.now().strftime('%Y%m%d%H%M%S')}",
                    "response": response,
                    "state": "Demo",
                    "language": "English",
                    "domain": "Demo",
                    "timestamp": datetime.utcnow(),
                    "status": "captured"
                })
                print("  ✅ Feedback added!")

        elif choice == "4":
            print("Goodbye!")
            break


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="AjraSakha WhatsApp Bot Demo")
    parser.add_argument("--interactions", "-n", type=int, default=5,
                        help="Number of farmer interactions to simulate")
    parser.add_argument("--stats", "-s", action="store_true",
                        help="Show current stats and exit")
    parser.add_argument("--interactive", "-i", action="store_true",
                        help="Run in interactive mode")
    args = parser.parse_args()

    if args.stats:
        show_current_stats()
    elif args.interactive:
        interactive_mode()
    else:
        run_demo(args.interactions)