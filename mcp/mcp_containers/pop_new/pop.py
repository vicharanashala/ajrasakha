import os
import re
import asyncio
from typing import List, Optional

from fastmcp import FastMCP
from pydantic import BaseModel
from pymongo import MongoClient
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

from langchain_huggingface import HuggingFaceEmbeddings
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------
RESPONSE_GUIDANCE = (
    "* If retrieved context is relevant and sufficient:\n"
    "* Generate answer using available data.\n"
    "* Append:\n"
    '"# Your query has also been shared with an expert for review. '
    'It will be processed within 2 hours. Please ask the same query after 2 hours."\n'
    "* If insufficient:\n"
    '"# We do not have sufficient information to answer your query at the moment. '
    'Your query has been transferred to an expert and will be processed within 2 hours."'
)

# ---------------------------------------------------------------------------
# ENV
# ---------------------------------------------------------------------------
EMBEDDING_MODEL = os.getenv("POP_EMBEDDING_MODEL")

MONGODB_URI = os.getenv("POP_MONGODB_URI")

MONGODB_DATABASE = os.getenv("POP_MONGODB_DATABASE")

MONGODB_COLLECTION = os.getenv("POP_MONGODB_COLLECTION")

# ---------------------------------------------------------------------------
# EMBEDDING MODEL
# ---------------------------------------------------------------------------
embedding_model = HuggingFaceEmbeddings(
    model_name=EMBEDDING_MODEL,
    model_kwargs={
        "device": "cpu"
    },
    encode_kwargs={
        "normalize_embeddings": True
    }
)

# ---------------------------------------------------------------------------
# MONGODB
# ---------------------------------------------------------------------------
mongo_client = MongoClient(MONGODB_URI)

database = mongo_client[MONGODB_DATABASE]

chunks_collection = database[MONGODB_COLLECTION]

# ---------------------------------------------------------------------------
# LOAD STATES + CROPS
# ---------------------------------------------------------------------------
RAW_STATES = sorted([
    s for s in chunks_collection.distinct(
        "document.doc_usage.state"
    )
    if s
])

RAW_CROPS = sorted([
    c for c in chunks_collection.distinct(
        "document.doc_usage.crop"
    )
    if c
])

# ---------------------------------------------------------------------------
# NORMALIZATION
# ---------------------------------------------------------------------------
def _normalize(text: str) -> str:

    text = (text or "").lower()

    text = text.replace("&", "and")

    text = text.replace("_", " ")

    text = re.sub(r"[^\w\s]", " ", text)

    text = re.sub(r"\s+", " ", text)

    return text.strip()

# ---------------------------------------------------------------------------
# MODEL
# ---------------------------------------------------------------------------
class POPChunkResult(BaseModel):

    doc_id: str

    doc_name: str

    doc_link: Optional[str]

    doc_origin: str

    chunk_id: str

    chunk_content: str

    page_no: Optional[int]

    similarity_score: float

    verified_by: Optional[str]

# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------
def _get_verified_by(doc_usage, state_n, crop_n):

    for entry in (doc_usage or []):

        if (
            _normalize(entry.get("state")) == state_n
            and _normalize(entry.get("crop")) == crop_n
        ):
            return entry.get("verified_by")

    return None

# ---------------------------------------------------------------------------
# VALIDATE STATE
# ---------------------------------------------------------------------------
def validate_state(state: str):

    state_n = _normalize(state)

    for s in RAW_STATES:

        if _normalize(s) == state_n:
            return s

    for s in RAW_STATES:

        norm_s = _normalize(s)

        if state_n in norm_s or norm_s in state_n:
            return s

    return None

# ---------------------------------------------------------------------------
# GET CROPS FOR STATE
# ---------------------------------------------------------------------------
def get_available_crops_for_state(state_n: str):

    pipeline = [

        {
            "$match": {
                "document.doc_usage.state": {
                    "$regex": re.escape(state_n),
                    "$options": "i"
                }
            }
        },

        {
            "$unwind": "$document.doc_usage"
        },

        {
            "$match": {
                "document.doc_usage.state": {
                    "$regex": re.escape(state_n),
                    "$options": "i"
                }
            }
        },

        {
            "$group": {
                "_id": "$document.doc_usage.crop"
            }
        }
    ]

    results = list(
        chunks_collection.aggregate(pipeline)
    )

    return sorted([
        r["_id"]
        for r in results
        if r.get("_id")
    ])

# ---------------------------------------------------------------------------
# VALIDATE CROP
# ---------------------------------------------------------------------------
def validate_crop(crop: str, available_crops: list):

    crop_n = _normalize(crop)

    for c in available_crops:

        norm_c = _normalize(c)

        # Exact
        if norm_c == crop_n:
            return c

        # Partial
        if crop_n in norm_c or norm_c in crop_n:
            return c

    return None

