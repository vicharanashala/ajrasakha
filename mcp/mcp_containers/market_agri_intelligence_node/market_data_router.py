
import asyncio
import json
import os
from datetime import datetime
from typing import TypedDict, Optional, Literal, List, Dict, Any

from fastmcp import FastMCP
from mcp.client.streamable_http import streamablehttp_client
from mcp import ClientSession

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph import StateGraph, END

try:
    # Try importing as a module (if running from root)
    from market_data.values import state_ids as STATE_DATA_TUPLE
    STATE_NAME_TO_ID = {item["state_name"].upper(): item["state_id"] for item in STATE_DATA_TUPLE}
    print("[DEBUG] Successfully imported state_ids from market_data.values")
except ImportError:
    try:
        # Try importing locally (if running from inside market_data)
        from values import state_ids as STATE_DATA_TUPLE
        STATE_NAME_TO_ID = {item["state_name"].upper(): item["state_id"] for item in STATE_DATA_TUPLE}
        print("[DEBUG] Successfully imported state_ids from values (local)")
    except ImportError as e:
        print(f"WARNING: Could not import market_data.values or local values. Using empty state map. Error: {e}")
        STATE_NAME_TO_ID = {}

# --- Constants & Config ---
MARKET_SERVER_URL = os.getenv("MARKET_SERVER_URL", "http://100.100.108.28:9003/mcp")

# LLM Config
API_KEY = "EMPTY"
BASE_URL = "http://localhost:8001/v1"
MODEL_NAME = "Qwen/Qwen3-30B-A3B-Instruct-2507"

# --- MCP Tool Definition ---
mcp = FastMCP("Market Data Router")

# --- LLM Client ---
llm = ChatOpenAI(
    model=MODEL_NAME,
    temperature=0,
    api_key=API_KEY,
    base_url=BASE_URL,
    max_retries=2
)

# --- MCP Client Helper ---
async def call_market_tool(tool_name: str, arguments: dict = {}):
    """Calls a tool on the Market MCP server."""
    print(f"DEBUG: Calling Market Tool: {tool_name} with args: {arguments}")
    try:
        async with streamablehttp_client(MARKET_SERVER_URL) as (read_stream, write_stream, _):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                result = await session.call_tool(tool_name, arguments=arguments)
                
                if hasattr(result, 'content') and result.content:
                    text_parts = []
                    for item in result.content:
                        if hasattr(item, 'text'):
                            text_parts.append(item.text)
                    return "\n".join(text_parts)
                return str(result)
    except Exception as e:
        error_msg = f"Error calling {tool_name}: {str(e)}"
        print(error_msg)
        return json.dumps({"error": error_msg})

# --- Complex Logic Models ---

class MarketTask(TypedDict):
    task_type: Literal["list_apmc", "price_check"]
    state_name: Optional[str]
    state_id: Optional[str]
    apmc_name: Optional[str]
    commodity: Optional[str]
    from_date: str
    to_date: str

class MarketState(TypedDict):
    query: str
    
    # Analysis
    extracted_entities: Dict[str, Any]
    tasks: List[MarketTask]
    
    # Execution
    current_task_index: int
    results: List[str] # Collected results strings
    
    # Final
    final_response: str

# --- Nodes ---


