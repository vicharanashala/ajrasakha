from typing import List
from fastmcp import FastMCP
import pymongo
from llama_index.core import Settings
from llama_index.embeddings.huggingface import HuggingFaceEmbedding

from functions import get_retriever
from constants import COLLECTION_POP, COLLECTION_QA, EMBEDDING_MODEL, MONGODB_URI
from functions import process_nodes_pop, process_nodes_qa
from models import ContextPOP, ContextQuestionAnswerPair
from llama_index.core.settings import Settings

mcp = FastMCP("POP")

Settings.embed_model = HuggingFaceEmbedding(
    model_name=EMBEDDING_MODEL, cache_folder="./hf_cache", trust_remote_code=True
)

client: pymongo.MongoClient = pymongo.MongoClient(MONGODB_URI)

retriever_qa = get_retriever(
    client=client, collection_name=COLLECTION_QA, similarity_top_k=4
)
retriever_pop = get_retriever(
    client=client, collection_name=COLLECTION_POP, similarity_top_k=5
)



@mcp.tool()
async def upload_question_to_reviewer_system(question: str, state_code: str, crop: str) -> dict:
    """
    Upload the question to the reviewer system for further review by human experts.
    This is called when the system is unable to find a satisfactory answer from the datasets for the particular state and crop.
    """
    state_codes = {
        "status": "Uploaded Successfully",
    }
    return state_codes





if __name__ == "__main__":
    mcp.run(transport='streamable-http', host='0.0.0.0', port=9003)
