import asyncio
import logging
import os
from typing import Annotated, Optional

from motor.motor_asyncio import AsyncIOMotorClient

from anthropic import APITimeoutError, APIConnectionError, APIStatusError
from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, HumanMessage, ToolMessage
from langchain_core.runnables import RunnableConfig, patch_config
from langchain_core.tools import tool
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from pydantic import BaseModel
from typing_extensions import TypedDict

from ajrasakha.agents.chemical_checker_agent import chemical_checker
from ajrasakha.agents.config import CLAUDE_MODEL, MCP_URLS
from ajrasakha.agents.gdb_agent import gdb
from ajrasakha.agents.market_agent import market
from ajrasakha.agents.prompts import AJRASAKHA_SYSTEM_PROMPT, GDB_SYSTEM_PROMPT, WHATSAPP_SYSTEM_PROMPT
from ajrasakha.agents.schemes_agent import schemes
from ajrasakha.agents.soil_agent import soil
from ajrasakha.agents.weather_agent import weather

load_dotenv()


class Location(TypedDict):
    latitude: Optional[float]
    longitude: Optional[float]
    city: Optional[str]
    state: Optional[str]
    address: Optional[str]


class AjraSakhaState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    location: Optional[Location]


MCP_SERVERS = {
    "golden_db":        {"url": MCP_URLS["gdb"],       "transport": "http"},
    "weather_server":   {"url": MCP_URLS["weather"],   "transport": "http"},
    "soil_server":      {"url": MCP_URLS["soil"],      "transport": "http"},
    "agmarknet_server": {"url": MCP_URLS["agmarknet"], "transport": "http"},
    "enam_server":      {"url": MCP_URLS["enam"],      "transport": "http"},
    "location_server":  {"url": MCP_URLS["location"],  "transport": "http"},
}

_tools_cache: list | None = None


async def _get_tools() -> list:
    global _tools_cache
    if _tools_cache is None:
        all_tools = []
        seen: set[str] = set()
        for server_name, config in MCP_SERVERS.items():
            client = MultiServerMCPClient({server_name: config})
            tools = await client.get_tools()
            for t in tools:
                if t.name in seen:
                    t.name = f"{t.name}_{server_name}"
                seen.add(t.name)
                all_tools.append(t)
        _tools_cache = all_tools
    return _tools_cache


SYSTEM_PROMPT ="""
You are AjraSakha, a helpful and knowledgeable assistant for farmers. Your purpose is to provide accurate and timely information to farmers based on their queries. 
You have access to gdb tool, use it to fetch location aware answers to questions that farmers have, these are curated by agri experts.
""".strip()


_location_tool = None
_reviewer_tool = None

async def _get_location_tool():
    global _location_tool
    if _location_tool is None:
        client = MultiServerMCPClient({"location_server": {"url": MCP_URLS["location"], "transport": "http"}})
        tools = await client.get_tools()
        _location_tool = tools[0]  # only one tool
    return _location_tool

async def _get_reviewer_tool():
    global _reviewer_tool
    if _reviewer_tool is None:
        client = MultiServerMCPClient({"reviewer_server": {"url": MCP_URLS["reviewer"], "transport": "http"}})
        tools = await client.get_tools()
        _reviewer_tool = tools[0]  # only one tool
    return _reviewer_tool

# Fallback message returned when the LLM call fails — keeps the checkpoint
# clean so the thread history is never corrupted.
_LLM_FALLBACK_MSG = (
    "I'm sorry, my connection is not working properly right now. "
    "Please try asking again after some time. 🙏"
)

logger = logging.getLogger(__name__)


async def ajrasakha_node(state: AjraSakhaState, config: RunnableConfig) -> dict:
    location = await _get_location_tool()
    reviewer = await _get_reviewer_tool()
    enriched_config = patch_config(config, configurable={"location": state.get("location")})
    llm = ChatAnthropic(model=CLAUDE_MODEL).bind_tools([gdb, weather, soil, market, location, schemes, chemical_checker, reviewer])
    messages = [SystemMessage(content=WHATSAPP_SYSTEM_PROMPT)] + list(state["messages"])

    try:
        response = await llm.ainvoke(messages)
    except (asyncio.CancelledError, TimeoutError, APITimeoutError,
            APIConnectionError) as exc:
        logger.warning(
            "LLM call failed (%s: %s) — returning safe fallback to protect thread history",
            type(exc).__name__, exc,
        )
        return {"messages": [AIMessage(content=_LLM_FALLBACK_MSG)]}
    except APIStatusError as exc:
        if exc.status_code >= 500:
            logger.warning(
                "Anthropic server error (%s) — returning safe fallback",
                exc.status_code,
            )
            return {"messages": [AIMessage(content=_LLM_FALLBACK_MSG)]}
        raise  # 4xx errors (auth, rate-limit) should still propagate

    return {"messages": [response]}


