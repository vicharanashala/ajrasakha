#!/usr/bin/env python3
"""
Agricultural Review System RAG - MCP Server

A semantic search system for agricultural Q&A using BGE embeddings.
Provides MCP tool for AI agents to search agricultural knowledge base.

Features:
- Vector similarity search using MongoDB
- Semantic embeddings using BAAI/bge-large-en-v1.5
- GPU acceleration (CUDA)
- Returns question-answer pairs with metadata (author, crop, state, district)

Author: Review System Team
Date: January 2026
"""

import os
import re
import json
from typing import List, Dict, Any, Optional
from datetime import datetime
from pathlib import Path

import numpy as np
from pymongo import MongoClient
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from dotenv import load_dotenv
from fastmcp import FastMCP

# Load environment variables
load_dotenv()

# ==============================================================================
# CONFIGURATION
# ==============================================================================

# MongoDB Configuration
# Load environment variables from .env file
load_dotenv()

# MongoDB Configuration - REQUIRED: Set in .env file
MONGODB_URI = os.getenv("MONGODB_URI")
if not MONGODB_URI:
    raise ValueError("MONGODB_URI environment variable is required. Please set it in .env file")

DATABASE_NAME = os.getenv("DATABASE_NAME", "agriai")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "questions")
ANSWERS_COLLECTION_NAME = os.getenv("ANSWERS_COLLECTION_NAME", "answers")

# Embedding Model Configuration
MODEL_NAME = os.getenv("EMBEDDING_MODEL", "BAAI/bge-large-en-v1.5")
DEVICE = os.getenv("DEVICE", "cuda")

# Retrieval Configuration
DEFAULT_TOP_K = 5
SIMILARITY_THRESHOLD = 0.5

# ==============================================================================
# INITIALIZE FASTMCP SERVER
# ==============================================================================

mcp = FastMCP("Agricultural-Review-Search")

# ==============================================================================
# GLOBAL VARIABLES - INITIALIZED ON MODULE LOAD
# ==============================================================================

client: Optional[MongoClient] = None
db = None
collection = None
answers_collection = None
users_collection = None
model: Optional[SentenceTransformer] = None

# ==============================================================================
# INITIALIZATION
# ==============================================================================

def initialize_connections():
    """Initialize MongoDB connection and load embedding model."""
    global client, db, collection, answers_collection, users_collection, model
    
    print("Initializing Agricultural Review Search MCP Server...")
    
    # Connect to MongoDB
    print(f"Connecting to MongoDB...")
    client = MongoClient(MONGODB_URI)
    db = client[DATABASE_NAME]
    collection = db[COLLECTION_NAME]
    answers_collection = db[ANSWERS_COLLECTION_NAME]
    users_collection = db["users"] if "users" in db.list_collection_names() else None
    print(f"✓ Connected to database: {DATABASE_NAME}")
    
    # Load embedding model
    print(f"Loading embedding model: {MODEL_NAME} on {DEVICE}...")
    model = SentenceTransformer(MODEL_NAME, device=DEVICE)
    print(f"✓ Model loaded successfully")

# Initialize when module is loaded
initialize_connections()

# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================

def generate_embedding(text: str) -> np.ndarray:
    """Generate embedding for text."""
    if not text or not text.strip():
        raise ValueError("Input text cannot be empty")
    return model.encode(text, normalize_embeddings=True)

def compute_similarity(query_embedding: np.ndarray, doc_embedding: np.ndarray) -> float:
    """Compute cosine similarity between embeddings."""
    query_emb = query_embedding.reshape(1, -1)
    doc_emb = doc_embedding.reshape(1, -1)
    return float(cosine_similarity(query_emb, doc_emb)[0][0])

def get_author_name(author_id: str) -> str:
    """Resolve author ID to name from users collection."""
    if users_collection is None or not author_id:
        return "Unknown"
    try:
        from bson import ObjectId
        query_id = ObjectId(author_id) if ObjectId.is_valid(author_id) else author_id
        user = users_collection.find_one({"_id": query_id})
        
        if user:
            first = user.get("firstName", "")
            last = user.get("lastName", "")
            return f"{first} {last}".strip() or "Unknown"
    except:
        pass
    return "Unknown"

def extract_crop_state(text: str) -> dict:
    """Best-effort extraction of crop and state from text."""
    if not text:
        return {"crop": "N/A", "state": "N/A"}
    
    text = text.lower()
    crops = ["wheat", "paddy", "rice", "cotton", "tomato", "potato", "sugarcane", "maize", "chilli"]
    states = ["punjab", "haryana", "uttar pradesh", "rajasthan", "madhya pradesh", "west bengal", "delhi"]
    
    found_crop = next((c for c in crops if c in text), "N/A")
    found_state = next((s for s in states if s in text), "N/A")
    
    return {
        "crop": found_crop.title() if found_crop != "N/A" else "N/A",
        "state": found_state.title() if found_state != "N/A" else "N/A"
    }

def retrieve_candidates(query: str, top_k: int, filters: Optional[Dict] = None) -> List[Dict]:
    """Low-level retrieval from Questions collection."""
    query_embedding = generate_embedding(query)
    mongo_query = filters if filters else {}
    documents = list(collection.find(mongo_query))
    
    if not documents:
        return []
    
    results = []
    for doc in documents:
        if "embedding" not in doc or not doc["embedding"]:
            continue
        
        similarity = compute_similarity(query_embedding, np.array(doc["embedding"]))
        
        if similarity >= SIMILARITY_THRESHOLD:
            results.append({
                "_id": str(doc["_id"]),
                "question": doc.get("question", ""),
                "userId": doc.get("userId"),
                "text": doc.get("text", ""),
                "details": doc.get("details", {}),
                "aiInitialAnswer": doc.get("aiInitialAnswer", ""),
                "similarity_score": similarity
            })
    
    results.sort(key=lambda x: x["similarity_score"], reverse=True)
    return results[:top_k]

