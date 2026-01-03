"""
Pydantic Models for FAQ MCP Server
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class FAQMetadata(BaseModel):
    """Metadata for a single FAQ result."""
    question_id: str = Field(..., description="Unique FAQ identifier (e.g., Q1.1)")
    category: str = Field(..., description="FAQ category")
    similarity_score: float = Field(..., description="Overall similarity score (0-1)")
    tfidf_score: float = Field(0.0, description="TF-IDF similarity score (0-1)")
    embedding_score: float = Field(0.0, description="Embedding similarity score (0-1)")
    search_method: str = Field("tfidf", description="Search method used")


class FAQResult(BaseModel):
    """Single FAQ search result."""
    question: str = Field(..., description="The FAQ question")
    answer: str = Field(..., description="The FAQ answer")
    metadata: FAQMetadata = Field(..., description="Result metadata")


class SearchRequest(BaseModel):
    """Request model for FAQ search."""
    query: str = Field(..., description="User's question")
    top_k: int = Field(3, ge=1, le=5, description="Number of results to return")


class SearchResponse(BaseModel):
    """Response model for FAQ search."""
    results: List[FAQResult] = Field(..., description="List of FAQ results")
    total_results: int = Field(..., description="Total number of results found")
    search_method: str = Field(..., description="Search method used")
