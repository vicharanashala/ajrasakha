import json
import re
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage

from ajrasakha.agents.config import CLAUDE_MODEL, SANITIZER_MODEL
from ajrasakha.agents.acc_agent.state import AccAgentState
from ajrasakha.agents.acc_agent.prompts import ACC_EXTRACT_PROMPT, ACC_PLANNER_PROMPT, ACC_ASSEMBLER_PROMPT

from ajrasakha.agents.gdb_agent import gdb
from ajrasakha.agents.weather_agent import weather
from ajrasakha.agents.market_agent import market

async def extract_node(state: AccAgentState):
    """Extract query, state, district, crop from transcript."""
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
            
        return {
            "extracted_query": data.get("query", ""),
            "extracted_state": data.get("state", "All"),
            "extracted_district": data.get("district", "All"),
            "extracted_crop": data.get("crop", "All"),
            "verified_by_human": False
        }
    except Exception as e:
        return {"extracted_query": f"Failed to parse: {str(e)}", "verified_by_human": False}

async def planner_node(state: AccAgentState):
    """Determine which sub-agent tool to use based on verified inputs."""
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
    content = str(response.content).strip().lower()
    
    # Normalize tool output
    selected_tool = "gdb" # Default fallback
    if "weather" in content:
        selected_tool = "weather"
    elif "market" in content:
        selected_tool = "market"
        
    return {"selected_tool": selected_tool}

async def tool_execution_node(state: AccAgentState):
    """Execute the selected sub-agent."""
    tool_name = state.get("selected_tool", "gdb")
    
    # Shared args from state
    query = state.get("extracted_query", "")
    crop = state.get("extracted_crop", "all")
    loc_state = state.get("extracted_state", "all")
    district = state.get("extracted_district", "all")
    
    try:
        if tool_name == "gdb":
            response = await gdb.ainvoke({
                "rephrased_query": query, 
                "crop": crop, 
                "state": loc_state,
                "latitude": None, "longitude": None, "address": None
            })
        elif tool_name == "weather":
            # Weather agent expects 'address' for geocoding instead of state/district
            d_lower = district.lower()
            s_lower = loc_state.lower()
            if d_lower == "all" and s_lower == "all":
                import asyncio
                # Fetch weather for major Indian cities concurrently
                cities = ["Mumbai", "Delhi", "Kolkata", "Chennai"]
                
                async def fetch_city_weather(city: str) -> str:
                    resp = await weather.ainvoke({
                        "query": "current weather", "latitude": None, "longitude": None, "address": city
                    })
                    return f"**{city}**: {str(resp)}"
                
                city_responses = await asyncio.gather(*(fetch_city_weather(city) for city in cities))
                
                response = "⚠️ Weather coordinates are unavailable.\n\nHere are current weather condition of major Indian cities in India:\n\n" + "\n\n".join(city_responses)
            elif d_lower == "all":
                address = loc_state
                response = await weather.ainvoke({
                    "query": query, "latitude": None, "longitude": None, "address": address
                })
            else:
                address = f"{district}, {loc_state}"
                response = await weather.ainvoke({
                    "query": query, "latitude": None, "longitude": None, "address": address
                })
        elif tool_name == "market":
            response = await market.ainvoke({
                "query": query, "state": loc_state, "district": district, "crop": crop, "date": None
            })
        else:
            response = "Unknown tool requested."
    except Exception as e:
        response = f"Tool execution failed: {str(e)}"
        
    return {"tool_response": str(response)}

async def assembler_node(state: AccAgentState):
    """Format raw sub-agent response into a professional call-center answer."""
    llm = ChatAnthropic(model=CLAUDE_MODEL)
    
    context = (
        f"Original Query: {state.get('extracted_query')}\n"
        f"Raw Database Output: {state.get('tool_response')}\n"
    )
    
    messages = [
        SystemMessage(content=ACC_ASSEMBLER_PROMPT),
        HumanMessage(content=context)
    ]
    response = await llm.ainvoke(messages)
    
    return {"final_answer": str(response.content)}
