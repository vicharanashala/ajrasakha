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
from golden_query_function import collection, search

mcp = FastMCP("GD")

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

state_codes = {
    "AR": "ARUNACHAL PRADESH",
    "HR": "Haryana",
    "MP": "MADHYA PRADESH",
    "MH": "MAHARASHTRA",
    "PB": "PUNJAB",
    "RJ": "Rajasthan",
    "TN": "TAMILNADU",
    "UP": "Uttar Pradesh",
    "--": ""
}

@mcp.tool()
async def get_context_from_golden_dataset(query: str, state_code: str, crop: str) -> List[ContextQuestionAnswerPair]:
    """
    Retrieve the most contextually relevant agricultural question-answer pairs 
        from the Golden Dataset based on the query, state, and crop.

        This function performs a vector-based semantic search on the Golden Dataset, 
        leveraging an embedding model to find the most relevant entries. The search 
        can be filtered by both the state and crop, allowing fine-grained retrieval 
        of domain-specific agricultural information.

        Args:
            query (str):
                A natural language query describing the agricultural or climate-related issue.
                Example: "how to improve soil fertility in paddy fields"
            
            state_code (str):
                A two-letter state code (e.g., "TN" for Tamil Nadu, "PB" for Punjab)
                used to narrow the search context to region-specific questions.

            crop (str):
                The crop name (e.g., "Paddy", "Cotton", "Sugarcane") to restrict results 
                to a specific agricultural domain.

        Returns:
            List[ContextQuestionAnswerPair]:
                A list of contextually relevant question-answer pairs, each containing:
                    - `question`: The retrieved question text.
                    - `answer`: The corresponding expert answer.
                    - `meta_data`: Metadata fields including:
                        - Agri Specialist
                        - Crop
                        - State
                        - Source
                        - Similarity score with the input query.
    """

    results = search(query, state_code, crop, threshold=0.8, limit=5)
    return results


@mcp.tool()
async def get_available_states_for_golden_dataset() -> List[dict]:
    """
    Retrieve the list of available Indian states supported by the Golden Dataset, 
    along with their corresponding two-letter codes.

    This endpoint helps clients understand which states can be used in queries
    when retrieving domain-specific context or crop information.

    Returns:
        List[dict]:
            A list of dictionaries in the format:
            [
                {"state": "TAMILNADU", "code": "TN"},
                {"state": "PUNJAB", "code": "PB"},
                ...
            ]

    Example:
        >>> get_available_states()
        [
            {"state": "TAMILNADU", "code": "TN"},
            {"state": "MAHARASHTRA", "code": "MH"},
            {"state": "PUNJAB", "code": "PB"},
            {"state": "RAJASTHAN", "code": "RJ"}
        ]
    """
    return [{"state": state, "code": code} for state, code in state_codes.items()]

@mcp.tool()
def get_crops_by_state_for_golden_dataset(state_code: str) -> List[str]:
    """
    Get the list of crops that can be queried for a specific state.

    This function helps language models or applications understand which crops
    are available in the Golden Dataset for each state. It ensures that queries
    remain relevant by focusing only on crops actually associated with the given
    state.

    Args:
        state_code (str):
            The two-letter state code (e.g., "TN" for Tamil Nadu, "MH" for Maharashtra).

    Returns:
        List[str]:
            A sorted list of crop names that can be meaningfully queried for the
            specified state.

    Example:
        >>> get_crops_by_state("TN")
        ["Banana", "Coconut", "Cotton", "Paddy", "Sugarcane", "Turmeric"]

    Purpose:
        Use this tool before forming or refining a query to check what crops
        are relevant for a particular state in the Golden Dataset.
    """
    # Convert state code to full name
    state_full = state_codes.get(state_code.upper())
    if not state_full:
        raise ValueError(f"❌ Invalid or unsupported state code: {state_code}")

    # Fetch distinct crop names
    crops = collection.distinct("metadata.Crop", {"metadata.State": state_full})

    return sorted(crop for crop in crops if crop and crop.strip())


if __name__ == "__main__":
    mcp.run(transport='streamable-http', host='0.0.0.0', port=9002)
