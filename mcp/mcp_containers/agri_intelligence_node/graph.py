import sys
import os
import asyncio
import json
import sys
import os
import asyncio
import json
# import httpx # Removed
from typing import TypedDict, Optional, Literal, List, Dict, Any
from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from fastmcp import FastMCP

# MCP Client Imports
from mcp.client.streamable_http import streamablehttp_client
from mcp import ClientSession

# Define MCP Server URLs (configurable via environment variables)
MCP_SERVER_BASE = os.getenv("MCP_SERVER_BASE", "http://100.100.108.28")
SERVERS = {
    "golden": os.getenv("GOLDEN_MCP_URL", f"{MCP_SERVER_BASE}:9001/mcp"),
    "pop": os.getenv("POP_MCP_URL", f"{MCP_SERVER_BASE}:9002/mcp"), 
    "faq-videos": os.getenv("FAQ_VIDEOS_MCP_URL", f"{MCP_SERVER_BASE}:9005/mcp"),
    "reviewed": os.getenv("REVIEWED_MCP_URL", f"{MCP_SERVER_BASE}:9012/mcp")
}

# --- MCP Client Helper ---


# --- Helpers ---
import re

def get_similarity_score(data: Any) -> float:
    """
    Parses similarity_score from data string (handling single/double quotes).
    Returns max score or 0.0 if none found.
    """
    if not data:
        print("No data provided")
        return 0.0
    try:
        data_str = str(data)
        print(f"Data string: {data_str}")
        scores = re.findall(r'["\']similarity_score["\']\s*:\s*([\d\.]+)', data_str)
        if not scores:
            return 0.0
        return max([float(s) for s in scores])
    except Exception as e:
        print(f"Error parsing similarity score: {e}")
        return 0.0


async def call_mcp_tool(server_key: str, tool_name: str, arguments: dict = {}):
    server_url = SERVERS.get(server_key)
    if not server_url:
        return ""

    try:
        async with streamablehttp_client(server_url) as (read_stream, write_stream, _):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                result = await session.call_tool(tool_name, arguments=arguments)
                
                # --- NEW CLEANING LOGIC ---
                if hasattr(result, 'content') and result.content:
                    # Extract text from each content block and join them
                    text_parts = []
                    for item in result.content:
                        if hasattr(item, 'text'):
                            text_parts.append(item.text)
                    return "\n".join(text_parts)
                
                return str(result) # Fallback
                
    except Exception as e:
        print(f"Error calling {tool_name}: {e}")
        return ""
# --- State Definition ---

class AgentState(TypedDict):
    user_query: str
    
    # Extracted Slots
    intent: Literal["disease", "pest", "fertilizer", "general", "greeting"]
    location_provided: bool
    state_name: Optional[str]
    state_code: Optional[str]
    crop_name: Optional[str]
    
    # Data containers
    golden_data: Optional[Dict]
    pop_data: Optional[Dict]
    video_data: Optional[Dict]
    reviewed_data: Optional[Dict] # NEW
    
    # Flags
    uploaded_to_reviewer: bool
    golden_relevant_flag: bool
    reviewed_relevant_flag: bool # NEW
    pop_relevant_flag: bool # NEW
    video_relevant_flag: bool # NEW
    video_search_done: bool
    data_search_done: bool
    
    # Final Output (The Prompt)
    final_prompt: str

# ... (Previous code) ...


async def verify_pop_relevance_llm(state: AgentState):
    """
    Node F: Verify if PoP Data is relevant using LLM.
    """
    query = state["user_query"]
    data = state.get("pop_data")
    
    if not data:
        return {"pop_relevant_flag": False}
        
    prompt = f"""
    User Query: "{query}"
    
    Retrieved PoP Context:
    {str(data)}
    
    Does the retrieved context contain information relevant to answering the user query regarding the crop/issue?
    Return YES or NO.
    """
    
    try:
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        content = response.content.strip().upper()
        
        is_relevant = "YES" in content
        print(f"DEBUG: PoP Relevance Check: {is_relevant} (Response: {content})")
        return {"pop_relevant_flag": is_relevant}
    except Exception as e:
        print(f"ERROR in PoP relevance check: {e}")
        return {"pop_relevant_flag": False}

