"""
One-time script to seed a static GDB reference-answer fixture from MongoDB.

Run by hand:
    uv run python -m ajrasakha.evaluation.scripts.fetch_gdb_samples

Connects read-only to the `agriai` database, joins `answers` back to their
`questions`, and writes the result to
ajrasakha/evaluation/fixtures/gdb_samples.json.

The evaluation pipeline itself never imports this script or connects to
MongoDB - it only reads the static JSON fixture this script produces.
"""

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

FIXTURE_PATH = Path(__file__).resolve().parent.parent / "fixtures" / "gdb_samples.json"

# Any answer with isFinalAnswer=True is expert-approved. We also include
# answers with at least one moderator approval as best-effort references,
# since this sandbox database only has a single fully-approved answer.
MIN_APPROVAL_COUNT_FALLBACK = 1


def fetch_samples() -> list[dict]:
    mongodb_uri = os.getenv("MONGODB_URI")
    if not mongodb_uri:
        raise RuntimeError("MONGODB_URI is not set")

    client = MongoClient(mongodb_uri, serverSelectionTimeoutMS=15000)
    db = client["agriai"]

    answers = list(
        db["answers"].find(
            {
                "$or": [
                    {"isFinalAnswer": True},
                    {"approvalCount": {"$gte": MIN_APPROVAL_COUNT_FALLBACK}},
                ]
            }
        )
    )

    samples = []

    for answer in answers:
        question = db["questions"].find_one({"_id": answer.get("questionId")})
        if not question:
            continue

        details = question.get("details", {}) or {}
        domains = details.get("domain", []) or []

        is_final = bool(answer.get("isFinalAnswer"))
        verification_status = "expert_approved" if is_final else "pending_partial_approval"

        samples.append(
            {
                "query": question.get("question", ""),
                "expected_answer": answer.get("answer", ""),
                "expected_domain": domains[0] if domains else None,
                "domains": domains,
                "crop": details.get("normalised_crop") or details.get("crop"),
                "state": details.get("state"),
                "is_final_answer": is_final,
                "verification_status": verification_status,
                "approval_count": answer.get("approvalCount", 0),
                "source": "agriai.answers",
            }
        )

    client.close()
    return samples


def main():
    samples = fetch_samples()

    FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(FIXTURE_PATH, "w", encoding="utf-8") as f:
        json.dump(samples, f, indent=2, ensure_ascii=False)

    print(f"Wrote {len(samples)} sample(s) to {FIXTURE_PATH}")
    for sample in samples:
        print(
            f"  - [{sample['expected_domain']}] {sample['query'][:80]!r} "
            f"(final={sample['is_final_answer']}, approvals={sample['approval_count']})"
        )


if __name__ == "__main__":
    main()
