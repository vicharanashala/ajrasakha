
import sys
import os
import asyncio
import json
import datetime
import importlib
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from fastmcp import FastMCP
import values


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
    # Check for updates to golden data
    await update_golden_data()

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

async def update_golden_data():
    """
    Checks if values.py needs an update (older than 24h).
    If so, fetches new data from MongoDB, rewrites values.py, and reloads the module.
    """
    print("Checking for Golden Data updates...")
    
    # Check last update time
    last_updated_str = getattr(values, "last_updated_metadata", "2000-01-01T00:00:00")
    try:
        last_updated = datetime.datetime.fromisoformat(last_updated_str)
    except ValueError:
        last_updated = datetime.datetime(2000, 1, 1)

    today_ist = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=5, minutes=30)))
    
    # Handle naive vs aware comparison by ensuring last_updated is aware or today is naive (prefer aware)
    if last_updated.tzinfo is None:
         # Assume naive legacy timestamp is UTC or local, convert to aware for safety or just make current naive?
         # Simplest: make last_updated aware as IST if missing, or generic. 
         # Actually, if last_updated is naive (old format), and we use aware today, it fails.
         # Let's ensure strict consistency. 
         last_updated = last_updated.replace(tzinfo=datetime.timezone(datetime.timedelta(hours=5, minutes=30)))

    if (today_ist - last_updated) < datetime.timedelta(hours=6):
        print("Golden Data is up-to-date. Skipping update.")
        return

    print("Golden Data is stale. Fetching from MongoDB...")

    try:
        # Connect to MongoDB
        MONGODB_URI = os.getenv("GOLDEN_MONGODB_URI")
        MONGODB_DATABASE = os.getenv("GOLDEN_MONGODB_DATABASE")
        COLLECTION_NAME = os.getenv("GOLDEN_MONGODB_COLLECTION")

        if not MONGODB_URI or not MONGODB_DATABASE:
            print("Error: Missing MongoDB credentials in env.")
            return

        mongo_client = AsyncIOMotorClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
        database = mongo_client[MONGODB_DATABASE]
        questions_collection = database[COLLECTION_NAME]

        # 1. Fetch State Crops Mapping
        pipeline = [
            {
                "$match": {
                    "details.state": {"$exists": True, "$ne": None},
                    "details.crop": {"$exists": True, "$ne": None},
                }
            },
            {
                "$group": {
                    "_id": "$details.state",
                    "crops": {"$addToSet": "$details.crop"}
                }
            },
            {"$sort": {"_id": 1}}
        ]
        
        cursor = questions_collection.aggregate(pipeline)
        state_crops_golden_dataset = {}
        async for doc in cursor:
            # Normalize state name to match expected format if needed, executing logic similar to plan
            state_crops_golden_dataset[doc["_id"]] = sorted(list(doc["crops"]))
        
        distinct_states = await questions_collection.distinct("details.state", {"details.state": {"$exists": True, "$ne": None}})
        
        golden_state_codes = {}
        for s in distinct_states:
            golden_state_codes[s.upper()] = s
            

        # 3. Rewrite values.py
        ist_timezone = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
        new_timestamp = datetime.datetime.now(ist_timezone).isoformat()
        
        
        pop_states = getattr(values, "pop_states", {})

        content = f"# Auto-generated by agriculture_mcp.py on {new_timestamp}\n\n"
        content += f"state_crops_golden_dataset = {json.dumps(state_crops_golden_dataset, indent=4)}\n\n"
        content += f"golden_state_codes = {json.dumps(golden_state_codes, indent=4)}\n\n"
        content += f"pop_states = {json.dumps(pop_states, indent=4)}\n\n"
        content += f"last_updated_metadata = \"{new_timestamp}\"\n"

        values_file = os.path.join(current_dir, 'values.py')
        
        # Atomic write if possible, or just overwrite
        with open(values_file, 'w') as f:
            f.write(content)
            
        print("values.py updated successfully.")

        # 4. Hot Reload
        importlib.reload(values)
        print("values module reloaded with new data.")

    except Exception as e:
        print(f"Error updating golden data: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    mcp.run(
        transport="streamable-http",
        host="0.0.0.0",
        port=9023,
    )