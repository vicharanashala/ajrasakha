import os
from dotenv import load_dotenv

load_dotenv()

from typing import TypedDict, Annotated, List
from pydantic import BaseModel, Field
from langchain_anthropic import ChatAnthropic
from langgraph.graph import StateGraph, END
from langchain_core.messages import BaseMessage, AIMessage, HumanMessage
from langgraph.graph.message import add_messages
from pymongo import MongoClient

from agents.gdb_agent import run_gdb_agent
from agents.market_agent import run_market_agent
from agents.weather_agent import run_weather_agent
from agents.soil_agent import run_soil_agent

def merge_answers(existing: list, new: any) -> list:

    if new == "CLEAR":
        return []
        
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

def merge_entities(existing: dict, new: dict) -> dict:
    if existing is None:
        existing = {}
    if new is None:
        new = {}
        
    merged = existing.copy()
    merged.update(new)
    return merged

class MasterState(TypedDict):
    query: str
    intents: List[str]
    entities: Annotated[dict, merge_entities] 
    final_answer: Annotated[List[str], merge_answers] 
    messages: Annotated[List[BaseMessage], add_messages]

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
    messages = state["messages"]
    user_message = messages[-1].content
    
    past_entities = state.get("entities", {})
    
    history_text = "\n".join(
        [f"{'Farmer' if m.type == 'human' else 'AjraSakha'}: {m.content}" for m in messages[:-1]]
    )
    
    print(f"\n[Orchestrator] Original Farmer Query: '{user_message}'")
    
    prompt = f"""You are an intelligent router for an agricultural AI.
    
    Conversation History:
    {history_text if history_text else "No previous history. This is the start of the conversation."}
    
    Latest Farmer Query: '{user_message}'
    
    Based on the context of the conversation, analyze the LATEST query and output ALL applicable intents and entities in a list.
    """
    
    response = await structured_llm.ainvoke(prompt)
    
    current_entities = past_entities.copy()
    current_entities.update(response.entities)
    
    enriched_query = user_message
    if "location" in current_entities:
        enriched_query = f"[Context: The farmer is currently in {current_entities['location']}]. {user_message}"
    
    print(f"[Orchestrator] LLM decided Intents -> {response.intents}")
    print(f"[Orchestrator] Current Entities -> {current_entities}")
    print(f"[Orchestrator] ENRICHED Query sent to Agents -> '{enriched_query}'")
    
    return {
        "query": enriched_query,
        "intents": response.intents, 
        "entities": current_entities,
        "final_answer": "CLEAR"
    }

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
    
    return {
        "final_answer": final_text,
        "messages": [AIMessage(content=final_text)]
    }

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
