from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from pymongo import MongoClient
from sentence_transformers import SentenceTransformer
import os
import uvicorn
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="AgriAI Q&A Semantic Search")

# --- Reviewer DB (existing) ---
MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME", "agriai")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "questions")
VECTOR_INDEX_NAME = os.getenv("VECTOR_INDEX_NAME", "vector_index")

# --- Golden + PoP DB ---
# Defaults chosen to match your MCP containers, but you should set these in env.
GOLDEN_MONGO_URI = os.getenv("GOLDEN_MONGO_URI") or MONGO_URI
GOLDEN_DB_NAME = os.getenv("GOLDEN_DB_NAME", "golden_db")
GOLDEN_QA_COLLECTION = os.getenv("GOLDEN_QA_COLLECTION", "agri_qa_latest")
GOLDEN_POP_COLLECTION = os.getenv("GOLDEN_POP_COLLECTION", "pop")
GOLDEN_VECTOR_INDEX_NAME = os.getenv("GOLDEN_VECTOR_INDEX_NAME", "vector_index")

# Embedding model used for the query vector. Must match the embedding dimensionality
# used when building your Atlas vector index.
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "BAAI/bge-large-en")

reviewer_client = MongoClient(MONGO_URI)
reviewer_collection = reviewer_client[DB_NAME][COLLECTION_NAME]

golden_client = MongoClient(GOLDEN_MONGO_URI)
golden_qa_collection = golden_client[GOLDEN_DB_NAME][GOLDEN_QA_COLLECTION]
golden_pop_collection = golden_client[GOLDEN_DB_NAME][GOLDEN_POP_COLLECTION]

model = SentenceTransformer(EMBEDDING_MODEL_NAME)


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
    threshold: float = 0.8
    # Reviewer + golden: optional district/state/crop/domain/season (see schema).
    # PoP has no district — only state + attributes apply. Wildcard districts still
    # require crop/domain/season when those are sent.
    district: str | None = None
    state: str | None = None
    # When set, documents must match these (case-insensitive). Applies to every hit,
    # including wildcard districts (FAQ / N/A / All / …), so location wildcards do
    # not bypass crop / domain / season.
    crop: str | None = None
    domain: str | None = None
    season: str | None = None


class QAItem(BaseModel):
    id: str
    question: str
    text: str | None = None
    answer: str | None = None
    details: dict
    status: str
    source: str
    score: float


class GoldenQAItem(BaseModel):
    text: str
    question: str
    answer: str
    metadata: dict
    score: float


class PopItem(BaseModel):
    text: str
    metadata: dict
    score: float


class MultiSearchResponse(BaseModel):
    reviewer: list[QAItem]
    golden: list[GoldenQAItem]
    pop: list[PopItem]


# District values that are not a specific place: include only when document state
# matches request state (same rule as legacy FAQ / Unknown).
_STATE_SCOPED_WILDCARD_DISTRICTS_CF = frozenset(
    x.casefold()
    for x in (
        "#N/A",
        "N/A",
        "All",
        "General",
        "Multiple",
        "Unknown",
        "Not specified",
        "not provided",
        "FAQ",
    )
)


def _is_state_scoped_wildcard_district(doc_district: str) -> bool:
    dd = (doc_district or "").strip()
    if not dd:
        return False
    return dd.casefold() in _STATE_SCOPED_WILDCARD_DISTRICTS_CF


def _passes_location_filter(
    doc_district: str | None,
    doc_state: str | None,
    filter_district: str | None,
    filter_state: str | None,
) -> bool:
    """Apply optional district/state filter for reviewer, golden, and PoP.

    Wildcard districts (FAQ, Unknown, N/A, All, General, etc.) pass only when
    ``filter_state`` is set and matches ``doc_state`` (case-insensitive).
    """
    fd = (filter_district or "").strip() or None
    fs = (filter_state or "").strip() or None
    dd = (doc_district or "").strip()
    ds = (doc_state or "").strip()

    if not fd and not fs:
        return True

    if _is_state_scoped_wildcard_district(dd):
        if not fs:
            return False
        if not ds:
            return False
        return ds.casefold() == fs.casefold()

    if fd and dd.casefold() != fd.casefold():
        return False
    if fs:
        if not ds:
            return False
        if ds.casefold() != fs.casefold():
            return False
    return True


