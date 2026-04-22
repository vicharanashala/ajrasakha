import os
import logging
from typing import TypedDict, Annotated, List
from pydantic import BaseModel, Field
from langchain_anthropic import ChatAnthropic
from langgraph.graph import StateGraph, END

from agents.gdb_agent import run_gdb_agent
from agents.market_agent import run_market_agent
from agents.weather_agent import run_weather_agent
from agents.soil_agent import run_soil_agent

from dotenv import load_dotenv
load_dotenv()

def merge_answers(existing: list, new: any) -> list:
    if existing is None:
        existing = []
        
    if isinstance(new, str):
        return existing + [new]
        
    elif isinstance(new, list):
        extracted = []
        for item in new:
            if isinstance(item, str):
                extracted.append(item)
            elif isinstance(item, dict) and 'text' in item:
                extracted.append(item['text'])
            else:
                extracted.append(str(item))
        return existing + extracted
        
    elif isinstance(new, dict):
        text_val = new.get("text", str(new))
        return existing + [text_val]
        
    return existing + [str(new)]

class MasterState(TypedDict):
    query: str
    intents: List[str]
    entities: dict
    final_answer: Annotated[List[str], merge_answers] 

class RouterSchema(BaseModel):
    intents: List[str] = Field(
        description="List of applicable intents based on user query. Options: 'market' (prices), 'gdb' (diseases/general), 'weather' (rain), 'soil' (fertilizers)."
    )
    entities: dict = Field(
        description="Extract useful info as a dict, e.g. {'crop': 'wheat', 'state': 'Haryana'}. Empty dict if nothing found."
    )

llm = ChatAnthropic(model="claude-sonnet-4-5-20250929")
structured_llm = llm.with_structured_output(RouterSchema)

async def parse_query_node(state: MasterState):
    query = state["query"]
    print(f"\n[Orchestrator] Farmer Query: '{query}'")
    
    prompt = f"Analyze this farmer query and output ALL applicable intents and entities in a list: '{query}'"
    response = await structured_llm.ainvoke(prompt)
    
    print(f"[Orchestrator] LLM decided Intents -> {response.intents}")
    print(f"[Orchestrator] Extracted Entities -> {response.entities}")
    
    return {"intents": response.intents, "entities": response.entities}

def route_to_agents(state: MasterState):
    intents = state.get("intents", [])
    
    routes = []
    if "weather" in intents: routes.append("weather_node")
    if "market" in intents: routes.append("market_node")
    if "soil" in intents: routes.append("soil_node")
    if "gdb" in intents: routes.append("gdb_node")
        
    if not routes:
        return ["gdb_node"]
        
    print(f"[Orchestrator] Routing in parallel to -> {routes}")
    return routes

async def combine_answers_node(state: MasterState):
    all_answers = state.get("final_answer", [])
    
    print("\n[Orchestrator] Combining answers from all agents...")
    
    clean_answers = [str(ans) for ans in all_answers if ans] 
    
    combined_message = "\n\n---\n\n".join(clean_answers)
    
    final_text = f"Hello. Here is the detailed information regarding your queries:\n\n{combined_message}"
    
    return {"final_answer": final_text}

builder = StateGraph(MasterState)

builder.add_node("parse_query_node", parse_query_node)
builder.add_node("market_node", run_market_agent)
builder.add_node("weather_node", run_weather_agent)
builder.add_node("soil_node", run_soil_agent)
builder.add_node("gdb_node", run_gdb_agent)
builder.add_node("combine_answers_node", combine_answers_node)

builder.set_entry_point("parse_query_node")

builder.add_conditional_edges(
    "parse_query_node", 
    route_to_agents, 
    ["market_node", "gdb_node", "weather_node", "soil_node"]
)

builder.add_edge("market_node", "combine_answers_node")
builder.add_edge("gdb_node", "combine_answers_node")
builder.add_edge("weather_node", "combine_answers_node")
builder.add_edge("soil_node", "combine_answers_node")

builder.add_edge("combine_answers_node", END)

master_graph = builder.compile()
