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

mcp = FastMCP(
    name="AgriRAG-Tools",
    description="Safe for Qwen3 & GPT-OSS - Dec 2025",
    max_tool_calls_per_turn=3,
    max_total_tool_calls=10,
    timeout_seconds=120,
)

Settings.embed_model = HuggingFaceEmbedding(
    model_name=EMBEDDING_MODEL, cache_folder="./hf_cache", trust_remote_code=True
)

client: pymongo.MongoClient = pymongo.MongoClient(MONGODB_URI)

retriever_qa = get_retriever(
    client=client, collection_name=COLLECTION_QA, similarity_top_k=3
)
retriever_pop = get_retriever(
    client=client, collection_name=COLLECTION_POP, similarity_top_k=3
)


@mcp.tool()
async def get_context_from_golden_dataset(query: str) -> List[ContextQuestionAnswerPair]:
    """
    Retrieve the 3 most relevant Q&A pairs from Golden Dataset.
    
    IMPORTANT RULES FOR LLM:
    • Call this tool AT MOST ONCE per user question
    • If you already called it, DO NOT call again
    • Never call just to "double-check" or "think more"
    
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
    Retrieve the 3 most relevant PoP entries.
    
    IMPORTANT RULES FOR LLM:
    • Call this tool AT MOST ONCE per user question
    • Never combine both tools unless clearly justified
    
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
