from langchain.agents import create_agent
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.constants import START
from langgraph.graph import StateGraph
from pydantic import BaseModel

from ajrasakha.agents.config import CLAUDE_MODEL, MCP_URLS
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
    latitude: float
    longitude: float
    address: str

@tool(args_schema=WeatherInput)
async def weather(query: str, latitude: float, longitude: float, address: str, config: RunnableConfig) -> str:
    """
    Query the weather agent.
    Use when the user asks for weather forecasts, rainfall predictions, or IMD alerts.
    Always pass the user's latitude, longitude, address, and a focused query about the weather.
    """
    context = f"""
Location Context:
- Address  : {address}
- Latitude : {latitude}
- Longitude: {longitude}

Query: {query}
    """.strip()

    agent = await _get_weather_agent()
    result = await agent.ainvoke(
        {"messages": [
            HumanMessage(content=context)
        ]},
        config=config
    )
    return result["messages"][-1].content