"""
seed_gdb.py — Load the full GDB JSON into MongoDB, adding helpfulness fields.

This script:
  1. Reads farmer_feedback_gdb_entries.json from the Database/GDB folder
  2. Adds missing helpfulness fields (helpfulness_score, total_responses, etc.)
  3. Upserts every entry into MongoDB (safe to run multiple times)
  4. Also seeds feedback, flagged_entries, and weekly_digest if present

Usage:
    cd backend
    python scripts/seed_gdb.py
"""
import sys
import io
# Force UTF-8 on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import asyncio
import json
import os
from pathlib import Path
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DB_PATH = Path(__file__).parent.parent.parent.parent / "Database"

GDB_FILE      = BASE_DB_PATH / "GDB" / "farmer_feedback_gdb_entries.json"
FEEDBACK_FILE = BASE_DB_PATH / "All About Feedbacks given by Farmers" / "farmer_feedback_feedback.json"
FLAGGED_FILE  = BASE_DB_PATH / "All About Feedbacks given by Farmers" / "farmer_feedback_flagged_entries.json"
WEEKLY_FILE   = BASE_DB_PATH / "All About Feedbacks given by Farmers" / "farmer_feedback_weekly_digest.json"


# ── MongoDB Extended JSON parser ───────────────────────────────────────────────
def parse_mongo_extended(obj):
    """Convert MongoDB Extended JSON ($oid, $date) to plain Python types."""
    if isinstance(obj, dict):
        if "$oid" in obj:
            return obj["$oid"]
        if "$date" in obj:
            date_val = obj["$date"]
            if isinstance(date_val, str):
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
        print(f"  [WARN] File not found: {path}")
        return []
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    return parse_mongo_extended(raw)


# ── GDB Seeder ────────────────────────────────────────────────────────────────
async def seed_gdb_entries(db, data: list) -> int:
    """
    Seed gdb_entries. Adds helpfulness fields if missing.
    Uses upsert to avoid duplicate errors on re-run.
    """
    if not data:
        print("  [WARN] No GDB data to seed.")
        return 0

    count = 0
    for entry in data:
        doc = {**entry}

        # Ensure all required helpfulness fields exist
        doc.setdefault("helpfulness_score", 0.0)
        doc.setdefault("total_responses", 0)
        doc.setdefault("helpful_count", 0)
        doc.setdefault("not_helpful_count", 0)
        doc.setdefault("is_flagged", False)
        doc.setdefault("last_feedback_at", None)

        await db.gdb_entries.replace_one({"_id": doc["_id"]}, doc, upsert=True)
        count += 1

    return count


# ── Feedback Seeder ───────────────────────────────────────────────────────────
async def seed_feedback(db, data: list) -> int:
    if not data:
        return 0
    count = 0
    for item in data:
        doc = {**item}
        doc.setdefault("timestamp", datetime.now(timezone.utc))
        try:
            await db.feedback.replace_one({"_id": doc["_id"]}, doc, upsert=True)
            count += 1
        except Exception as e:
            print(f"  [WARN] Feedback insert error: {e}")
    return count


# ── Flagged Entries Seeder ────────────────────────────────────────────────────
async def seed_flagged_entries(db, data: list) -> int:
    if not data:
        return 0
    count = 0
    for item in data:
        doc = {**item}
        gdb_id = doc.get("gdb_entry_id")
        doc.pop("_id", None)
        try:
            await db.flagged_entries.replace_one({"gdb_entry_id": gdb_id}, doc, upsert=True)
            if gdb_id:
                await db.gdb_entries.update_one(
                    {"_id": gdb_id},
                    {"$set": {"is_flagged": True}}
                )
            count += 1
        except Exception as e:
            print(f"  [WARN] Flagged entry insert error: {e}")
    return count


# ── Weekly Digest Seeder ──────────────────────────────────────────────────────
async def seed_weekly_digest(db, data: list) -> int:
    if not data:
        return 0
    existing = await db.weekly_digests.count_documents({})
    if existing > 0:
        print(f"  [SKIP] {existing} digest(s) already exist")
        return 0
    count = 0
    for item in data:
        doc = {**item}
        doc.pop("_id", None)
        try:
            await db.weekly_digests.insert_one(doc)
            count += 1
        except Exception as e:
            print(f"  [WARN] Weekly digest insert error: {e}")
    return count


