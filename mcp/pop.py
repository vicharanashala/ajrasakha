from typing import List, Dict
from fastmcp import FastMCP
import pymongo
from llama_index.core import Settings
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
import logging

from functions import get_retriever
from constants import COLLECTION_POP, COLLECTION_QA, EMBEDDING_MODEL, MONGODB_URI
from functions import process_nodes_pop, process_nodes_qa
from models import ContextPOP, ContextQuestionAnswerPair
from banned_items import (
    get_checker,
    check_text_for_banned_items,
    is_text_clean,
    get_detected_items,
    BannedItemsChecker,
    ValidationResult
)

# Configure logging
logger = logging.getLogger(__name__)

mcp = FastMCP("POP")

Settings.embed_model = HuggingFaceEmbedding(
    model_name=EMBEDDING_MODEL, cache_folder="./hf_cache", trust_remote_code=True
)

client: pymongo.MongoClient = pymongo.MongoClient(MONGODB_URI)

retriever_qa = get_retriever(
    client=client, collection_name=COLLECTION_QA, similarity_top_k=4
)
retriever_pop = get_retriever(
    client=client, collection_name=COLLECTION_POP, similarity_top_k=5
)



@mcp.tool()
async def get_states_for_pop() -> dict:
    """
    Retrieve the list of available Indian states supported by the Package of Practices dataset, 
    along with their corresponding two-letter codes.
    """
    state_codes = {
        "PUNJAB": "PB",
    }
    return state_codes

@mcp.tool()
async def get_context_from_package_of_practices(query: str, state_code : str)-> List[ContextPOP]:
    """
    Retrieve context from the package of practices dataset.

    The query should:
    - Be concise and directly related to agriculture, climate, or closely associated domains.
    - Exclude any meta-instructions (e.g., "use mcp tools", "use package of practices dataset").
    - Avoid unnecessary details or formatting outside the main concern.

    Args:
        query (str): A plain-text query strictly describing the agricultural, climate, 
                     or related issue of concern.
        state_code (str): A two-letter state code (e.g., "TN" for Tamil Nadu, "PB" for Punjab)
                          used to narrow the search context to region-specific questions.
    """
    nodes = await retriever_pop.aretrieve(query)
    processed_nodes = await process_nodes_pop(nodes)
    return processed_nodes


import requests

@mcp.tool()
async def upload_question_to_reviewer_system(question: str, state_name: str, crop: str, details: dict) -> dict:
    """
    Upload the question to the reviewer system for further review by human experts.
    This function is called when the system is unable to find a satisfactory answer from both the datasets (golden dataset and package of practices dataset) 
    for the particular state and crop.

    Parameters:
    - question (str): The question that needs to be reviewed by human experts. 
                      This should be a string containing the query related to crop protection or any other agricultural query.
    - state_name (str): The name of the state in which the query is relevant. 
                        This is typically a string corresponding to the full state name (e.g., "Punjab").
    - crop (str): The type of crop associated with the query. This will be a string like "Paddy" or other crop names.
    - details (dict): A dictionary containing detailed information about the location, crop, season, and domain of the query.
                      The dictionary should have the following structure:
                      {
                        "state": str,       # Name of the state (e.g., "Punjab")
                        "district": str,    # Name of the district (e.g., "Chandigarh")
                        "crop": str,        # Crop name (e.g., "Paddy")
                        "season": str,      # Season of the year (e.g., "Kharif")
                        "domain": str       # Domain of the query, such as "Crop Protection"
                      }
    """
    
    # Define constant values
    source = "AJRASAKHA"
    priority = "high"
    context = ""  # Empty string as context for now
    
    # Construct the payload according to the schema
    payload = {
        "question": question,
        "priority": priority,
        "source": source,
        "details": details,
        "context": context
    }
    
    # Send the POST request
    url = "http://34.131.207.81:4000/api/questions"
    headers = {"Content-Type": "application/json"}

    try:
        response = requests.post(url, json=payload, headers=headers)
        
        if response.status_code == 201:
            return {"status": "Uploaded Successfully"}
        else:
            return {"status": "Failed", "message": response.text}

    except requests.exceptions.RequestException as e:
        return {"status": "Error", "message": str(e)}


# ============================================================================
# BANNED ITEMS VALIDATION TOOLS
# ============================================================================

@mcp.tool()
async def validate_response_for_banned_items(response_text: str) -> dict:
    """
    Validate a chatbot response to ensure it does not contain any banned chemicals,
    pesticides, or fertilizers.
    
    This tool should be called BEFORE sending any agricultural advice response to users
    to ensure compliance with safety regulations. It performs fast, case-insensitive
    scanning of the text.
    
    Args:
        response_text (str): The complete response text generated by the chatbot
                            that needs to be validated before sending to the user.
    
    Returns:
        dict: Validation result containing:
            - is_clean (bool): True if no banned items detected, False otherwise
            - detected_count (int): Number of banned items found
            - detected_items (list): List of detected banned items with details:
                - item (str): Name of the banned substance
                - position (int): Character position in text
                - context (str): Surrounding text context
                - normalized_form (str): Normalized version of the match
            - detection_time_ms (float): Time taken for detection in milliseconds
            - action_required (str): Recommended action ("REGENERATE" or "APPROVED")
            - message (str): Human-readable status message
    
    Example:
        >>> result = await validate_response_for_banned_items(
        ...     "For pest control, you can use neem oil or biological methods."
        ... )
        >>> result["is_clean"]  # True
        >>> result["action_required"]  # "APPROVED"
        
        >>> result = await validate_response_for_banned_items(
        ...     "Apply endosulfan for effective pest control."
        ... )
        >>> result["is_clean"]  # False
        >>> result["action_required"]  # "REGENERATE"
        >>> result["detected_items"][0]["item"]  # "Endosulfan"
    """
    try:
        validation_result = check_text_for_banned_items(response_text)
        
        result_dict = validation_result.to_dict()
        
        # Add action recommendation
        if validation_result.is_clean:
            result_dict["action_required"] = "APPROVED"
            result_dict["message"] = "Response is clean and safe to send to user."
        else:
            result_dict["action_required"] = "REGENERATE"
            detected_names = [item.item for item in validation_result.detected_items]
            result_dict["message"] = (
                f"Response contains {len(detected_names)} banned item(s): "
                f"{', '.join(detected_names)}. Please regenerate response without these items."
            )
            
            # Log the detection
            logger.warning(
                f"Banned items detected in response. Items: {detected_names}. "
                f"Response excerpt: {response_text[:100]}..."
            )
        
        return result_dict
        
    except Exception as e:
        logger.error(f"Error during banned items validation: {str(e)}")
        return {
            "is_clean": False,
            "detected_count": 0,
            "detected_items": [],
            "detection_time_ms": 0,
            "action_required": "ERROR",
            "message": f"Validation error: {str(e)}. Recommend manual review.",
            "error": str(e)
        }


