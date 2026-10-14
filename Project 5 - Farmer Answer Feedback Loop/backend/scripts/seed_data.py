"""
Seed script -- loads existing JSON data from the Database folder into MongoDB.
Run once to populate the database.

Usage:
    cd backend
    python scripts/seed_data.py
"""
import sys
import io
# Force UTF-8 output on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import asyncio
import json
import os
from pathlib import Path
from datetime import datetime, timezone

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings

# ─── Paths to the existing Database folder ────────────────────────────────────
BASE_DB_PATH = Path(__file__).parent.parent.parent.parent / "Database"

GDB_FILE          = BASE_DB_PATH / "GDB" / "farmer_feedback_gdb_entries.json"
FEEDBACK_FILE     = BASE_DB_PATH / "All About Feedbacks given by Farmers" / "farmer_feedback_feedback.json"
FLAGGED_FILE      = BASE_DB_PATH / "All About Feedbacks given by Farmers" / "farmer_feedback_flagged_entries.json"
WEEKLY_FILE       = BASE_DB_PATH / "All About Feedbacks given by Farmers" / "farmer_feedback_weekly_digest.json"


def parse_mongo_extended(obj):
    """Convert MongoDB Extended JSON ($oid, $date) to plain Python types."""
    if isinstance(obj, dict):
        if "$oid" in obj:
            return obj["$oid"]
        if "$date" in obj:
            date_val = obj["$date"]
            if isinstance(date_val, str):
                # Parse ISO format
                return datetime.fromisoformat(date_val.replace("Z", "+00:00"))
            elif isinstance(date_val, (int, float)):
                return datetime.fromtimestamp(date_val / 1000, tz=timezone.utc)
        return {k: parse_mongo_extended(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [parse_mongo_extended(item) for item in obj]
    return obj


def load_json(path: Path) -> list:
    """Load and parse a MongoDB extended JSON file."""
    if not path.exists():
        print(f"  ⚠️  File not found: {path}")
        return []
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    return parse_mongo_extended(raw)


async def seed_gdb_entries(db, data: list):
    """Seed gdb_entries collection with GDB data + computed helpfulness fields."""
    if not data:
        return 0

    # We'll compute helpfulness scores from feedback after seeding feedback
    # For now, add default computed fields
    docs = []
    for entry in data:
        doc = {**entry}
        # Ensure computed fields exist
        if "helpfulness_score" not in doc:
            doc["helpfulness_score"] = 0.0
        if "total_responses" not in doc:
            doc["total_responses"] = 0
        if "helpful_count" not in doc:
            doc["helpful_count"] = 0
        if "not_helpful_count" not in doc:
            doc["not_helpful_count"] = 0
        if "is_flagged" not in doc:
            doc["is_flagged"] = False
        docs.append(doc)

    # Upsert each to avoid duplicate key errors on re-run
    count = 0
    for doc in docs:
        result = await db.gdb_entries.replace_one(
            {"_id": doc["_id"]}, doc, upsert=True
        )
        count += 1

    return count


async def seed_feedback(db, data: list):
    """Seed feedback collection."""
    if not data:
        return 0

    docs = []
    for item in data:
        doc = {**item}
        # Ensure timestamp is datetime
        if "timestamp" not in doc or not isinstance(doc.get("timestamp"), datetime):
            doc["timestamp"] = datetime.now(timezone.utc)
        docs.append(doc)

    count = 0
    for doc in docs:
        try:
            await db.feedback.replace_one({"_id": doc["_id"]}, doc, upsert=True)
            count += 1
        except Exception as e:
            print(f"  ⚠️  Feedback insert error: {e}")

    return count


async def seed_flagged_entries(db, data: list):
    """Seed flagged_entries collection."""
    if not data:
        return 0

    count = 0
    for item in data:
        doc = {**item}
        gdb_id = doc.get("gdb_entry_id")

        # Upsert by gdb_entry_id (not _id, since _id is ObjectId in source)
        if "_id" in doc:
            doc.pop("_id")  # Remove ObjectId, let MongoDB generate new one

        try:
            await db.flagged_entries.replace_one(
                {"gdb_entry_id": gdb_id}, doc, upsert=True
            )
            count += 1

            # Also mark the GDB entry as flagged
            if gdb_id:
                await db.gdb_entries.update_one(
                    {"_id": gdb_id},
                    {"$set": {"is_flagged": True}}
                )
        except Exception as e:
            print(f"  ⚠️  Flagged entry insert error: {e}")

    return count


async def seed_weekly_digest(db, data: list):
    """Seed weekly_digests collection."""
    if not data:
        return 0

    count = 0
    for item in data:
        doc = {**item}
        if "_id" in doc:
            doc.pop("_id")
        try:
            await db.weekly_digests.insert_one(doc)
            count += 1
        except Exception as e:
            print(f"  ⚠️  Weekly digest insert error: {e}")
    return count


async def recompute_gdb_scores(db):
    """
    After seeding feedback, recompute helpfulness_score for all GDB entries
    based on actual feedback data.
    """
    print("\n🔄 Recomputing helpfulness scores from feedback data...")
    pipeline = [
        {"$group": {
            "_id": "$gdb_entry_id",
            "total": {"$sum": 1},
            "helpful": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}},
            "not_helpful": {"$sum": {"$cond": [{"$eq": ["$response", "2"]}, 1, 0]}},
        }}
    ]
    results = await db.feedback.aggregate(pipeline).to_list(5000)

    updated = 0
    for r in results:
        gdb_id = r["_id"]
        total = r["total"]
        helpful = r["helpful"]
        not_helpful = r["not_helpful"]
        score = round((helpful / total) * 100, 2) if total > 0 else 0.0

        await db.gdb_entries.update_one(
            {"_id": gdb_id},
            {"$set": {
                "total_responses": total,
                "helpful_count": helpful,
                "not_helpful_count": not_helpful,
                "helpfulness_score": score,
            }}
        )
        updated += 1

    print(f"   ✅ Updated {updated} GDB entries with real helpfulness scores")
    return updated


