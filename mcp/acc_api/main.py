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
    # When set, reviewer + golden are restricted to this district, except documents
    # whose district is FAQ or Unknown (those are always included). PoP has no
    # district field and is never filtered by district.
    district: str | None = None


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


def _passes_district_filter(doc_district: str | None, filter_district: str | None) -> bool:
    """If filter_district is set, keep docs whose district matches it, or is FAQ/Unknown."""
    if not filter_district or not str(filter_district).strip():
        return True
    want = str(filter_district).strip()
    got = (doc_district or "").strip()
    if not got:
        return False
    if got.casefold() in ("faq", "unknown"):
        return True
    return got.casefold() == want.casefold()


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
        top_k=request.top_k,
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
    if request.district:
        items = [
            x
            for x in items
            if _passes_district_filter(
                (x.details or {}).get("district"), request.district
            )
        ]
    return items


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

    reviewer_raw = _vector_search(
        collection=reviewer_collection,
        query_embedding=query_embedding,
        top_k=request.top_k,
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
        # skip if answer missing
        if not item.answer or not item.answer.strip():
            continue
        reviewer_items.append(item)

    reviewer_items.sort(key=lambda x: x.score, reverse=True)

    if request.district:
        reviewer_items = [
            x
            for x in reviewer_items
            if _passes_district_filter(
                (x.details or {}).get("district"), request.district
            )
        ]

    # ---------------- Golden QA Search ----------------

    golden_raw = _vector_search(
        collection=golden_qa_collection,
        query_embedding=query_embedding,
        top_k=request.top_k,
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

    if request.district:
        golden_items = [
            x
            for x in golden_items
            if _passes_district_filter(
                (x.metadata or {}).get("District"), request.district
            )
        ]

    # ---------------- PoP Search ----------------

    pop_raw = _vector_search(
        collection=golden_pop_collection,
        query_embedding=query_embedding,
        top_k=request.top_k,
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
