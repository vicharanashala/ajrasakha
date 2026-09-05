import asyncio
import json
import re

from langchain_core.messages import SystemMessage, HumanMessage
from langchain_anthropic import ChatAnthropic

from ajrasakha.agents.config import CLAUDE_MODEL, get_minimax_chat_model
from ajrasakha.agents.acc_agent.state import AccAgentState
from ajrasakha.agents.acc_agent.extraction import (
    build_extraction_update,
    normalize_extraction_type,
)
from ajrasakha.agents.acc_agent.lgd_location import normalize_location_from_lgd
from ajrasakha.agents.acc_agent.prompts import (
    ACC_ASSEMBLER_PROMPT,
    ACC_EXTRACT_PROMPT,
    ACC_FARMER_DETAILS_PROMPT,
    ACC_PLANNER_PROMPT,
    ACC_QUERY_DETAILS_PROMPT,
)

from ajrasakha.agents.gdb_agent import gdb
from ajrasakha.agents.weather_agent import weather
from ajrasakha.agents.daily_price_agent import daily_price
from ajrasakha.agents.schemes_agent import schemes
from ajrasakha.agents.location_context import forward_geocode


_TOOL_DOMAINS = {
    "weather": {"Climate, Weather & Stress Management"},
    "market": {"Market Prices, MSP & Marketing"},
    "schemes": {
        "Agricultural Schemes & Subsidies",
        "Credit, Loan & Insurance",
    },
}


def _state_queries(state: AccAgentState) -> list[dict]:
    """Return every extracted farmer question from the canonical state field."""
    queries = state.get("extracted_queries") or []
    return [query for query in queries if isinstance(query, dict)]


def _query_context(state: AccAgentState) -> str:
    """Format every extracted question for routing and answer synthesis."""
    queries = _state_queries(state)
    if not queries:
        return "No query was extracted."

    lines = []
    for index, query in enumerate(queries, start=1):
        domains = query.get("standardized_domains") or []
        lines.append(
            f"Question {index}: {query.get('query', '')}\n"
            f"Crop: {query.get('crop') or 'All'}\n"
            f"Domains: {', '.join(domains) if domains else 'Others'}"
        )
    return "\n\n".join(lines)


def _queries_for_tool(state: AccAgentState, tool: str) -> list[dict]:
    """Give each tool the questions relevant to its domain when available."""
    queries = _state_queries(state)
    tool_domains = _TOOL_DOMAINS.get(tool)
    if tool_domains is None:
        special_domains = set().union(*_TOOL_DOMAINS.values())
        matches = [
            query
            for query in queries
            if not set(query.get("standardized_domains") or []).issubset(
                special_domains
            )
        ]
    else:
        matches = [
            query
            for query in queries
            if set(query.get("standardized_domains") or []) & tool_domains
        ]
    return matches or queries


def _tool_query_text(state: AccAgentState, tool: str) -> str:
    return "\n".join(
        str(query.get("query", "")) for query in _queries_for_tool(state, tool)
    )


def _tool_crop(state: AccAgentState, tool: str) -> str:
    crops = [
        str(query["crop"])
        for query in _queries_for_tool(state, tool)
        if query.get("crop")
    ]
    return ", ".join(dict.fromkeys(crops)) or "all"


def _tools_for_query(query: dict, selected_tools: list[str]) -> list[str]:
    """Return the relevant tool(s) for one question, independent of other questions."""
    domains = set(query.get("standardized_domains") or [])
    special_domains = set().union(*_TOOL_DOMAINS.values())
    matching_tools = []

    for tool in ("gdb", "weather", "market", "schemes"):
        tool_domains = _TOOL_DOMAINS.get(tool)
        if tool_domains is None:
            # GDB handles agricultural questions outside the specialised tools.
            if not domains.issubset(special_domains):
                matching_tools.append(tool)
        elif domains & tool_domains:
            matching_tools.append(tool)

    return matching_tools or selected_tools or ["gdb"]


