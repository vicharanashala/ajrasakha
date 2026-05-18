import re
from typing import Any, Dict

from bson import ObjectId
from pymongo import AsyncMongoClient
from pymongo.errors import PyMongoError
import reviewer_values
from normalised_crop_names import golden_crop_names


def _escape_exact_regex(value: str) -> str:
    return f"^{re.escape((value or '').strip())}$"


def _escape_question_prefix_regex(value: str) -> str:
    """
    Match records where text starts with question, then newline(s), then answer.
    Example format:
      Question text

      Answer text...
    """
    escaped_question = re.escape((value or "").strip())
    return rf"^\s*{escaped_question}\s*(?:\r?\n)+\s*.+"


def _get_golden_crop_search_variants(crop: str | None) -> list[str]:
    if not crop:
        return []
    crop_clean = crop.strip()
    if not crop_clean:
        return []

    for canonical, variants in golden_crop_names.items():
        if canonical.lower() == crop_clean.lower():
            return list(dict.fromkeys(variants))
        for variant in variants:
            if str(variant).lower() == crop_clean.lower():
                return list(dict.fromkeys(variants))

    return [crop_clean]


def _is_missing_source_name(name: Any) -> bool:
    if name is None:
        return True
    normalized = str(name).strip().lower()
    return normalized in {"", "preview not available", "na", "n/a", "none", "null"}


def _normalize_sources_with_names(sources: Any) -> list[dict]:
    if not isinstance(sources, list):
        return []

    normalized: list[dict] = []
    for idx, source in enumerate(sources, start=1):
        fallback_name = f"source_{idx}"
        if isinstance(source, dict):
            item = dict(source)
            name = (
                item.get("source_name")
                or item.get("sourceName")
                or item.get("name")
                or item.get("title")
            )
            item["source_name"] = fallback_name if _is_missing_source_name(name) else str(name).strip()
            normalized.append(item)
        elif isinstance(source, str):
            normalized.append({"source": source, "page": None, "source_name": fallback_name})
        else:
            normalized.append({"source": str(source), "page": None, "source_name": fallback_name})
    return normalized


def _build_golden_sources(source_field: Any) -> list[dict]:
    """Split Golden source links and add source_1, source_2 placeholders."""
    if source_field is None:
        return []

    links: list[str] = []
    if isinstance(source_field, str):
        links = [line.strip() for line in source_field.splitlines() if line.strip()]
    elif isinstance(source_field, list):
        for item in source_field:
            if isinstance(item, str):
                links.extend([line.strip() for line in item.splitlines() if line.strip()])
            elif isinstance(item, dict) and item.get("source"):
                links.append(str(item.get("source")).strip())
    elif isinstance(source_field, dict) and source_field.get("source"):
        links = [str(source_field.get("source")).strip()]
    else:
        raw = str(source_field).strip()
        if raw:
            links = [raw]

    return [
        {"source": link, "page": None, "source_name": f"source_{idx}"}
        for idx, link in enumerate(links, start=1)
    ]


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

    normalized_sources = _normalize_sources_with_names((answer_doc or {}).get("sources", []))

    return {
        "found": True,
        "dataset": "reviewer",
        "question_id": str(matched_question.get("_id")),
        "question_text": matched_question.get("question"),
        "author": author_name,
        "answer_text": (answer_doc or {}).get("answer", ""),
        "sources": normalized_sources,
    }


async def find_exact_question_context_in_golden(
    mongo_uri: str,
    mongo_database: str,
    mongo_collection: str,
    original_question: str,
    state: str | None,
    crop: str | None,
) -> Dict[str, Any]:
    """
    Retry exact question lookup in Golden DB dataset by text with optional metadata filters.
    """
    if not mongo_uri or not mongo_database or not mongo_collection:
        return {"found": False, "reason": "missing_golden_db_config"}
    if not (original_question or "").strip():
        return {"found": False, "reason": "missing_original_question"}

    try:
        client = AsyncMongoClient(mongo_uri)
        db = client[mongo_database]
        golden_collection = db[mongo_collection]

        # Golden text usually stores: "<question>\\n\\n<answer>".
        # Match question as prefix before answer body, not full-text equality.
        query_filter: Dict[str, Any] = {
            "$and": [
                {"text": {"$regex": _escape_question_prefix_regex(original_question), "$options": "is"}},
            ]
        }
        if state:
            query_filter["$and"].append(
                {"metadata.State": {"$regex": _escape_exact_regex(state), "$options": "i"}}
            )
        if crop:
            crop_variants = _get_golden_crop_search_variants(crop)
            crop_filters = [
                {"metadata.Crop": {"$regex": _escape_exact_regex(crop_name), "$options": "i"}}
                for crop_name in crop_variants
            ]
            if crop_filters:
                query_filter["$and"].append({"$or": crop_filters})

        matched_doc = await golden_collection.find_one(query_filter, sort=[("_id", -1)])
        if not matched_doc:
            return {"found": False}
    except PyMongoError as exc:
        # Golden lookup is optional fallback; authorization/config errors should not fail the tool call.
        return {"found": False, "reason": "golden_query_failed", "error": str(exc)}
    except Exception as exc:
        return {"found": False, "reason": "golden_query_failed", "error": str(exc)}

    metadata = matched_doc.get("metadata", {}) if isinstance(matched_doc, dict) else {}
    golden_sources = _build_golden_sources(metadata.get("Source [Name and Link]"))
    if not golden_sources:
        golden_sources = [{"source": "", "page": None, "source_name": "source_1"}]
    agri_specialist = metadata.get("Agri Specialist")

    return {
        "found": True,
        "dataset": "golden",
        "question_id": str(matched_doc.get("_id")),
        "question_text": original_question,
        "author": agri_specialist if agri_specialist else None,
        "answer_text": matched_doc.get("text", ""),
        "sources": golden_sources,
        "metadata": metadata,
    }