# ── Score Recomputer ──────────────────────────────────────────────────────────
async def recompute_gdb_scores(db) -> int:
    """Recompute helpfulness scores from actual feedback data."""
    print("\n  Recomputing helpfulness scores from feedback...")
    pipeline = [
        {"$group": {
            "_id": "$gdb_entry_id",
            "total": {"$sum": 1},
            "helpful": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}},
            "not_helpful": {"$sum": {"$cond": [{"$eq": ["$response", "2"]}, 1, 0]}},
        }}
    ]
    results = await db.feedback.aggregate(pipeline).to_list(10000)

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

    print(f"  [OK] Updated {updated} GDB entries with real helpfulness scores")
    return updated


# ── Index Creator ─────────────────────────────────────────────────────────────
async def create_indexes(db):
    await db.feedback.create_index("gdb_entry_id")
    await db.feedback.create_index("timestamp")
    await db.gdb_entries.create_index("domain")
    await db.gdb_entries.create_index("language")
    await db.gdb_entries.create_index("state")
    await db.gdb_entries.create_index("helpfulness_score")
    await db.gdb_entries.create_index("is_flagged")
    await db.flagged_entries.create_index("gdb_entry_id")
    await db.flagged_entries.create_index("status")
    await db.whatsapp_sessions.create_index("farmer_phone", unique=True)
    print("  [OK] Indexes created")


# ── Main ──────────────────────────────────────────────────────────────────────
async def main():
    print("\n" + "="*60)
    print("  ACE Farmer Feedback System — Full Database Seeder")
    print("="*60)
    print(f"  MongoDB : {settings.mongodb_uri}")
    print(f"  Database: {settings.mongodb_db_name}")
    print(f"  GDB File: {GDB_FILE}")
    print("="*60 + "\n")

    client = AsyncIOMotorClient(settings.mongodb_uri)
    db = client[settings.mongodb_db_name]

    # Test connection
    try:
        await client.admin.command("ping")
        print("[OK] Connected to MongoDB\n")
    except Exception as e:
        print(f"[ERROR] Could not connect to MongoDB: {e}")
        print("  Make sure MongoDB is running: mongod --dbpath <your-data-path>")
        sys.exit(1)

    # ── 1. GDB Entries ─────────────────────────────────────────────────────────
    print("Loading GDB entries from JSON...")
    gdb_data = load_json(GDB_FILE)
    print(f"  Found {len(gdb_data)} entries in JSON file")
    gdb_count = await seed_gdb_entries(db, gdb_data)
    print(f"  [OK] {gdb_count} GDB entries seeded (with helpfulness fields)\n")

    # ── 2. Feedback Records ────────────────────────────────────────────────────
    print("Loading farmer feedback records...")
    fb_data = load_json(FEEDBACK_FILE)
    if fb_data:
        print(f"  Found {len(fb_data)} feedback records")
        fb_count = await seed_feedback(db, fb_data)
        print(f"  [OK] {fb_count} feedback records seeded\n")

        # Recompute scores from real feedback
        await recompute_gdb_scores(db)
    else:
        fb_count = 0
        print("  [SKIP] No feedback file found\n")

    # ── 3. Flagged Entries ─────────────────────────────────────────────────────
    print("Loading flagged entries...")
    flagged_data = load_json(FLAGGED_FILE)
    if flagged_data:
        flagged_count = await seed_flagged_entries(db, flagged_data)
        print(f"  [OK] {flagged_count} flagged entries seeded\n")
    else:
        flagged_count = 0
        print("  [SKIP] No flagged entries file found\n")

    # ── 4. Weekly Digest ───────────────────────────────────────────────────────
    print("Loading weekly digest...")
    digest_data = load_json(WEEKLY_FILE)
    digest_count = await seed_weekly_digest(db, digest_data)
    if digest_count:
        print(f"  [OK] {digest_count} weekly digest seeded\n")

    # ── 5. Indexes ─────────────────────────────────────────────────────────────
    print("Creating indexes...")
    await create_indexes(db)

    # ── Summary ────────────────────────────────────────────────────────────────
    total_gdb = await db.gdb_entries.count_documents({})
    total_fb = await db.feedback.count_documents({})
    total_flagged = await db.flagged_entries.count_documents({})

    print("\n" + "="*60)
    print("  SEED COMPLETE")
    print("="*60)
    print(f"  GDB Entries in DB     : {total_gdb}")
    print(f"  Feedback Records in DB: {total_fb}")
    print(f"  Flagged Entries in DB : {total_flagged}")
    print("="*60)
    print("\nDatabase ready! Start the backend with:")
    print("   python run.py\n")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