def evaluate_pop_score(state: AgentState) -> Literal["valid", "invalid"]:
    return "valid" if state.get("pop_relevant_flag") else "invalid"

# ... (Previous code) ...

# Graph Updates:
# workflow.add_node("verify_pop_relevance_llm", verify_pop_relevance_llm)
# And update edges below


# --- LLM Setup ---
# Local OpenAI-compatible endpoint (configurable via environment variable)
api_key = os.getenv("LLM_API_KEY", "EMPTY")
base_url = os.getenv("LLM_BASE_URL", "http://100.100.108.100:8081/v1")
model_name = os.getenv("LLM_MODEL_NAME", "")

llm = ChatOpenAI(
    model=model_name,
    temperature=0,
    api_key=api_key,
    base_url=base_url
)

# --- Nodes ---

async def intent_extractor(state: AgentState):
    """
    Node 1: Extract Intent, State, Crop using LLM.
    """
    query = state["user_query"]
    
    extraction_prompt = f"""
    Analyze this query: "{query}"
    Return JSON only:
    {{
        "intent": "disease" | "pest" | "fertilizer" | "general" | "greeting",
        "location_provided": true/false,
        "state": "detected_indian_state_or_union_territory_full_name_or_null" e.g Delhi , Uttar Pradesh etc
        "crop": "detected_crop_or_null"
    }}
    """
    
    try:
        response = await llm.ainvoke([HumanMessage(content=extraction_prompt)])
        content = response.content.strip()
        print(f"DEBUG: Intent Extraction Prompt: {extraction_prompt}")
        print(f"DEBUG: Intent Extraction: {content}")
        # Clean markdown code blocks if present
        if content.startswith("```"):
            content = content.replace("```json", "").replace("```", "")
            
        slots = json.loads(content)
        
        # Normalize state
        s_name = slots.get("state")
        s_code = None
        if s_name:

             # Use merged maps from values.py
             s_code = None
             
             # Merge Name->Code maps
             all_states = {**pop_states, **golden_state_codes, **review_state_codes}
             state_map = {k.upper(): v for k, v in all_states.items()}
             
             if s_name.upper() in state_map:
                 s_code = state_map[s_name.upper()]
                 s_name = s_name.title() # Normalize name for display
             else:
                 # Fuzzy search or partial match
                 for k, v in state_map.items():
                     if k in s_name.upper() or s_name.upper() in k:
                         s_code = v
                         s_name = k.title()
                         break
             
             if not s_code and len(s_name) == 2:
                  s_code = s_name.upper()

        return {
            "intent": slots.get("intent", "general"),
            "location_provided": bool(s_name),
            "state_name": s_name,
            "state_code": s_code,
            "crop_name": slots.get("crop")
        }
    except Exception as e:
        print(f"Extraction failed: {e}")
        return {"intent": "general", "location_provided": False}

def guardrail_router(state: AgentState) -> Literal["greeting", "missing_state", "proceed"]:
    """
    Router: Check extraction results.
    """
    intent = state.get("intent")
    s_code = state.get("state_code")
    s_name = state.get("state_name")
    
    if intent == "greeting":
        return "greeting"
    
    # Relaxed check: valid if we have code OR name
    if not s_code and not s_name:
        # If no state detected, strictly ask for it (unless generic query allowed?)
        # User request says: "If not slots['state']: return 'Could you please tell me your State...'"
        return "missing_state"
        
    return "proceed"

def handle_greeting(state: AgentState):
    return {"final_prompt": "Namaste! I am AjraSakha. How can I help your farm today?"}

def handle_missing_state(state: AgentState):
    return {"final_prompt": "Could you please tell me your State so I can give accurate advice?"}


async def search_video_parallel(state: AgentState):
    """
    Node B: Search FAQ videos.
    """
    query = state["user_query"]
    result = await call_mcp_tool("faq-videos", "search_faq", {"query": query})
    result = await call_mcp_tool("faq-videos", "search_faq", {"query": query})
    return {"video_data": result, "video_search_done": True}

