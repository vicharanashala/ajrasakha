"""
standardize_db.py

Fetch distinct crop and state values from MongoDB, build a standardized mapping,
collapse special sentinel values to the canonical token 'all', and optionally
apply the mapping back to the database.

Usage:
  python ai/standardize_db.py         # dry-run, prints mapping and stats
  python ai/standardize_db.py --apply  # perform updates on DB

Environment variables:
  GOLDEN_MONGODB_URI

This script writes outputs to the same directory as the script:
  - raw_values.json
  - standardized_mapping.json
  - duplicate_groups.json
  - final_standardized_mapping.json
  - final_duplicate_groups.json
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
from collections import defaultdict
from urllib.parse import unquote, urlparse
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import OperationFailure

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

# Values that, after standardization, should be collapsed to the special token 'all'
COLLAPSE_TO_ALL = {
    "All",
    "Unknown",
    "General",
    "Not Specified",
    "Not Provided",
    "Not Applicable",
    "N/A",
    "All Crops",
    "All India",
}


def normalize_spaces(s: str) -> str:
    """Collapse multiple whitespace to single space and trim."""
    return re.sub(r"\s+", " ", s).strip()


def standardize(value: str) -> str:
    """Standardize string: single spaces, Title Case (first letter capital), rest lower.

    Example: "  APPLE  fruit" -> "Apple Fruit"
    """
    if not isinstance(value, str):
        return value
    s = normalize_spaces(value)
    # Title case using word-by-word capitalize to avoid some .title() quirks
    parts = [p.capitalize() for p in s.split(" ")]
    return " ".join(parts)


def build_mapping(raw_values: list[str]) -> tuple[dict, dict]:
    mapping: dict[str, str] = {}
    groups: dict[str, list[str]] = defaultdict(list)

    for original in raw_values:
        std = standardize(original)
        if std in COLLAPSE_TO_ALL:
            mapped = "all"
        else:
            mapped = std

        mapping[original] = mapped
        groups[mapped].append(original)

    duplicate_groups = {k: v for k, v in groups.items() if len(v) > 1}
    return mapping, duplicate_groups


def save_json(path: str, obj) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)


def fetch_distinct_values(collection, field_path: str) -> list[str]:
    vals = collection.distinct(field_path)
    return sorted([v for v in vals if v and isinstance(v, str)])


def infer_database_and_collection(mongo_uri: str) -> tuple[str, str]:
    """Infer database and collection from the MongoDB URI path.

    Expected URI forms:
      mongodb://host:port/database
      mongodb+srv://host/database
      mongodb://host:port/database?options
    If the URI does not include a database name, fall back to the default
    repository database/collection values used by this project.
    """
    parsed = urlparse(mongo_uri)
    database = unquote(parsed.path.lstrip("/")) if parsed.path else ""
    if not database:
        database = os.getenv("GOLDEN_MONGODB_DATABASE", "agriai")
    collection = os.getenv("GOLDEN_MONGODB_COLLECTION", "questions")
    return database, collection


def apply_mapping_to_db(collection, field_path: str, mapping: dict[str, str], apply: bool) -> dict:
    """For each original value, report matched_count and if apply=True perform update_many.

    Returns a dict of original -> { matched, modified }
    """
    results = {}
    for original, mapped in mapping.items():
        query = {field_path: original}
        matched = collection.count_documents(query)
        modified = 0
        if matched and apply:
            try:
                res = collection.update_many(query, {"$set": {field_path: mapped}})
                modified = int(res.modified_count)
            except OperationFailure as e:
                # Log and continue; caller will summarize errors. Use None to indicate failure.
                logging.error("Update failed for %s -> %s : %s", original, mapped, e)
                modified = None
        results[original] = {"matched": matched, "modified": modified, "mapped_to": mapped}
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Apply updates to the DB")
    parser.add_argument("--crop-field", default="details.crop", help="MongoDB field path for crop")
    parser.add_argument("--state-field", default="details.state", help="MongoDB field path for state")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
    load_dotenv()

    MONGODB_URI = os.getenv("GOLDEN_MONGODB_URI")

    if not MONGODB_URI:
        logging.error("GOLDEN_MONGODB_URI not set in environment")
        return

    MONGODB_DATABASE, MONGODB_COLLECTION = infer_database_and_collection(MONGODB_URI)

    client = MongoClient(MONGODB_URI)
    db = client[MONGODB_DATABASE]
    collection = db[MONGODB_COLLECTION]

    logging.info("Fetching distinct crop values from DB...")
    raw_crops = fetch_distinct_values(collection, args.crop_field)
    logging.info("Fetching distinct state values from DB...")
    raw_states = fetch_distinct_values(collection, args.state_field)

    raw_path = os.path.join(OUTPUT_DIR, "raw_values.json")
    save_json(raw_path, {"crops": raw_crops, "states": raw_states})
    logging.info("Saved raw values -> %s", raw_path)

    crop_mapping, crop_duplicates = build_mapping(raw_crops)
    state_mapping, state_duplicates = build_mapping(raw_states)

    std_path = os.path.join(OUTPUT_DIR, "standardized_mapping.json")
    save_json(std_path, {"crops": crop_mapping, "states": state_mapping})
    logging.info("Saved standardized mapping -> %s", std_path)

    dup_path = os.path.join(OUTPUT_DIR, "duplicate_groups.json")
    save_json(dup_path, {"crops": crop_duplicates, "states": state_duplicates})
    logging.info("Saved duplicate groups -> %s", dup_path)

    # Final corpus (mapping already collapses special sentinels to 'all')
    final_crop_values = sorted({v for v in crop_mapping.values()})
    final_state_values = sorted({v for v in state_mapping.values()})

    final_std_path = os.path.join(OUTPUT_DIR, "final_standardized_mapping.json")
    save_json(final_std_path, {"crops": crop_mapping, "states": state_mapping})
    final_dup_path = os.path.join(OUTPUT_DIR, "final_duplicate_groups.json")
    save_json(final_dup_path, {"crops": crop_duplicates, "states": state_duplicates})

    logging.info("Final unique crops: %d", len(final_crop_values))
    logging.info("Final unique states: %d", len(final_state_values))

    # Dry-run summary of how many DB documents would be updated/matched
    logging.info("Preparing DB update summary (dry-run unless --apply is provided)...")
    crop_results = apply_mapping_to_db(collection, args.crop_field, crop_mapping, apply=False)
    state_results = apply_mapping_to_db(collection, args.state_field, state_mapping, apply=False)

    # Summarize counts
    total_crop_matches = sum(info["matched"] for info in crop_results.values())
    total_state_matches = sum(info["matched"] for info in state_results.values())

    logging.info("Total documents matching crop originals: %d", total_crop_matches)
    logging.info("Total documents matching state originals: %d", total_state_matches)

    if args.apply:
        logging.info("Applying crop mappings to DB...")
        crop_results_applied = apply_mapping_to_db(collection, args.crop_field, crop_mapping, apply=True)
        logging.info("Applying state mappings to DB...")
        state_results_applied = apply_mapping_to_db(collection, args.state_field, state_mapping, apply=True)

        # Some updates may have failed and set 'modified' to None; treat those as 0
        modified_crops = sum((info.get("modified") or 0) for info in crop_results_applied.values())
        modified_states = sum((info.get("modified") or 0) for info in state_results_applied.values())
        failed_crops = sum(1 for info in crop_results_applied.values() if info.get("modified") is None)
        failed_states = sum(1 for info in state_results_applied.values() if info.get("modified") is None)

        logging.info("Documents modified (crops): %d (failures: %d)", modified_crops, failed_crops)
        logging.info("Documents modified (states): %d (failures: %d)", modified_states, failed_states)

    logging.info("Done. Output files are in %s", OUTPUT_DIR)


if __name__ == "__main__":
    main()
