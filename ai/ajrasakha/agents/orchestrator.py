from langgraph.graph import StateGraph, END
from typing import TypedDict, Optional
from pydantic import BaseModel, Field
from langchain_anthropic import ChatAnthropic

import os
from dotenv import load_dotenv
load_dotenv()

# 1. Master State
class MasterState(TypedDict):
    query: str
    intent: Optional[str]
    entities: Optional[dict]
    final_answer: Optional[str]

# 2. LLM Router Schema (Rulebook for Claude)
class RouterSchema(BaseModel):
    intent: str = Field(
        description="Route to: 'market' (for mandi/prices), 'gdb' (for farming advice/diseases), 'weather' (for rain/climate), or 'soil' (for fertilizer/soil health)."
    )
    entities: dict = Field(
        description="Extract useful info as a dict, e.g. {'crop': 'tomato', 'state': 'Punjab'}. Empty dict if nothing found."
    )

# Initialize Claude
llm = ChatAnthropic(model="claude-sonnet-4-5-20250929")
structured_llm = llm.with_structured_output(RouterSchema)

# 3. SMART Parse Query Node
async def parse_query_node(state: MasterState):
    query = state["query"]
    print(f"\n[Orchestrator] Farmer Query: '{query}'")
    
    # LLM decides the intent dynamically
    prompt = f"Analyze this farmer query and strictly output the intent and entities: '{query}'"
    response = await structured_llm.ainvoke(prompt)
    
    print(f"[Orchestrator] LLM decided Intent -> {response.intent}")
    print(f"[Orchestrator] Extracted Entities -> {response.entities}")
    
    return {"intent": response.intent, "entities": response.entities}

# 4. Router Logic (Traffic Police)
def route_query(state: MasterState):
    intent = state.get("intent")
    print(f"[Orchestrator] Routing to -> {intent}_node")
    
    if intent == "market":
        return "market_node"
    elif intent == "gdb":
        return "gdb_node"
    elif intent == "weather":
        return "weather_node"
    elif intent == "soil":
        return "soil_node"
    else:
        return END

# 5. Dummy Department Nodes (To be replaced with real agents later)
async def market_node(state: MasterState):
    print("Market Dept: Fetching prices from eNAM...")
    return {"final_answer": "Dummy Market Data: Tomato price is Rs. 2000/Qtl"}

async def gdb_node(state: MasterState):
    print("GDB Dept: Searching Vector DB for advice...")
    return {"final_answer": "Dummy GDB Data: Use Neem oil for tomato leaves."}

async def weather_node(state: MasterState):
    print("Weather Dept: Checking IMD API...")
    return {"final_answer": "Dummy Weather Data: Heavy rain expected tomorrow."}

async def soil_node(state: MasterState):
    print("Soil Dept: Fetching fertilizer dosage...")
    return {"final_answer": "Dummy Soil Data: Add 50kg Urea per acre."}

# ==========================================
# GRAPH COMPILATION
# ==========================================
builder = StateGraph(MasterState)

# Add all nodes
builder.add_node("parse_query_node", parse_query_node)
builder.add_node("market_node", market_node)
builder.add_node("gdb_node", gdb_node)
builder.add_node("weather_node", weather_node)
builder.add_node("soil_node", soil_node)

builder.set_entry_point("parse_query_node")

# Add conditional routing
builder.add_conditional_edges(
    "parse_query_node", 
    route_query, 
    {
        "market_node": "market_node",
        "gdb_node": "gdb_node",
        "weather_node": "weather_node",
        "soil_node": "soil_node",
        END: END
    }
)

# Connect all departments to END
builder.add_edge("market_node", END)
builder.add_edge("gdb_node", END)
builder.add_edge("weather_node", END)
builder.add_edge("soil_node", END)

# Compile
master_graph = builder.compile()