async def verify_video_relevance_llm(state: AgentState):
    """
    Node: Verify if Video Data is relevant using LLM.
    """
    query = state["user_query"]
    data = state.get("video_data")
    
    # Check if empty or "No FAQ entries found"
    if not data or "No FAQ entries found" in str(data):
        return {"video_relevant_flag": False}
        
    prompt = f"""
    User Query: "{query}"
    
    Video Search Results:
    {str(data)}
    
    Are any of these videos relevant to the user query?
    Return YES or NO.
    """
    
    try:
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        content = response.content.strip().upper()
        is_relevant = "YES" in content
        print(f"DEBUG: Video Relevance Check: {is_relevant}")
        return {"video_relevant_flag": is_relevant}
    except Exception as e:
        print(f"ERROR in Video relevance check: {e}")
        return {"video_relevant_flag": False}

from values import state_crops_golden_dataset, pop_states, golden_state_codes, state_crop_review_dataset, review_state_codes

async def search_golden_dataset_node(state: AgentState):
    """
    Node C: Search Golden Dataset with Validation.
    """
    query = state["user_query"]
    code = state.get("state_code", "PB")
    crop = state.get("crop_name", "") # Crop is extracted as a string, e.g., "Potato"
    
    print(f"DEBUG: Validating Golden Search for State: {code}, Crop: {crop}")
    
    # 1. Validation: Check State
    if code not in state_crops_golden_dataset:
        print(f"DEBUG: State {code} not in Golden Dataset. Skipping.")
        return {"golden_data": None} # Return None to trigger Low score -> PoP
        
    # 2. Validation: Check Crop
    # The value in values.py is a JSON string of a list, e.g., '["Rice", "Wheat"]'
    try:
        allowed_crops_str = state_crops_golden_dataset[code]
        allowed_crops = json.loads(allowed_crops_str)
        if not crop:
            print(f"DEBUG: No crop provided. Skipping Golden.")
            return {"golden_data": None}
            
        allowed_crops_lower = [c.lower() for c in allowed_crops]
        
        # 2a. Programmatic Check
        if crop.lower() in allowed_crops_lower:
             # Exact/Case-insensitive match found
             # Find the original case 
             for c in allowed_crops:
                 if c.lower() == crop.lower():
                     crop = c
                     break
             print(f"DEBUG: Programmatic match for crop: {crop}") 
        else:
             # 2b. LLM Fallback
             print(f"DEBUG: doing LLM fallback for crop: {crop} against {len(allowed_crops)} allowed crops.")
             
             fallback_prompt = f"""
             You are a crop matcher. 
             User Crop: "{crop}"
             Allowed Crops for this State: {json.dumps(allowed_crops)}
             
             Is the User Crop a synonym for any crop in the Allowed Crops list?
             If yes, return ONLY the EXACT name from the Allowed Crops list.
             If no, return "None".
             """
             
             try:
                 response = await llm.ainvoke([HumanMessage(content=fallback_prompt)])
                 match = response.content.strip().replace('"', '')
                 if match != "None" and match in allowed_crops:
                     print(f"DEBUG: LLM matched '{crop}' to '{match}'")
                     crop = match # Update crop to the standardized name
                 else:
                     print(f"DEBUG: LLM did not find a match for '{crop}'.")
                     return {"golden_data": None}
             except Exception as e:
                 print(f"DEBUG: LLM fallback failed: {e}")
                 # Proceed or skip? Safer to skip if validation fails
                 return {"golden_data": None}
            
    except Exception as e:
        print(f"ERROR parsing crops list for {code}: {e}")
        return {"golden_data": None}

    print(f"Search Golden Dataset: {query}, {code}, {crop}")
    result = await call_mcp_tool(
        "golden", 
        "get_context_from_golden_dataset", 
        {"query": query, "state_code": code, "crop": crop}
    )
    return {"golden_data": result}

    return {"golden_data": result}