async def query_analyzer(state: MarketState):
    """
    Node 1: Analyze query to extract entities and infer location.
    """
    query = state["query"]
    today = datetime.now().strftime("%Y-%m-%d")
    
    print(f"\n[DEBUG] --- Node: Query Analyzer ---")
    print(f"[DEBUG] Analyzing Query: {query}")
    
    # Create a list of Valid States for LLM to reference
    valid_states = list(STATE_NAME_TO_ID.keys())
    
    prompt_text = f"""
    You are an Agricultural Market Expert.
    
    Current Date: {today}
    Valid States in Database: {json.dumps(valid_states)}
    
    User Query: "{query}"
    
    Task:
    1. Extract relevant entities: State, APMC (Market), City, Commodity (Crop).
    2. Resolve Date Range: If user asks for "today", use {today}. If "last week", calculate dates. Default to {today}.
    3. Resolve Location:
       - If user provides state, map to Valid State Name.
       - If user provides City but no State, infer the State and the likely APMC name (often City name = APMC name).
       - If user asks for "nearest market" to a city, assume the city's own APMC is best.
    
    Return JSON:
    {{
        "requests": [
            {{
                "type": "price_check" (if asking for price/data) OR "list_apmc" (if asking for list of markets),
                "state": "RESOLVED_STATE_NAME", 
                "apmc": "RESOLVED_APMC_NAME" (or null if listing all markets in state),
                "commodity": "Commodity Name" (or null),
                "from_date": "YYYY-MM-DD",
                "to_date": "YYYY-MM-DD"
            }}
        ],
        "explanation": "Brief reasoning for location resolution"
    }}
    
    If comparing two things, return multiple items in "requests".
    """
    
    try:
        response = await llm.ainvoke([HumanMessage(content=prompt_text)])
        content = response.content.strip()
        print(f"[DEBUG] LLM Raw Response (Analyzer): {content}")
        
        if content.startswith("```"):
            content = content.replace("```json", "").replace("```", "")
            
        data = json.loads(content)
        print(f"[DEBUG] Extracted Data: {json.dumps(data, indent=2)}")
        
        tasks = []
        for req in data.get("requests", []):
            s_name = req.get("state", "").upper()
            s_id = STATE_NAME_TO_ID.get(s_name)
            
            if not s_id:
                print(f"[DEBUG] Warning: State ID not found for '{s_name}'. Tasks might fail if ID is required.")

            tasks.append({
                "task_type": req.get("type", "price_check"),
                "state_name": s_name,
                "state_id": s_id,
                "apmc_name": req.get("apmc"),
                "commodity": req.get("commodity"),
                "from_date": req.get("from_date", today),
                "to_date": req.get("to_date", today)
            })
            
        return {
            "extracted_entities": data,
            "tasks": tasks,
            "current_task_index": 0,
            "results": []
        }
        
    except Exception as e:
        print(f"[ERROR] properties in analyzer: {e}")
        return {"tasks": [], "results": [f"Error analyzing query: {e}"]}

async def task_executor(state: MarketState):
    """
    Node 2: Execute tasks iteratively. 
    """
    tasks = state["tasks"]
    results = []
    
    print(f"\n[DEBUG] --- Node: Task Executor ---")
    print(f"[DEBUG] Tasks to execute: {len(tasks)}")
    
    if not tasks:
        print("[DEBUG] No tasks to execute.")
        return {"results": ["No actionable tasks identified from query."]}

    for i, task in enumerate(tasks):
        print(f"\n[DEBUG] Executing Task #{i+1}: {task}")
        try:
            t_type = task["task_type"]
            s_name = task["state_name"]
            s_id = task["state_id"]
            apmc = task["apmc_name"]
            comm = task["commodity"]
            f_date = task["from_date"]
            t_date = task["to_date"]
            
            res_str = f"--- Result for {s_name} ({apmc or 'All'}) ---\n"
            
            if t_type == "list_apmc":
                if s_id:
                    print(f"[DEBUG] Calling 'get_apmc_list_from_enam' with state_id='{s_id}'")
                    data = await call_market_tool("get_apmc_list_from_enam", {"state_id": s_id})
                    print(f"[DEBUG] Tool Result Length: {len(str(data))}")
                    res_str += f"APMCs in {s_name}:\n{data}"
                else:
                    msg = f"Could not resolve State ID for {s_name}. Cannot list APMCs."
                    print(f"[DEBUG] {msg}")
                    res_str += msg
            
            elif t_type == "price_check":
                if not s_name or not apmc:
                    res_str += "Missing State or APMC information for price check."
                else:
                    # Step 1: commodity list (Context feeding)
                    print(f"[DEBUG] Step 1: Fetching commodities for {apmc}, {s_name}")
                    comm_list_res = await call_market_tool("get_commodity_list_from_enam", {
                        "state_name": s_name,
                        "apmc_name": apmc,
                        "from_date": f_date,
                        "to_date": t_date
                    })
                    print(f"[DEBUG] Commodity List Result (First 100 chars): {str(comm_list_res)[:100]}...")
                    
                    res_str += f"Available Commodities Context:\n{comm_list_res[:1000]}...\n" 
                    
                    # Step 2: Trade Data
                    if comm:
                        print(f"[DEBUG] Step 2: Fetching Trade Data for {comm}")
                        res_str += f"\nTrade Data for {comm}:\n"
                        trade_res = await call_market_tool("get_trade_data_list", {
                            "state_name": s_name,
                            "apmc_name": apmc,
                            "commodity_name": comm,
                            "from_date": f_date,
                            "to_date": t_date
                        })
                        print(f"[DEBUG] Trade Data Result (First 100 chars): {str(trade_res)[:100]}...")
                        res_str += str(trade_res)
                    else:
                        print("[DEBUG] No specific commodity, skipping Step 2.")
                        res_str += "\nNo specific commodity requested. See Available Commodities list above."
            
            results.append(res_str)
            
        except Exception as e:
            err = f"Error executing task {task}: {e}"
            print(f"[ERROR] {err}")
            results.append(err)
            
    return {"results": results}

