from pymongo import MongoClient
from typing import List
import asyncio
import aiohttp
from constants import (
    DB_NAME,
    INDEX_NAME,
    EMBEDDING_API_URL,
)
from models import (
    ContextPOP,
    ContextQuestionAnswerPair,
    POPMetaData,
    QuestionAnswerPairMetaData,
)


class SyncRetrieverWrapper:
    """
    Lightweight retriever wrapper around MongoDB Atlas $vectorSearch.
    aretrieve() accepts an optional state_value kwarg and falls back to
    unfiltered retrieval if no state-specific docs are found.
    """
    def __init__(self, collection, top_k: int = 5):
        self._collection = collection   # pymongo sync Collection
        self._top_k = top_k

    def _raw_vector_search(self, embedding: list, state_value: str | None = None, limit: int = 5) -> list:
        """Run $vectorSearch synchronously, with optional state pre-filter."""
        vs_stage: dict = {
            "index": INDEX_NAME,
            "path": "embedding",
            "queryVector": embedding,
            "numCandidates": limit * 10,
            "limit": limit,
        }
        if state_value:
            vs_stage["filter"] = {"metadata.state": state_value}

        pipeline = [
            {"$vectorSearch": vs_stage},
            {"$set": {"score": {"$meta": "vectorSearchScore"}}},
        ]
        return list(self._collection.aggregate(pipeline))

    def _docs_to_nodes(self, docs: list) -> list:
        """Normalize raw MongoDB docs to a simple node-like dict shape."""
        results = []
        for doc in docs:
            text   = doc.get("text", "")
            score  = doc.get("score", 0.0)
            meta   = dict(doc.get("metadata", {}))  # preserve all raw metadata fields
            doc_id = str(doc.get("_id", ""))

            # Remove stale internal keys if present in older documents.
            meta.pop("_node_content", None)
            meta.pop("_node_type", None)

            results.append(
                {
                    "id": doc_id,
                    "text": text,
                    "metadata": meta,
                    "score": score,
                }
            )
        return results

    async def _get_query_embedding(self, query: str) -> list:
        """Fetch query embedding from external embedding service."""
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                EMBEDDING_API_URL,
                json={"text": query},
                headers={"Content-Type": "application/json"},
            ) as response:
                response.raise_for_status()
                payload = await response.json()

        embedding = payload.get("embedding")
        if not isinstance(embedding, list) or not embedding:
            raise ValueError("Embedding API returned invalid 'embedding' payload")
        return embedding

    async def aretrieve(self, query: str, state_value: str | None = None) -> list:
        embedding = await self._get_query_embedding(query)

        # Try state-filtered search first
        if state_value:
            docs = await asyncio.to_thread(
                self._raw_vector_search, embedding, state_value, self._top_k
            )
            if docs:
                return self._docs_to_nodes(docs)
            # Fallback: no state-specific results → unfiltered
            print(f"[POP] No docs for state='{state_value}', falling back to unfiltered search")

        docs = await asyncio.to_thread(
            self._raw_vector_search, embedding, None, self._top_k
        )
        return self._docs_to_nodes(docs)


def get_retriever(
    client: MongoClient, collection_name: str, similarity_top_k: int = 3
) -> "SyncRetrieverWrapper":
    collection = client[DB_NAME][collection_name]
    return SyncRetrieverWrapper(collection=collection, top_k=similarity_top_k)



# ---------------------------
# Data Processors
# ---------------------------

async def process_nodes_qa(
    nodes: List[dict],
) -> List[ContextQuestionAnswerPair]:

    context: List[ContextQuestionAnswerPair] = []

    for node in nodes:
        text = node.get("text", "")
        metadata = node.get("metadata", {})
        score = node.get("score")
        q, a = text, ""

        if "\n\nAnswer:" in text:
            parts = text.split("\n\nAnswer:", 1)
            q = parts[0].replace("Question:", "", 1).strip()
            a = parts[1].strip()

        context.append(
            ContextQuestionAnswerPair(
                question=q,
                answer=a,
                meta_data=QuestionAnswerPairMetaData(
                    agri_specialist=metadata.get("Agri Specialist", "Not Available"),
                    crop=metadata.get("Crop", "Not Available"),
                    sources=metadata.get(
                        "Source [Name and Link]", "Source Not Available"
                    ),
                    state=metadata.get("State", "Not Available"),
                    similarity_score=score,
                ),
            )
        )

    return context


async def process_nodes_pop(nodes: List[dict]) -> List[ContextPOP]:

    context: List[ContextPOP] = []

    for node in nodes:
        metadata = node.get("metadata", {})
        context.append(
            ContextPOP(
                text=node.get("text", ""),
                meta_data=POPMetaData(
                    page_no=metadata.get("page_no", "Not Available"),
                    source=metadata.get("source", "https://linknotavailable.com"),
                    topics=metadata.get("headings", "No topics available"),
                    similarity_score=node.get("score"),
                    source_name=metadata.get("pop_name","Not Available")
                ),
            )
        )

    return context