async def search_reviewed_node(state: AgentState):
    """
    Node X: Search Reviewed Agricultural Q&A. (Highest Priority)
    """
    query = state["user_query"]
    code = state.get("state_code", "PB")
    crop = state.get("crop_name", "")
    
    # 1. Validation: Check State
    if code not in state_crop_review_dataset:
        print(f"DEBUG: State {code} not in Review Dataset. Skipping.")
        return {"reviewed_data": None}
        
    # 2. Validation: Check Crop
    try:
        allowed_crops = state_crop_review_dataset[code] # List of strings
        if not crop:
             print(f"DEBUG: No crop provided for Review search. Skipping.")
             return {"reviewed_data": None}

        # Case-insensitive match check
        allowed_crops_lower = [c.lower() for c in allowed_crops]
        
        if crop.lower() in allowed_crops_lower:
             for c in allowed_crops:
                 if c.lower() == crop.lower():
                     crop = c
                     break
             print(f"DEBUG: Programmatic match for Review crop: {crop}")
        else:
             # LLM Fallback (Reuse logic)
             print(f"DEBUG: LLM Fallback for Review Crop: {crop}")
             fallback_prompt = f"""
             You are a crop matcher.
             User Crop: "{crop}"
             Allowed Crops: {json.dumps(allowed_crops)}
             Is the User Crop a synonym for any crop in the Allowed Crops list?
             If yes, return ONLY the EXACT name from the list.
             If no, return "None".
             """
             try:
                 response = await llm.ainvoke([HumanMessage(content=fallback_prompt)])
                 match = response.content.strip().replace('"', '')
                 if match != "None" and match in allowed_crops:
                     print(f"DEBUG: Review LLM matched '{crop}' to '{match}'")
                     crop = match
                 else:
                     print(f"DEBUG: Review LLM did not find match.")
                     return {"reviewed_data": None}
             except Exception:
                 return {"reviewed_data": None}

    except Exception as e:
        print(f"ERROR validating review crop: {e}")
        return {"reviewed_data": None}

    print(f"Search Reviewed DB: {query}, {code}, {crop}")
    result = await call_mcp_tool("reviewed", "get_context_from_review_dataset", {"query": query, "state_code": code, "crop": crop})
    print(f"DEBUG: Reviewed Data: {result}")
    return {"reviewed_data": result}

def evaluate_reviewed_score(state: AgentState) -> Literal["high", "medium", "low"]:
    score = get_similarity_score(state.get("reviewed_data"))
    print(f"DEBUG: Max Reviewed Score: {score}")
    if score > 0.8:
        return "high"
    elif score > 0.7:
        return "medium"
    else:
        return "low"

def mark_reviewed_high_confidence(state: AgentState):
    """
    Node: Explicitly mark reviewed data as relevant for high confidence scores.
    """
    return {"reviewed_relevant_flag": True}

async def verify_reviewed_relevance_llm(state: AgentState):
    """
    Node Y: Verify Reviewed Data Relevance.
    """
    query = state["user_query"]
    data = state.get("reviewed_data")
    
    if not data:
        return {"reviewed_relevant_flag": False}
        
    prompt = f"""
    User Query: "{query}"
    
    Retrieved Q&A Pairs:
    {str(data)}
    
    Do any of these questions match the user query and provide a relevant answer?
    Return YES or NO.
    """
    
    try:
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        content = response.content.strip().upper()
        is_relevant = "YES" in content
        print(f"Reviewed Relevance Check: {is_relevant}")
        return {"reviewed_relevant_flag": is_relevant}
    except Exception as e:
        print(f"Error in reviewed check: {e}")
        return {"reviewed_relevant_flag": False}


def check_reviewed_relevance(state: AgentState) -> Literal["relevant", "fallback"]:
    return "relevant" if state.get("reviewed_relevant_flag") else "fallback"

    
# ... (evaluate_golden_score remains same, checking for None/Empty)
def evaluate_golden_score(state: AgentState) -> Literal["high", "medium", "low"]:
    score = get_similarity_score(state.get("golden_data"))
    print(f"DEBUG: Max Golden Score: {score}")
    if score > 0.8:
        return "high"
    elif score > 0.7:
        return "medium"
    else:
        return "low"

