"""
Focused follow-up to discover_database.py — inspects specific candidate
collections in full detail: every field name (not capped at 10), document
counts, and field data TYPES (not values) so we can tell, for example,
whether `embedding` is a real vector or missing, without printing any
actual farmer data.

Usage:
    python inspect_candidates.py
"""

from __future__ import annotations
import os
from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "").strip()
from pymongo import MongoClient

client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=8000)

TARGETS = [
    ("gdb_gap_detector", "raw_queries"),
    ("gdb_gap_detector", "clusters"),
    ("farmer_feedback", "disclaimer_logs"),
    ("farmer_feedback", "gdb_entries"),
]

for db_name, coll_name in TARGETS:
    db = client[db_name]
    coll = db[coll_name]
    count = coll.estimated_document_count()
    sample = coll.find_one()

    print(f"=== {db_name}.{coll_name} ===")
    print(f"  document count: ~{count}")

    if not sample:
        print("  (empty or no sample found)\n")
        continue

    print("  fields (name: type):")
    for key, value in sample.items():
        type_name = type(value).__name__
        # For lists, show what's inside (e.g. is `embedding` a list of numbers?)
        if isinstance(value, list) and len(value) > 0:
            inner_type = type(value[0]).__name__
            extra = f" of {inner_type} (length {len(value)})"
        elif isinstance(value, list):
            extra = " (empty list)"
        else:
            extra = ""
        print(f"    - {key}: {type_name}{extra}")
    print()

print("---")
print("Look specifically for:")
print("  - raw_queries / disclaimer_logs: does either have a field that's a")
print("    'list of float' — that would be a real embedding vector.")
print("  - Does either have distinct 'crop' AND 'state' AND 'domain' fields?")
print("  - gdb_entries: does it have 'domain' and 'state' for the coverage count?")