def _want(s: str | None) -> str | None:
    if s is None:
        return None
    t = str(s).strip()
    return t or None


def _passes_attribute_filters(
    request: SearchRequest,
    *,
    crop: str | None,
    domain: str | None,
    season: str | None,
) -> bool:
    """Require crop/domain/season to match when the client sends them."""
    wc, wd, ws = _want(request.crop), _want(request.domain), _want(request.season)
    if wc:
        dc = _want(crop)
        if not dc or dc.casefold() != wc.casefold():
            return False
    if wd:
        dd = _want(domain)
        if not dd or dd.casefold() != wd.casefold():
            return False
    if ws:
        ds = _want(season)
        if not ds or ds.casefold() != ws.casefold():
            return False
    return True


def _any_request_filters(request: SearchRequest) -> bool:
    return bool(
        _want(request.district)
        or _want(request.state)
        or _want(request.crop)
        or _want(request.domain)
        or _want(request.season)
    )


_FILTER_POOL_MULTIPLIER = 20

def _fetch_k(request: SearchRequest) -> int:
    """When filters are active, widen the candidate pool so post-filtering
    doesn't eat all results.  Return value replaces top_k in _vector_search."""
    if _any_request_filters(request):
        return max(request.top_k * _FILTER_POOL_MULTIPLIER, 50)
    return request.top_k


def _reviewer_passes_filters(request: SearchRequest, item: QAItem) -> bool:
    d = item.details or {}
    if not _passes_location_filter(
        d.get("district"),
        d.get("state"),
        request.district,
        request.state,
    ):
        return False
    return _passes_attribute_filters(
        request,
        crop=d.get("crop"),
        domain=d.get("domain"),
        season=d.get("season"),
    )


def _golden_passes_filters(request: SearchRequest, item: GoldenQAItem) -> bool:
    md = item.metadata or {}
    if not _passes_location_filter(
        md.get("District"),
        md.get("State"),
        request.district,
        request.state,
    ):
        return False
    # Golden schema: Crop, Category (maps to request "domain"), Season, District, State
    return _passes_attribute_filters(
        request,
        crop=md.get("Crop"),
        domain=md.get("Category"),
        season=md.get("Season"),
    )


def _pop_passes_filters(request: SearchRequest, item: PopItem) -> bool:
    md = item.metadata or {}
    # PoP has no district in metadata — only filter by state (and crop/domain/season).
    # Never pass request.district here or every PoP row would fail district match.
    if not _passes_location_filter(
        None,
        md.get("state") or md.get("State"),
        None,
        request.state,
    ):
        return False
    return _passes_attribute_filters(
        request,
        crop=md.get("crop") or md.get("Crop"),
        domain=md.get("domain")
        or md.get("Domain")
        or md.get("category")
        or md.get("Category"),
        season=md.get("season") or md.get("Season"),
    )


def parse_answer(text: str | None) -> str | None:
    if not text:
        return None
    lower = text.lower()
    marker = "\n\nanswer:"
    idx = lower.find(marker)
    if idx != -1:
        return text[idx + len(marker) :].strip()
    marker2 = "\nanswer:"
    idx2 = lower.find(marker2)
    if idx2 != -1:
        return text[idx2 + len(marker2) :].strip()
    return None


def serialize_doc(doc: dict) -> QAItem:
    return QAItem(
        id=str(doc["_id"]),
        question=doc.get("question", ""),
        text=doc.get("text"),
        answer=parse_answer(doc.get("text")),
        details=doc.get("details", {}),
        status=doc.get("status", ""),
        source=doc.get("source", ""),
        score=float(doc.get("score", 0.0) or 0.0),
    )


def _parse_golden_qa_text(text: str) -> tuple[str, str]:
    if not text:
        return "", ""
    if "Question:" in text and "\n\nAnswer:" in text:
        parts = text.split("\n\nAnswer:", 1)
        return parts[0].replace("Question:", "", 1).strip(), parts[1].strip()
    if "\n\n" in text:
        parts = text.split("\n\n", 1)
        return parts[0].strip(), parts[1].strip()
    return text.strip(), ""