async def verify_relevance_llm(state: AgentState):
    """
    Node D: Verify if Golden Data is relevant using LLM.
    """
    query = state["user_query"]
    data = state.get("golden_data")
    
    if not data:
        return {"golden_relevant_flag": False}
        
    prompt = f"""
    User Query: "{query}"
    
    Retrieved Context:
    {str(data)}
    
    Does the retrieved context contain information relevant to answering the user query?
    Return YES or NO.
    """
    
    try:
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        content = response.content.strip().upper()
        
        is_relevant = "YES" in content
        print(f"DEBUG: Relevance Check: {is_relevant} (Response: {content})")
        return {"golden_relevant_flag": is_relevant}
    except Exception as e:
        print(f"ERROR in relevance check: {e}")
        # Fail safe to Not Relevant if error, so we try PoP
        return {"golden_relevant_flag": False}

def check_relevance_result(state: AgentState) -> Literal["relevant", "not_relevant"]:
    return "relevant" if state.get("golden_relevant_flag") else "not_relevant"

async def search_pop_node(state: AgentState):
    """
    Node E: Search PoP with Validation.
    """
    query = state["user_query"]
    code = state.get("state_code", "PB")
    s_name = state.get("state_name", "")
    
    # Validation: Check if State is in PoP Supported list
    # pop_states is mapping Name -> Code, but user requirement implies checking availability.
    # If we have a code, let's assume valid unless we have a list of supported codes.
    # User's values.py has pop_states={'PUNJAB': 'PB'}. This looks like a helper to get code from name.
    # If the intention "if state available in values.py" means checking keys/values of pop_states:
    
    # Strict interpretation of User request: "if state is available ... then proceed otherwise upload"
    
    is_supported = False
    
    # Check if code maps to any value in pop_states (reverse lookup) or simply check validity
    # Given the small pop_states, lets check if our code is among the values or if our name is among keys
    if code in pop_states.values():
        is_supported = True
    elif s_name and s_name.upper() in pop_states:
         is_supported = True
         
    if not is_supported:
        print(f"DEBUG: State {code}/{s_name} not supported by PoP. Skipping to Upload.")
        return {"pop_data": None}
    
    print(f"DEBUG: Calling PoP for {code}")
    result = await call_mcp_tool("pop", "get_context_from_package_of_practices", {"query": query, "state_code": code})
    return {"pop_data": result}

async def verify_pop_relevance_llm(state: AgentState):
    """
    Node F: Verify if PoP Data is relevant using LLM.
    """
    query = state["user_query"]
    data = state.get("pop_data")
    
    if not data:
        return {"pop_relevant_flag": False}
        
    prompt = f"""
    User Query: "{query}"
    
    Retrieved PoP Context:
    {str(data)}
    
    Does the retrieved context contain information relevant to answering the user query regarding the crop/issue?
    Return YES or NO.
    """
    
    try:
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        content = response.content.strip().upper()
        
        is_relevant = "YES" in content
        print(f"DEBUG: PoP Relevance Check: {is_relevant} (Response: {content})")
        return {"pop_relevant_flag": is_relevant}
    except Exception as e:
        print(f"ERROR in PoP relevance check: {e}")
        return {"pop_relevant_flag": False}

def evaluate_pop_score(state: AgentState) -> Literal["valid", "invalid"]:
    return "valid" if state.get("pop_relevant_flag") else "invalid"

async def upload_to_reviewer_node(state: AgentState):
    q = state["user_query"]
    s = state.get("state_name", "Unknown")
    c = state.get("crop_name", "Unknown")
    details = {"state": s, "crop": c, "season": "General", "domain": "Crop Protection", "district": "Not specified"}
    await call_mcp_tool("pop", "upload_question_to_reviewer_system", 
                       {"question": q, "state_name": s, "crop": c, "details": details})
    return {"uploaded_to_reviewer": True}

def mark_data_search_done(state: AgentState):
    return {"data_search_done": True}

def synchronizer(state: AgentState): pass

def check_sync(state: AgentState) -> Literal["ready", "waiting"]:
    if state.get("video_search_done") and state.get("data_search_done"):
        return "ready"
    return "waiting"

