"""
Seed script for Farmer Feedback System
Pulls real question/answer pairs from original DB and generates
synthetic feedback with varied helpful/not-helpful splits.

Run: python3 seed.py
Make sure the FastAPI server is running first.
"""

import asyncio
import httpx
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os
import random

load_dotenv()

ORIGINAL_DB_URL = os.getenv("ORIGINAL_DB_URL")
ORIGINAL_DB_NAME = os.getenv("ORIGINAL_DB_NAME", "agriai")
API_BASE = "http://localhost:8000"

LANGUAGES = ["hindi", "english", "kannada", "tamil", "punjabi", "telugu"]
PHONES = [
    "919876543210", "918830025338", "917654321098",
    "916543210987", "915432109876", "914321098765"
]

# Helpfulness splits per answer index
# (helpful_count, not_helpful_count) — varied deliberately
SPLITS = [
    (8, 2),   # 80% — good
    (7, 3),   # 70% — good
    (6, 4),   # 60% — borderline
    (3, 7),   # 30% — bad, should be flagged
    (2, 8),   # 20% — very bad, should be flagged
    (1, 9),   # 10% — worst, should be flagged
    (9, 1),   # 90% — great
    (5, 5),   # 50% — bad, should be flagged
    (4, 6),   # 40% — bad
    (10, 0),  # 100% — perfect
]

async def get_real_pairs():
    """Pull real question/answer pairs from original DB."""
    client = AsyncIOMotorClient(ORIGINAL_DB_URL)
    db = client[ORIGINAL_DB_NAME]

    pairs = []

    # Try approved final answers first
    cursor = db["answers"].find(
        {"isFinalAnswer": True, "status": "approved"},
        {"_id": 1, "questionId": 1}
    ).limit(10)

    async for answer in cursor:
        question = await db["questions"].find_one(
            {"_id": answer["questionId"]},
            {"_id": 1, "question": 1, "details": 1}
        )
        if question:
            pairs.append({
                "question_id": str(question["_id"]),
                "answer_id": str(answer["_id"]),
                "question_text": question.get("question", "")[:80]
            })

    # Fall back to any answers if not enough
    if len(pairs) < 3:
        cursor = db["answers"].find({}, {"_id": 1, "questionId": 1}).limit(10)
        async for answer in cursor:
            question = await db["questions"].find_one(
                {"_id": answer["questionId"]},
                {"_id": 1, "question": 1, "details": 1}
            )
            if question:
                pair = {
                    "question_id": str(question["_id"]),
                    "answer_id": str(answer["_id"]),
                    "question_text": question.get("question", "")[:80]
                }
                if pair not in pairs:
                    pairs.append(pair)

    client.close()
    return pairs

async def clear_existing():
    """Clear all existing feedback from own cluster."""
    async with httpx.AsyncClient() as client:
        # Check current count
        res = await client.get(f"{API_BASE}/feedback/count")
        count = res.json()["total"]
        if count > 0:
            print(f"Found {count} existing feedback records.")
            confirm = input("Clear existing data before seeding? (y/n): ")
            if confirm.lower() == "y":
                from motor.motor_asyncio import AsyncIOMotorClient
                from dotenv import load_dotenv
                load_dotenv()
                own_client = AsyncIOMotorClient(os.getenv("OWN_DB_URL"))
                own_db = own_client[os.getenv("OWN_DB_NAME", "feedback")]
                result = await own_db["feedback"].delete_many({})
                print(f"Cleared {result.deleted_count} records.")
                own_client.close()

async def seed():
    print("🌱 Starting seed script...")
    print()

    # Check API is running
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{API_BASE}/")
            print(f"✅ API is running: {res.json()['status']}")
    except Exception:
        print("❌ API is not running. Start it with: uvicorn main:app --reload")
        return

    # Clear existing if needed
    await clear_existing()

    # Get real pairs
    print("\n📋 Fetching real question/answer pairs from original DB...")
    pairs = await get_real_pairs()

    if not pairs:
        print("❌ No question/answer pairs found in original DB.")
        return

    print(f"✅ Found {len(pairs)} real pairs")
    for i, p in enumerate(pairs):
        print(f"   {i+1}. {p['question_text']}...")

    print()

    # Seed feedback
    total_submitted = 0
    failed = 0

    async with httpx.AsyncClient(timeout=30) as client:
        for i, pair in enumerate(pairs):
            split = SPLITS[i % len(SPLITS)]
            helpful_count, not_helpful_count = split

            print(f"📝 Pair {i+1}/{len(pairs)} — {helpful_count} helpful, {not_helpful_count} not helpful")

            # Submit helpful responses
            for j in range(helpful_count):
                try:
                    res = await client.post(f"{API_BASE}/feedback", json={
                        "farmer_phone": random.choice(PHONES),
                        "question_id": pair["question_id"],
                        "answer_id": pair["answer_id"],
                        "language": random.choice(LANGUAGES),
                        "response": "1"
                    })
                    if res.status_code == 200:
                        total_submitted += 1
                    else:
                        failed += 1
                        print(f"   ⚠️ Failed: {res.json()}")
                except Exception as e:
                    failed += 1
                    print(f"   ❌ Error: {e}")

            # Submit not helpful responses
            for j in range(not_helpful_count):
                try:
                    res = await client.post(f"{API_BASE}/feedback", json={
                        "farmer_phone": random.choice(PHONES),
                        "question_id": pair["question_id"],
                        "answer_id": pair["answer_id"],
                        "language": random.choice(LANGUAGES),
                        "response": "2"
                    })
                    if res.status_code == 200:
                        total_submitted += 1
                    else:
                        failed += 1
                except Exception as e:
                    failed += 1

        print()
        print("=" * 50)
        print(f"✅ Seeded {total_submitted} feedback records")
        if failed:
            print(f"⚠️  {failed} failed")

        # Final counts
        res = await client.get(f"{API_BASE}/feedback/count")
        print(f"📊 Total in DB: {res.json()['total']}")

        # Show flagged
        res = await client.get(f"{API_BASE}/feedback/flagged?threshold=60&min_responses=3")
        data = res.json()
        print(f"🚩 Flagged entries (threshold=60%, min=3): {data['flagged_count']}")

        print()
        print("🎉 Seed complete! Open http://localhost:5173 to see the dashboard.")

asyncio.run(seed())
