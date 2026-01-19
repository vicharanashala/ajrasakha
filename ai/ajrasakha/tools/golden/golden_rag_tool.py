from typing import List, Optional
from utils import get_mongodb_vector_store, get_huggingface_embedding_model
from langchain.tools import tool
from pymongo import AsyncMongoClient
from bson import ObjectId
import os
from pydantic import BaseModel

EMBEDDING_MODEL = os.getenv("GOLDEN_EMBEDDING_MODEL")
MONGODB_URI = os.getenv("GOLDEN_MONGODB_URI")
MONGODB_DATABASE = os.getenv("GOLDEN_MONGODB_DATABASE")
MONGODB_COLLECTION = os.getenv("GOLDEN_MONGODB_COLLECTION")
MONGODB_INDEX = os.getenv("GOLDEN_MONGODB_INDEX")

embedding_model = get_huggingface_embedding_model(EMBEDDING_MODEL)
vector_store = get_mongodb_vector_store(
    embedding_model,
    MONGODB_URI,
    MONGODB_DATABASE,
    MONGODB_COLLECTION,
    MONGODB_INDEX,
)

mongo_client = AsyncMongoClient(MONGODB_URI)
database = mongo_client[MONGODB_DATABASE]
answers_collection = database["answers"]
users_collection = database["users"]

class QuestionAnswerPair(BaseModel):
    question_id: str
    question_text: str
    answer_text: str
    author: Optional[str]
    sources: List
    similarity_score: Optional[float] = None

async def _get_answer_text_sources_and_author_name(question_id: str):
    answer_document = await answers_collection.find_one(
        {
            "questionId": ObjectId(question_id)
        },
        {
            "sources": 1,
            "authorId": 1,
            "answer": 1,
        },
    )
    user_document = await users_collection.find_one(
        {
            "_id": ObjectId(answer_document["authorId"])
        }
    )
    author_name = user_document['firstName']
    sources = answer_document["sources"]
    answer = answer_document["answer"]

    return answer, sources, author_name


@tool
async def golden_retriever_tool(
        query: str,
        crop: str | None = None,
        season: str | None = None,
        state: str | None = None,
        domain: str | None = None,
):
    '''Retrieve relevant documents from the Golden dataset based on the query and optional filters.'''
    filters = {"status": "closed"}

    if crop:
        filters["details.crop"] = crop
    if season:
        filters["details.season"] = season
    if state:
        filters["details.state"] = state
    if domain:
        filters["details.domain"] = domain

    docs = vector_store.similarity_search_with_score(query, k=5, pre_filter=filters)
    result = []
    for doc in docs:
        document, score = doc
        answer, sources, author_name = await _get_answer_text_sources_and_author_name(
            document.metadata['_id']
        )
        question_answer_pair = QuestionAnswerPair(
            question_id=document.metadata['_id'],
            question_text=document.metadata['question'],
            answer_text=answer,
            author=author_name,
            sources=sources,
            similarity_score=score,
        )
        result.append(question_answer_pair)
    return result
