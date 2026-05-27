from langchain.agents import create_agent
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langchain_mcp_adapters.client import MultiServerMCPClient
from pydantic import BaseModel

from ajrasakha.agents.config import SANITIZER_MODEL, MCP_URLS
from ajrasakha.agents.location_context import sub_agent_system_prompt_with_thread_location
from ajrasakha.agents.prompts import MARKET_SYSTEM_PROMPT

market_mcp = MultiServerMCPClient(
    {
        "mandi": {
            "url": MCP_URLS["mandi"],
            "transport": "streamable_http",
        },
    }
)

llm = ChatAnthropic(model=SANITIZER_MODEL)

_market_agent_graph = None  # lazy init

async def _get_market_agent():
    global _market_agent_graph
    if _market_agent_graph is None:
        tools = await market_mcp.get_tools()
        _market_agent_graph = create_agent(
            name="market_agent",
            model=llm,
            tools=tools,
            system_prompt=None,
            checkpointer=False,
        )
    return _market_agent_graph

class MarketInput(BaseModel):
    query: str              # Natural language question, e.g. "Price of onion in Rangareddy today?"
    commodity: str = ""    # Commodity name, e.g. "onion", "wheat", "tomato"
    market: str = ""       # Mandi/market name, e.g. "azadpur apmc", "yeotmal"
    state: str = ""        # State name, e.g. "telangana", "karnataka"
    district: str = ""     # District name, e.g. "rangareddy", "north west delhi"
    date: str = ""         # Date filter — any format: "2026-05-23", "23 May 2026"
    commodity_group: str = ""  # Group, e.g. "vegetables", "cereals"
    variety: str = ""      # Variety, e.g. "local", "hybrid"
    grade: str = ""        # Grade, e.g. "FAQ", "A"
    source_name: str = ""  # Data source, e.g. "agmarknet", "nafed"
    limit: int = 50        # Max records to return (default 50)


@tool(args_schema=MarketInput)
async def market(
    query: str,
    commodity: str,
    market: str,
    state: str,
    district: str,
    date: str,
    commodity_group: str,
    variety: str,
    grade: str,
    source_name: str,
    limit: int,
    config: RunnableConfig,
) -> str:
    """
    Query APMC mandi commodity prices from the database.
    Use when the user asks for mandi prices, APMC rates, commodity arrivals, or market trends.

    Supply any combination of filters to narrow the search — at least one filter
    (commodity, market, state, district, date, etc.) should be provided.
    The mandi name/market field supports fuzzy matching: if no results are found,
    the agent will automatically suggest similar market names.
    """
    try:
        context = f"""
    Query     : {query}

    Filters:
      Commodity       : {commodity or "(any)"}
      Market/Mandi    : {market or "(any)"}
      State           : {state or "(any)"}
      District        : {district or "(any)"}
      Date            : {date or "today"}
      Commodity Group : {commodity_group or "(any)"}
      Variety         : {variety or "(any)"}
      Grade           : {grade or "(any)"}
      Source          : {source_name or "(any)"}
      Limit           : {limit}
        """.strip()

        system_text = sub_agent_system_prompt_with_thread_location(MARKET_SYSTEM_PROMPT, config)
        agent = await _get_market_agent()
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
        logging.getLogger(__name__).error("market sub-agent failed: %s", exc)
        return f"⚠️ The market price service is temporarily unavailable. Error: {type(exc).__name__}"