def _vector_search(
    *,
    collection,
    query_embedding: list[float],
    top_k: int,
    index_name: str,
    project: dict,
    filter_query: dict | None = None,
):
    vector_stage: dict = {
        "$vectorSearch": {
            "index": index_name,
            "path": "embedding",
            "queryVector": query_embedding,
            "numCandidates": max(top_k * 10, 50),
            "limit": top_k,
        }
    }
    if filter_query:
        vector_stage["$vectorSearch"]["filter"] = filter_query

    pipeline = [vector_stage, {"$project": project}]
    return list(collection.aggregate(pipeline))


@app.post("/search", response_model=list[QAItem])
def search_questions(request: SearchRequest):
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query must not be empty.")

    query_text = f"Represent this sentence for searching relevant passages: {request.query}"
    query_embedding = model.encode(query_text, normalize_embeddings=True).tolist()

    results = _vector_search(
        collection=reviewer_collection,
        query_embedding=query_embedding,
        top_k=_fetch_k(request),
        index_name=VECTOR_INDEX_NAME,
        project={
            "_id": 1,
            "question": 1,
            "text": 1,
            "details": 1,
            "status": 1,
            "source": 1,
            "score": {"$meta": "vectorSearchScore"},
        },
    )

    if not results:
        return []
    items = [serialize_doc(doc) for doc in results]
    if _any_request_filters(request):
        items = [x for x in items if _reviewer_passes_filters(request, x)]
    return items[: request.top_k]


# @app.post("/search_all", response_model=MultiSearchResponse)
# def search_all(request: SearchRequest):
#     if not request.query.strip():
#         raise HTTPException(status_code=400, detail="Query must not be empty.")
#     if request.top_k <= 0:
#         raise HTTPException(status_code=400, detail="top_k must be > 0.")
#     if not (0.0 <= request.threshold <= 1.0):
#         raise HTTPException(status_code=400, detail="threshold must be between 0 and 1.")

#     query_text = f"Represent this sentence for searching relevant passages: {request.query}"
#     query_embedding = model.encode(query_text, normalize_embeddings=True).tolist()

#     reviewer_raw = _vector_search(
#         collection=reviewer_collection,
#         query_embedding=query_embedding,
#         top_k=request.top_k,
#         index_name=VECTOR_INDEX_NAME,
#         project={
#             "_id": 1,
#             "question": 1,
#             "text": 1,
#             "details": 1,
#             "status": 1,
#             "source": 1,
#             "score": {"$meta": "vectorSearchScore"},
#         },
#     )
#     reviewer_items = [
#         serialize_doc(d)
#         for d in reviewer_raw
#         if float(d.get("score", 0.0) or 0.0) >= request.threshold
#     ]

#     golden_raw = _vector_search(
#         collection=golden_qa_collection,
#         query_embedding=query_embedding,
#         top_k=request.top_k,
#         index_name=GOLDEN_VECTOR_INDEX_NAME,
#         project={
#             "text": 1,
#             "metadata": 1,
#             "score": {"$meta": "vectorSearchScore"},
#         },
#     )
#     golden_items: list[GoldenQAItem] = []
#     for d in golden_raw:
#         score = float(d.get("score", 0.0) or 0.0)
#         if score < request.threshold:
#             continue
#         text = d.get("text", "") or ""
#         q, a = _parse_golden_qa_text(text)
#         golden_items.append(
#             GoldenQAItem(
#                 text=text,
#                 question=q,
#                 answer=a,
#                 metadata=d.get("metadata", {}) or {},
#                 score=score,
#             )
#         )

#     pop_raw = _vector_search(
#         collection=golden_pop_collection,
#         query_embedding=query_embedding,
#         top_k=request.top_k,
#         index_name=GOLDEN_VECTOR_INDEX_NAME,
#         project={
#             "text": 1,
#             "metadata": 1,
#             "score": {"$meta": "vectorSearchScore"},
#         },
#     )
#     pop_items = [
#         PopItem(
#             text=(d.get("text", "") or ""),
#             metadata=(d.get("metadata", {}) or {}),
#             score=float(d.get("score", 0.0) or 0.0),
#         )
#         for d in pop_raw
#         if float(d.get("score", 0.0) or 0.0) >= request.threshold
#     ]