# ---------------------------------------------------------------------------
# SEARCH
# ---------------------------------------------------------------------------
def _search(
    query_embedding,
    origin_filter,
    state_n,
    crop_n,
    limit,
    exclude_doc_ids,
):

    mongo_query = {

        **origin_filter,

        "document.doc_usage": {
            "$elemMatch": {

                "state": {
                    "$regex": re.escape(state_n),
                    "$options": "i"
                },

                "crop": {
                    "$regex": re.escape(crop_n),
                    "$options": "i"
                },
            }
        },

        "document.doc_id": {
            "$nin": list(exclude_doc_ids)
        },
    }

    docs = list(
        chunks_collection.find(mongo_query)
    )

    results = []

    for doc in docs:

        document = doc.get("document", {})

        chunks = doc.get("chunks", [])

        if not chunks:
            continue

        embeddings = []

        valid_chunks = []

        for chunk in chunks:

            emb = chunk.get("embedding_vector")

            if emb:

                embeddings.append(emb)

                valid_chunks.append(chunk)

        if not embeddings:
            continue

        scores = cosine_similarity(
            np.array(query_embedding).reshape(1, -1),
            np.array(embeddings)
        )[0]

        best_idx = int(np.argmax(scores))

        best_chunk = valid_chunks[best_idx]

        results.append(

            POPChunkResult(

                doc_id=str(
                    document.get("doc_id", "")
                ),

                doc_name=str(
                    document.get("doc_name", "")
                ),

                doc_link=document.get(
                    "unique_links"
                ),

                doc_origin=str(
                    document.get("state") or ""
                ),

                chunk_id=str(
                    best_chunk.get("chunk_id", "")
                ),

                chunk_content=str(
                    best_chunk.get("chunk_content", "")
                ),

                page_no=best_chunk.get(
                    "page_no"
                ),

                similarity_score=float(
                    scores[best_idx]
                ),

                verified_by=_get_verified_by(
                    document.get("doc_usage", []),
                    state_n,
                    crop_n,
                ),
            )
        )

    results.sort(
        key=lambda r: r.similarity_score,
        reverse=True
    )

    return results[:limit]

# ---------------------------------------------------------------------------
# MCP
# ---------------------------------------------------------------------------
mcp = FastMCP(
    "ajrasakha-pop-mcp"
)

# ---------------------------------------------------------------------------
# MCP TOOL
# ---------------------------------------------------------------------------
@mcp.tool()
async def get_context_from_pop(
    query: str,
    state: str,
    crop: str,
) -> List[dict]:
    """
    Retrieve POP context chunks.

    Retrieval Flow:

    Case 1:
        document.state == state

    Case 2:
        document.state == central

    Case 3:
        document.state != state
        AND
        document.state != central

    Additional filters:

        doc_usage.state == state
        AND
        doc_usage.crop == crop
    """

    # -------------------------------------------------------------------
    # VALIDATE STATE
    # -------------------------------------------------------------------
    matched_state = validate_state(state)

    if not matched_state:

        return [{

            "contexts": [],

            "message":
                f"We do not currently have POP data "
                f"for state '{state}'.",

            "available_states":
                RAW_STATES
        }]

    state = matched_state

    state_n = _normalize(state)

    # -------------------------------------------------------------------
    # VALIDATE CROP
    # -------------------------------------------------------------------

    available_crops = get_available_crops_for_state(state_n)

    matched_crop = validate_crop(
        crop,
        available_crops
    )

    if not matched_crop:

        return [{

            "contexts": [],

            "message":
                f"We do not currently have POP data "
                f"for crop '{crop}' in state '{state}'.",

            "available_crops_for_state":
                available_crops,

            "total_available_crops":
                len(available_crops)
        }]

    crop = matched_crop

    crop_n = _normalize(crop)

    # -------------------------------------------------------------------
    # EMBEDDING
    # -------------------------------------------------------------------
    query_embedding = embedding_model.embed_query(query)

    # -------------------------------------------------------------------
    # CASE FILTERS
    # -------------------------------------------------------------------
    case_filters = [

        # ---------------------------------------------------------------
        # CASE 1
        # document.state == state
        # ---------------------------------------------------------------
        {
            "document.state": {
                "$regex": re.escape(state_n),
                "$options": "i"
            }
        },

        # ---------------------------------------------------------------
        # CASE 2
        # document.state == central
        # ---------------------------------------------------------------
        {
            "document.state": {
                "$regex": r"^central$",
                "$options": "i"
            }
        },

        # ---------------------------------------------------------------
        # CASE 3
        # document.state != state
        # document.state != central
        # ---------------------------------------------------------------
        {
            "$nor": [

                {
                    "document.state": {
                        "$regex": re.escape(state_n),
                        "$options": "i"
                    }
                },

                {
                    "document.state": {
                        "$regex": r"^central$",
                        "$options": "i"
                    }
                },
            ]
        },
    ]

    # -------------------------------------------------------------------
    # SEQUENTIAL RETRIEVAL
    # -------------------------------------------------------------------
    collected = []

    seen_doc_ids = set()

    for case_filter in case_filters:

        if len(collected) >= 5:
            break

        batch = await asyncio.to_thread(

            _search,

            query_embedding,

            case_filter,

            state_n,

            crop_n,

            5 - len(collected),

            seen_doc_ids,
        )

        collected.extend(batch)

        seen_doc_ids.update(
            r.doc_id
            for r in batch
        )

    # -------------------------------------------------------------------
    # NO CONTEXT FOUND
    # -------------------------------------------------------------------
    if not collected:

        return [{

            "contexts": [],

            "message":
                f"POP data exists for crop '{crop}' "
                f"in state '{state}', but no relevant "
                f"context could be retrieved for this query.",

            "response_guidance":
                RESPONSE_GUIDANCE,
        }]

    # -------------------------------------------------------------------
    # SUCCESS
    # -------------------------------------------------------------------
    return [{

        "contexts": [

            r.model_dump()

            for r in collected
        ],

        "response_guidance":
            RESPONSE_GUIDANCE,
    }]

# ---------------------------------------------------------------------------
# RUN
# ---------------------------------------------------------------------------
if __name__ == "__main__":

    mcp.run(
        transport="streamable-http",
        host="0.0.0.0",
        port=9003,
    )