@mcp.tool()
async def get_banned_items_list() -> dict:
    """
    Retrieve the complete list of banned chemicals, pesticides, and fertilizers
    that should never be recommended in responses.
    
    Use this tool to:
    - Understand what substances are prohibited
    - Generate prompts that explicitly exclude banned items
    - Educate the system about restricted substances
    
    Returns:
        dict: Contains:
            - total_count (int): Total number of banned items
            - items (list): Complete list of banned item names
            - categories (dict): Items grouped by type (if available)
            - last_updated (str): Last update timestamp
            - usage_note (str): Important usage guidelines
    
    Example:
        >>> result = await get_banned_items_list()
        >>> result["total_count"]  # 115
        >>> "Endosulfan" in result["items"]  # True
        >>> print(result["usage_note"])
    """
    try:
        checker = get_checker()
        items = checker.get_banned_items_list()
        stats = checker.get_stats()
        
        return {
            "total_count": len(items),
            "items": sorted(items),
            "statistics": stats,
            "last_updated": "2024-11-03",  # Update this when list changes
            "usage_note": (
                "This list contains chemicals, pesticides, and fertilizers banned "
                "in India. NEVER recommend these in agricultural advice. Always use "
                "validate_response_for_banned_items() before sending responses to users."
            ),
            "warning": (
                "Recommending banned substances can cause serious harm to farmers, "
                "environment, and public health. Always verify responses."
            )
        }
        
    except Exception as e:
        logger.error(f"Error retrieving banned items list: {str(e)}")
        return {
            "total_count": 0,
            "items": [],
            "error": str(e),
            "message": "Failed to retrieve banned items list."
        }


@mcp.tool()
async def quick_check_banned_items(text: str) -> dict:
    """
    Perform a quick boolean check if text contains banned items.
    
    This is a lightweight version of validate_response_for_banned_items()
    that only returns whether the text is clean or not, without detailed
    information. Use this for fast pre-checks or filtering.
    
    Args:
        text (str): Text to check for banned items
    
    Returns:
        dict: Contains:
            - is_clean (bool): True if no banned items, False otherwise
            - requires_full_validation (bool): Whether to run full validation
            - message (str): Quick status message
    
    Example:
        >>> result = await quick_check_banned_items("Use neem oil for pests")
        >>> result["is_clean"]  # True
        
        >>> result = await quick_check_banned_items("Use carbofuran spray")
        >>> result["is_clean"]  # False
        >>> result["requires_full_validation"]  # True
    """
    try:
        is_clean_result = is_text_clean(text)
        
        return {
            "is_clean": is_clean_result,
            "requires_full_validation": not is_clean_result,
            "message": "Text is clean" if is_clean_result else "Banned items detected - run full validation",
            "text_length": len(text)
        }
        
    except Exception as e:
        logger.error(f"Error in quick check: {str(e)}")
        return {
            "is_clean": False,
            "requires_full_validation": True,
            "message": f"Error during check: {str(e)}",
            "error": str(e)
        }


@mcp.tool()
async def get_banned_items_stats() -> dict:
    """
    Get statistics and system information about the banned items checker.
    
    Useful for monitoring, debugging, and understanding the checker's capabilities.
    
    Returns:
        dict: System statistics including:
            - total_banned_items: Number of banned substances tracked
            - total_normalized_forms: Number of text variations recognized
            - total_patterns: Number of regex patterns compiled
            - system_status: Current operational status
            - performance_info: Performance characteristics
    
    Example:
        >>> stats = await get_banned_items_stats()
        >>> print(f"Tracking {stats['total_banned_items']} banned substances")
    """
    try:
        checker = get_checker()
        stats = checker.get_stats()
        
        return {
            **stats,
            "system_status": "operational",
            "performance_info": {
                "average_check_time_ms": "< 10ms for typical responses",
                "supports_realtime": True,
                "case_sensitive": False,
                "boundary_detection": True
            },
            "capabilities": [
                "Multi-word phrase detection",
                "Abbreviation recognition (e.g., BHC, DDT)",
                "Variant spelling detection",
                "Context extraction for matches",
                "Sub-millisecond performance"
            ]
        }
        
    except Exception as e:
        logger.error(f"Error retrieving stats: {str(e)}")
        return {
            "system_status": "error",
            "error": str(e),
            "message": "Failed to retrieve statistics"
        }


if __name__ == "__main__":
    mcp.run(transport='streamable-http', host='0.0.0.0', port=9002)
