import re
from typing import Any, Dict

from bson import ObjectId
from pymongo import AsyncMongoClient
import reviewer_values


def _escape_exact_regex(value: str) -> str:
    return f"^{re.escape((value or '').strip())}$"


def _extract_source_names(sources: Any) -> list[str]:
    if not isinstance(sources, list):
        return []
    names: list[str] = []
    for source in sources:
        if isinstance(source, dict):
            name = (
                source.get("source_name")
                or source.get("sourceName")
                or source.get("name")
                or source.get("title")
                or source.get("url")
            )
            if name:
                names.append(str(name))
        elif isinstance(source, str):
            names.append(source)
    return names


async def find_exact_question_context(
    mongo_uri: str,
    mongo_database: str,
    mongo_collection: str,
    original_question: str,
    state: str | None,
    crop: str | None,
) -> Dict[str, Any]:
    """
    Find exact question match in reviewer DB by original_question with optional state/crop.
    Returns a dict with found flag and context payload if available.
    """
    if not mongo_uri or not mongo_database or not mongo_collection:
        return {"found": False, "reason": "missing_db_config"}
    if not (original_question or "").strip():
        return {"found": False, "reason": "missing_original_question"}

    state_to_filter = None
    if state:
        state_upper = state.upper()
        if state_upper in reviewer_values.reviewer_state_codes:
            state_to_filter = reviewer_values.reviewer_state_codes[state_upper]
        else:
            available_states = sorted(reviewer_values.reviewer_state_codes.values())
            return {
                "found": False,
                "validation_error": (
                    f"Invalid state name '{state}'. "
                    f"Available states are: {', '.join(available_states)}"
                ),
            }

    crop_to_filter = crop
    if crop and state_to_filter:
        valid_crops = reviewer_values.state_crops_reviewer_dataset.get(state_to_filter, [])
        crop_found = False
        for valid_crop in valid_crops:
            if valid_crop.lower() == crop.lower():
                crop_to_filter = valid_crop
                crop_found = True
                break
        if not crop_found:
            return {
                "found": False,
                "validation_error": (
                    f"Invalid crop '{crop}' for state '{state_to_filter}'. "
                    f"Available crops are: {', '.join(valid_crops)}"
                ),
            }

    client = AsyncMongoClient(mongo_uri)
    db = client[mongo_database]
    questions_collection = db[mongo_collection]
    answers_collection = db["answers"]
    users_collection = db["users"]

    query_filter: Dict[str, Any] = {
        "$and": [
            {"status": {"$in": ["closed", "resolved", "answered"]}},
            {
                "$or": [
                    {"question": {"$regex": _escape_exact_regex(original_question), "$options": "i"}},
                    {"originalQuestion": {"$regex": _escape_exact_regex(original_question), "$options": "i"}},
                ]
            },
        ]
    }

    if state_to_filter:
        query_filter["$and"].append(
            {"details.state": {"$regex": _escape_exact_regex(state_to_filter), "$options": "i"}}
        )
    if crop_to_filter:
        query_filter["$and"].append(
            {"details.crop": {"$regex": _escape_exact_regex(crop_to_filter), "$options": "i"}}
        )

    matched_question = await questions_collection.find_one(query_filter, sort=[("updatedAt", -1), ("_id", -1)])
    if not matched_question:
        return {"found": False}

    answer_doc = await answers_collection.find_one(
        {"questionId": ObjectId(matched_question["_id"])},
        {"answer": 1, "sources": 1, "authorId": 1},
        sort=[("updatedAt", -1), ("_id", -1)],
    )

    author_name = None
    if answer_doc and answer_doc.get("authorId"):
        try:
            user_doc = await users_collection.find_one(
                {"_id": ObjectId(answer_doc["authorId"])},
                {"firstName": 1, "lastName": 1, "name": 1},
            )
            if user_doc:
                if user_doc.get("name"):
                    author_name = user_doc["name"]
                else:
                    first_name = (user_doc.get("firstName") or "").strip()
                    last_name = (user_doc.get("lastName") or "").strip()
                    author_name = " ".join(part for part in [first_name, last_name] if part) or None
        except Exception:
            author_name = None

    return {
        "found": True,
        "question_id": str(matched_question.get("_id")),
        "question_text": matched_question.get("question"),
        "author": author_name,
        "answer_text": (answer_doc or {}).get("answer", ""),
        "sources": (answer_doc or {}).get("sources", []),
        "source_name": _extract_source_names((answer_doc or {}).get("sources", [])),
    }
