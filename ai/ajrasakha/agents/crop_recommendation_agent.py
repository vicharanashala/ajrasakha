from langchain.agents import create_agent
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langchain_mcp_adapters.client import MultiServerMCPClient
from pydantic import BaseModel

from ajrasakha.agents.config import SANITIZER_MODEL, MCP_URLS
from ajrasakha.agents.location_context import sub_agent_system_prompt_with_thread_location

_mcp_client = MultiServerMCPClient(
    {
        "crop_recommendation": {
            "url": MCP_URLS.get("crop_recommendation", "http://100.100.108.44:9020/mcp"),
            "transport": "http",
        }
    }
)

llm = ChatAnthropic(model=SANITIZER_MODEL)

_crop_agent_graph = None

async def _get_crop_agent():
    global _crop_agent_graph
    if _crop_agent_graph is None:
        tools = await _mcp_client.get_tools()
        _crop_agent_graph = create_agent(
            name="crop_recommendation_agent",
            model=llm,
            tools=tools,
            system_prompt=None,
            checkpointer=False,
        )
    return _crop_agent_graph


class CropRecommendationInput(BaseModel):
    query: str
    state: str
    district: str


CROP_REC_SYSTEM_PROMPT = """
You are a Crop Recommendation AI specialist for Indian farmers.
Your task is to extract soil and climate parameters from the user's query and call the recommend_crop tool.
If the query mentions parameters like N, P, K, pH, temperature, humidity, or rainfall, pass them to the tool.
For any missing parameters, you can use typical default values or ask the farmer to provide them, but try your best to run the tool if enough information is present.
Do not make up values if the farmer explicitly asks what values are needed.
Answer in the same language as the farmer's query.

CRITICAL: You MUST include the exact recommended crop name at the very end of your response in this exact format:
RECOMMENDED_CROP: [crop_name]
Example: RECOMMENDED_CROP: rice
"""

@tool(args_schema=CropRecommendationInput)
async def crop_recommendation(query: str, state: str, district: str, config: RunnableConfig) -> str:
    """
    Query the crop recommendation agent.
    Use this when the user asks which crop to grow based on soil parameters (N, P, K, pH) 
    and/or weather conditions (temperature, humidity, rainfall).
    """
    try:
        context = f"""
    State   : {state}
    District: {district}
    Query   : {query}
        """.strip()

        system_text = sub_agent_system_prompt_with_thread_location(CROP_REC_SYSTEM_PROMPT, config)
        agent = await _get_crop_agent()
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
        logging.getLogger(__name__).error("crop_recommendation sub-agent failed: %s", exc)
        return f"⚠️ The crop recommendation service is temporarily unavailable. Error: {type(exc).__name__}"
