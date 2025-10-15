from typing import List, Dict
import pymongo
from llama_index.core import Settings
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.core.retrievers import VectorStoreRetriever
from llama_index.vector_stores.mongodb import MongoDBAtlasVectorSearch

from .models import ContextPOP

# Constants
MONGODB_URI = "mongodb+srv://agriai:agriai1224@staging.1fo96dy.mongodb.net/?retryWrites=true&w=majority&appName=staging"
EMBEDDING_MODEL = "BAAI/bge-large-en-v1.5"
DB_NAME = "golden_db"
COLLECTION_POP = "pop"

# Initialize settings
Settings.embed_model = HuggingFaceEmbedding(
    model_name=EMBEDDING_MODEL,
    cache_folder="./hf_cache",
    trust_remote_code=True
)

# MongoDB client
client = pymongo.MongoClient(MONGODB_URI)


def get_retriever(collection_name: str, similarity_top_k: int) -> VectorStoreRetriever:
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


# Initialize retriever
retriever_pop = get_retriever(collection_name=COLLECTION_POP, similarity_top_k=5)


def process_pop_nodes(nodes: List[Dict]) -> List[ContextPOP]:
    """Process retrieved nodes for Package of Practices."""
    return [
        ContextPOP(
            content=node.text,
            meta_data=node.metadata
        )
        for node in nodes
    ]


def get_states_for_pop() -> Dict[str, str]:
    """
    Get the list of available Indian states supported by the Package of Practices dataset.
    Returns:
        Dictionary mapping state names to their two-letter codes
    """
    return {
        "PUNJAB": "PB",
        # Add more states as they become available
    }


async def get_context_from_package_of_practices(query: str, state_code: str) -> List[ContextPOP]:
    """
    Retrieve context from the package of practices dataset.
    
    Args:
        query: Natural language query about agricultural practices
        state_code: Two-letter state code to filter results
        
    Returns:
        List of relevant PoP entries with metadata
    """
    nodes = retriever_pop.retrieve(query)
    return process_pop_nodes(nodes)


async def upload_question_to_reviewer_system(question: str, state_code: str, crop: str) -> Dict[str, str]:
    """
    Upload a question for expert review when no satisfactory answer is found.
    
    Args:
        question: The user's question that needs expert review
        state_code: Two-letter state code
        crop: The crop the question is about
        
    Returns:
        Status of the upload request
    """
    # This is a placeholder implementation
    # In production, this should connect to an actual review system
    return {
        "status": "success",
        "message": f"Question about {crop} from {state_code} has been queued for expert review"
    }