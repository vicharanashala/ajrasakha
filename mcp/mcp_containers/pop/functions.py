from pymongo import MongoClient
from typing import List
from llama_cloud import TextNode
from llama_index.core import VectorStoreIndex
from llama_index.core.base.base_retriever import BaseRetriever
from llama_index.vector_stores.mongodb import MongoDBAtlasVectorSearch
from llama_index.core.schema import NodeWithScore
from constants import (
    DB_NAME,
    INDEX_NAME,
)
from models import (
    ContextPOP,
    ContextQuestionAnswerPair,
    POPMetaData,
    QuestionAnswerPairMetaData,
)


def get_retriever(
    client: MongoClient, collection_name: str, similarity_top_k: int = 3
) -> BaseRetriever:

    vector_store = MongoDBAtlasVectorSearch(
        client,
        db_name=DB_NAME,
        collection_name=collection_name,
        vector_index_name=INDEX_NAME,
        embedding_key="embedding",
        text_key="text",
        metadata_key="metadata",
        id_key="_id",  # important fix
    )

    index = VectorStoreIndex.from_vector_store(vector_store)
    retriever = index.as_retriever(similarity_top_k=similarity_top_k)

    # fix ObjectId issue
    orig_aretrieve = retriever.aretrieve

    async def safe_aretrieve(query):
        nodes = await orig_aretrieve(query)
        for n in nodes:
            try:
                if hasattr(n, "id_"):
                    n.id_ = str(n.id_)
            except Exception:
                continue
        return nodes

    retriever.aretrieve = safe_aretrieve

    return retriever


# Data Processors


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

        question_answer_pair = ContextQuestionAnswerPair(
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
        context.append(question_answer_pair)
    return context


async def process_nodes_pop(nodes: List[NodeWithScore]) -> List[ContextPOP]:
    context: List[ContextPOP] = []
    for node in nodes:
        question_answer_pair = ContextPOP(
            text=node.text,
            meta_data=POPMetaData(
                page_no=node.metadata.get("page_no", "Not Available"),
                source=node.metadata.get("source", "https://linknotavailable.com"),
                topics=node.metadata.get("headings", "No topics available"),
                similarity_score=node.score,
            ),
        )
        context.append(question_answer_pair)
    return context