async def extract_node(state: AccAgentState):
    """Extract all details, farmer details, or query details from a transcript."""
    if not state.get("transcript"):
        return {}

    extraction_type = normalize_extraction_type(state.get("extraction_type"))
    prompt_by_type = {
        "all": ACC_EXTRACT_PROMPT,
        "farmer_details": ACC_FARMER_DETAILS_PROMPT,
        "query_details": ACC_QUERY_DETAILS_PROMPT,
    }

    # Transcript extraction is quality-sensitive: use Claude Sonnet rather than
    # the shared MiniMax model so distinct farmer questions and profile fields
    # are extracted more reliably.
    llm = ChatAnthropic(model=CLAUDE_MODEL)
    messages = [
        SystemMessage(content=prompt_by_type[extraction_type]),
        HumanMessage(content=state["transcript"])
    ]
    response = await llm.ainvoke(messages)
    
    try:
        content = response.content
        json_match = re.search(r'(\{.*\})', content, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group(1))
        else:
            data = json.loads(content)
        extraction_update = build_extraction_update(data, extraction_type)
        normalized_state, normalized_district = await normalize_location_from_lgd(
            extraction_update.get("extracted_state"),
            extraction_update.get("extracted_district"),
        )
        extraction_update["extracted_state"] = normalized_state
        extraction_update["extracted_district"] = normalized_district
        return extraction_update
    except Exception as e:
        if extraction_type == "farmer_details":
            return {
                "extraction_type": extraction_type,
                "extracted_state": "All",
                "extracted_district": "All",
                "verified_by_human": False,
            }
        return {
            "extraction_type": extraction_type,
            "extracted_queries": [],
            "verified_by_human": False,
        }

async def planner_node(state: AccAgentState):
    """Determine which sub-agent tool(s) to use based on verified inputs."""
    llm = get_minimax_chat_model()
    
    context = (
        f"Extracted questions:\n{_query_context(state)}\n"
        f"State: {state.get('extracted_state')}\n"
        f"District: {state.get('extracted_district')}\n"
    )
    
    messages = [
        SystemMessage(content=ACC_PLANNER_PROMPT),
        HumanMessage(content=context)
    ]
    response = await llm.ainvoke(messages)
    content = str(response.content).strip()
    
    # Parse JSON array from response
    selected_tools = ["gdb"]  # Default fallback
    try:
        import json
        import re
        # Try to extract JSON array from response
        json_match = re.search(r'\[.*\]', content, re.DOTALL)
        if json_match:
            parsed = json.loads(json_match.group(0))
            if isinstance(parsed, list):
                # Normalize tool names
                normalized = []
                for tool in parsed:
                    tool_lower = str(tool).lower().strip()
                    if tool_lower in ["gdb", "weather", "market", "schemes"]:
                        normalized.append(tool_lower)
                if normalized:
                    selected_tools = normalized
    except Exception:
        pass  # Keep default
    
    return {"selected_tools": selected_tools}

async def tool_execution_node(state: AccAgentState):
    """Execute relevant sub-agents separately for every extracted question."""
    selected_tools = state.get("selected_tools", ["gdb"])
    loc_state = state.get("extracted_state", "all")
    district = state.get("extracted_district", "all")

    async def call_tool(tool: str, query: dict) -> str:
        query_text = str(query.get("query", ""))
        crop = str(query.get("crop") or "all")
        try:
            if tool == "gdb":
                return await gdb.ainvoke({
                    "rephrased_query": query_text,
                    "crop": crop,
                    "state": loc_state,
                    "latitude": None,
                    "longitude": None,
                    "address": None,
                })
            if tool == "weather":
                d_lower = str(district).lower()
                s_lower = str(loc_state).lower()
                if d_lower == "all" and s_lower == "all":
                    cities = ["Mumbai", "Delhi", "Kolkata", "Chennai"]

                    async def fetch_city_weather(city: str) -> str:
                        response = await weather.ainvoke({
                            "query": "current weather",
                            "latitude": None,
                            "longitude": None,
                            "address": city,
                        })
                        return f"**{city}**: {str(response)}"

                    city_responses = await asyncio.gather(
                        *(fetch_city_weather(city) for city in cities)
                    )
                    return (
                        "⚠️ Weather coordinates are unavailable.\n\n"
                        "Here are current weather condition of major Indian cities in India:\n\n"
                        + "\n\n".join(city_responses)
                    )
                address = loc_state if d_lower == "all" else f"{district}, {loc_state}"
                return await weather.ainvoke({
                    "query": query_text,
                    "latitude": None,
                    "longitude": None,
                    "address": address,
                })
            if tool == "market":
                geocode_district = (
                    None
                    if str(district).strip().lower() in {"all", "not specified", ""}
                    else district
                )
                geocode_state = (
                    None
                    if str(loc_state).strip().lower() in {"all", "not specified", ""}
                    else loc_state
                )
                geo = (
                    await forward_geocode(state=geocode_state, district=geocode_district)
                    if geocode_state or geocode_district
                    else None
                )
                return await daily_price.ainvoke({
                    "query": query_text,
                    "latitude": geo.get("latitude") if geo else None,
                    "longitude": geo.get("longitude") if geo else None,
                    "crop": crop,
                    "state": geocode_state,
                })
            if tool == "schemes":
                return await schemes.ainvoke({
                    "query": query_text,
                    "state": loc_state,
                    "gender": None,
                    "age": None,
                    "caste": None,
                    "residence": None,
                    "occupation": "Farmer",
                    "benefit_type": None,
                    "is_bpl": False,
                    "is_minority": False,
                    "is_differently_abled": False,
                })
            return f"Error: Unsupported tool {tool}"
        except Exception as e:
            return f"Error: {str(e)}"

    async def execute_query(index: int, query: dict) -> dict:
        tools = _tools_for_query(query, selected_tools)
        results = await asyncio.gather(*(call_tool(tool, query) for tool in tools))
        return {
            "query_index": index,
            "query": query,
            "tool_responses": {
                tool: str(result) for tool, result in zip(tools, results, strict=True)
            },
        }

    queries = _state_queries(state)
    query_tool_responses = await asyncio.gather(
        *(execute_query(index, query) for index, query in enumerate(queries))
    )

    # Keep raw tool fields for existing single-question consumers. For multiple
    # questions, the authoritative, correctly separated values are in
    # query_tool_responses.
    legacy_responses: dict[str, list[str]] = {
        tool: [] for tool in ("gdb", "weather", "market", "schemes")
    }
    for query_response in query_tool_responses:
        for tool, response in query_response["tool_responses"].items():
            legacy_responses[tool].append(response)

    response_updates = {"query_tool_responses": list(query_tool_responses)}
    for tool, responses in legacy_responses.items():
        if len(responses) == 1:
            response_updates[f"{tool}_response"] = responses[0]
        elif responses:
            response_updates[f"{tool}_response"] = json.dumps(responses)
        else:
            response_updates[f"{tool}_response"] = None
    return response_updates

