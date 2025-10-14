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
async def get_states_for_pop() -> dict:
    """
    Retrieve the list of available Indian states supported by the Package of Practices dataset, 
    along with their corresponding two-letter codes.
    """
    state_codes = {
        "PUNJAB": "PB",
    }
    return state_codes

@mcp.tool()
async def get_context_from_package_of_practices(query: str, state_code : str)-> List[ContextPOP]:
    """
    Retrieve context from the package of practices dataset.

    The query should:
    - Be concise and directly related to agriculture, climate, or closely associated domains.
    - Exclude any meta-instructions (e.g., "use mcp tools", "use package of practices dataset").
    - Avoid unnecessary details or formatting outside the main concern.

    Args:
        query (str): A plain-text query strictly describing the agricultural, climate, 
                     or related issue of concern.
        state_code (str): A two-letter state code (e.g., "TN" for Tamil Nadu, "PB" for Punjab)
                          used to narrow the search context to region-specific questions.
    """
    nodes = await retriever_pop.aretrieve(query)
    processed_nodes = await process_nodes_pop(nodes)
    return processed_nodes


@mcp.tool()
async def upload_question_to_reviewer_system(question: str, state_code: str, crop: str) -> dict:
    """
    Upload the question to the reviewer system for further review by human experts.
    This is called when the system is unable to find a satisfactory answer from both the datasets(golden dataset and package of practices dataset) for the particular state and crop.
    """
    state_codes = {
        "status": "Uploaded Successfully",
    }
    return state_codes



if __name__ == "__main__":
    mcp.run(transport='streamable-http', host='0.0.0.0', port=9002)
