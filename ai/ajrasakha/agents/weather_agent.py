from typing import Optional

from langchain.agents import create_agent
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.constants import START
from langgraph.graph import StateGraph
from pydantic import BaseModel

from ajrasakha.agents.config import CLAUDE_MODEL, MCP_URLS
from ajrasakha.agents.location_context import thread_location_system_message
from ajrasakha.agents.prompts import GDB_SYSTEM_PROMPT, WEATHER_SYSTEM_PROMPT

weather_mcp = MultiServerMCPClient(
    {
        "weather": {
            "url": MCP_URLS["weather"],
            "transport": "streamable_http",
        }
    }
)

llm = ChatAnthropic(model=CLAUDE_MODEL)

_soil_agent_graph = None  # lazy init

async def _get_weather_agent():
    global _weather_agent_graph
    if _weather_agent_graph is None:
        tools = await weather_mcp.get_tools()
        _weather_agent_graph = create_agent(
            name="weather_agent",
            model=llm,
            tools=tools,
            system_prompt=WEATHER_SYSTEM_PROMPT,
            checkpointer=True,
        )
    return _weather_agent_graph


class WeatherInput(BaseModel):
    query: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None

@tool(args_schema=WeatherInput)
async def weather(
    query: str,
    latitude: Optional[float],
    longitude: Optional[float],
    address: Optional[str],
    config: RunnableConfig,
) -> str:
    """
    Query the weather agent.
    Use when the user asks for weather forecasts, rainfall predictions, or IMD alerts.
    Prefer thread GPS from runtime context when latitude/longitude are omitted.
    Always pass a focused query about the weather.
    """
    try:
        injected: dict = (config.get("configurable") or {}).get("location") or {}
        lat = latitude if latitude is not None else injected.get("latitude")
        lon = longitude if longitude is not None else injected.get("longitude")
        addr = address if address is not None else injected.get("address")

        context = f"""
Location Context:
- Address  : {addr or "unknown"}
- Latitude : {lat if lat is not None else "unknown"}
- Longitude: {lon if lon is not None else "unknown"}

Query: {query}
        """.strip()

        agent = await _get_weather_agent()
        result = await agent.ainvoke(
            {
                "messages": [
                    thread_location_system_message(config),
                    HumanMessage(content=context),
                ]
            },
            config=config
        )
        return result["messages"][-1].content
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("weather sub-agent failed: %s", exc)
        return f"⚠️ The weather service is temporarily unavailable. Error: {type(exc).__name__}"