async def tools_node(state: AjraSakhaState, config: RunnableConfig) -> dict:
    location = await _get_location_tool()
    reviewer = await _get_reviewer_tool()

    enriched_config = patch_config(config, configurable={"location": state.get("location")})

    try:
        return await ToolNode([gdb, weather, soil, market, location, schemes, chemical_checker, reviewer]).ainvoke(state)
    except Exception as exc:
        logger.error(
            "ToolNode execution failed (%s: %s) — injecting error tool messages "
            "to keep history valid",
            type(exc).__name__, exc,
        )
        # Build synthetic ToolMessage responses for each pending tool_call
        # so the message history stays valid (every tool_use gets a tool response).
        last_ai = state["messages"][-1]
        error_messages = []
        if hasattr(last_ai, "tool_calls") and last_ai.tool_calls:
            for tc in last_ai.tool_calls:
                error_messages.append(ToolMessage(
                    content=(
                        f"Tool execution failed: {type(exc).__name__}. "
                        "Please inform the user that the service is temporarily unavailable."
                    ),
                    tool_call_id=tc["id"],
                    name=tc["name"],
                ))
        if not error_messages:
            # Shouldn't happen, but guard against edge cases
            error_messages.append(ToolMessage(
                content=f"Tool execution failed: {type(exc).__name__}",
                tool_call_id="unknown",
            ))
        return {"messages": error_messages}


_mongo_client = None

def get_async_mongo_collection():
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = AsyncIOMotorClient(os.environ.get("GOLDEN_MONGODB_URI", ""))
    db = _mongo_client["agriai"]
    return db["questions"]

async def exact_search_node(state: AjraSakhaState, config: RunnableConfig) -> dict:
    messages = state.get("messages", [])
    if not messages:
        return {"messages": []}
        
    last_message = messages[-1]
    if isinstance(last_message, HumanMessage):
        content = last_message.content
        if isinstance(content, list):
            query = " ".join([
                b.get("text", "") if isinstance(b, dict) and b.get("type") == "text"
                else str(b) if isinstance(b, str) else ""
                for b in content
            ]).strip()
        else:
            query = str(content).strip()
        
        collection = get_async_mongo_collection()
        index_name = "review_questions_search_index"
        
        pipeline = [
            {
                "$search": {
                    "index": index_name,
                    "text": {
                        "query": query,
                        "path": ["question", "text"]
                    }
                }
            },
            {"$limit": 5},
            {
                "$lookup": {
                    "from": "answers",
                    "localField": "_id",
                    "foreignField": "questionId",
                    "as": "answer_docs"
                }
            },
            {
                "$lookup": {
                    "from": "users",
                    "localField": "answer_docs.authorId",
                    "foreignField": "_id",
                    "as": "author_docs"
                }
            },
            {
                "$project": {
                    "score": {"$meta": "searchScore"},
                    "question": 1,
                    "answer": {"$arrayElemAt": ["$answer_docs.answer", 0]},
                    "sources": {"$arrayElemAt": ["$answer_docs.sources", 0]},
                    "author_name": {"$arrayElemAt": ["$author_docs.firstName", 0]}
                }
            }
        ]
        
        try:
            cursor = collection.aggregate(pipeline)
            results = await cursor.to_list(length=5)
            
            import string
            import re
            def normalize(t: str) -> str:
                return re.sub(r'\s+', ' ', t.translate(str.maketrans('', '', string.punctuation)).lower()).strip()
            
            norm_query = normalize(query)
            
            for top_doc in results:
                if normalize(top_doc.get("question", "")) == norm_query:
                    answer = top_doc.get("answer", "")
                    sources = top_doc.get("sources", [])
                    author_name = top_doc.get("author_name", "")
                    
                    if answer:
                        content = f"{answer}\n\n"
                        
                        if author_name:
                            content += f"**Expert:** {author_name}\n"
                            
                        if sources:
                            content += "**Sources:**\n"
                            for s in sources:
                                src_name = s.get("source_name", "Link")
                                src_link = s.get("source", "")
                                if src_link:
                                    content += f"- [{src_name}]({src_link})\n"
                                else:
                                    content += f"- {src_name}\n"
                        
                        warning_text = """\n⚠️ *Important Notice (Testing)* ⚠️

                            This AjraSakha application is under development and intended only for testing and validation. 
                            Advisories are experimental and currently cover major crops in selected states. 
                            Weather data is sourced from IMD.
                            Market data from eNAM, Agmarknet, and State APMCs.
                            Soil health guidance from https://soilhealth.dac.gov.in/fertilizer-dosage.
                            Government schemes from https://www.myscheme.gov.in/. 
                            Other agricultural information and advisories are expert-verified by Annam.ai. 

                            Users should independently validate recommendations before acting."""

                        content += warning_text
                        
                        return {"messages": [AIMessage(content=content)]}
        except Exception as e:
            logger.error("Error in exact_search_node: %s", e)
            pass

    return {"messages": []}

def route_after_exact_search(state: AjraSakhaState) -> str:
    messages = state.get("messages", [])
    if not messages:
        return "ajrasakha"
    last_message = messages[-1]
    if isinstance(last_message, AIMessage):
        return END
    return "ajrasakha"


builder = StateGraph(AjraSakhaState)
builder.add_node("exact_search", exact_search_node)
builder.add_node("ajrasakha", ajrasakha_node)
builder.add_node("tools", tools_node)

builder.add_edge(START, "exact_search")
builder.add_conditional_edges(
    "exact_search", 
    route_after_exact_search,
    {END: END, "ajrasakha": "ajrasakha"}
)
builder.add_conditional_edges("ajrasakha", tools_condition)
builder.add_edge("tools", "ajrasakha")

graph = builder.compile()
