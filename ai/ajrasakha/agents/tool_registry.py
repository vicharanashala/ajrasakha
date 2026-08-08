"""Shared MCP and specialist tool loading for the main graph."""

from __future__ import annotations

import logging
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import ToolNode

from ajrasakha.agents.chemical_checker_agent import chemical_checker
from ajrasakha.agents.config import MCP_URLS
from ajrasakha.agents.daily_price_agent import daily_price
from ajrasakha.agents.gdb_agent import gdb
from ajrasakha.agents.schemes_agent import schemes
from ajrasakha.agents.soil_agent import soil
from ajrasakha.agents.weather_agent import weather
from ajrasakha.agents.new_weather_agent import new_weather

logger = logging.getLogger(__name__)

_location_tool = None
_reviewer_tool = None
_main_tool_node: ToolNode | None = None


async def get_location_tool():
    global _location_tool
    if _location_tool is None:
        try:
            client = MultiServerMCPClient(
                {"location_server": {"url": MCP_URLS["location"], "transport": "http"}}
            )
            tools = await client.get_tools()
            if tools:
                _location_tool = tools[0]
        except Exception as err:
            logger.warning("Could not connect to location MCP server at %s: %s", MCP_URLS["location"], err)
            _location_tool = None
    return _location_tool


async def get_reviewer_tool():
    global _reviewer_tool
    if _reviewer_tool is None:
        try:
            client = MultiServerMCPClient(
                {"reviewer_server": {"url": MCP_URLS["reviewer"], "transport": "http"}}
            )
            tools = await client.get_tools()
            if tools:
                _reviewer_tool = tools[0]
        except Exception as err:
            logger.warning("Could not connect to reviewer MCP server at %s: %s", MCP_URLS["reviewer"], err)
            _reviewer_tool = None
    return _reviewer_tool


async def get_main_tools() -> list:
    tools_list = [
        gdb,
        new_weather,
        weather,
        soil,
        daily_price,
        schemes,
        chemical_checker,
    ]
    
    location_mcp = await get_location_tool()
    if location_mcp:
        tools_list.append(location_mcp)
        
    reviewer_mcp = await get_reviewer_tool()
    if reviewer_mcp:
        tools_list.append(reviewer_mcp)
        
    return tools_list


async def get_main_tool_node() -> ToolNode:
    global _main_tool_node
    if _main_tool_node is None:
        _main_tool_node = ToolNode(await get_main_tools())
    return _main_tool_node

