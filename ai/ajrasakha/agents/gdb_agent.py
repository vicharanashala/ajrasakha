from typing import Optional

from langchain.agents import create_agent
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.constants import START
from langgraph.graph import StateGraph
from pydantic import BaseModel, Field

from ajrasakha.agents.config import CLAUDE_MODEL, MCP_URLS
from ajrasakha.agents.location_context import (
    resolve_location_field,
    sub_agent_system_prompt_with_thread_location,
)
from ajrasakha.agents.prompts import GDB_SYSTEM_PROMPT


gdb_mcp = MultiServerMCPClient(
    {
        "gdb": {
            "url": MCP_URLS["gdb"],
            "transport": "streamable_http",
        }
    }
)

llm = ChatAnthropic(model=CLAUDE_MODEL)

_gdb_agent_graph = None  # lazy init

async def _get_gdb_agent():
    global _gdb_agent_graph
    if _gdb_agent_graph is None:
        tools = await gdb_mcp.get_tools()
        _gdb_agent_graph = create_agent(
            name="gdb_agent",
            model=llm,
            tools=tools,
            system_prompt=None,
            checkpointer=False,
        )
    return _gdb_agent_graph


class GDBInput(BaseModel):
    query: str
    crop: str = Field(
        ...,
        description=(
            "Crop for Golden DB retrieval (required). Use the crop from the farmer's "
            "question; use 'all' only as a last resort when not crop-specific."
        ),
    )
    state: str = Field(
        ...,
        description=(
            "Indian state for Golden DB retrieval (required). Use the state in the "
            "farmer's message when mentioned; use thread GPS state only as fallback."
        ),
    )
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None

@tool(args_schema=GDBInput)
async def gdb(
    query: str,
    crop: str,
    state: str,
    latitude: Optional[float],
    longitude: Optional[float],
    address: Optional[str],
    config: RunnableConfig,
) -> str:
    """
    Query the golden database agent for crop/disease/pest/farming knowledge.

    crop and state are required. Pass state from the farmer's question when mentioned;
    thread GPS state is used only when the question does not specify a state.
    """
    try:
        injected: dict = (config.get("configurable") or {}).get("location") or {}

        lat  = injected.get("latitude")  or latitude
        lon  = injected.get("longitude") or longitude
        addr = injected.get("address")   or address
        crop = resolve_location_field(crop, injected.get("crop"), default="all")
        state = resolve_location_field(state, injected.get("state"), default="all")

        context = f"""
Mandatory Golden DB filters (pass on every golden_retriever_tool / golden_exact_search_tool call):
- Crop : {crop}
- State: {state}

Location Context:
- Address  : {addr or "unknown"}
- Latitude : {lat or "unknown"}
- Longitude: {lon or "unknown"}

Query: {query}
        """.strip()

        system_text = sub_agent_system_prompt_with_thread_location(GDB_SYSTEM_PROMPT, config)
        if state.lower() != "all":
            system_text += (
                f"\n\nQUERY-SPECIFIED GOLDEN DB STATE: Use state=\"{state}\" on every "
                "golden_retriever_tool and golden_exact_search_tool call. "
                "Do not substitute THREAD LOCATION state when this block is set."
            )
        agent = await _get_gdb_agent()
        result = await agent.ainvoke(
            {
                "messages": [
                    SystemMessage(content=system_text),
                    HumanMessage(content=context),
                ]
            },
            config=config,
        )
        return result["messages"][-1].content
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("gdb sub-agent failed: %s", exc)
        return f"⚠️ The database service is temporarily unavailable. Error: {type(exc).__name__}"