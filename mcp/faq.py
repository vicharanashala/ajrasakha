"""
FAQ MCP Server - CSV-based FAQ Search using Vector Similarity

This MCP server provides tools to search through FAQ data loaded from CSV
and return the most relevant FAQ entries based on semantic similarity to
user queries.

Features:
- Vector similarity search using MongoDB
- Semantic embeddings using BAAI/bge-large-en
- Returns relevant FAQ entries with titles, links, and answers
- Supports configurable result limits

Author: Ajrasakha Team
Date: November 2, 2025
"""

import os
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime

import pymongo
from pymongo import MongoClient
from sentence_transformers import SentenceTransformer
import numpy as np
from dotenv import load_dotenv
from fastmcp import FastMCP

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

Settings.embed_model = HuggingFaceEmbedding(
    model_name=EMBEDDING_MODEL, cache_folder="./hf_cache", trust_remote_code=True
)

# Load environment variables
load_dotenv()

# Initialize FastMCP server
mcp = FastMCP(
    name="faq-video",
    description="FAQ search - Safe for Qwen3 & GPT-OSS",
    max_tool_calls_per_turn=2,
    max_total_tool_calls=8,
    timeout_seconds=90,
)

user = "agriai"
password = "agriai1224"

# MongoDB connection settings
MONGODB_URI = os.getenv("MONGODB_URI", f"mongodb+srv://{user}:{password}@staging.1fo96dy.mongodb.net/?retryWrites=true&w=majority&appName=staging")
DATABASE_NAME = os.getenv("FAQ_DATABASE_NAME", "golden_db")
COLLECTION_NAME = os.getenv("FAQ_COLLECTION_NAME", "faq")

# Embedding model
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-large-en")

# Global variables for database connection and model
db_client: Optional[MongoClient] = None
db_collection = None
embedding_model: Optional[SentenceTransformer] = None


def initialize_connections():
    """Initialize MongoDB connection and embedding model."""
    global db_client, db_collection, embedding_model
    
    try:
        # Initialize MongoDB client
        db_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
        # Test connection
        db_client.server_info()
        
        # Get database and collection
        db = db_client[DATABASE_NAME]
        db_collection = db[COLLECTION_NAME]
        
        print(f"✓ Connected to MongoDB: {DATABASE_NAME}.{COLLECTION_NAME}")
        
        return True
    except Exception as e:
        print(f"✗ Failed to initialize connections: {e}")
        return False


def close_connections():
    """Close MongoDB connection."""
    global db_client
    
    if db_client:
        db_client.close()
        print("✓ Closed MongoDB connection")


def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """
    Calculate cosine similarity between two vectors.
    
    Args:
        vec1: First vector
        vec2: Second vector
        
    Returns:
        Cosine similarity score (0 to 1)
    """
    vec1_np = np.array(vec1)
    vec2_np = np.array(vec2)
    
    dot_product = np.dot(vec1_np, vec2_np)
    norm1 = np.linalg.norm(vec1_np)
    norm2 = np.linalg.norm(vec2_np)
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    return float(dot_product / (norm1 * norm2))


