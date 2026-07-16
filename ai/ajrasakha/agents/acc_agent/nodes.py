import json
import re
from typing import Optional

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage

from ajrasakha.agents.config import CLAUDE_MODEL, SANITIZER_MODEL
from ajrasakha.agents.acc_agent.state import AccAgentState
from ajrasakha.agents.acc_agent.prompts import ACC_EXTRACT_PROMPT, ACC_PLANNER_PROMPT, ACC_ASSEMBLER_PROMPT

from ajrasakha.agents.gdb_agent import gdb
from ajrasakha.agents.weather_agent import weather
from ajrasakha.agents.daily_price_agent import daily_price
from ajrasakha.agents.schemes_agent import schemes
from ajrasakha.agents.location_context import forward_geocode

def _optional_str(value) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"null", "none", "n/a", "na", "all", "not specified", "unknown"}:
        return None
    return text


def _optional_int(value) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


async def extract_node(state: AccAgentState):
    """Extract query, location, crop, domains, and farmer profile fields from transcript."""
    if not state.get("transcript"):
        return {}
        
    llm = ChatAnthropic(model=SANITIZER_MODEL)
    messages = [
        SystemMessage(content=ACC_EXTRACT_PROMPT),
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
            
        # Extract standardized_domains (can be one or more)
        domains = data.get("standardized_domains", [])
        if isinstance(domains, str):
            domains = [domains]
        if not domains:
            domains = ["Others"]  # Default fallback

        primary_crop = _optional_str(data.get("primary_crop"))
        query_crop = data.get("crop", "All")
        if not primary_crop and query_crop and str(query_crop).strip().lower() not in {"all", "not specified", ""}:
            primary_crop = str(query_crop).strip()
            
        return {
            "extracted_query": data.get("query", ""),
            "extracted_state": data.get("state", "All"),
            "extracted_district": data.get("district", "All"),
            "extracted_crop": query_crop,
            "standardized_domains": domains,
            "extracted_name": _optional_str(data.get("name")),
            "extracted_phone": _optional_str(data.get("phone")),
            "extracted_age": _optional_int(data.get("age")),
            "extracted_gender": _optional_str(data.get("gender")),
            "extracted_village": _optional_str(data.get("village")),
            "extracted_block": _optional_str(data.get("block")),
            "extracted_primary_crop": primary_crop,
            "verified_by_human": False
        }
    except Exception as e:
        return {"extracted_query": f"Failed to parse: {str(e)}", "verified_by_human": False}

async def planner_node(state: AccAgentState):
    """Determine which sub-agent tool(s) to use based on verified inputs."""
    llm = ChatAnthropic(model=SANITIZER_MODEL)
    
    context = (
        f"Query: {state.get('extracted_query')}\n"
        f"State: {state.get('extracted_state')}\n"
        f"District: {state.get('extracted_district')}\n"
        f"Crop: {state.get('extracted_crop')}\n"
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
    
    # Shared args from state
    query = state.get("extracted_query", "")
    crop = state.get("extracted_crop", "all")
    loc_state = state.get("extracted_state", "all")
    district = state.get("extracted_district", "all")
    
    async def call_gdb() -> str:
        try:
            return await gdb.ainvoke({
                "rephrased_query": query, 
                "crop": crop, 
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
                    "query": query, "latitude": None, "longitude": None, "address": address
                })
            else:
                address = f"{district}, {loc_state}"
                return await weather.ainvoke({
                    "query": query, "latitude": None, "longitude": None, "address": address
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
                "query": query,
                "latitude": lat,
                "longitude": lon,
                "crop": crop,
                "state": loc_state if str(loc_state).strip().lower() not in {"all", "not specified"} else None,
            })
        except Exception as e:
            return f"Error: {str(e)}"

    async def call_schemes() -> str:
        try:
            return await schemes.ainvoke({
                "query": query,
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
    llm = ChatAnthropic(model=CLAUDE_MODEL)
    context = (
        f"Original Query: {state.get('extracted_query')}\n\n"
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
