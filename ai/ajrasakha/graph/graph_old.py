"""
AjraSakha LangGraph agent.

Decision flow
-------------
1. Classify the user message (with conversation history in mind) as one of:
   agri | weather | market_agmarknet | market_enam | off_topic | followup

2. Off-topic -> politely reject.

3. Weather -> call IMD / OpenWeather tools as needed.

4. Market (agmarknet) -> resolve state/district/market/commodity IDs then
   call get_price_arrivals.

5. Market (enam) -> resolve state/APMC/commodity then call
   get_trade_data_from_enam.

6. Agri ->
   a. Resolve user location and question details (crop, season, state).
   b. If filters are meaningful, fetch available filter values first, then
      call golden_retriever_tool with filters.
   c. If filtered results are empty or irrelevant, retry without filters.
   d. If still no relevant result, fallback to PoP (get_available_states_pop
      -> get_context_from_pop).
   e. If PoP context is also irrelevant, call upload_question_to_reviewer_system
      and inform the user.

The agent is a standard ReAct loop: the LLM decides which tools to call;
LangGraph routes tool results back to the LLM until it produces a final answer.
Conversation history is persisted via a MongoDB checkpointer on the server side.
"""

from __future__ import annotations

import os
from typing import Annotated, Any

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import BaseMessage, SystemMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from typing_extensions import TypedDict

from ajrasakha.tools.golden.golden_rag_tool import (
    golden_retriever_tool,
    get_available_states,
    get_available_crops,
    get_available_domains,
    get_available_seasons,
)
from ajrasakha.tools.location.location_tool import location_information_tool
from ajrasakha.tools.market.market_agmarknet_tool import (
    get_states_agmarknet,
    get_districts_agmarknet,
    get_markets_agmarknet,
    get_commodities_agmarknet,
    get_price_arrivals_agmarknet,
)
from ajrasakha.tools.market.market_enam_tool import (
    get_today_date_for_enam,
    get_state_list_from_enam,
    get_apmc_list_from_enam,
    get_commodity_list_from_enam,
    get_trade_data_from_enam,
)
from ajrasakha.tools.pop.pop_tool import (
    get_available_states_pop,
    get_context_from_pop,
)
from ajrasakha.tools.reviewer.reviewer_system_tool import (
    upload_question_to_reviewer_system,
)
from ajrasakha.tools.weather.weather_imd_tool import (
    get_weather_forecast,
    get_current_weather,
    get_district_warnings,
    get_district_rainfall,
    get_realtime_weather_by_state,
    get_subdivision_warnings,
    get_subdivision_rainfall_forecast,
)
from ajrasakha.tools.weather.weather_tool import weather_information_tool


ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929")

SYSTEM_PROMPT = """You are AjraSakha, a trusted agricultural assistant for Indian farmers.

You MUST follow this decision flow for every user message:

STEP 1 - UNDERSTAND CONTEXT
- Consider the full conversation history. A message may be a follow-up or
  provide additional details to a previous question.
- If the user provides location (lat/lon) use location_information_tool to
  resolve it to city/state before anything else.

STEP 2 - CLASSIFY
Classify the current intent as one of:
  - off_topic: not related to agriculture, weather, or markets
  - weather: questions about rain, temperature, forecast, warnings
  - market_agmarknet: mandi price questions (call agmarknet tools)
  - market_enam: eNAM market questions (call eNAM tools)
  - agri: crop advice, pest, fertilizer, soil, irrigation, seeds, etc.

STEP 3 - ACT PER CLASSIFICATION

OFF_TOPIC:
  Politely decline and explain you only answer agri, weather, and market queries.

WEATHER:
  Use get_weather_forecast (needs lat/lon) or other IMD tools as appropriate.
  Use weather_information_tool as fallback if no lat/lon but city is known.

MARKET_AGMARKNET:
  1. get_states() AND get_commodities() in parallel
  2. get_districts(state_id) if needed
  3. get_markets(state_id, district_id) if needed
  4. get_price_arrivals(...)

MARKET_ENAM:
  1. get_today_date_for_enam()
  2. get_state_list_from_enam()
  3. get_apmc_list_from_enam(state_id)
  4. get_commodity_list_from_enam(...)
  5. get_trade_data_from_enam(...)

AGRI:
  A. If the question naturally needs filters (mentions crop, state, season):
     1. get_available_states(), get_available_crops(), get_available_domains(),
        get_available_seasons() to discover valid filter values
     2. golden_retriever_tool(query, crop=..., state=..., season=..., domain=...)
  B. If the question is general agri (no obvious filters):
     1. golden_retriever_tool(query) with no filters
  C. If golden results are empty or clearly irrelevant:
     1. get_available_states_pop()
     2. get_context_from_pop(query, state, crop)
  D. If PoP results are also empty or irrelevant:
     1. upload_question_to_reviewer_system(question, state_name, crop, details)
     2. Tell the user the question has been forwarded to an agri expert.

IMPORTANT RULES:
- Always respond in the same language the user is writing in.
- Never fabricate data. Only state what the tools return.
- Keep responses concise and practical for farmers.
- When a follow-up message builds on prior context, carry forward the resolved
  state, crop, and location from conversation history — do not ask again.
"""