#     return MultiSearchResponse(reviewer=reviewer_items, golden=golden_items, pop=pop_items)


@app.post("/search_all", response_model=MultiSearchResponse)
def search_all(request: SearchRequest):

    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query must not be empty.")

    if request.top_k <= 0:
        raise HTTPException(status_code=400, detail="top_k must be > 0.")

    if not (0.0 <= request.threshold <= 1.0):
        raise HTTPException(status_code=400, detail="threshold must be between 0 and 1.")

    query_text = f"Represent this sentence for searching relevant passages: {request.query}"
    query_embedding = model.encode(query_text, normalize_embeddings=True).tolist()


    # ---------------- Reviewer Search ----------------

    pool_k = _fetch_k(request)

    reviewer_raw = _vector_search(
        collection=reviewer_collection,
        query_embedding=query_embedding,
        top_k=pool_k,
        index_name=VECTOR_INDEX_NAME,
        project={
            "_id": 1,
            "question": 1,
            "text": 1,
            "answer": 1,
            "details": 1,
            "status": 1,
            "source": 1,
            "score": {"$meta": "vectorSearchScore"},
        },
    )

    reviewer_items = []
    for d in reviewer_raw:
        item = serialize_doc(d)
        if item.score < request.threshold:
            continue
        if not item.answer or not item.answer.strip():
            continue
        reviewer_items.append(item)

    reviewer_items.sort(key=lambda x: x.score, reverse=True)

    if _any_request_filters(request):
        reviewer_items = [
            x for x in reviewer_items if _reviewer_passes_filters(request, x)
        ]

    reviewer_items = reviewer_items[: request.top_k]

    # ---------------- Golden QA Search ----------------

    golden_raw = _vector_search(
        collection=golden_qa_collection,
        query_embedding=query_embedding,
        top_k=pool_k,
        index_name=GOLDEN_VECTOR_INDEX_NAME,
        project={
            "text": 1,
            "metadata": 1,
            "score": {"$meta": "vectorSearchScore"},
        },
    )

    golden_items: list[GoldenQAItem] = []

    for d in golden_raw:
        score = float(d.get("score", 0.0) or 0.0)

        if score < request.threshold:
            continue

        text = d.get("text", "") or ""

        q, a = _parse_golden_qa_text(text)

        # skip if answer missing
        if not a or not a.strip():
            continue

        golden_items.append(
            GoldenQAItem(
                text=text,
                question=q,
                answer=a,
                metadata=d.get("metadata", {}) or {},
                score=score,
            )
        )

    golden_items.sort(key=lambda x: x.score, reverse=True)

    if _any_request_filters(request):
        golden_items = [
            x for x in golden_items if _golden_passes_filters(request, x)
        ]

    golden_items = golden_items[: request.top_k]

    # ---------------- PoP Search ----------------

    pop_raw = _vector_search(
        collection=golden_pop_collection,
        query_embedding=query_embedding,
        top_k=pool_k,
        index_name=GOLDEN_VECTOR_INDEX_NAME,
        project={
            "text": 1,
            "metadata": 1,
            "score": {"$meta": "vectorSearchScore"},
        },
    )

    pop_items = [
        PopItem(
            text=(d.get("text", "") or ""),
            metadata=(d.get("metadata", {}) or {}),
            score=float(d.get("score", 0.0) or 0.0),
        )
        for d in pop_raw
        if float(d.get("score", 0.0) or 0.0) >= request.threshold
    ]

    pop_items.sort(key=lambda x: x.score, reverse=True)

    if _any_request_filters(request):
        pop_items = [x for x in pop_items if _pop_passes_filters(request, x)]

    pop_items = pop_items[: request.top_k]

    # ---------------- Final Response ----------------

    return MultiSearchResponse(
        reviewer=reviewer_items,
        golden=golden_items,
        pop=pop_items,
    )

@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)


# uvicorn main:app --host 0.0.0.0 --port 8001 &
