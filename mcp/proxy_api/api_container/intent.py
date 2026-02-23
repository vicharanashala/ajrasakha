"""
Intent classification using LangChain with PydanticOutputParser for structured output.
"""
import os
import logging
from typing import List, Dict, Any
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import PydanticOutputParser

load_dotenv()

INTENT_MODEL_URL = os.getenv("INTENT_MODEL_URL", "http://100.100.108.27:8013/v1")
INTENT_MODEL_NAME = os.getenv("INTENT_MODEL_NAME", "google/gemma-3-12b-it")

logger = logging.getLogger("vllm-proxy")

llm = ChatOpenAI(
    base_url=INTENT_MODEL_URL,
    api_key="EMPTY",
    model=INTENT_MODEL_NAME,
    temperature=0.0
)

MARKET_KEYWORDS = ["mcp_market"]
WEATHER_KEYWORDS = ["mcp_weather"]
AGRICULTURE_KEYWORDS = ["mcp_pop", "mcp_golden", "mcp_faq-videos"]


class IntentOutput(BaseModel):
    """Pydantic model for intent classification output."""
    intent: str = Field(description="The classified intent. Must be one of: WEATHER, MARKET, AGRICULTURE")


output_parser = PydanticOutputParser(pydantic_object=IntentOutput)


async def classify_intent(messages: List[Dict[str, Any]]) -> str:
    """
    Classifies the intent of the user messages using an LLM with structured output.
    
    Returns: 'WEATHER', 'MARKET', or 'AGRICULTURE'.
    """
    if not messages:
        return "AGRICULTURE"

    user_messages = [msg for msg in messages if msg.get("role") == "user"]
    
    if not user_messages:
        return "AGRICULTURE"
    
    recent_user_messages = user_messages[-3:]
    recent_user_messages.reverse()
    
    labels = ["users most recent message", "users second last message", "user third last"]
    history_lines = []
    
    for i, msg in enumerate(recent_user_messages):
        label = labels[i] if i < len(labels) else "user older message"
        content = msg.get('content', '')
        history_lines.append(f"{label}: {content}")

    conversation_history = "\n".join(history_lines)

    format_instructions = output_parser.get_format_instructions()
    
    system_prompt = f"""You are an intelligent intent classifier.
Analyze the following conversation history and determine the user's current intent.
Analyse based on most recent message first.
Classify it into one of these categories: WEATHER, MARKET, AGRICULTURE.

Examples:
User: What is the price of cotton in Punjab?
Intent: MARKET

User: Is it going to rain tomorrow?
Intent: WEATHER

User: How to treat leaf folder in rice?
Intent: AGRICULTURE

{format_instructions}"""

    try:
        logger.info(f"[Intent] Analyzing intent for conversation: {conversation_history}")
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=conversation_history)
        ])
        
        try:
            parsed_output = output_parser.parse(response.content)
            intent = parsed_output.intent.strip().upper()
        except Exception:
            intent = response.content.strip().upper()
        
        if "MARKET" in intent:
            return "MARKET"
        elif "WEATHER" in intent:
            return "WEATHER"
        elif "AGRICULTURE" in intent:
            return "AGRICULTURE"
        else:
            logger.warning(f"Unclear intent '{intent}', defaulting to AGRICULTURE")
            return "AGRICULTURE"

    except Exception as e:
        logger.error(f"Intent classification failed: {e}")
        return "AGRICULTURE"


def prune_tools(tools: List[Dict[str, Any]], intent: str) -> List[Dict[str, Any]]:
    """Filters the tools list based on the classified intent."""
    if not tools:
        return []

    filtered_tools = []
    
    for tool in tools:
        function_name = tool.get("function", {}).get("name", "")
        
        keep = False
        if intent == "MARKET":
            if any(k in function_name for k in MARKET_KEYWORDS):
                if "get_state_list_from_enam" in function_name or "get_today_date_for_enam" in function_name:
                    keep = False
                else:
                    keep = True
        elif intent == "WEATHER":
            if any(k in function_name for k in WEATHER_KEYWORDS):
                keep = True
        elif intent == "AGRICULTURE":
            if any(k in function_name for k in AGRICULTURE_KEYWORDS):
                keep = True
        
        if keep:
            filtered_tools.append(tool)
    
    if not filtered_tools and tools:
        logger.warning(f"Pruning for intent {intent} removed all tools. Returning original list.")
        return tools
        
    logger.info(f"Pruned tools from {len(tools)} to {len(filtered_tools)} for intent {intent}")
    return filtered_tools
