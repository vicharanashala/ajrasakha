"""Sync golden Q&A data from MongoDB to HuggingFace Dataset.

This script:
1. Connects to MongoDB and fetches closed questions with final answers
2. Formats the data for HuggingFace dataset format
3. Pushes to HuggingFace Hub

Run via Google Cloud Run as a daily cron job.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from bson import ObjectId
from datasets import Dataset, DatasetDict
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

IST = timezone(timedelta(hours=5, minutes=30))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s IST %(levelname)s [sync] %(message)s",
)
log = logging.getLogger(__name__)

# MongoDB Configuration
MONGODB_URI = os.getenv("MONGODB_URI")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "agriai")

# HuggingFace Configuration
HUGGINGFACE_TOKEN = os.getenv("HUGGINGFACE_TOKEN")
HF_DATASET_NAME = os.getenv("HF_DATASET_NAME", "vicharanashala/ajrasakha-dataset-v1")


class GoldenToHuggingFaceSync:
    """Syncs golden Q&A data from MongoDB to HuggingFace."""

    def __init__(self):
        if not MONGODB_URI:
            raise ValueError("MONGODB_URI is required")
        if not HUGGINGFACE_TOKEN:
            raise ValueError("HUGGINGFACE_TOKEN is required")

        self.mongo_client = MongoClient(MONGODB_URI)
        self.db = self.mongo_client[MONGODB_DATABASE]
        self.questions_collection = self.db["questions"]
        self.answers_collection = self.db["answers"]
        self.users_collection = self.db["users"]

        log.info("Connected to MongoDB: %s/%s", MONGODB_URI.split("@")[-1], MONGODB_DATABASE)

    def _get_user_display_name(self, user_doc: dict | None) -> str | None:
        """Extract display name from user document."""
        if not user_doc:
            return None
        name = (user_doc.get("name") or "").strip()
        if name:
            return name
        first = (user_doc.get("firstName") or "").strip()
        last = (user_doc.get("lastName") or "").strip()
        full = " ".join(part for part in (first, last) if part)
        return full or None

    def _get_final_answer(self, question_id: str) -> tuple[str | None, list, str | None]:
        """Get final answer, sources, and author name for a question."""
        answer_doc = self.answers_collection.find_one(
            {"questionId": ObjectId(question_id), "isFinalAnswer": True},
            {"answer": 1, "sources": 1, "authorId": 1},
        )

        if not answer_doc:
            return None, [], None

        answer_text = answer_doc.get("answer")
        sources = answer_doc.get("sources") or []

        author_name = None
        author_id = answer_doc.get("authorId")
        if author_id:
            user_doc = self.users_collection.find_one(
                {"_id": author_id},
                {"firstName": 1, "lastName": 1, "name": 1},
            )
            author_name = self._get_user_display_name(user_doc)

        return answer_text, sources, author_name

    def _extract_details(self, details: dict | None) -> dict[str, Any]:
        """Extract and normalize details from question."""
        details = details or {}

        # Handle nested crop object
        crop = details.get("crop") or {}
        if isinstance(crop, dict):
            crop = crop.get("name", "")

        return {
            "crop": str(crop).strip() if crop else None,
            "normalised_crop": details.get("normalised_crop"),
            "state": details.get("state"),
            "season": details.get("season"),
            "domain": details.get("domain"),
        }

    def fetch_golden_qa_pairs(self, limit: int | None = None) -> list[dict[str, Any]]:
        """Fetch all closed questions with final answers from MongoDB.

        Args:
            limit: Optional limit for testing

        Returns:
            List of Q&A pair dictionaries suitable for HuggingFace dataset
        """
        query = {"status": "closed"}

        log.info("Fetching closed questions from MongoDB...")
        if limit:
            questions_cursor = self.questions_collection.find(query).limit(limit)
            questions = list(questions_cursor)
        else:
            questions = list(self.questions_collection.find(query))

        total_questions = len(questions)
        log.info("Found %d closed questions", total_questions)

        qa_pairs = []
        skipped_no_answer = 0

        for q in questions:
            question_id = str(q["_id"])
            question_text = q.get("question") or q.get("text") or ""
            details = self._extract_details(q.get("details"))

            # Get final answer
            answer_text, sources, author_name = self._get_final_answer(question_id)

            if not answer_text:
                skipped_no_answer += 1
                continue

            # Create Q&A pair
            qa_pair = {
                "question_id": question_id,
                "question": question_text,
                "answer": answer_text,
                "author": author_name,
                "sources": sources if isinstance(sources, list) else [],
                "crop": details.get("crop"),
                "normalised_crop": details.get("normalised_crop"),
                "state": details.get("state"),
                "season": details.get("season"),
                "domain": details.get("domain"),
                "status": q.get("status"),
                "source": q.get("source"),
                "created_at": (
                    q["createdAt"].isoformat() if q.get("createdAt") else None
                ),
            }

            qa_pairs.append(qa_pair)

        log.info("Successfully extracted %d Q&A pairs (skipped %d without answers)", len(qa_pairs), skipped_no_answer)
        return qa_pairs

    def create_dataset(self, qa_pairs: list[dict[str, Any]]) -> DatasetDict:
        """Create a HuggingFace DatasetDict from Q&A pairs.

        Args:
            qa_pairs: List of Q&A pair dictionaries

        Returns:
            DatasetDict with 'train' split
        """
        if not qa_pairs:
            log.warning("No Q&A pairs to create dataset from!")
            return DatasetDict()

        dataset = Dataset.from_list(qa_pairs)
        dataset_dict = DatasetDict({"train": dataset})

        log.info("Created dataset with %d examples", len(dataset))
        return dataset_dict

    def push_to_huggingface(self, dataset: DatasetDict, commit_message: str | None = None) -> None:
        """Push dataset to HuggingFace Hub using git-based push.

        Args:
            dataset: DatasetDict to push
            commit_message: Optional commit message
        """
        if not dataset:
            log.warning("Empty dataset, skipping push to HuggingFace")
            return

        commit_msg = commit_message or (
            f"Update dataset: {datetime.now(IST).strftime('%Y-%m-%d %H:%M:%S')} IST - "
            f"{len(dataset['train'])} examples"
        )

        log.info("Pushing dataset to %s", HF_DATASET_NAME)
        
        # Use git-based push (works with both git and git-lfs enabled datasets)
        dataset.push_to_hub(
            repo_id=HF_DATASET_NAME,
            token=HUGGINGFACE_TOKEN,
            commit_message=commit_msg,
        )

        log.info("Successfully pushed dataset to https://huggingface.co/datasets/%s", HF_DATASET_NAME)

    def run_sync(self, limit: int | None = None, dry_run: bool = False) -> DatasetDict | None:
        """Run the full sync pipeline.

        Args:
            limit: Optional limit for testing
            dry_run: If True, don't push to HuggingFace

        Returns:
            The created dataset, or None if dry_run with no data
        """
        log.info("=" * 60)
        log.info("Starting Golden DB to HuggingFace sync")
        log.info("Target dataset: %s", HF_DATASET_NAME)
        log.info("=" * 60)

        # Fetch Q&A pairs from MongoDB
        qa_pairs = self.fetch_golden_qa_pairs(limit=limit)

        if not qa_pairs:
            log.warning("No Q&A pairs found in database!")
            return None

        # Create dataset
        dataset = self.create_dataset(qa_pairs)

        # Push to HuggingFace (unless dry run)
        if dry_run:
            log.info("Dry run - skipping push to HuggingFace")
            log.info("Dataset preview:")
            log.info("  Total examples: %d", len(dataset["train"]))
            log.info("  Columns: %s", dataset["train"].column_names)
            return dataset

        self.push_to_huggingface(dataset)

        log.info("=" * 60)
        log.info("Sync completed successfully!")
        log.info("=" * 60)

        return dataset


def main():
    """Main entry point for the sync script."""
    import argparse

    parser = argparse.ArgumentParser(description="Sync golden Q&A data to HuggingFace")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of questions for testing")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and create dataset without pushing")

    args = parser.parse_args()

    sync = GoldenToHuggingFaceSync()
    sync.run_sync(limit=args.limit, dry_run=args.dry_run)


if __name__ == "__main__":
    main()