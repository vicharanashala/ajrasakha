import pytest

from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig

from ajrasakha.agents.ajrasakha import ajrasakha_node, AjraSakhaState

from .questions import TEST_CASES


@pytest.fixture
def base_config():
    return RunnableConfig()


@pytest.mark.asyncio
@pytest.mark.parametrize("case", TEST_CASES)
async def test_tool_routing(case, base_config):

    state: AjraSakhaState = {
        "messages": [HumanMessage(content=case["query"])],
        "location": case["location"]
    }

    result = await ajrasakha_node(state, base_config)

    response_message = result["messages"][0]

    tool_calls = response_message.tool_calls or []

    tool_names = [call["name"] for call in tool_calls]

    for expected_tool in case["expected_tools"]:

        assert any(
            expected_tool in tool_name
            for tool_name in tool_names
        ), f"Expected tool '{expected_tool}' not called. Got: {tool_names}"