async def format_final_prompt(state: AgentState):
    """
    Node G: Format the final prompt string (Do not generate answer).
    """
    query = state["user_query"]
    intent = state.get("intent", "general")
    uploaded = state.get("uploaded_to_reviewer")
    
    golden = state.get("golden_data", {})
    pop = state.get("pop_data", {})
    video = state.get("video_data", {})
    reviewed = state.get("reviewed_data", {})
    
    # Video Section Logic
    video_section = ""
    if state.get("video_relevant_flag"):
         video_section = f"""
    VIDEO SOURCE:
    {str(video)}
    (This is a relevant video. Please put the link in your response so farmers can watch it.)
    """
    else:
         video_section = "VIDEO SOURCE: No relevant video found."

    # Filter Data based on Relevance Flags
    # If Reviewed applies, it takes precedence.
    if state.get("reviewed_relevant_flag"):
         # If reviewed is RELEVANT, we suppress Golden/PoP to avoid confusion?
         # Or we just show it at top?
         # Requirement: "precedence". Let's show it prominently.
         # We can hide others to reduce tokens if reviewed is the answer.
         golden = "Skipped (Reviewed Data Found)"
         pop = "Skipped (Reviewed Data Found)"
    else:
         reviewed = "No relevant reviewed data found."
         
    # If PoP relevance check failed, do not show data
    if state.get("pop_data") and state.get("pop_relevant_flag") is False:
         pop = "Data flagged as irrelevant by validation system."
         
    # Logic for Golden? 
    # If we routed to PoP because Golden was Low/Irrelevant, we probably shouldn't show Golden?
    # But current state flow doesn't explicitly mark Golden invalid unless verify_relevance_llm returned False.
    if state.get("golden_relevant_flag") is False:
         golden = "Data flagged as irrelevant by validation system."
    
    # Select Matrix Instruction
    base_system_prompt = "You are AjraSakha2.0. Answer using the provided context."
    matrix_instruction = "Answer politely using the context provided."
    
    if intent == "disease":
        matrix_instruction = "Follow 'Matrix A: Disease Management'. Structure: Description, Identification, Severity, Control (Chemical/Bio/Cultural)."
    elif intent == "pest":
        matrix_instruction = "Follow 'Matrix B: Pest Management'. Structure: ETL, Symptoms, Chemical/Bio Control."
    elif intent == "fertilizer":
        matrix_instruction = "Follow 'Matrix C: Nutrient Management'. Focus on NPK doses and Soil Health."
    
    # Construct Final Prompt
    final_prompt = f"""
    {base_system_prompt}
    
    {matrix_instruction}
    
    CONTEXT DATA FROM DATABASE OR POP:
    CONTEXT DATA FROM DATABASE OR POP:
    Reviewed Data (High Priority): {str(reviewed)}
    Golden: {str(golden)}
    PoP: {str(pop)}
    
    {str(pop)}
    
    {video_section}
    
    USER QUESTION:
    {query}
    
    UPLOAD TO REVIEWER STATUS: {uploaded}
    (If True, please apologize and inform the user the query is being reviewed.)
    """
    print(f"DEBUG: Final Prompt: {final_prompt}")
    return {"final_prompt": final_prompt.strip()}


# --- Graph Construction ---

workflow = StateGraph(AgentState)

workflow.add_node("intent_extractor", intent_extractor)
workflow.add_node("handle_greeting", handle_greeting)
workflow.add_node("handle_missing_state", handle_missing_state)
workflow.add_node("search_video_parallel", search_video_parallel)
workflow.add_node("verify_video_relevance_llm", verify_video_relevance_llm) # NEW
workflow.add_node("search_golden_dataset", search_golden_dataset_node)
workflow.add_node("verify_relevance_llm", verify_relevance_llm)
workflow.add_node("search_pop", search_pop_node)
workflow.add_node("verify_pop_relevance_llm", verify_pop_relevance_llm) # NEW
workflow.add_node("mark_reviewed_high_confidence", mark_reviewed_high_confidence) # NEW
workflow.add_node("upload_to_reviewer", upload_to_reviewer_node)
workflow.add_node("mark_data_done", mark_data_search_done)
workflow.add_node("synchronizer", synchronizer)
workflow.add_node("format_final_prompt", format_final_prompt)