@mcp.tool()
async def search_faq(
    query: str,
    max_results: int = 5,
    min_similarity: float = 0.3
) -> Dict[str, Any]:
    """
    Search for relevant FAQ entries based on user query using vector similarity.
    
    This tool searches through FAQ data loaded from CSV and returns the most
    relevant entries based on semantic similarity to the query.
    
    Args:
        query: The user's question or search query
        max_results: Maximum number of FAQ entries to return (default: 5, max: 10)
        min_similarity: Minimum similarity threshold (default: 0.3, range: 0-1)
        
    Returns:
        Dict containing:
        - status: "success" or "error"
        - results: List of relevant FAQ entries with titles, links, answers, and similarity scores
        - query: The original query
        - total_results: Number of results found
        
    Example:
        >>> await search_faq("How to control leaf folder in rice?")
        {
            "status": "success",
            "query": "How to control leaf folder in rice?",
            "total_results": 3,
            "results": [
                {
                    "title": "Leaf Folder in Rice: IPM Made Simple",
                    "link": "https://youtu.be/...",
                    "similarity_score": 0.89,
                    "english_answer": "Rice leaf folder-infected leaves..."
                }
            ]
        }
    """
    try:
        # Validate inputs
        if not query or not query.strip():
            return {
                "status": "error",
                "message": "Query cannot be empty",
                "query": query
            }
        
        # Hard cap: this line saves your life
        max_results = min(max_results, 3)
        
        # Limit max_results to reasonable range
        max_results = max(1, min(max_results, 10))
        min_similarity = max(0.0, min(min_similarity, 1.0))
        
        # Initialize connections if needed
        if db_collection is None:
            init_success = initialize_connections()
            if not init_success:
                return {
                    "status": "error",
                    "message": "Failed to initialize database",
                    "query": query
                }
        
        # Generate query embedding
        query_embedding = Settings.embed_model.get_text_embedding(query)
        
        # Fetch all documents from MongoDB
        documents = list(db_collection.find({}, {
            "_id": 0,
            "title": 1,
            "link": 1,
            "query": 1,
            "english_answer": 1,
            "embedding": 1
        }))
        
        if not documents:
            return {
                "status": "success",
                "message": "No FAQ entries found in database",
                "query": query,
                "total_results": 0,
                "results": []
            }
        
        # Calculate similarity scores for all FAQ entries
        scored_entries = []
        for doc in documents:
            if "embedding" in doc and doc["embedding"]:
                similarity = cosine_similarity(query_embedding, doc["embedding"])
                
                if similarity >= min_similarity:
                    scored_entries.append({
                        "title": doc.get("title"),
                        "link": doc.get("link"),
                        "query": doc.get("query"),
                        "english_answer": doc.get("english_answer", ""),
                        "similarity_score": round(similarity, 4)
                    })
        
        # Sort by similarity score (descending)
        scored_entries.sort(key=lambda x: x["similarity_score"], reverse=True)
        
        # Get top results
        top_results = scored_entries[:max_results]
        
        return {
            "status": "success",
            "query": query,
            "total_results": len(top_results),
            "max_results": max_results,
            "min_similarity": min_similarity,
            "results": top_results
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": f"Error searching FAQ: {str(e)}",
            "query": query
        }


@mcp.tool()
async def get_faq_stats() -> Dict[str, Any]:
    """
    Get statistics about the FAQ database.
    
    Returns information about the number of FAQ entries and last update time.
    
    Returns:
        Dict containing:
        - status: "success" or "error"
        - total_entries: Number of FAQ entries
        - last_updated: Timestamp of last update
        
    Example:
        >>> await get_faq_stats()
        {
            "status": "success",
            "total_entries": 250,
            "last_updated": "2025-11-02T10:30:00"
        }
    """
    try:
        # Initialize connections if needed
        if db_collection is None:
            init_success = initialize_connections()
            if not init_success:
                return {
                    "status": "error",
                    "message": "Failed to initialize database connection"
                }
        
        # Count total entries
        total_entries = db_collection.count_documents({})
        
        # Get last update time (from most recent document)
        latest_doc = db_collection.find_one(
            sort=[("created_at", pymongo.DESCENDING)]
        )
        
        last_updated = None
        if latest_doc and "created_at" in latest_doc:
            last_updated = latest_doc["created_at"].isoformat()
        
        return {
            "status": "success",
            "total_entries": total_entries,
            "last_updated": last_updated,
            "database": DATABASE_NAME,
            "collection": COLLECTION_NAME
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": f"Error fetching stats: {str(e)}"
        }


@mcp.tool()
async def get_all_faq_titles() -> Dict[str, Any]:
    """
    Get a list of all available FAQ titles in the database.
    
    Returns:
        Dict containing:
        - status: "success" or "error"
        - total_faqs: Number of FAQ entries
        - faqs: List of FAQ information (title, link)
        
    Example:
        >>> await get_all_faq_titles()
        {
            "status": "success",
            "total_faqs": 250,
            "faqs": [
                {
                    "title": "Basmati Fertilizer Dosage",
                    "link": "https://youtu.be/..."
                }
            ]
        }
    """
    try:
        # Initialize connections if needed
        if db_collection is None:
            init_success = initialize_connections()
            if not init_success:
                return {
                    "status": "error",
                    "message": "Failed to initialize database connection"
                }
        
        # Get all FAQ entries
        faqs = list(db_collection.find({}, {
            "_id": 0,
            "title": 1,
            "link": 1
        }).sort("title", 1))
        
        return {
            "status": "success",
            "total_faqs": len(faqs),
            "faqs": faqs
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": f"Error fetching FAQ titles: {str(e)}"
        }


# Initialize connections when module is loaded
print("=" * 60)
print("Ajrasakha FAQ MCP Server")
print("=" * 60)
initialize_connections()


if __name__ == "__main__":
    # Run the MCP server
    try:
        print("\n🚀 Starting FAQ MCP server...")
        print(f"📊 Database: {DATABASE_NAME}")
        print(f"📚 Collection: {COLLECTION_NAME}")
        print(f"🤖 Model: {EMBEDDING_MODEL}")
        print("\nServer is ready to accept connections.\n")
        
        mcp.run(transport='streamable-http', host='0.0.0.0', port=9005)
    finally:
        close_connections()
