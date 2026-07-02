from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Dict, List, Tuple
from urllib import request

import pymongo

from chemical_guard import _read_sheet_rows
from constants import DB_NAME, MONGODB_URI


EMBED_URL = "http://100.100.108.44:6001/embed"
TARGET_COLLECTION = "pop_test_chemical_compliance"
STATE_VALUE = "Tamil Nadu"


def _normalize(value: str) -> str:
    return str(value or "").strip()


def _load_alias_map() -> Dict[str, Tuple[str, str]]:
    base_dir = Path(__file__).resolve().parent
    alias_rows = _read_sheet_rows(base_dir / "data" / "chemical_name_alias.xlsx")
    alias_map: Dict[str, Tuple[str, str]] = {}

    for row in alias_rows[1:]:
        if len(row) < 3:
            continue
        chemical_id = _normalize(row[0])
        chemical_name = _normalize(row[1])
        alias = _normalize(row[2])
        if not chemical_id or not alias:
            continue
        # deterministic choice: keep first alias for a chemical
        alias_map.setdefault(chemical_id, (chemical_name, alias))
    return alias_map


def _load_policy_rows() -> List[dict]:
    base_dir = Path(__file__).resolve().parent
    banned_rows = _read_sheet_rows(base_dir / "data" / "banned_chemicals.xlsx")
    output: List[dict] = []
    for row in banned_rows[1:]:
        if len(row) < 3:
            continue
        output.append(
            {
                "chemical_id": _normalize(row[0]),
                "chemical_name": _normalize(row[1]),
                "status": _normalize(row[2]),
            }
        )
    return output


def _embed_text(text: str) -> List[float]:
    payload = json.dumps({"text": text}).encode("utf-8")
    req = request.Request(
        EMBED_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    if isinstance(data, dict):
        if isinstance(data.get("embedding"), list):
            return data["embedding"]
        if isinstance(data.get("embeddings"), list) and data["embeddings"]:
            first = data["embeddings"][0]
            if isinstance(first, list):
                return first
            if isinstance(first, dict) and isinstance(first.get("embedding"), list):
                return first["embedding"]
        if isinstance(data.get("data"), list) and data["data"]:
            first = data["data"][0]
            if isinstance(first, dict) and isinstance(first.get("embedding"), list):
                return first["embedding"]

    raise ValueError(f"Unexpected embedding response format: {data}")


def _build_test_records() -> List[dict]:
    alias_map = _load_alias_map()
    policies = _load_policy_rows()

    restricted: List[dict] = []
    non_restricted: List[dict] = []

    for row in policies:
        chemical_id = row["chemical_id"]
        status = row["status"]
        if chemical_id not in alias_map:
            continue
        entry = {
            "chemical_id": chemical_id,
            "chemical_name": alias_map[chemical_id][0] or row["chemical_name"],
            "alias": alias_map[chemical_id][1],
            "status": status,
        }
        if status.lower() == "restricted":
            restricted.append(entry)
        else:
            non_restricted.append(entry)

    restricted = sorted(restricted, key=lambda x: x["chemical_id"])[:4]
    non_restricted = sorted(non_restricted, key=lambda x: x["chemical_id"])[:4]

    records: List[dict] = []
    page_no = 1000
    for row in restricted:
        page_no += 1
        text = (
            f"For pest management in paddy, {row['alias']} is discussed in advisory context. "
            "Always follow label claim and government restriction conditions."
        )
        records.append(
            {
                "text": text,
                "metadata": {
                    "state": STATE_VALUE,
                    "source": "https://test-pop.local/restricted",
                    "headings": ["Test Compliance", "Restricted Chemical"],
                    "page_no": page_no,
                    "pop_name": "POP_TEST_COMPLIANCE",
                },
            }
        )

    for row in non_restricted:
        page_no += 1
        text = (
            f"Recommendation note mentions {row['alias']} in treatment examples for insects. "
            "Farmers should verify whether this is currently permitted."
        )
        records.append(
            {
                "text": text,
                "metadata": {
                    "state": STATE_VALUE,
                    "source": "https://test-pop.local/non-restricted",
                    "headings": ["Test Compliance", "Non Restricted Chemical"],
                    "page_no": page_no,
                    "pop_name": "POP_TEST_COMPLIANCE",
                },
            }
        )

    clean_texts = [
        "Use yellow sticky traps and field sanitation to reduce pest pressure in vegetables.",
        "Maintain irrigation intervals based on soil moisture and crop growth stage.",
        "Seed treatment with approved bio-inputs supports healthy early plant establishment.",
    ]
    for idx, text in enumerate(clean_texts, start=1):
        page_no += 1
        records.append(
            {
                "text": text,
                "metadata": {
                    "state": STATE_VALUE,
                    "source": "https://test-pop.local/clean",
                    "headings": ["Test Compliance", "Clean Control"],
                    "page_no": page_no,
                    "pop_name": "POP_TEST_COMPLIANCE",
                    "clean_case_id": idx,
                },
            }
        )

    return records


def seed() -> None:
    docs = _build_test_records()
    if not docs:
        raise RuntimeError("No test records generated. Check XLSX source files.")

    client = pymongo.MongoClient(MONGODB_URI, tlsAllowInvalidCertificates=True)
    collection = client[DB_NAME][TARGET_COLLECTION]

    delete_result = collection.delete_many({"metadata.pop_name": "POP_TEST_COMPLIANCE"})

    now = datetime.now(timezone.utc).isoformat()
    prepared_docs = []
    for item in docs:
        embedding = _embed_text(item["text"])
        prepared_docs.append(
            {
                "text": item["text"],
                "embedding": embedding,
                "metadata": {
                    **item["metadata"]
                },
            }
        )

    insert_result = collection.insert_many(prepared_docs, ordered=True)

    counter = Counter(doc["metadata"]["source"] for doc in prepared_docs)
    print("SEED_SUMMARY")
    print(f"db={DB_NAME} collection={TARGET_COLLECTION}")
    print(f"deleted_existing_test_docs={delete_result.deleted_count}")
    print(f"inserted_total={len(insert_result.inserted_ids)}")
    print("inserted_by_expected_behavior=" + json.dumps(counter, sort_keys=True))
    print("sample_docs=")
    for doc_id, doc in list(zip(insert_result.inserted_ids, prepared_docs))[:5]:
        print(
            json.dumps(
                {
                    "_id": str(doc_id),
                    "source": doc["metadata"]["source"],
                    "text_preview": doc["text"][:90],
                },
                ensure_ascii=True,
            )
        )


if __name__ == "__main__":
    seed()
