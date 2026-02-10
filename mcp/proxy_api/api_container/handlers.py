"""
Request handlers for the proxy API.
Implements segregated endpoint handling with single-responsibility functions.
"""
import json
import httpx
from datetime import datetime
from typing import Optional, Dict, Any, List

from config import logger, VISION_API_URL
from prompts import (
    MARKET_SYSTEM_PROMPT,
    AGRICULTURE_SYSTEM_PROMPT,
    AGRICULTURE_USER_GUIDANCE,
    VISION_PREDICTION_TEMPLATE
)
from typing import Union
from utils import (
    extract_text_from_content,
    find_last_user_message,
    get_messages_for_language_detection,
    Success, Failure
)
from market_values import state_ids
from multilingual import detect_language, translate_text
from intent import classify_intent, prune_tools
from exceptions import VisionAPIError


async def process_single_image(url: str) -> Union[Success[str], Failure[str]]:
    """
    Process a single image URL through the Vision API.
    
    Args:
        url: The image URL to process
        
    Returns:
        Result containing prediction text on success, error message on failure
    """
    if not VISION_API_URL:
        return Failure("VISION_API_URL is not set")
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as vision_client:
            resp = await vision_client.post(VISION_API_URL, json={"url": url})
            
            if resp.status_code != 200:
                return Failure(f"Vision API returned {resp.status_code}")
            
            prediction_data = resp.json()
            class_name = prediction_data.get("class_name", "Unknown")
            confidence = prediction_data.get("confidence", 0.0)
            
            prediction_text = VISION_PREDICTION_TEMPLATE.format(
                class_name=class_name,
                confidence=confidence
            )
            logger.info(f"Vision API Prediction: {class_name} ({confidence:.2%})")
            return Success(prediction_text)
            
    except Exception as e:
        return Failure(str(e))


async def process_images_in_messages(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Scans messages for image_url content and replaces with Vision API predictions.
    """
    if not VISION_API_URL:
        logger.warning("VISION_API_URL is not set. Skipping image processing.")
        return messages

    for msg in messages:
        if msg.get("role") != "user" or not isinstance(msg.get("content"), list):
            continue
            
        new_content = []
        for block in msg["content"]:
            if not isinstance(block, dict) or block.get("type") != "image_url":
                new_content.append(block)
                continue
                
            url = block.get("image_url", {}).get("url")
            if not url:
                new_content.append(block)
                continue
                
            logger.info(f"Intercepted image URL. Sending to Vision API: {VISION_API_URL}")
            result = await process_single_image(url)
            
            if result.is_success():
                new_content.append({"type": "text", "text": result.value})
            else:
                logger.error(f"Failed to call Vision API: {result.error}")
                new_content.append(block)
        
        msg["content"] = new_content
    
    return messages


async def handle_language_detection(messages: List[Dict[str, Any]], request_id: str) -> str:
    """
    Detect language from conversation context.
    
    Returns:
        Detected language name (defaults to "English" on error)
    """
    combined_content = get_messages_for_language_detection(messages)
    
    if not combined_content:
        return "English"
    
    logger.info(f"[{request_id}] Language detection content: {combined_content[:1000]}...")
    detected_lang = await detect_language(combined_content)
    logger.info(f"[{request_id}] Detected Language: {detected_lang}")
    
    return detected_lang


async def handle_translation_to_english(
    messages: List[Dict[str, Any]], 
    user_msg_idx: int,
    user_msg_content: Any,
    request_id: str
) -> List[Dict[str, Any]]:
    """
    Translate user message to English if needed.
    """
    logger.info(f"[{request_id}] Translating user request to English...")
    text_to_translate = extract_text_from_content(user_msg_content)
    english_text = await translate_text(text_to_translate, "English")
    messages[user_msg_idx]["content"] = english_text
    return messages


def inject_market_context(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Inject market-specific system prompt with date and state IDs.
    """
    current_date = datetime.now().strftime("%Y-%m-%d")
    market_context = MARKET_SYSTEM_PROMPT.format(
        current_date=current_date,
        state_ids_json=json.dumps(state_ids, indent=2)
    )
    
    if messages and messages[0].get("role") == "system":
        existing_content = messages[0].get("content", "")
        messages[0]["content"] = existing_content + "\n\n" + market_context
    else:
        messages.insert(0, {"role": "system", "content": market_context})
    
    return messages


def inject_agriculture_context(
    messages: List[Dict[str, Any]], 
    user_msg_idx: int
) -> List[Dict[str, Any]]:
    """
    Inject agriculture-specific system prompt and user guidance.
    """
    if messages and messages[0].get("role") == "system":
        messages[0]["content"] = AGRICULTURE_SYSTEM_PROMPT
    else:
        messages.insert(0, {"role": "system", "content": AGRICULTURE_SYSTEM_PROMPT})
    
    if user_msg_idx >= 0:
        original_content = messages[user_msg_idx].get("content", "")
        messages[user_msg_idx]["content"] = original_content + AGRICULTURE_USER_GUIDANCE
    
    return messages


async def handle_intent_routing(
    messages: List[Dict[str, Any]],
    tools: List[Dict[str, Any]],
    user_msg_idx: int,
    request_id: str
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Classify intent and route to appropriate handler.
    
    Returns:
        Tuple of (modified_messages, pruned_tools)
    """
    logger.info(f"[{request_id}] Analyzing intent...")
    intent = await classify_intent(messages)
    logger.info(f"[{request_id}] Intent classified as: {intent}")
    
    pruned_tools = prune_tools(tools, intent)
    
    if intent == "MARKET":
        messages = inject_market_context(messages)
    elif intent == "AGRICULTURE":
        messages = inject_agriculture_context(messages, user_msg_idx)
    
    return messages, pruned_tools
