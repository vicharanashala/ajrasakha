"""
Live routing tests for the legacy ajrasakha_node (bind_tools + WHATSAPP_SYSTEM_PROMPT).

The default compiled graph uses the planner pipeline when USE_PLANNER_GRAPH=true.
See test_planner.py for deterministic planner/executor unit tests.
"""

import pytest
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig

from ajrasakha.agents.ajrasakha import ajrasakha_node, use_planner_graph
from ajrasakha.agents.state import AjraSakhaState

pytestmark = pytest.mark.skipif(
    use_planner_graph(),
    reason="Legacy ajrasakha_node tests; set USE_PLANNER_GRAPH=false to run",
)


@pytest.fixture
def base_config() -> RunnableConfig:
    """Provides a basic Langchain config for the tests."""
    return RunnableConfig()


@pytest.mark.asyncio
async def test_weather_intent_routing(base_config):
    """
    Test if a clear weather query triggers the weather tool.
    To bypass the location verification tool, both state and district 
    must be explicitly mentioned in the user's query.
    """
    state: AjraSakhaState = {
        "messages": [HumanMessage(content="What is the weather today in Ropar district of Punjab state?")],
        "location": {"city": "Ropar", "state": "Punjab"}
    }
    
    result = await ajrasakha_node(state, base_config)
    
    response_message = result["messages"][0]
    
    assert response_message.tool_calls is not None, "LLM failed to generate any tool calls!"
    
    tool_names = [call["name"] for call in response_message.tool_calls]
    weather_tool_called = any("weather" in name for name in tool_names)
    reviewer_called = any("upload_question" in name for name in tool_names)
    
    assert reviewer_called, f"Expected reviewer upload before weather. Called: {tool_names}"
    assert weather_tool_called, f"Expected weather tool to be called, but got: {tool_names}"


@pytest.mark.asyncio
async def test_gdb_reviewer_routing(base_config):
    """
    Test if a core farming question triggers the reviewer upload tool first, 
    as strictly mandated by the system prompt Step 1.
    """
    state: AjraSakhaState = {
        "messages": [HumanMessage(content="I am from Kathua, Jammu and Kashmir. I want to grow tomatoes. What varities of tamatoes are best for me?")],
        "location": {"city": "Kathua", "state": "Jammu and Kashmir"}
    }
    
    result = await ajrasakha_node(state, base_config)
    response_message = result["messages"][0]
    
    assert len(response_message.tool_calls) > 0, "No tools triggered for the farming query."
    
    tool_names = [call["name"] for call in response_message.tool_calls]
    
    reviewer_called = any("upload_question" in name for name in tool_names)
    
    assert reviewer_called, f"Prompt rule failed! Did not call reviewer system first. Called: {tool_names}"


@pytest.mark.asyncio
async def test_greeting_uploads_to_reviewer(base_config):
    """
    Every message including greetings must call upload_question_to_reviewer_system first.
    """
    state: AjraSakhaState = {
        "messages": [HumanMessage(content="Namaste Ajrasakha!")],
        "location": None
    }
    
    result = await ajrasakha_node(state, base_config)
    response_message = result["messages"][0]
    
    assert response_message.tool_calls is not None and len(response_message.tool_calls) > 0, (
        "Expected reviewer upload for a greeting, but no tools were called."
    )
    tool_names = [call["name"] for call in response_message.tool_calls]
    reviewer_called = any("upload_question" in name for name in tool_names)
    assert reviewer_called, f"Greeting must upload to reviewer first. Called: {tool_names}"

