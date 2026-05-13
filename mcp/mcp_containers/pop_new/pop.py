import os
import re
import asyncio
from typing import List, Optional, Tuple
from collections import defaultdict

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import BaseModel
from pymongo import MongoClient
from sklearn.metrics.pairwise import cosine_similarity
from rapidfuzz import process
import numpy as np

from langchain_huggingface import HuggingFaceEmbeddings
from dotenv import load_dotenv
load_dotenv()

RESPONSE_GUIDANCE = (
    "* If retrieved context is relevant and sufficient:\n"
    "* Generate answer using available data.\n"
    "* Append:\n"
    '"# Your query has also been shared with an expert for review. '
    "It will be processed within 2 hours. Please ask the same query after 2 hours.\"\n"
    "* If insufficient:\n"
    '"# We do not have sufficient information to answer your query at the moment. '
    "Your query has been transferred to an expert and will be processed within 2 hours.\""
)

STATE_CODE_TO_NAME = {
    "AP": "Andhra Pradesh",
    "AR": "Arunachal Pradesh",
    "AS": "Assam",
    "BR": "Bihar",
    "CG": "Chhattisgarh",
    "GA": "Goa",
    "GJ": "Gujarat",
    "HR": "Haryana",
    "JK": "Jammu and Kashmir",
    "JH": "Jharkhand",
    "KA": "Karnataka",
    "KL": "Kerala",
    "MH": "Maharashtra",
    "MN": "Manipur",
    "ML": "Meghalaya",
    "MZ": "Mizoram",
    "NL": "Nagaland",
    "OR": "Odisha",
    "PB": "Punjab",
    "RJ": "Rajasthan",
    "SK": "Sikkim",
    "TN": "Tamil Nadu",
    "TR": "Tripura",
    "UP": "Uttar Pradesh",
    "UK": "Uttarakhand",
    "WB": "West Bengal",
    "DL": "Delhi",
    "MULTIPLE": "Pops_Multiple_States",
}

# ---------------------------------------------------------------------------
# ENV
# ---------------------------------------------------------------------------
EMBEDDING_MODEL    = os.getenv("POP_EMBEDDING_MODEL")
MONGODB_URI        = os.getenv("POP_MONGODB_URI")
MONGODB_DATABASE   = os.getenv("POP_MONGODB_DATABASE")
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

mongo_client      = MongoClient(MONGODB_URI)
database          = mongo_client[MONGODB_DATABASE]
chunks_collection = database[MONGODB_COLLECTION]

# ---------------------------------------------------------------------------
# LOAD STATES & CROPS FROM DB
# ---------------------------------------------------------------------------
RAW_STATES = [s for s in chunks_collection.distinct("document.doc_usage.state") if s]
RAW_CROPS  = [c for c in chunks_collection.distinct("document.doc_usage.crop")  if c]

# ---------------------------------------------------------------------------
# NORMALIZE
# ---------------------------------------------------------------------------
def _normalize(text: str) -> str:
    text = (text or "").lower()
    text = text.replace("&", "and").replace("_", " ")
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()

# ---------------------------------------------------------------------------
# ALIAS MAP
# ---------------------------------------------------------------------------
def _generate_aliases(state: str):
    norm    = _normalize(state)
    aliases = {norm, norm.replace(" ", "")}
    words   = norm.split()
    if len(words) > 1:
        aliases.add("".join(w[0] for w in words))   # initials
    return aliases

STATE_ALIAS_MAP: dict = defaultdict(list)
for _s in RAW_STATES:
    for _a in _generate_aliases(_s):
        STATE_ALIAS_MAP[_a].append(_s)

CROP_MAP = {_normalize(c): c for c in RAW_CROPS}

# ---------------------------------------------------------------------------
# MODEL
# ---------------------------------------------------------------------------
class POPChunkResult(BaseModel):
    doc_id:           str
    doc_name:         str
    doc_link:         Optional[str]   # from document.unique_links
    doc_origin:       str             # from document.state
    chunk_id:         str
    chunk_content:    str
    page_no:          Optional[int]
    similarity_score: float
    verified_by:      Optional[str]

# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------
def _get_verified_by(doc_usage: list, state_n: str, crop_n: str) -> Optional[str]:
    for entry in (doc_usage or []):
        if (
            _normalize(entry.get("state")) == state_n
            and _normalize(entry.get("crop")) == crop_n
        ):
            return entry.get("verified_by")
    return None