ALL_TOOLS = [
    location_information_tool,
    weather_information_tool,
    get_weather_forecast,
    get_current_weather,
    get_district_warnings,
    get_district_rainfall,
    get_realtime_weather_by_state,
    get_subdivision_warnings,
    get_subdivision_rainfall_forecast,
    get_states_agmarknet,
    get_districts_agmarknet,
    get_markets_agmarknet,
    get_commodities_agmarknet,
    get_price_arrivals_agmarknet,
    get_today_date_for_enam,
    get_state_list_from_enam,
    get_apmc_list_from_enam,
    get_commodity_list_from_enam,
    get_trade_data_from_enam,
    golden_retriever_tool,
    get_available_states,
    get_available_crops,
    get_available_domains,
    get_available_seasons,
    get_available_states_pop,
    get_context_from_pop,
    upload_question_to_reviewer_system,
]


class AgentState(TypedDict):
    """State passed between graph nodes on every turn."""

    messages: Annotated[list[BaseMessage], add_messages]
    latitude: float | None
    longitude: float | None


def _build_llm():
    """Construct the Claude model with all tools bound."""
    llm = ChatAnthropic(
        model=ANTHROPIC_MODEL,
        api_key=ANTHROPIC_API_KEY,
        temperature=0,
        streaming=True,
    )
    return llm.bind_tools(ALL_TOOLS)


_llm_with_tools = _build_llm()


async def agent_node(state: AgentState) -> dict[str, Any]:
    """
    Core ReAct node.  Prepends the system prompt, optionally injects location
    context into the first human message, then calls the LLM.
    """
    messages = state["messages"]
    lat = state.get("latitude")
    lon = state.get("longitude")

    system = SystemMessage(content=SYSTEM_PROMPT)

    if lat is not None and lon is not None:
        location_hint = SystemMessage(
            content=(
                f"The user's GPS coordinates are latitude={lat}, longitude={lon}. "
                "Use location_information_tool to resolve these if location context "
                "is relevant to the query."
            )
        )
        full_messages = [system, location_hint] + list(messages)
    else:
        full_messages = [system] + list(messages)

    response = await _llm_with_tools.ainvoke(full_messages)
    return {"messages": [response]}


def _should_continue(state: AgentState) -> str:
    """
    Route after the agent node.  If the last message contains tool calls,
    send to the tool node; otherwise end the turn.
    """
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tools"
    return END


tool_node = ToolNode(ALL_TOOLS)


def build_graph() -> Any:
    """
    Assemble and compile the LangGraph StateGraph.

    Graph topology:
      agent -> tools -> agent -> ... -> END
    """
    builder = StateGraph(AgentState)

    builder.add_node("agent", agent_node)
    builder.add_node("tools", tool_node)

    builder.set_entry_point("agent")

    builder.add_conditional_edges(
        "agent", _should_continue, {"tools": "tools", END: END}
    )
    builder.add_edge("tools", "agent")

    return builder.compile()


graph = build_graph()