async def response_synthesizer(state: MarketState):
    """
    Node 3: Final Answer Generation.
    """
    query = state["query"]
    results = state["results"]
    
    print(f"\n[DEBUG] --- Node: Response Synthesizer ---")
    print(f"[DEBUG] Synthesizing {len(results)} result blocks.")
    
    # Combine all results
    combined_data = "\n\n".join(results)
    
    prompt = f"""
    User Query: "{query}"
    
    Collected Market Data:
    {combined_data[:15000]} # Context limit safety
    
    Instructions:
    - Synthesize the data to answer the user's question directly.
    - If comparing, create a comparison table (in markdown).
    - If price data is found, show Min/Max/Modal prices.
    - Format nicely.
    """
    
    try:
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        print(f"[DEBUG] Final LLM Response Length: {len(response.content)}")
        return {"final_response": response.content.strip()}
    except Exception as e:
        print(f"[ERROR] Synthesizer failed: {e}")
        return {"final_response": f"Error generating final response: {e}"}


# --- Graph Construction ---
workflow = StateGraph(MarketState)

workflow.add_node("query_analyzer", query_analyzer)
workflow.add_node("task_executor", task_executor)
workflow.add_node("response_synthesizer", response_synthesizer)

workflow.set_entry_point("query_analyzer")
workflow.add_edge("query_analyzer", "task_executor")
workflow.add_edge("task_executor", "response_synthesizer")
workflow.add_edge("response_synthesizer", END)

app = workflow.compile()

# --- Main Tool ---
@mcp.tool()
async def query_market_data(query: str) -> str:
    """
    Advanced Market Data Assistant.
    Handles:
    - Listings: "Show markets in Punjab"
    - Prices: "Price of Potato in Abohar"
    - Comparisons: "Compare Potato price in Punjab and Haryana"
    - Inference: "Nearest market to Bhatinda for Wheat"
    
    Args:
        query: User question.
    """
    print(f"Received Query: {query}")
    inputs = {
        "query": query,
        "extracted_entities": {},
        "tasks": [],
        "current_task_index": 0,
        "results": [],
        "final_response": ""
    }
    
    final_res = ""
    try:
        async for output in app.astream(inputs):
            for key, value in output.items():
                print(f"Finished Node: {key}")
                if "final_response" in value:
                    final_res = value["final_response"]
    except Exception as e:
        return f"Workflow Error: {str(e)}"
        
    return final_res

if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=9011)
