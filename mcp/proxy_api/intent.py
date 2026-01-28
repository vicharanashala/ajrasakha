import os
import json
import logging
from typing import List, Dict, Any
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

load_dotenv()

# Configuration
INTENT_MODEL_URL = "http://localhost:8013/v1"
INTENT_MODEL_NAME = "google/gemma-3-12b-it"

logger = logging.getLogger("vllm-proxy")

# Initialize LangChain LLM
llm = ChatOpenAI(
    base_url=INTENT_MODEL_URL,
    api_key="EMPTY",  # vLLM usually doesn't require a real key
    model=INTENT_MODEL_NAME,
    temperature=0.0
)

# Tool keywords for pruning logic
MARKET_KEYWORDS = ["mcp_market"]
WEATHER_KEYWORDS = ["mcp_weather"]
AGRICULTURE_KEYWORDS = ["mcp_pop", "mcp_golden", "mcp_faq-videos"]


async def classify_intent(messages: List[Dict[str, Any]]) -> str:
    """
    Classifies the intent of the user messages using an LLM.
    Returns: 'WEATHER', 'MARKET', or 'AGRICULTURE'.
    """
    if not messages:
        return "AGRICULTURE"

    # Filter only user messages for intent classification
    user_messages = [msg for msg in messages if msg.get("role") == "user"]
    
    if not user_messages:
        return "AGRICULTURE"
    
    # Take last 3 user messages for context
    recent_user_messages = user_messages[-3:]
    conversation_history = "\n".join(
        [f"user: {msg.get('content', '')}" for msg in recent_user_messages]
    )

    system_prompt = (
        "You are an intelligent intent classifier. "
        "Analyze the following conversation history and determine the user's current intent. "
        "Classify it into one of these categories: "
        "WEATHER, MARKET, AGRICULTURE. "
        "Do not output anything else. Just the category name."
        "\nExamples:\n"
        "User: What is the price of cotton in Punjab?\nResponse: MARKET\n"
        "User: Is it going to rain tomorrow?\nResponse: WEATHER\n"
        "User: How to treat leaf folder in rice?\nResponse: AGRICULTURE"
    )

    try:
        print(f"[Intent] Analyzing intent for conversation: {conversation_history}")
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=conversation_history)
        ])
        intent = response.content.strip().upper()
        
        # Fallback if model outputs extra text
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
    """
    Filters the tools list based on the classified intent.
    """
    if not tools:
        return []

    filtered_tools = []
    
    for tool in tools:
        function_name = tool.get("function", {}).get("name", "")
        
        keep = False
        if intent == "MARKET":
            if any(k in function_name for k in MARKET_KEYWORDS):
                # User requested to prune these specifically as context is provided in system prompt
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
        
        # If intent logic fails or is overly aggressive, we might want to keep everything?
        # But for this task, the goal is specifically to prune.
        
        # Optimization: Always keep general utility tools if they exist, but here we only see domain specific ones.
        
        if keep:
            filtered_tools.append(tool)
            
    # Fallback: If pruning removed everything, return original tools (safer)
    if not filtered_tools and tools:
        logger.warning(f"Pruning for intent {intent} removed all tools. Returning original list.")
        return tools
        
    logger.info(f"Pruned tools from {len(tools)} to {len(filtered_tools)} for intent {intent}")
    return filtered_tools
