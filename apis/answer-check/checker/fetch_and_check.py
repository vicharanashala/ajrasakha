"""Fetch approved answers from MongoDB and print chemical-safety checks.

This script is read-only: it does not write to MongoDB or create an output file.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import PyMongoError

from chem_checker import check_banned_chemicals
from normalizer import normalize_answer


PROJECT_DIRECTORY = Path(__file__).resolve().parent.parent
ENV_PATH = PROJECT_DIRECTORY / ".env"


def _first_value(document: dict[str, Any], *field_names: str) -> Any:
    """Return the first present, non-null field value."""
    for field_name in field_names:
        value = document.get(field_name)
        if value is not None:
            return value
    return None


def _find_question(questions: Any, question_id: Any) -> dict[str, Any]:
    """Find a linked question whether its ID is stored as ObjectId or text."""
    if question_id is None:
        return {}

    candidate_ids = [question_id]
    if isinstance(question_id, str):
        try:
            candidate_ids.append(ObjectId(question_id))
        except InvalidId:
            pass

    question = questions.find_one({"_id": {"$in": candidate_ids}})
    if question is None:
        # Some datasets expose a separate questionId rather than using _id.
        question = questions.find_one({"questionId": {"$in": candidate_ids}})
    return question or {}


def _details(answer: dict[str, Any], question: dict[str, Any]) -> dict[str, Any]:
    """Get crop/state details, preferring question details over answer details."""
    question_details = question.get("details")
    if isinstance(question_details, dict):
        return question_details
    answer_details = answer.get("details")
    if isinstance(answer_details, dict):
        return answer_details
    return {}


def _format_status(check: dict[str, Any], restricted: bool = False) -> str:
    if check["pass"]:
        return "PASS"

    chemical = check.get("found") or "Unknown chemical"
    if restricted:
        restricted_for = ", ".join(check.get("restricted_for", [])) or "this crop"
        return f"FAIL - {chemical} found, restricted for {restricted_for}"
    return f"FAIL - {chemical} found"


def main() -> int:
    load_dotenv(ENV_PATH)
    mongodb_uri = os.getenv("MONGODB_URI", "").strip()
    if not mongodb_uri or mongodb_uri == "<we will fill this>":
        print("Error: Set MONGODB_URI in .env before running this script.", file=sys.stderr)
        return 1

    client = MongoClient(mongodb_uri, serverSelectionTimeoutMS=10_000)
    try:
        database = client["agriai"]
        answers = database["answers"]
        questions = database["questions"]

        answer_cursor = answers.find(
            {"status": "approved", "isFinalAnswer": True}
        ).limit(10)

        for answer in answer_cursor:
            question_id = _first_value(answer, "questionId", "question_id")
            question = _find_question(questions, question_id)
            details = _details(answer, question)

            answer_text = str(
                _first_value(answer, "answer_text", "answerText", "answer") or ""
            )
            question_text = str(
                _first_value(question, "question_text", "questionText", "question")
                or ""
            )
            crop = str(_first_value(details, "crop", "cropName") or "Unknown")
            state = str(_first_value(details, "state", "stateName") or "Unknown")

            # Extracted for completeness even though only the checks are printed.
            _ = question_text
            context = normalize_answer(
                {
                    "answer_id": str(answer["_id"]),
                    "question_id": str(question_id or ""),
                    "answer_text": answer_text,
                    "question_text": question_text,
                    "crop": crop,
                    "state": state,
                    "sources": answer.get("sources", []),
                }
            )
            checks = check_banned_chemicals(context)
            banned = checks["banned_chemical"]
            restricted = checks["restricted_chemical"]
            overall = "PASS" if banned["pass"] and restricted["pass"] else "FAIL"

            print(f"Answer ID: {answer['_id']}")
            print(f"Crop: {crop} | State: {state}")
            print(f"Banned Chemical: {_format_status(banned)}")
            print(
                "Restricted Chemical: "
                f"{_format_status(restricted, restricted=True)}"
            )
            print(f"Overall: {overall}")
            print("-------------")

        return 0
    except PyMongoError as exc:
        print(f"MongoDB error: {exc}", file=sys.stderr)
        return 1
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
