
import sys
import os
import asyncio
from dotenv import load_dotenv
from fastmcp import FastMCP


# Load environment variables from .env file
current_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(current_dir, '.env')
load_dotenv(env_path)

# Add current directory to path to allow imports from nodes, tools, etc.
sys.path.append(current_dir)

# Also add the parent directory if needed (for 'ai' package resolution if running as script)
# sys.path.append(os.path.join(current_dir, "..", "..")) 

from agricultural import app as agricultural_graph, AgentState

mcp = FastMCP("Agricultural Agent")

@mcp.tool()
async def get_agricultural_context(query: str) -> str:
    """
    Retrieves agricultural context (Golden/PoP data, Video links) for a given query.
    Returns a formatted prompt containing the retrieved information to be used by the assistant.
    
    Args:
        query: The user's agricultural question (e.g., "paddy blast cure in Punjab").
    """
    # Initialize state with default values to satisfy TypedDict
    initial_state: AgentState = {
        "user_query": query,
        "intent": "general", 
        "location_provided": False,
        "state_name": None,
        "state_code": None,
        "crop_name": None,
        "golden_data": None,
        "pop_data": None,
        "video_data": None,
        "uploaded_to_reviewer": False,
        "golden_relevant_flag": False, 
        "pop_relevant_flag": False,
        "video_relevant_flag": False,
        "video_search_done": False,
        "data_search_done": False,
        "final_prompt": ""
    }
    
    try:
        # Invoke the graph
        result = await agricultural_graph.ainvoke(initial_state)
        # Return the final prompt constructed by the graph
        return result.get("final_prompt", "Error: No final prompt generated.")
    except Exception as e:
        # Log the full error for debugging if needed
        import traceback
        traceback.print_exc()
        return f"Error executing agricultural workflow: {str(e)}"

if __name__ == "__main__":
    mcp.run(
        transport="streamable-http",
        host="0.0.0.0",
        port=9023,
    )