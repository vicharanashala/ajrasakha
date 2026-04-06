from pymongo import MongoClient
from typing import List
import asyncio
import os
from llama_index.core import VectorStoreIndex
from llama_index.core.base.base_retriever import BaseRetriever
from llama_index.vector_stores.mongodb import MongoDBAtlasVectorSearch
from llama_index.core.schema import NodeWithScore
from constants import (
    DB_NAME,
    INDEX_NAME,
    MONGODB_URI,
)
from models import (
    ContextPOP,
    ContextQuestionAnswerPair,
    POPMetaData,
    QuestionAnswerPairMetaData,
)


class SyncRetrieverWrapper:
    """
    Wraps a llama-index retriever so that aretrieve() uses the sync
    _retrieve() path in a thread pool, bypassing the async MongoDB
    SSL issue on macOS local dev.

    aretrieve() accepts an optional state_value kwarg.  When provided it
    runs a raw $vectorSearch with a pre-filter on metadata.state (uses the
    Atlas filter field on the index) and falls back to unfiltered results
    if no state-specific docs are found.
    """
    def __init__(self, retriever, collection, top_k: int = 5):
        self._retriever = retriever
        self._collection = collection   # pymongo sync Collection
        self._top_k = top_k

    def retrieve(self, query: str):
        from llama_index.core.schema import QueryBundle
        return self._retriever._retrieve(QueryBundle(query))

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
        """Convert raw MongoDB docs to NodeWithScore objects, preserving all metadata."""
        from llama_index.core.schema import TextNode, NodeWithScore
        results = []
        for doc in docs:
            text   = doc.get("text", "")
            score  = doc.get("score", 0.0)
            meta   = dict(doc.get("metadata", {}))  # preserve all raw metadata fields
            doc_id = str(doc.get("_id", ""))

            # Remove llama-index internal keys that can cause issues
            meta.pop("_node_content", None)
            meta.pop("_node_type", None)

            node = TextNode(text=text, id_=doc_id, metadata=meta)
            results.append(NodeWithScore(node=node, score=score))
        return results

    async def aretrieve(self, query: str, state_value: str | None = None) -> list:
        # Get the query embedding synchronously in a thread
        from llama_index.core import Settings
        embedding = await asyncio.to_thread(
            Settings.embed_model.get_text_embedding, query
        )

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

    # Set env var so llama-index's internal async client init doesn't raise ValueError
    os.environ["MONGODB_URI"] = MONGODB_URI

    vector_store = MongoDBAtlasVectorSearch(
        client,
        db_name=DB_NAME,
        collection_name=collection_name,
        vector_index_name=INDEX_NAME,
        embedding_key="embedding",
        text_key="text",
        metadata_key="metadata",
        id_key="_id",
        stores_text=True,   # IMPORTANT
    )

    index = VectorStoreIndex.from_vector_store(vector_store)
    retriever = index.as_retriever(similarity_top_k=similarity_top_k)

    collection = client[DB_NAME][collection_name]
    return SyncRetrieverWrapper(retriever, collection=collection, top_k=similarity_top_k)



# ---------------------------
# Data Processors
# ---------------------------

async def process_nodes_qa(
    nodes: List[NodeWithScore],
) -> List[ContextQuestionAnswerPair]:

    context: List[ContextQuestionAnswerPair] = []

    for node in nodes:
        text = node.text
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
                    agri_specialist=node.metadata.get("Agri Specialist", "Not Available"),
                    crop=node.metadata.get("Crop", "Not Available"),
                    sources=node.metadata.get(
                        "Source [Name and Link]", "Source Not Available"
                    ),
                    state=node.metadata.get("State", "Not Available"),
                    similarity_score=node.score,
                ),
            )
        )

    return context


async def process_nodes_pop(nodes: List[NodeWithScore]) -> List[ContextPOP]:

    context: List[ContextPOP] = []

    for node in nodes:
        context.append(
            ContextPOP(
                text=node.text,
                meta_data=POPMetaData(
                    page_no=node.metadata.get("page_no", "Not Available"),
                    source=node.metadata.get("source", "https://linknotavailable.com"),
                    topics=node.metadata.get("headings", "No topics available"),
                    similarity_score=node.score,
                    source_name=node.metadata.get("pop_name","Not Available") 
                ),
            )
        )

    return context
