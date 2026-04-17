"""
State type definitions for the AjraSakha LangGraph agent.
All state fields use Optional to allow partial updates across nodes.
"""

from typing import Annotated, Any
from typing_extensions import TypedDict
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage


class QueryClassification(TypedDict):
    is_agri: bool
    is_off_topic: bool
    needs_gdb: bool
    needs_weather: bool
    needs_market_agmarknet: bool
    needs_market_enam: bool
    reasoning: str


class MainState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    user_language: str | None
    user_state: str | None
    user_crop: str | None
    user_location: str | None
    query_classification: QueryClassification | None
    agent_results: dict[str, Any]
    final_response: str | None


class GdbState(TypedDict):
    user_state: str | None
    user_crop: str | None
    user_location: str | None
    user_query: str
    available_states: list[str] | None  # flat string list from get_available_states
    available_crops: list[str] | None
    available_domains: list[str] | None
    available_seasons: list[str] | None
    pop_states: list[str] | None  # flat string list from get_available_states_pop
    gdb_result: list | None  # list[QuestionAnswerPair] from golden_retriever_tool
    used_filters: bool
    pop_result: str | None
    escalated_to_reviewer: bool


class AgmarknetState(TypedDict):
    user_state: str | None
    user_crop: str | None
    user_location: str | None
    user_query: str
    resolved_state_id: int | None       # integer IDs as returned by Agmarknet API
    resolved_district_id: int | None
    resolved_market_id: int | None
    resolved_commodity_id: int | None
    result: dict | None


class EnamState(TypedDict):
    user_state: str | None
    user_crop: str | None
    user_location: str | None
    user_query: str
    today_date: str | None              # DD-MM-YYYY, returned by get_today_date_for_enam
    query_date: str | None              # YYYY-MM-DD, used as from_date/to_date in API params
    resolved_state_id: str | None       # eNAM state_id string, used only for get_apmc_list
    resolved_state_name: str | None     # canonical state name passed to commodity/trade calls
    resolved_apmc_name: str | None      # eNAM uses names (not IDs) for all downstream calls
    resolved_commodity_name: str | None
    result: dict | None


class WeatherState(TypedDict):
    user_state: str | None
    user_location: str | None
    user_query: str
    result: str | None