async def main():
    print("\n" + "="*56)
    print("  Farmer Feedback System -- Database Seeder")
    print("="*56 + "\n")
    print(f"Connecting to: {settings.mongodb_uri}")
    print(f"Database: {settings.mongodb_db_name}\n")

    client = AsyncIOMotorClient(settings.mongodb_uri)
    db = client[settings.mongodb_db_name]

    try:
        await client.admin.command("ping")
        print("[OK] Connected to MongoDB\n")
    except Exception as e:
        print(f"[ERROR] Could not connect to MongoDB: {e}")
        print("   Make sure MongoDB is running on localhost:27017")
        sys.exit(1)

    # ── GDB Entries ────────────────────────────────────────────
    print("Seeding GDB entries...")
    gdb_data = load_json(GDB_FILE)
    gdb_count = await seed_gdb_entries(db, gdb_data)
    print(f"  [OK] {gdb_count} GDB entries seeded")

    # ── Feedback ───────────────────────────────────────────────
    print("\nSeeding farmer feedback records...")
    fb_data = load_json(FEEDBACK_FILE)
    fb_count = await seed_feedback(db, fb_data)
    print(f"  [OK] {fb_count} feedback records seeded")

    # ── Recompute scores ───────────────────────────────────────
    await recompute_gdb_scores(db)

    # ── Flagged Entries ────────────────────────────────────────
    print("\nSeeding flagged entries...")
    flagged_data = load_json(FLAGGED_FILE)
    flagged_count = await seed_flagged_entries(db, flagged_data)
    print(f"  [OK] {flagged_count} flagged entries seeded")

    # Weekly Digest
    print("\nSeeding weekly digest...")
    digest_data = load_json(WEEKLY_FILE)
    existing_count = await db.weekly_digests.count_documents({})
    if existing_count == 0:
        digest_count = await seed_weekly_digest(db, digest_data)
        print(f"  [OK] {digest_count} weekly digest records seeded")
    else:
        print(f"  [SKIP] {existing_count} digest(s) already exist")

    # ── Create Indexes ─────────────────────────────────────────
    print("\nCreating indexes...")
    await db.feedback.create_index("gdb_entry_id")
    await db.feedback.create_index("timestamp")
    await db.gdb_entries.create_index("domain")
    await db.gdb_entries.create_index("helpfulness_score")
    await db.gdb_entries.create_index("is_flagged")
    await db.flagged_entries.create_index("gdb_entry_id")
    await db.flagged_entries.create_index("status")
    print("  [OK] Indexes created")

    # ── Summary ────────────────────────────────────────────────
    print("\n" + "="*56)
    print("  SEED COMPLETE")
    print("="*56)
    print(f"  GDB Entries    : {gdb_count}")
    print(f"  Feedback Rows  : {fb_count}")
    print(f"  Flagged Entries: {flagged_count}")
    print("="*56 + "\n")
    print("Database ready! Now start the API:")
    print("   uvicorn app.main:app --reload --port 8000\n")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
