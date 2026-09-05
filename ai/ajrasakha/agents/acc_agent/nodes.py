import json
import re

from langchain_core.messages import SystemMessage, HumanMessage

from ajrasakha.agents.config import get_minimax_chat_model
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

    llm = get_minimax_chat_model()
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
    """Execute the selected sub-agent(s) in parallel."""
    import asyncio
    
    selected_tools = state.get("selected_tools", ["gdb"])
    
    loc_state = state.get("extracted_state", "all")
    district = state.get("extracted_district", "all")
    
    async def call_gdb() -> str:
        try:
            return await gdb.ainvoke({
                "rephrased_query": _tool_query_text(state, "gdb"),
                "crop": _tool_crop(state, "gdb"),
                "state": loc_state,
                "latitude": None, "longitude": None, "address": None
            })
        except Exception as e:
            return f"Error: {str(e)}"
    
    async def call_weather() -> str:
        try:
            d_lower = district.lower()
            s_lower = loc_state.lower()
            if d_lower == "all" and s_lower == "all":
                # Fetch weather for major Indian cities concurrently
                cities = ["Mumbai", "Delhi", "Kolkata", "Chennai"]
                
                async def fetch_city_weather(city: str) -> str:
                    resp = await weather.ainvoke({
                        "query": "current weather", "latitude": None, "longitude": None, "address": city
                    })
                    return f"**{city}**: {str(resp)}"
                
                city_responses = await asyncio.gather(*(fetch_city_weather(city) for city in cities))
                
                return "⚠️ Weather coordinates are unavailable.\n\nHere are current weather condition of major Indian cities in India:\n\n" + "\n\n".join(city_responses)
            elif d_lower == "all":
                address = loc_state
                return await weather.ainvoke({
                    "query": _tool_query_text(state, "weather"), "latitude": None, "longitude": None, "address": address
                })
            else:
                address = f"{district}, {loc_state}"
                return await weather.ainvoke({
                    "query": _tool_query_text(state, "weather"), "latitude": None, "longitude": None, "address": address
                })
        except Exception as e:
            return f"Error: {str(e)}"
    
    async def call_market() -> str:
        try:
            lat = None
            lon = None
            geocode_district = None if str(district).strip().lower() in {"all", "not specified", ""} else district
            geocode_state = None if str(loc_state).strip().lower() in {"all", "not specified", ""} else loc_state
            if geocode_state or geocode_district:
                geo = await forward_geocode(state=geocode_state, district=geocode_district)
                if geo:
                    lat = geo.get("latitude")
                    lon = geo.get("longitude")
            return await daily_price.ainvoke({
                "query": _tool_query_text(state, "market"),
                "latitude": lat,
                "longitude": lon,
                "crop": _tool_crop(state, "market"),
                "state": loc_state if str(loc_state).strip().lower() not in {"all", "not specified"} else None,
            })
        except Exception as e:
            return f"Error: {str(e)}"

    async def call_schemes() -> str:
        try:
            return await schemes.ainvoke({
                "query": _tool_query_text(state, "schemes"),
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
        except Exception as e:
            return f"Error: {str(e)}"
    
    # Build task mapping
    tasks = {}
    if "gdb" in selected_tools:
        tasks["gdb"] = call_gdb()
    if "weather" in selected_tools:
        tasks["weather"] = call_weather()
    if "market" in selected_tools:
        tasks["market"] = call_market()
    if "schemes" in selected_tools:
        tasks["schemes"] = call_schemes()
    
    # Execute all selected tools in parallel
    if tasks:
        results = await asyncio.gather(*tasks.values())
        
        # Map results back to tool names
        responses = {}
        for i, tool_name in enumerate(tasks.keys()):
            responses[f"{tool_name}_response"] = str(results[i])
        
        return responses
    
    return {
        "gdb_response": "No tools selected",
        "weather_response": None,
        "market_response": None,
        "schemes_response": None,
    }

async def assembler_node(state: AccAgentState):
    """Build JSON output with tool data and the synthesized final answer."""
    # Parse each response into JSON (or keep as string if parsing fails)
    gdb_data = None
    weather_data = None
    market_data = None
    schemes_data = None
    
    gdb_response = state.get("gdb_response")
    weather_response = state.get("weather_response")
    market_response = state.get("market_response")
    schemes_response = state.get("schemes_response")
    
    # Try to parse GDB response
    if gdb_response:
        try:
            gdb_data = json.loads(gdb_response)
        except (json.JSONDecodeError, TypeError):
            gdb_data = gdb_response
    
    # Try to parse Weather response
    if weather_response:
        try:
            weather_data = json.loads(weather_response)
        except (json.JSONDecodeError, TypeError):
            weather_data = weather_response
    
    # Try to parse Market response
    if market_response:
        try:
            market_data = json.loads(market_response)
        except (json.JSONDecodeError, TypeError):
            market_data = market_response

    # Try to parse Schemes response
    if schemes_response:
        try:
            schemes_data = json.loads(schemes_response)
        except (json.JSONDecodeError, TypeError):
            schemes_data = schemes_response
    
    # Generate final_answer using LLM
    llm = get_minimax_chat_model()
    context = (
        f"Extracted Questions:\n{_query_context(state)}\n\n"
        f"GDB Data:\n{json.dumps(gdb_data, indent=2, ensure_ascii=False) if gdb_data else 'Not requested'}\n\n"
        f"Weather Data:\n{json.dumps(weather_data, indent=2, ensure_ascii=False) if weather_data else 'Not requested'}\n\n"
        f"Market Data:\n{json.dumps(market_data, indent=2, ensure_ascii=False) if market_data else 'Not requested'}\n\n"
        f"Schemes Data:\n{json.dumps(schemes_data, indent=2, ensure_ascii=False) if schemes_data else 'Not requested'}"
    )
    
    messages = [
        SystemMessage(content=ACC_ASSEMBLER_PROMPT),
        HumanMessage(content=context)
    ]
    response = await llm.ainvoke(messages)
    final_answer_text = str(response.content)
    
    # Build final JSON output
    final_output = {
        "gdb": gdb_data,
        "weather": weather_data,
        "market": market_data,
        "schemes": schemes_data,
        "final_answer": final_answer_text
    }
    
    return {"final_answer": json.dumps(final_output, indent=2, ensure_ascii=False)}
