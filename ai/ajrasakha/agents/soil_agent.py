

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
from ajrasakha.agents.prompts import GDB_SYSTEM_PROMPT, WEATHER_SYSTEM_PROMPT, SOIL_SYSTEM_PROMPT

soil_mcp = MultiServerMCPClient(
    {
        "soil": {
            "url": MCP_URLS["soil"],
            "transport": "streamable_http",
        }
    }
)

llm = ChatAnthropic(model=CLAUDE_MODEL)

_soil_agent_graph = None  # lazy init

async def _get_soil_agent():
    global _soil_agent_graph
    if _soil_agent_graph is None:
        tools = await soil_mcp.get_tools()
        _soil_agent_graph = create_agent(
            name="soil_agent",
            model=llm,
            tools=tools,
            system_prompt=SOIL_SYSTEM_PROMPT,
            checkpointer=True,
        )
    return _soil_agent_graph


class SoilInput(BaseModel):
    query: str
    address: str  # e.g., "123 Main St, Rangareddy, Telangana"
    state: str  # e.g., "Telangana"
    district: str  # e.g., "Rangareddy"
    crop: str  # e.g., "Rice"
    n: float  # Available Nitrogen (kg/ha)
    p: float  # Available Phosphorus (kg/ha)
    k: float  # Available Potassium (kg/ha)
    oc: float  # Organic Carbon (%)


@tool(args_schema=SoilInput)
async def soil(query: str, address: str, state: str, district: str, crop: str, n: float, p: float, k: float, oc: float, config: RunnableConfig) -> str:
    """
    Query the soil agent.
    Use when the user asks for soil health recommendations, fertilizer dosages, or crop suitability based on soil tests.
    Always pass the user's state, district, crop of interest, soil test results (N, P, K, OC), and a focused query about soil health or recommendations.
    """
    context = f"""
    Address : {address}
    State   : {state}
    District: {district}
    Crop    : {crop}

    Soil Test Results:
    - Nitrogen (N) : {n} kg/ha
    - Phosphorus (P): {p} kg/ha
    - Potassium (K) : {k} kg/ha
    - Organic Carbon: {oc} %

    Query: {query}
    """.strip()

    agent = await _get_soil_agent()
    result = await agent.ainvoke(
        {"messages": [
            HumanMessage(content=context)
        ]},
        config=config
    )
    return result["messages"][-1].content