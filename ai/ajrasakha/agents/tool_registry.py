"""Shared MCP and specialist tool loading for the main graph."""

from __future__ import annotations

from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import ToolNode

from ajrasakha.agents.chemical_checker_agent import chemical_checker
from ajrasakha.agents.config import MCP_URLS
from ajrasakha.agents.daily_price_agent import daily_price
from ajrasakha.agents.gdb_agent import gdb
from ajrasakha.agents.schemes_agent import schemes
from ajrasakha.agents.soil_agent import soil
from ajrasakha.agents.weather_agent import weather

_location_tool = None
_reviewer_tool = None
_main_tool_node: ToolNode | None = None


async def get_location_tool():
    global _location_tool
    if _location_tool is None:
        client = MultiServerMCPClient(
            {"location_server": {"url": MCP_URLS["location"], "transport": "http"}}
        )
        tools = await client.get_tools()
        _location_tool = tools[0]
    return _location_tool


async def get_reviewer_tool():
    global _reviewer_tool
    if _reviewer_tool is None:
        client = MultiServerMCPClient(
            {"reviewer_server": {"url": MCP_URLS["reviewer"], "transport": "http"}}
        )
        tools = await client.get_tools()
        _reviewer_tool = tools[0]
    return _reviewer_tool


async def get_main_tools() -> list:
    location_mcp = await get_location_tool()
    reviewer_mcp = await get_reviewer_tool()
    return [
        gdb,
        weather,
        soil,
        daily_price,
        location_mcp,
        schemes,
        chemical_checker,
        reviewer_mcp,
    ]


async def get_main_tool_node() -> ToolNode:
    global _main_tool_node
    if _main_tool_node is None:
        _main_tool_node = ToolNode(await get_main_tools())
    return _main_tool_node
