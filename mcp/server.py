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

mcp = FastMCP("Test")

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
async def get_context_from_golden_dataset(query: str) -> List[ContextQuestionAnswerPair]:
    """
    Retrieve domain-specific context from the golden dataset.

    The query should:
    - Be concise and directly related to agriculture, climate, or closely associated domains.
    - Exclude any meta-instructions (e.g., "use mcp tools", "use golden dataset").
    - Avoid unnecessary details or formatting outside the main concern.

    Args:
        query (str): A plain-text query strictly describing the agricultural, climate, 
                     or related issue of concern.

    """
    nodes = await retriever_qa.aretrieve(query)
    processed_nodes = await process_nodes_qa(nodes)
    return processed_nodes

@mcp.tool()
async def get_context_from_package_of_practices(query: str)-> List[ContextPOP]:
    """
    Retrieve context from the package of practices dataset.

    The query should:
    - Be concise and directly related to agriculture, climate, or closely associated domains.
    - Exclude any meta-instructions (e.g., "use mcp tools", "use package of practices dataset").
    - Avoid unnecessary details or formatting outside the main concern.

    Args:
        query (str): A plain-text query strictly describing the agricultural, climate, 
                     or related issue of concern.
    """
    nodes = await retriever_pop.aretrieve(query)
    processed_nodes = await process_nodes_pop(nodes)
    return processed_nodes




if __name__ == "__main__":
    mcp.run(transport='streamable-http', host='localhost', port=9000)