def _resolve_state_code(code: str) -> Tuple[Optional[str], list]:
    """
    Map a 2-3 char uppercase state code to a full state name.
    Returns (state_name, []) on success, (None, ambiguous_list) if multiple
    DB states match, or (None, []) if the code is unknown.
    """
    code = code.upper()
    if code not in STATE_CODE_TO_NAME:
        return None, []

    mapped = STATE_CODE_TO_NAME[code]
    norm_mapped = _normalize(mapped)

    # Find matching states already in the DB
    matches = [s for s in RAW_STATES if norm_mapped in _normalize(s)]

    if len(matches) == 1:
        return matches[0], []
    if len(matches) > 1:
        return None, matches
    # Code is valid but no DB documents yet — use the mapped name directly
    return mapped, []

# ---------------------------------------------------------------------------
# STATE + CROP EXTRACTION
# ---------------------------------------------------------------------------
def extract_state_crop(query: str) -> Tuple[Optional[str], Optional[str], list]:
    """
    Returns (state, crop, ambiguous_states).
    ambiguous_states is non-empty only when a state code maps to multiple candidates.
    """
    q     = _normalize(query)
    words = set(q.split())

    detected_state: Optional[str] = None
    detected_crop:  Optional[str] = None

    # ------------------------------------------------------------------
    # Step 0 — STATE CODE from the ORIGINAL query  ← KEY FIX
    #
    # Scan pre-normalized tokens for uppercase abbreviations like "AP",
    # "TN", "MH".  Using the original casing means we don't confuse
    # common lowercase words ("in", "of", "or") with state codes.
    # ------------------------------------------------------------------
    for raw_token in query.split():
        token = re.sub(r"[^\w]", "", raw_token)          # strip punctuation
        if 2 <= len(token) <= 3 and token.isupper():     # must be ALL-CAPS
            state, ambiguous = _resolve_state_code(token)
            if ambiguous:
                return None, None, ambiguous
            if state:
                detected_state = state
                break

    # ------------------------------------------------------------------
    # Step 1 — EXACT PHRASE MATCH (full state name as substring of query)
    # ------------------------------------------------------------------
    if not detected_state:
        exact = [s for s in RAW_STATES if _normalize(s) in q]
        if len(exact) == 1:
            detected_state = exact[0]
        elif len(exact) > 1:
            exact.sort(key=lambda s: -len(_normalize(s)))   # longest wins
            detected_state = exact[0]

    # ------------------------------------------------------------------
    # Step 2 — ALL-WORD MATCH (every word of the state name is in query)
    # ------------------------------------------------------------------
    if not detected_state:
        strict = [
            s for s in RAW_STATES
            if set(_normalize(s).split()).issubset(words)
        ]
        if len(strict) == 1:
            detected_state = strict[0]
        elif len(strict) > 1:
            strict.sort(key=lambda s: -len(_normalize(s)))
            detected_state = strict[0]

    # ------------------------------------------------------------------
    # Step 3 — PARTIAL MATCH (≥ half the state's words appear in query)
    # ------------------------------------------------------------------
    if not detected_state:
        partial = []
        for s in RAW_STATES:
            sw      = set(_normalize(s).split())
            overlap = sw & words
            if len(overlap) >= max(1, len(sw) // 2):
                partial.append(s)
        if len(partial) == 1:
            detected_state = partial[0]

    # ------------------------------------------------------------------
    # Step 4 — ALIAS MAP
    # ------------------------------------------------------------------
    if not detected_state:
        for alias, states in STATE_ALIAS_MAP.items():
            hit = (len(alias) <= 3 and alias in words) or (
                  len(alias) > 3  and alias in q)
            if hit:
                if len(states) == 1:
                    detected_state = states[0]
                else:
                    return None, None, states
                break

    # ------------------------------------------------------------------
    # Step 5 — FUZZY MATCH (last resort)
    # ------------------------------------------------------------------
    if not detected_state and RAW_STATES:
        match, score, _ = process.extractOne(q, RAW_STATES)
        if score > 85:
            detected_state = match

    # ------------------------------------------------------------------
    # Crop — exact substring of normalized query
    # ------------------------------------------------------------------
    for norm_crop, orig_crop in CROP_MAP.items():
        if norm_crop in q:
            detected_crop = orig_crop
            break

    return detected_state, detected_crop, []

# ---------------------------------------------------------------------------
# CORE SEARCH  (one case at a time)
# ---------------------------------------------------------------------------
def _search(
    query_embedding:  list,
    origin_filter:    dict,
    state_n:          str,
    crop_n:           str,
    limit:            int,
    exclude_doc_ids:  set,
) -> List[POPChunkResult]:
    """
    Fetch documents that satisfy:
      • origin_filter          (document.state condition for this case)
      • doc_usage entry with matching state & crop
      • doc_id not already collected

    Pick the highest-similarity chunk per document; return top `limit`.
    """
    mongo_query = {
        **origin_filter,
        "document.doc_usage": {
            "$elemMatch": {
                "state": {"$regex": re.escape(state_n), "$options": "i"},
                "crop":  {"$regex": re.escape(crop_n),  "$options": "i"},
            }
        },
        "document.doc_id": {"$nin": list(exclude_doc_ids)},
    }

    docs    = list(chunks_collection.find(mongo_query))
    results: List[POPChunkResult] = []

    for doc in docs:
        document = doc.get("document", {})
        chunks   = doc.get("chunks", [])
        if not chunks:
            continue

        embeddings, valid_chunks = [], []
        for c in chunks:
            emb = c.get("embedding_vector")
            if emb:
                embeddings.append(emb)
                valid_chunks.append(c)

        if not embeddings:
            continue

        scores = cosine_similarity(
            np.array(query_embedding).reshape(1, -1),
            np.array(embeddings),
        )[0]

        idx  = int(np.argmax(scores))
        best = valid_chunks[idx]

        results.append(POPChunkResult(
            doc_id           = str(document.get("doc_id", "")),
            doc_name         = str(document.get("doc_name", "")),
            doc_link         = document.get("unique_links"),      
            doc_origin       = str(document.get("state") or ""),  
            chunk_id         = str(best.get("chunk_id", "")),
            chunk_content    = str(best.get("chunk_content", "")),
            page_no          = best.get("page_no"),
            similarity_score = float(scores[idx]),
            verified_by      = _get_verified_by(
                                   document.get("doc_usage", []),
                                   state_n, crop_n),
        ))

    results.sort(key=lambda r: r.similarity_score, reverse=True)
    return results[:limit]

# ---------------------------------------------------------------------------
# MCP
# ---------------------------------------------------------------------------
mcp = FastMCP(
    "ajrasakha-pop-mcp",
    port=9003,
    host="0.0.0.0",
)


@mcp.tool()
async def get_context_from_pop(query: str) -> List[dict]:
    """
    Retrieve POP context chunks for the given agronomic query.

    Cases run sequentially until 5 documents are collected:
      Case 1 — document.state matches the detected state
      Case 2 — document.state is "central"
      Case 3 — everything else
    All cases additionally filter by doc_usage (state + crop match).
    """
    state, crop, ambiguous = extract_state_crop(query)

    if ambiguous:
        return [{"error": "AMBIGUOUS_STATE", "possible_states": ambiguous}]

    if not state or not crop:
        return [{"message": f"Could not detect {'state' if not state else 'crop'} from query."}]

    state_n = _normalize(state)
    crop_n  = _normalize(crop)

    query_embedding = embedding_model.embed_query(query)

    case_filters = [
        # Case 1: origin == detected state
        {"document.state": {"$regex": re.escape(state_n), "$options": "i"}},
        # Case 2: origin == central
        {"document.state": {"$regex": r"^central$", "$options": "i"}},
        # Case 3: origin is something else entirely
        {"$nor": [
            {"document.state": {"$regex": re.escape(state_n), "$options": "i"}},
            {"document.state": {"$regex": r"^central$",        "$options": "i"}},
        ]},
    ]

    collected:    List[POPChunkResult] = []
    seen_doc_ids: set                  = set()

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
        seen_doc_ids.update(r.doc_id for r in batch)

    if not collected:
        return [{
            "contexts":          [],
            "message":           "No relevant data found.",
            "response_guidance": RESPONSE_GUIDANCE,
        }]

    return [{
        "contexts":          [r.model_dump() for r in collected],
        "response_guidance": RESPONSE_GUIDANCE,
    }]


# ---------------------------------------------------------------------------
# RUN
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    mcp.run(transport="streamable-http")