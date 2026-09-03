"""
Diagnostic tool: discovers which database(s) and collections your
MONGODB_URI can actually see, without needing anyone to tell you the exact
database name in advance.

Usage:
    python discover_database.py

Reads MONGODB_URI from your .env file (same one the main app uses). Prints
every database your connection can access, and for each one, every
collection name plus a sample document's top-level fields — so you can spot
which database/collection matches what this project needs (a `questions`
collection with fields like `tag`, `status`, `details`, `embedding`).

This is read-only — it only lists and samples data, it never writes,
modifies, or deletes anything.
"""

from __future__ import annotations
import os
from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "").strip()

if not MONGODB_URI:
    print("MONGODB_URI is not set in your .env file. Nothing to inspect.")
    raise SystemExit(1)

from pymongo import MongoClient

print(f"Connecting using your configured MONGODB_URI...\n")
client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=8000)

try:
    db_names = client.list_database_names()
except Exception as e:
    print(f"Could not list databases — connection may have failed: {e}")
    raise SystemExit(1)

# These are MongoDB's own built-in system databases — not relevant to this project.
SYSTEM_DBS = {"admin", "local", "config"}
candidate_dbs = [name for name in db_names if name not in SYSTEM_DBS]

if not candidate_dbs:
    print("No non-system databases visible with this connection. "
          "Your connection may only have access to one specific database "
          "already (try running the main app directly — get_default_database() "
          "might just work).")
    raise SystemExit(0)

print(f"Found {len(candidate_dbs)} database(s) this connection can see:\n")

for db_name in candidate_dbs:
    db = client[db_name]
    try:
        collection_names = db.list_collection_names()
    except Exception as e:
        print(f"  [{db_name}] — could not list collections: {e}")
        continue

    print(f"[{db_name}]  ({len(collection_names)} collections)")

    # Specifically flag anything that looks like the questions collection
    # this project needs, based on the real schema we already confirmed.
    likely_matches = [c for c in collection_names if "question" in c.lower()]
    if likely_matches:
        print(f"    -> Looks promising: {likely_matches}")

    for coll_name in collection_names[:15]:  # cap output for readability
        coll = db[coll_name]
        sample = coll.find_one()
        if sample:
            fields = list(sample.keys())[:10]
            print(f"    - {coll_name}: sample fields = {fields}")
        else:
            print(f"    - {coll_name}: (empty)")
    if len(collection_names) > 15:
        print(f"    ... and {len(collection_names) - 15} more collections")
    print()

print("---")
print("What to look for: a collection (likely named 'questions' or similar)")
print("whose sample fields include things like: question, details, tag,")
print("status, embedding, createdAt. The database that CONTAINS that")
print("collection is the one to put in MONGODB_DB_NAME in your .env file.")
