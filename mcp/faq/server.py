"""
FAQ MCP Server using FastMCP
Main server implementation with tool definitions.
"""

from typing import List
from fastmcp import FastMCP

from models import FAQResult
from functions import search_faqs, initialize
from constants import SERVER_HOST, SERVER_PORT

# Initialize FastMCP server
mcp = FastMCP("FAQ Search Server")


@mcp.tool()
async def search_faq(query: str, top_k: int = 3) -> List[FAQResult]:
    """
    Search the FAQ database for answers to user questions.
    
    Uses hybrid search combining keyword matching (TF-IDF) and 
    semantic understanding (embeddings) for accurate results.
    
    The query should:
    - Be a clear, concise question about the bootcamp or internship
    - Focus on topics like registration, ViBe platform, attendance, certification
    - Avoid meta-instructions (e.g., "use this tool", "search the database")
    
    Args:
        query: User's question about the Full Stack Development Bootcamp or NPTEL Internship
        top_k: Number of results to return (default: 3, max: 5)
    
    Returns:
        List of FAQ results with questions, answers, and metadata including similarity scores
    
    Examples:
        - "How do I register for the bootcamp?"
        - "Can I use mobile for ViBe?"
        - "What are the attendance requirements?"
        - "How do I get my certificate?"
    """
    # Validate top_k
    if top_k < 1:
        top_k = 1
    elif top_k > 5:
        top_k = 5
    
    # Perform search
    results = await search_faqs(query, top_k)
    
    return results


if __name__ == "__main__":
    # Initialize search system
    import asyncio
    asyncio.run(initialize())
    
    # Run server with streamable-http transport
    print(f"\n🚀 Starting FAQ MCP Server on http://{SERVER_HOST}:{SERVER_PORT}")
    print("=" * 60)
    mcp.run(transport='streamable-http', host=SERVER_HOST, port=SERVER_PORT)