def search_reviews(query: str, top_k: int = DEFAULT_TOP_K) -> List[Dict[str, Any]]:
    """
    Main search function: Returns question-answer pairs with metadata.
    
    Args:
        query: Search query text
        top_k: Number of results to return
        
    Returns:
        List of dicts with question, answer, and metadata
    """
    # Fetch candidates (5x to allow filtering)
    raw_results = retrieve_candidates(query, top_k=top_k * 5)
    
    formatted_results = []
    for r in raw_results:
        question_text = r.get("question", "")
        full_text = r.get("text", "")
        
        # Extract answer using regex
        answer_text = ""
        split_match = re.split(r"answer:\s*", full_text, flags=re.IGNORECASE)
        if len(split_match) > 1:
            answer_text = split_match[1].strip()
        
        # Fallback to aiInitialAnswer
        if not answer_text and "aiInitialAnswer" in r:
            answer_text = r.get("aiInitialAnswer", "")
        
        # Filter: Skip if answer is too short/empty
        if not answer_text or len(answer_text) < 5:
            continue
        
        # Extract metadata
        author_id = r.get("userId")
        details = r.get("details", {})
        
        # Fallback extraction for Crop/State
        extracted = extract_crop_state(question_text)
        
        metadata = {
            "author_name": get_author_name(author_id),
            "crop": details.get("crop") or extracted["crop"],
            "state": details.get("state") or extracted["state"],
            "district": details.get("district", "N/A")
        }
        
        formatted_results.append({
            "question": question_text,
            "answer": answer_text,
            "metadata": metadata
        })
        
        if len(formatted_results) >= top_k:
            break
    
    return formatted_results

# ==============================================================================
# MCP TOOLS
# ==============================================================================

@mcp.tool()
async def search_agricultural_reviews(query: str, top_k: int = 5) -> str:
    """
    Search for agricultural review questions and answers based on semantic similarity.
    
    This tool searches through a comprehensive database of agricultural questions
    and expert answers, using vector similarity to find the most relevant content.
    The search covers various crops, states, and agricultural issues.
    
    Args:
        query (str): 
            A natural language query describing the agricultural issue or question.
            Examples:
            - "How to control weeds in wheat?"
            - "Potato leaf blight treatment methods"
            - "Best fertilizer for paddy in Punjab"
            
        top_k (int, optional): 
            Number of top results to return. Default is 5.
            Range: 1-10 results.
    
    Returns:
        str: JSON string containing a list of search results. Each result includes:
            - question (str): The matched question text
            - answer (str): The expert answer/solution
            - metadata (dict): Additional information including:
                - author_name (str): Name of the agricultural expert
                - crop (str): Relevant crop (e.g., "Wheat", "Paddy", "Cotton")
                - state (str): Indian state context (e.g., "Punjab", "Haryana")
                - district (str): District information if available
    
    Example:
        >>> result = await search_agricultural_reviews("potato disease control", top_k=3)
        >>> data = json.loads(result)
        >>> print(data[0]["question"])
        "How to control late blight in potato?"
        >>> print(data[0]["metadata"]["crop"])
        "Potato"
    
    Note:
        - Results are ranked by semantic similarity
        - Only questions with substantial answers are returned
        - Metadata is extracted from database or inferred from question text
    """
    try:
        # Validate inputs
        if not query or not query.strip():
            return json.dumps({"error": "Query cannot be empty"})
        
        if top_k < 1 or top_k > 10:
            top_k = min(max(top_k, 1), 10)
        
        # Perform search
        results = search_reviews(query, top_k=top_k)
        
        # Return as JSON string
        return json.dumps(results, ensure_ascii=False, default=str)
    
    except Exception as e:
        return json.dumps({"error": f"Search failed: {str(e)}"})

@mcp.tool()
async def get_collection_stats() -> str:
    """
    Get statistics about the agricultural review database.
    
    Returns collection counts and basic information about the knowledge base.
    
    Returns:
        str: JSON string with database statistics including:
            - total_questions: Total number of questions in database
            - total_answers: Total number of answers in database
            - database_name: Name of the MongoDB database
    
    Example:
        >>> stats = await get_collection_stats()
        >>> data = json.loads(stats)
        >>> print(f"Questions: {data['total_questions']}")
    """
    try:
        stats = {
            "total_questions": collection.count_documents({}),
            "total_answers": answers_collection.count_documents({}),
            "database_name": DATABASE_NAME
        }
        return json.dumps(stats)
    except Exception as e:
        return json.dumps({"error": f"Failed to get stats: {str(e)}"})

# ==============================================================================
# MAIN - RUN MCP SERVER
# ==============================================================================

if __name__ == "__main__":
    # Run with streamable-http transport (like ajrasakha pattern)
    print("\nStarting Agricultural Review Search MCP Server...")
    print(f"Transport: streamable-http")
    print(f"Host: 0.0.0.0")
    print(f"Port: 9012")
    print("\nAvailable Tools:")
    print("  - search_agricultural_reviews: Search for Q&A pairs")
    print("  - get_collection_stats: Get database statistics")
    print("\n" + "="*70)
    
    mcp.run(transport="streamable-http", host="0.0.0.0", port=9012)