# Start -> Intent
workflow.set_entry_point("intent_extractor")

# Intent -> Router
workflow.add_conditional_edges(
    "intent_extractor",
    guardrail_router,
    {
        "greeting": "handle_greeting",
        "missing_state": "handle_missing_state",
        "proceed": "start_search_fork" 
    }
)

# Fork Node to handle branching after router says proceed
def start_search_fork(state: AgentState): pass
workflow.add_node("start_search_fork", start_search_fork)

# Fork -> Parallel
workflow.add_node("search_reviewed", search_reviewed_node)
workflow.add_node("verify_reviewed_relevance", verify_reviewed_relevance_llm)

workflow.add_edge("start_search_fork", "search_video_parallel")
workflow.add_edge("start_search_fork", "search_reviewed") # New Primary Path

# Reviewed Logic
# Reviewed Logic
# Check Score First
workflow.add_conditional_edges("search_reviewed", evaluate_reviewed_score,
                               {"high": "mark_reviewed_high_confidence", "medium": "verify_reviewed_relevance", "low": "search_golden_dataset"})

workflow.add_edge("mark_reviewed_high_confidence", "mark_data_done")

workflow.add_conditional_edges("verify_reviewed_relevance", check_reviewed_relevance,
                               {"relevant": "mark_data_done", "fallback": "search_golden_dataset"})



# Video -> Verify -> Sync
workflow.add_edge("search_video_parallel", "verify_video_relevance_llm")
workflow.add_edge("verify_video_relevance_llm", "synchronizer")

# Golden Logic
workflow.add_conditional_edges("search_golden_dataset", evaluate_golden_score,
                               {"high": "mark_data_done", "medium": "verify_relevance_llm", "low": "search_pop"})

workflow.add_conditional_edges("verify_relevance_llm", check_relevance_result,
                               {"relevant": "mark_data_done", "not_relevant": "search_pop"})

# Pop -> Verify
workflow.add_edge("search_pop", "verify_pop_relevance_llm")

# Verify -> Condition
workflow.add_conditional_edges("verify_pop_relevance_llm", evaluate_pop_score,
                               {"valid": "mark_data_done", "invalid": "upload_to_reviewer"})

workflow.add_edge("upload_to_reviewer", "mark_data_done")
workflow.add_edge("mark_data_done", "synchronizer")

workflow.add_conditional_edges("synchronizer", check_sync, {"ready": "format_final_prompt", "waiting": END})

workflow.add_edge("handle_greeting", END)
workflow.add_edge("handle_missing_state", END)
workflow.add_edge("format_final_prompt", END)

app = workflow.compile()

# --- MCP Tool Definition ---

mcp = FastMCP("AjraSakha Orchestrator")

@mcp.tool()
async def ask_ajrasakha(query: str) -> str:
    """
    Orchestrates the entire agricultural query response.
    Returns the FINAL PROMPT string that includes context and instructions.
    Does NOT generate the final answer text.
    
    Args:
        query: The farmer's question.
    """
    # Initial state
    inputs = {
        "user_query": query,
        "intent": "general",
        "location_provided": False,
        "state_name": None,
        "state_code": None,
        "crop_name": None,
        "uploaded_to_reviewer": False,
        "video_search_done": False,
        "data_search_done": False
    }
    
    print(f"Starting workflow for: {query}")
    final_res = ""
    
    async for output in app.astream(inputs):
        for key, value in output.items():
            print(f"Node '{key}' completed.")
            if value and "final_prompt" in value:
                final_res = value["final_prompt"]
    
    return final_res

if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    
    logger.info(f"Starting AjraSakha Orchestrator MCP Server on 0.0.0.0:9010")
    logger.info(f"Configured LLM endpoint: {base_url}")
    logger.info(f"Configured MCP Servers: {SERVERS}")
    logger.info(f"LLM_BASE_URL env var: {os.getenv('LLM_BASE_URL', 'NOT SET')}")
    logger.info(f"MCP_SERVER_BASE env var: {os.getenv('MCP_SERVER_BASE', 'NOT SET')}")
    
    mcp.run(transport='streamable-http', host='0.0.0.0', port=9010)