async def assembler_node(state: AccAgentState):
    """Synthesize a separate answer for each extracted farmer question."""
    def parse_tool_response(response: object) -> object:
        if response is None:
            return None
        try:
            return json.loads(str(response))
        except (json.JSONDecodeError, TypeError):
            return response

    query_tool_responses = state.get("query_tool_responses") or []
    if not query_tool_responses:
        # Preserve resumability for any thread created before this state field
        # existed by reconstructing one response per extracted question.
        query_tool_responses = [
            {
                "query_index": index,
                "query": query,
                "tool_responses": {
                    tool: state.get(f"{tool}_response")
                    for tool in ("gdb", "weather", "market", "schemes")
                    if state.get(f"{tool}_response") is not None
                },
            }
            for index, query in enumerate(_state_queries(state))
        ]

    llm = get_minimax_chat_model()

    async def assemble_one(query_response: dict) -> dict:
        query = query_response.get("query") or {}
        tool_data = {
            tool: parse_tool_response(response)
            for tool, response in (query_response.get("tool_responses") or {}).items()
        }
        context = (
            f"Farmer question:\n{query.get('query', '')}\n"
            f"Crop: {query.get('crop') or 'All'}\n"
            f"Domains: {', '.join(query.get('standardized_domains') or ['Others'])}\n\n"
            f"Relevant tool data only for this question:\n"
            f"{json.dumps(tool_data, indent=2, ensure_ascii=False)}"
        )
        response = await llm.ainvoke([
            SystemMessage(content=ACC_ASSEMBLER_PROMPT),
            HumanMessage(content=context),
        ])
        return {
            "query": query.get("query", ""),
            "crop": query.get("crop"),
            "standardized_domains": query.get("standardized_domains") or ["Others"],
            "answer": str(response.content),
        }

    final_answers = list(await asyncio.gather(
        *(assemble_one(query_response) for query_response in query_tool_responses)
    ))

    if len(final_answers) == 1:
        only_response = query_tool_responses[0]
        only_data = {
            tool: parse_tool_response(response)
            for tool, response in only_response.get("tool_responses", {}).items()
        }
        final_output = {
            "gdb": only_data.get("gdb"),
            "weather": only_data.get("weather"),
            "market": only_data.get("market"),
            "schemes": only_data.get("schemes"),
            "final_answer": final_answers[0]["answer"],
            "answers": final_answers,
        }
    else:
        final_output = {"answers": final_answers, "final_answer": None}

    return {
        "final_answers": final_answers,
        "final_answer": json.dumps(final_output, indent=2, ensure_ascii=False),
    }