@pytest.mark.asyncio
async def test_soil_intent_routing(base_config):
    """
    Test if a comprehensive soil query triggers the soil tool.
    Requires all mandatory parameters (N, P, K, OC, State, District, Crop) 
    as per the strict prompt rules to avoid fallback routing.
    """
    state: AjraSakhaState = {
        "messages": [HumanMessage(content="My soil test shows Nitrogen 120, Phosphorus 40, Potassium 30, and OC 0.5%. What is the fertilizer dosage for Rice in Ropar, Punjab?")],
        "location": {"city": "Ropar", "state": "Punjab"}
    }
    
    result = await ajrasakha_node(state, base_config)
    response_message = result["messages"][0]
    
    assert response_message.tool_calls is not None and len(response_message.tool_calls) > 0, "LLM failed to generate tool calls for soil query."
    
    tool_names = [call["name"] for call in response_message.tool_calls]
    soil_tool_called = any("soil" in name for name in tool_names)
    
    assert soil_tool_called, f"Expected soil tool to be called, but got: {tool_names}"

@pytest.mark.asyncio
async def test_market_intent_routing(base_config):
    """
    Test if a mandi price query successfully triggers the market tool.
    Provides crop (wheat), district/mandi (Sirsa), and state (Haryana) 
    to fulfill the tool's requirements.
    """
    state: AjraSakhaState = {
        "messages": [HumanMessage(content="What is the price of wheat in Sirsa mandi, Haryana?")],
        "location": {"city": "Sirsa", "state": "Haryana"}
    }
    
    result = await ajrasakha_node(state, base_config)
    response_message = result["messages"][0]
    
    assert response_message.tool_calls is not None and len(response_message.tool_calls) > 0, "LLM failed to generate tool calls for the market query."
    
    tool_names = [call["name"] for call in response_message.tool_calls]
    
    market_tool_called = any("market" in name for name in tool_names)
    
    assert market_tool_called, f"Expected the market tool to be called, but got: {tool_names}"

@pytest.mark.asyncio
async def test_schemes_intent_routing(base_config):
    """
    Test if a query about government subsidies or welfare schemes triggers the schemes tool.
    Provides necessary basic demographics to fulfill the tool's requirements.
    """
    state: AjraSakhaState = {
        "messages": [HumanMessage(content="I am 22 year, male general category farmer living in Ludhiana, Punjab. Are there any government schemes I can apply for?")],
        "location": {"city": "Ludhiana", "state": "Punjab"}
    }
    
    result = await ajrasakha_node(state, base_config)
    response_message = result["messages"][0]
    
    assert response_message.tool_calls is not None and len(response_message.tool_calls) > 0, "LLM failed to generate tool calls for the schemes query."
    
    tool_names = [call["name"] for call in response_message.tool_calls]
    
    schemes_tool_called = any("schemes" in name for name in tool_names)
    
    assert schemes_tool_called, f"Expected the schemes tool to be called, but got: {tool_names}"

@pytest.mark.asyncio
async def test_parallel_multiple_tool_calling(base_config):
    """
    Test if a multi-intent query triggers multiple tools simultaneously.
    Provides a query that asks for BOTH weather and crop disease advice.
    """
    state: AjraSakhaState = {
        "messages": [HumanMessage(content="What is the weather today in Ropar district, Punjab state? Also, my wheat crop is infected with yellow rust, what should I do?")],
        "location": {"city": "Ropar", "state": "Punjab"}
    }
    
    result = await ajrasakha_node(state, base_config)
    response_message = result["messages"][0]
    
    assert response_message.tool_calls is not None, "LLM failed to generate tool calls."
    
    num_tools = len(response_message.tool_calls)
    assert num_tools >= 2, f"Expected multiple parallel tool calls, but only got {num_tools}. Tool calls: {response_message.tool_calls}"
    
    tool_names = [call["name"] for call in response_message.tool_calls]
    
    weather_called = any("weather" in name for name in tool_names)
    
    reviewer_called = any("upload_question" in name for name in tool_names)
    gdb_called = any(name == "gdb" for name in tool_names)
    
    assert weather_called, f"Expected weather tool in parallel calls, but got: {tool_names}"
    assert reviewer_called, f"Expected reviewer upload in parallel batch, but got: {tool_names}"
    assert gdb_called, f"Expected gdb in parallel batch with weather, but got: {tool_names}"