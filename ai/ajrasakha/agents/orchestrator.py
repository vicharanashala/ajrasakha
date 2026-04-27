import logging
from typing import TypedDict, Annotated, List

from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import BaseMessage, AIMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from ajrasakha.agents.config import CLAUDE_MODEL
from ajrasakha.agents.gdb_agent import run_gdb_agent
from ajrasakha.agents.market_agent import run_market_agent
from ajrasakha.agents.prompts import ORCHESTRATOR_ROUTER_PROMPT
from ajrasakha.agents.schemas import RouterSchema
from ajrasakha.agents.soil_agent import run_soil_agent
from ajrasakha.agents.supervisor_agent import run_supervisor_agent
from ajrasakha.agents.weather_agent import run_weather_agent

load_dotenv()

logger = logging.getLogger(__name__)


def _merge_answers(existing: list, new: any) -> list:
    if new == "CLEAR":
        return []
    existing = existing or []
    if isinstance(new, str):
        return existing + [new]
    if isinstance(new, list):
        return existing + [
            item["text"] if isinstance(item, dict) and "text" in item else str(item)
            for item in new
        ]
    if isinstance(new, dict):
        return existing + [new.get("text", str(new))]
    return existing + [str(new)]


def _merge_entities(existing: dict, new: dict) -> dict:
    merged = (existing or {}).copy()
    merged.update(new or {})
    return merged


class OrchestratorState(TypedDict):
    original_query: str
    query: str
    intents: List[str]
    entities: Annotated[dict, _merge_entities]
    final_answer: Annotated[List[str], _merge_answers]
    messages: Annotated[List[BaseMessage], add_messages]
    response_mode: str


llm = ChatAnthropic(model=CLAUDE_MODEL)
structured_llm = llm.with_structured_output(RouterSchema)


async def parse_query_node(state: OrchestratorState) -> dict:
    messages = state["messages"]
    user_message = messages[-1].content
    past_entities = state.get("entities", {})

    history_text = "\n".join(
        f"{'Farmer' if m.type == 'human' else 'AjraSakha'}: {m.content}"
        for m in messages[:-1]
    )

    prompt = (
        f"{ORCHESTRATOR_ROUTER_PROMPT}\n\n"
        f"Conversation History:\n{history_text or 'No previous history.'}\n\n"
        f"Latest Farmer Query: '{user_message}'"
    )

    response: RouterSchema = await structured_llm.ainvoke(prompt)

    current_entities = past_entities.copy()
    current_entities.update(response.entities)

    enriched_query = user_message
    if "location" in current_entities:
        enriched_query = f"[Context: The farmer is in {current_entities['location']}]. {user_message}"

    detail_keywords = {"detail", "detailed", "full", "complete", "elaborate", "विस्तार", "पूरी जानकारी"}
    mode = "detailed" if any(k in user_message.lower() for k in detail_keywords) else "short"

    logger.info("Intents: %s | Entities: %s | Mode: %s", response.intents, current_entities, mode)

    return {
        "original_query": user_message,
        "query": enriched_query,
        "intents": response.intents,
        "entities": current_entities,
        "final_answer": "CLEAR",
        "response_mode": mode,
    }


def route_to_agents(state: OrchestratorState) -> List[str]:
    intents = state.get("intents", [])
    intent_map = {
        "weather": "weather_node",
        "market":  "market_node",
        "soil":    "soil_node",
        "gdb":     "gdb_node",
    }
    routes = [intent_map[intent] for intent in intents if intent in intent_map]
    return routes or ["gdb_node"]


builder = StateGraph(OrchestratorState)

builder.add_node("parse_query_node", parse_query_node)
builder.add_node("weather_node", run_weather_agent)
builder.add_node("market_node", run_market_agent)
builder.add_node("soil_node", run_soil_agent)
builder.add_node("gdb_node", run_gdb_agent)
builder.add_node("supervisor_node", run_supervisor_agent)

builder.add_edge(START, "parse_query_node")
builder.add_conditional_edges(
    "parse_query_node",
    route_to_agents,
    ["weather_node", "market_node", "soil_node", "gdb_node"],
)
builder.add_edge("weather_node", "supervisor_node")
builder.add_edge("market_node", "supervisor_node")
builder.add_edge("soil_node", "supervisor_node")
builder.add_edge("gdb_node", "supervisor_node")
builder.add_edge("supervisor_node", END)

master_graph = builder.compile()
