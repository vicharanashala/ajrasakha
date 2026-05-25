from typing import Annotated, Optional

from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import BaseMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.graph import StateGraph, START
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from typing_extensions import TypedDict

from ajrasakha.agents.chemical_checker_agent import chemical_checker
from ajrasakha.agents.config import CLAUDE_MODEL, MCP_URLS
from ajrasakha.agents.gdb_agent import gdb
from ajrasakha.agents.market_agent import market
from ajrasakha.agents.prompts import WHATSAPP_SYSTEM_PROMPT
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


MCP_TRANSPORT = "streamable_http"

MCP_SERVERS = {
    "golden_db": {
        "url": MCP_URLS["gdb"],
        "transport": MCP_TRANSPORT,
    },
    "weather_server": {
        "url": MCP_URLS["weather"],
        "transport": MCP_TRANSPORT,
    },
    "soil_server": {
        "url": MCP_URLS["soil"],
        "transport": MCP_TRANSPORT,
    },
    "agmarknet_server": {
        "url": MCP_URLS["agmarknet"],
        "transport": MCP_TRANSPORT,
    },
    "enam_server": {
        "url": MCP_URLS["enam"],
        "transport": MCP_TRANSPORT,
    },
    "location_server": {
        "url": MCP_URLS["location"],
        "transport": MCP_TRANSPORT,
    },
}


_tools_cache: list | None = None
_location_tool = None
_reviewer_tool = None


async def _get_tools() -> list:
    """
    Load all MCP tools from configured MCP servers.
    This is kept for diagnostics/future use.
    """
    global _tools_cache

    if _tools_cache is None:
        all_tools = []
        seen: set[str] = set()

        for server_name, server_config in MCP_SERVERS.items():
            client = MultiServerMCPClient({server_name: server_config})
            tools = await client.get_tools()

            for tool_item in tools:
                if tool_item.name in seen:
                    tool_item.name = f"{tool_item.name}_{server_name}"

                seen.add(tool_item.name)
                all_tools.append(tool_item)

        _tools_cache = all_tools

    return _tools_cache


async def _get_single_mcp_tool(
    server_name: str,
    url_key: str,
):
    client = MultiServerMCPClient(
        {
            server_name: {
                "url": MCP_URLS[url_key],
                "transport": MCP_TRANSPORT,
            }
        }
    )

    tools = await client.get_tools()

    if not tools:
        raise RuntimeError(
            f"No tools returned from MCP server '{server_name}' at {MCP_URLS[url_key]}"
        )

    return tools[0]


async def _get_location_tool():
    global _location_tool

    if _location_tool is None:
        _location_tool = await _get_single_mcp_tool(
            server_name="location_server",
            url_key="location",
        )

    return _location_tool


async def _get_reviewer_tool():
    global _reviewer_tool

    if _reviewer_tool is None:
        _reviewer_tool = await _get_single_mcp_tool(
            server_name="reviewer_server",
            url_key="reviewer",
        )

    return _reviewer_tool


async def ajrasakha_node(
    state: AjraSakhaState,
    config: RunnableConfig,
) -> dict:
    location = await _get_location_tool()
    reviewer = await _get_reviewer_tool()

    llm = ChatAnthropic(model=CLAUDE_MODEL).bind_tools(
        [
            gdb,
            weather,
            soil,
            market,
            location,
            schemes,
            chemical_checker,
            reviewer,
        ]
    )

    messages = [SystemMessage(content=WHATSAPP_SYSTEM_PROMPT)] + list(
        state["messages"]
    )

    response = await llm.ainvoke(messages, config=config)

    return {"messages": [response]}


async def tools_node(
    state: AjraSakhaState,
    config: RunnableConfig,
) -> dict:
    location = await _get_location_tool()
    reviewer = await _get_reviewer_tool()

    return await ToolNode(
        [
            gdb,
            weather,
            soil,
            market,
            location,
            schemes,
            chemical_checker,
            reviewer,
        ]
    ).ainvoke(state, config=config)


builder = StateGraph(AjraSakhaState)

builder.add_node("ajrasakha", ajrasakha_node)
builder.add_node("tools", tools_node)

builder.add_edge(START, "ajrasakha")
builder.add_conditional_edges("ajrasakha", tools_condition)
builder.add_edge("tools", "ajrasakha")

graph = builder.compile()