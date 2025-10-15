from typing import List, Dict
import pymongo
from llama_index.core import Settings
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.core.retrievers import VectorStoreRetriever
from llama_index.vector_stores.mongodb import MongoDBAtlasVectorSearch

from .models import ContextQuestionAnswerPair, ContextPOP


# Constants - these should be moved to a config file
MONGODB_URI = "mongodb+srv://agriai:agriai1224@staging.1fo96dy.mongodb.net/?retryWrites=true&w=majority&appName=staging"
EMBEDDING_MODEL = "BAAI/bge-large-en-v1.5"
DB_NAME = "golden_db"
COLLECTION_QA = "agri_qa"
COLLECTION_POP = "pop"

# Initialize settings
Settings.embed_model = HuggingFaceEmbedding(
    model_name=EMBEDDING_MODEL,
    cache_folder="./hf_cache",
    trust_remote_code=True
)

# MongoDB client
client = pymongo.MongoClient(MONGODB_URI)


def get_retriever(client: pymongo.MongoClient, collection_name: str, similarity_top_k: int) -> VectorStoreRetriever:
    """Create a vector store retriever for the specified collection."""
    store = MongoDBAtlasVectorSearch(
        client=client,
        db_name=DB_NAME,
        collection_name=collection_name,
        index_name="vector_index",
    )
    return VectorStoreRetriever(
        vector_store=store,
        similarity_top_k=similarity_top_k
    )


# Initialize retrievers
retriever_qa = get_retriever(client=client, collection_name=COLLECTION_QA, similarity_top_k=4)
retriever_pop = get_retriever(client=client, collection_name=COLLECTION_POP, similarity_top_k=5)


def process_qa_nodes(nodes: List[Dict], state_code: str = None, crop: str = None) -> List[ContextQuestionAnswerPair]:
    """Process retrieved nodes for QA pairs."""
    results = []
    for node in nodes:
        metadata = node.metadata
        # Filter by state and crop if provided
        if state_code and metadata.get("State") != state_code:
            continue
        if crop and metadata.get("Crop") != crop:
            continue
            
        results.append(
            ContextQuestionAnswerPair(
                question=metadata.get("Question", ""),
                answer=metadata.get("Answer", ""),
                meta_data=metadata
            )
        )
    return results


def process_pop_nodes(nodes: List[Dict]) -> List[ContextPOP]:
    """Process retrieved nodes for Package of Practices."""
    return [
        ContextPOP(
            content=node.text,
            meta_data=node.metadata
        )
        for node in nodes
    ]


async def get_context_from_golden_dataset(query: str, state_code: str, crop: str) -> List[ContextQuestionAnswerPair]:
    """
    Retrieve contextually relevant agricultural Q&A pairs from the Golden Dataset.
    
    Args:
        query: Natural language query about agricultural or climate-related issues
        state_code: Two-letter state code (e.g., "TN" for Tamil Nadu)
        crop: Specific crop name to filter results
        
    Returns:
        List of relevant question-answer pairs with metadata
    """
    nodes = retriever_qa.retrieve(query)
    return process_qa_nodes(nodes, state_code, crop)


def get_available_states() -> List[Dict[str, str]]:
    """Get list of available states with their codes."""
    return [
        {"state": "TAMILNADU", "code": "TN"},
        {"state": "MAHARASHTRA", "code": "MH"},
        {"state": "PUNJAB", "code": "PB"},
        {"state": "RAJASTHAN", "code": "RJ"},
        {"state": "MADHYA PRADESH", "code": "MP"},
        {"state": "HARYANA", "code": "HR"},
        {"state": "UTTAR PRADESH", "code": "UP"},
        {"state": "ARUNACHAL PRADESH", "code": "AR"}
    ]


def get_crops_by_state(state_code: str) -> List[str]:
    """Get available crops for a specific state."""
    # This should be replaced with a database query in production
    # For now returning a static list as an example
    crops_by_state = {
        "TN": ["Paddy", "Cotton", "Sugarcane", "Banana", "Coconut", "Turmeric"],
        "MH": ["Cotton", "Soybean", "Sugarcane", "Rice", "Jowar"],
        "PB": ["Rice", "Wheat", "Cotton", "Maize", "Sugarcane"],
        # Add more states and their crops
    }
    return sorted(crops_by_state.get(state_code, []))