

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
from ajrasakha.agents.prompts import GDB_SYSTEM_PROMPT, WEATHER_SYSTEM_PROMPT, SOIL_SYSTEM_PROMPT, MARKET_SYSTEM_PROMPT

market_mcp = MultiServerMCPClient(
    {
        "enam": {
            "url": MCP_URLS["enam"],
            "transport": "streamable_http",
        },
        "agmarknet": {
            "url": MCP_URLS["agmarknet"],
            "transport": "streamable_http",
        }
    }
)

llm = ChatAnthropic(model=CLAUDE_MODEL)

_market_agent_graph = None  # lazy init

async def _get_market_agent():
    global _market_agent_graph
    if _market_agent_graph is None:
        tools = await market_mcp.get_tools()
        _market_agent_graph = create_agent(
            name="market_agent",
            model=llm,
            tools=tools,
            system_prompt=MARKET_SYSTEM_PROMPT,
            checkpointer=True,
        )
    return _market_agent_graph

class MarketInput(BaseModel):
    query: str        # e.g., "What is the current price of rice in Rangareddy?"
    state: str        # e.g., "Telangana"
    district: str     # e.g., "Rangareddy"
    crop: str         # e.g., "Rice"
    date: str | None = None  # Optional: "YYYY-MM-DD", defaults to today if omitted


@tool(args_schema=MarketInput)
async def market(query: str, state: str, district: str, crop: str, date: str | None, config: RunnableConfig) -> str:
    """
    Query the market price agent.
    Use when the user asks for mandi prices, APMC rates, or commodity arrivals.
    Always pass the user's state, district, crop of interest, and a focused query.
    """
    context = f"""
    State   : {state}
    District: {district}
    Crop    : {crop}
    Date    : {date or "today"}

    Query: {query}
    """.strip()

    agent = await _get_market_agent()
    result = await agent.ainvoke(
        {"messages": [HumanMessage(content=context)]},
        config=config
    )
    return result["messages"][-1].content
