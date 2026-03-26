from __future__ import annotations

import asyncio
import io
import logging
import os
import sys
from typing import Any

import httpx
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

# Ensure UTF-8 output on all platforms including Windows
# This enables support for all Indian languages (Hindi, Telugu, Tamil, Kannada, Marathi, etc.)
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if sys.stderr.encoding != 'utf-8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

load_dotenv()

# Configure logging similar to admin reference implementation.
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================================
# SOIL HEALTH MCP SERVER - TOOL CALLING REFERENCE
# ============================================================================
#
# MULTILINGUAL SUPPORT
# ====================
# This module supports all Indian languages natively:
# - Hindi (हिंदी), Telugu (తెలుగు), Tamil (தமிழ்), Kannada (ಕನ್ನಡ)
# - Marathi (मराठी), Gujarati (ગુજરાતી), Punjabi (ਪੰਜਾਬੀ), etc.
#
# All crop names are automatically handled with proper UTF-8 encoding.
# Both local language and English names are preserved in responses.
# Helper function `extract_crop_display()` can be used to parse crop names.
#
# This module provides tools for interacting with the DAC Soil Health Portal
# (https://soilhealth4.dac.gov.in) to fetch soil test data and fertilizer
# recommendations based on soil NPK (Nitrogen, Phosphorus, Potassium) and OC
# (Organic Carbon) levels.
#
# ⚠️ IMPORTANT: Tools must be called in a specific sequence. The recommended
# flow is:
#
#   STEP 1: soilhealth_get_states()
#           ↓ (Returns list of states with MongoDB _id field)
#   STEP 2: soilhealth_get_districts_by_state(state_id_from_step_1)
#           ↓ (Optional: Returns list of districts)
#   STEP 3: soilhealth_get_crop_registries(state_id_from_step_1._id)
#           ↓ (REQUIRED! Returns crop IDs needed for fertilizer calculations)
#   STEP 4: soilhealth_get_fertilizer_recommendations(
#               state_from_step_1._id,
#               soil_test_results,
#               district_optional_from_step_2,
#               crop_ids_from_step_3
#           )
#           ↓ (Returns fertilizer dosages)
#
# TOOL DEPENDENCY GRAPH:
#   soilhealth_get_states()
#       ├─→ soilhealth_get_districts_by_state() [needs: state._id]
#       ├─→ soilhealth_get_crop_registries() [needs: state._id (MongoDB ObjectId)]
#       └─→ soilhealth_get_fertilizer_recommendations() [needs: state._id + crop IDs + soil results]
#
# KEY CONCEPTS:
#   - All tools return a dict with "success" boolean key
#   - If success=True: check "data" or specific keys (states, districts, etc.)
#   - If success=False: check "error" and "detail" for debugging
#   - State _id: MongoDB ObjectIds (24-char hex strings) returned by getState/getTestCenters
#   - Crop IDs: MongoDB ObjectIds returned by getCropRegistries (use "id" field)
#   - NPK values: Must be numeric (floats or ints), in mg/kg; OC in %
#
# TESTED QUERYRESPONSES (as of March 25, 2026):
#   ✅ getState: Returns 33 unique states (derived from test centers fallback)
#   ✅ getTestCenters: Returns list of test centers with state info
#   ✅ getdistrictAndSubdistrictBystate: Returns districts (may be empty for some states)
#   ✅ getCropRegistries: Returns 59 crops, 17 with GFR available (tested with state._id)
#   ✅ getRecommendations: Returns proper fertilizer dosage recommendations
#
# ============================================================================

SOILHEALTH_GRAPHQL_URL = os.getenv("SOILHEALTH_GRAPHQL_URL", "https://soilhealth4.dac.gov.in").rstrip("/")
TIMEOUT_SECONDS = float(os.getenv("SOILHEALTH_TIMEOUT_SECONDS", "30"))
MCP_TRANSPORT = os.getenv("MCP_TRANSPORT", "streamable-http").strip().lower()
MCP_HOST = os.getenv("MCP_HOST", "0.0.0.0").strip()
MCP_PORT = int(os.getenv("SOILHEALTH_MCP_PORT", "9005"))
MCP_MOUNT_PATH = os.getenv("MCP_MOUNT_PATH", "/").strip() or "/"
MAX_RETRIES = int(os.getenv("SOILHEALTH_MAX_RETRIES", "3"))
INITIAL_BACKOFF = float(os.getenv("SOILHEALTH_INITIAL_BACKOFF", "0.5"))

# ============================================================================
# MULTILINGUAL SUPPORT - Helper function for all Indian languages
# ============================================================================

def extract_crop_display(crop_name: str) -> tuple[str, str, str]:
    """
    Extract both local language and English names from crop name.
    Format: LocalName (English Name / Details)
    Returns: (local_name, english_name, formatted_display)
    
    Supports all Indian languages: Hindi, Telugu, Tamil, Kannada, Marathi, etc.
    """
    if not crop_name:
        return "Unknown", "Unknown", "Unknown"
    
    local_name = crop_name
    english_name = ""
    
    # Extract English part from parentheses
    if "(" in crop_name and ")" in crop_name:
        parts = crop_name.split("(", 1)
        local_name = parts[0].strip() if parts[0].strip() else crop_name
        english_part = parts[1].split(")")[0]
        english_name = english_part.split("/")[0].strip()  # Get just the crop name
    
    # Try to display with both, fallback to English if encoding fails
    try:
        formatted = f"{local_name} ({english_name})" if english_name else crop_name
        # Test encoding
        formatted.encode('utf-8').decode('utf-8')
        return local_name, english_name, formatted
    except (UnicodeEncodeError, UnicodeDecodeError):
        # Fallback to English only if local language can't be encoded
        return local_name, english_name, english_name if english_name else "Crop"

# ============================================================================

SOILHEALTH_GET_STATE_QUERY = """
query GetState($getStateId: String, $code: String) {
\tgetState(id: $getStateId, code: $code)
}
"""

SOILHEALTH_GET_DISTRICTS_QUERY = """
query GetdistrictAndSubdistrictBystate(
\t$getdistrictAndSubdistrictBystateId: String,
\t$name: String,
\t$state: ID,
\t$subdistrict: Boolean,
\t$code: String,
\t$aspirationaldistrict: Boolean
) {
\tgetdistrictAndSubdistrictBystate(
\t\tid: $getdistrictAndSubdistrictBystateId,
\t\tname: $name,
\t\tstate: $state,
\t\tsubdistrict: $subdistrict,
\t\tcode: $code,
\t\taspirationaldistrict: $aspirationaldistrict
\t)
}
"""

SOILHEALTH_GET_CROP_REGISTRIES_QUERY = """
query GetCropRegistries($state: String) {
\tgetCropRegistries(state: $state) {
\t\tGFRavailable
\t\tid
\t\tcombinedName
\t}
}
"""

SOILHEALTH_GET_TEST_CENTERS_QUERY = """
query GetTestCenters($state: String, $district: String) {
\tgetTestCenters(state: $state, district: $district) {
\t\tstate
\t}
}
"""

SOILHEALTH_GET_RECOMMENDATIONS_QUERY = """
query GetRecommendations($state: ID!, $results: JSON!, $district: ID, $crops: [ID!], $naturalFarming: Boolean) {
\tgetRecommendations(
\t\tstate: $state
\t\tresults: $results
\t\tdistrict: $district
\t\tcrops: $crops
\t\tnaturalFarming: $naturalFarming
\t)
}
"""

mcp = FastMCP(
    "soilhealth-fastmcp",
    host=MCP_HOST,
    port=MCP_PORT,
    mount_path=MCP_MOUNT_PATH,
)

async def _retry_with_backoff(func, *args, max_retries: int = MAX_RETRIES, **kwargs):
    last_exception: Exception | None = None

    for attempt in range(max_retries):
        try:
            return await func(*args, **kwargs)
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code if exc.response is not None else None

            if status == 429 or (status is not None and 500 <= status < 600):
                last_exception = exc
                if attempt < max_retries - 1:
                    backoff = INITIAL_BACKOFF * (2**attempt)
                    logger.warning("HTTP %s retry %s/%s after %.2fs", status, attempt + 1, max_retries, backoff)
                    await asyncio.sleep(backoff)
                    continue
                break
            raise
        except (
            httpx.ConnectError,
            httpx.ReadTimeout,
            httpx.WriteTimeout,
            httpx.TimeoutException,
            httpx.RemoteProtocolError,
            httpx.RequestError,
        ) as exc:
            last_exception = exc
            if attempt < max_retries - 1:
                backoff = INITIAL_BACKOFF * (2**attempt)
                logger.warning("Network retry %s/%s after %.2fs: %s", attempt + 1, max_retries, backoff, exc)
                await asyncio.sleep(backoff)
                continue
            break
        except Exception:
            raise

    if last_exception:
        raise last_exception

    raise RuntimeError("retry_with_backoff exhausted without captured exception")

async def _soilhealth_graphql(query: str, variables: dict[str, Any]) -> dict[str, Any]:
    body = {
        "query": query,
        "variables": variables,
    }

    async def make_request():
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.post(SOILHEALTH_GRAPHQL_URL, json=body)
            response.raise_for_status()
            return response

    response = await _retry_with_backoff(make_request)
    data = response.json()

    if isinstance(data, dict) and data.get("errors"):
        return {
            "success": False,
            "error": "graphql_error",
            "errors": data.get("errors"),
            "data": data.get("data"),
        }

    return {
        "success": True,
        "data": data.get("data") if isinstance(data, dict) else data,
    }

@mcp.tool()
async def soilhealth_get_states(
    state_id: str | None = None,
    code: str | None = None,
) -> dict[str, Any]:
    """
    Fetch soil health states from the DAC Soil Health Portal.
    
    → WHEN TO CALL:
      1. At the START of any soil health query workflow
      2. When you need a list of available states to present to user
      3. Required prerequisite for: soilhealth_get_districts_by_state() and
         soilhealth_get_crop_registries()
    
    → PARAMETERS:
      - state_id (OPTIONAL str): MongoDB ObjectId of specific state to fetch
        • If None (default): Returns ALL states in the system (recommended for
          initial queries)
        • Use case: Rarely needed - useful only if you have pre-filtered state ID
      
      - code (OPTIONAL str): State abbreviation code (e.g., "KA" for Karnataka)
        • If None (default): Ignored
        • Use case: Filter results by state code if available
    
    → RETURN VALUE (on success):
      {
          "success": True,
          "source": "soilhealth4.dac.gov.in",
          "count": int,
          "states": [
              {
                  "_id": "MONGODB_ID",      ← Use this for other tool calls
                  "name": "State Name",
                  "code": "ST",
                  ...other fields...
              },
              ...
          ]
      }
    
    → RETURN VALUE (on error):
      {
          "success": False,
          "error": "request_failed" | "graphql_error",
          "detail": "error details",
          "errors": [...] (only if graphql_error)
      }
    
    → EXAMPLES:
      Example 1: Get all states to display to user
        result = await soilhealth_get_states()
        if result["success"]:
            print("Available States:")
            for state in result["states"]:
                print(f"  {state['name']} ({state.get('code', 'N/A')})")
        # Output:
        # Available States:
        #   ANDHRA PRADESH (28)
        #   ARUNACHAL PRADESH (12)
        #   ANDAMAN & NICOBAR (35)
        #   ...
      
      Example 2: Find and use a specific state by name
        result = await soilhealth_get_states()
        if result["success"]:
            selected_state = None
            for state in result["states"]:
                if "karnataka" in state["name"].lower():
                    selected_state = state
                    break
            if selected_state:
                print(f"Found: {selected_state['name']}")
                state_id = selected_state["_id"]
    
    → ERROR HANDLING:
      - HTTP 500 errors: Server retry 3 times with exponential backoff
      - Connection timeouts: Retries up to 3 times (30s timeout per attempt)
      - GraphQL errors: Check result["errors"] for query syntax issues
      - Empty response: Fallback queries test centers for available states
    
    → NEXT STEPS:
      After calling this successfully, use returned state._id value as parameter
      for: soilhealth_get_districts_by_state() and soilhealth_get_crop_registries()
    """
    variables = {
        "getStateId": state_id,
        "code": code,
    }

    try:
        result = await _soilhealth_graphql(SOILHEALTH_GET_STATE_QUERY, variables)
        if result.get("success") is False:
            return result

        states = result.get("data", {}).get("getState", [])
        if isinstance(states, list) and states:
            return {
                "success": True,
                "source": "soilhealth4.dac.gov.in",
                "count": len(states),
                "states": states,
            }

        # Fallback for public listing: derive unique states from test center records.
        if not state_id and not code:
            fallback = await _soilhealth_graphql(
                SOILHEALTH_GET_TEST_CENTERS_QUERY,
                {"state": None, "district": None},
            )
            if fallback.get("success") is False:
                return fallback

            rows = fallback.get("data", {}).get("getTestCenters", [])
            unique: dict[str, dict[str, Any]] = {}
            for row in rows if isinstance(rows, list) else []:
                state_obj = row.get("state") if isinstance(row, dict) else None
                if not isinstance(state_obj, dict):
                    continue
                state_key = str(state_obj.get("_id") or state_obj.get("id") or "").strip()
                if not state_key:
                    continue
                unique[state_key] = state_obj

            derived_states = sorted(unique.values(), key=lambda x: str(x.get("name", "")))
            return {
                "success": True,
                "source": "soilhealth4.dac.gov.in",
                "count": len(derived_states),
                "states": derived_states,
                "note": "Derived from getTestCenters fallback because getState returned empty for unfiltered query.",
            }

        return {
            "success": True,
            "source": "soilhealth4.dac.gov.in",
            "count": 0,
            "states": [],
        }
    except Exception as exc:
        return {
            "success": False,
            "error": "request_failed",
            "detail": str(exc),
        }

@mcp.tool()
async def soilhealth_get_districts_by_state(
    state: str,
    name: str | None = None,
    subdistrict: bool = False,
    code: str | None = None,
    aspirationaldistrict: bool = False,
) -> dict[str, Any]:
    """
    Fetch soil health districts and sub-districts for a given state.
    
    → WHEN TO CALL:
      1. AFTER calling soilhealth_get_states() (use state._id from that result)
      2. When you need to show user available districts in a specific state
      3. Optional: Not required for fertilizer recommendations (district is optional
         in the recommendation query), but improves recommendation accuracy
    
    → DEPENDENCY:
      REQUIRED: Must call soilhealth_get_states() first to get state._id value
    
    → PARAMETERS:
      - state (REQUIRED str): MongoDB ObjectId of state to query
        • Get this value from soilhealth_get_states() result ["states"][i]["_id"]
        • Example: "507f191e810c19729de860ea"
      
      - name (OPTIONAL str): Filter by district name 
        • If None (default): Returns all districts in state
        • Use case: Search for specific district name
      
      - subdistrict (OPTIONAL bool, default=False): Include subdivisions
        • If True: Also returns sub-district level data (more granular)
        • If False: Only state & district level
      
      - code (OPTIONAL str): District code to filter
        • If None (default): Ignored
        • Use case: Filter by official district code if available
      
      - aspirationaldistrict (OPTIONAL bool, default=False): Filter aspirational districts
        • If True: Only returns districts marked as aspirational
        • If False: All districts
    
    → RETURN VALUE (on success):
      {
          "success": True,
          "source": "soilhealth4.dac.gov.in",
          "count": int,
          "districts": [
              {
                  "_id": "MONGODB_ID",
                  "name": "District Name",
                  "state": {...state object...},
                  "code": "DIST_CODE",
                  ...other fields...
              },
              ...
          ]
      }
    
    → RETURN VALUE (on error):
      {
          "success": False,
          "error": "request_failed" | "graphql_error",
          "detail": "error details"
      }
    
    → EXAMPLES:
      Example 1: Get all districts in a state and display by name
        states_result = await soilhealth_get_states()
        state = next(s for s in states_result["states"] 
                     if "andhra" in s["name"].lower())
        
        districts = await soilhealth_get_districts_by_state(
            state=state["_id"]
        )
        if districts["success"]:
            print(f"Districts in {state['name']}:")
            for dist in districts["districts"]:
                print(f"  - {dist['name']}")
      
      Example 2: Search for a specific district by name
        result = await soilhealth_get_districts_by_state(
            state="63f9ce47519359b7438e76fa",
            name="Bangalore"  # Search by district name
        )
        if result["success"] and result["districts"]:
            district = result["districts"][0]
            print(f"Found: {district['name']} (Code: {district.get('code')})")
      
      Example 3: Find aspirational districts
        result = await soilhealth_get_districts_by_state(
            state="63f9ce47519359b7438e76fa",
            aspirationaldistrict=True
        )
        print(f"Aspirational districts: {len(result['districts'])}")
        for dist in result["districts"]:
            print(f"  {dist['name']}")
    
    → USAGE TIPS:
      - Use the 'name' parameter to search for specific districts
      - District names are human-readable (e.g., "Bangalore", "Delhi")
      - For standard workflows, you don't need district-level precision
      - If you have a district name, search by name instead of tracking IDs
    
    → NEXT STEPS:
      Optionally use returned district._id in soilhealth_get_fertilizer_recommendations()
      for more geographically-specific recommendations
    """
    variables = {
        "getdistrictAndSubdistrictBystateId": None,
        "name": name,
        "state": state,
        "subdistrict": subdistrict,
        "code": code,
        "aspirationaldistrict": aspirationaldistrict,
    }

    try:
        result = await _soilhealth_graphql(SOILHEALTH_GET_DISTRICTS_QUERY, variables)
        if result.get("success") is False:
            return result
        districts = result.get("data", {}).get("getdistrictAndSubdistrictBystate", [])
        return {
            "success": True,
            "source": "soilhealth4.dac.gov.in",
            "count": len(districts) if isinstance(districts, list) else 0,
            "districts": districts,
        }
    except Exception as exc:
        return {
            "success": False,
            "error": "request_failed",
            "detail": str(exc),
        }

@mcp.tool()
async def soilhealth_get_crop_registries(
    state: str,
    gfr_only: bool = True,
) -> dict[str, Any]:
    """
    Fetch crop registries available in a state for fertilizer recommendations.
    
    ⚠️ CRITICAL: This tool MUST be called before soilhealth_get_fertilizer_recommendations()
    
    → WHEN TO CALL:
      1. REQUIRED STEP before calling soilhealth_get_fertilizer_recommendations()
      2. After calling soilhealth_get_states()
      3. To display list of available crops to user
      4. To validate that a requested crop is available in the state
    
    → DEPENDENCY:
      REQUIRED: Must call soilhealth_get_states() first to get state code
    
    → PARAMETERS:
      - state (REQUIRED str): State MongoDB ID
        • Get from soilhealth_get_states() result ["states"][i]["_id"]
        • Example: "63f9ce47519359b7438e76fa" (24-character hex MongoDB ID)
        • ⚠️ NOTE: Despite the name, this accepts MongoDB ObjectId, NOT state code
        • Common error: Passing state code (e.g., "KA") will cause GraphQL error
      
      - gfr_only (OPTIONAL bool, default=True): Filter to GFR-available crops
        • If True: Returns only crops marked with GFRavailable="yes"
        • If False: Returns all crops in the state
        • Recommendation: Keep True for standard fertilizer recommendations
    
    → RETURN VALUE (on success):
      {
          "success": True,
          "source": "soilhealth4.dac.gov.in",
          "count": int,
          "crops": [
              {
                  "_id": "MONGODB_ID",      ← Use these IDs in recommendations!
                  "name": "Crop Name",
                  "combinedName": "Full Crop Name",
                  "GFRavailable": "yes",
                  ...other fields...
              },
              ...
          ]
      }
    
    → RETURN VALUE (on error):
      {
          "success": False,
          "error": "request_failed" | "graphql_error",
          "detail": "error details"
      }
    
    → EXAMPLES:
      Example 1: Get all GFR-eligible crops and display by name (with multilingual support)
        states_result = await soilhealth_get_states()
        state = next(s for s in states_result["states"] 
                     if "andaman" in s["name"].lower())
        
        crops_result = await soilhealth_get_crop_registries(
            state=state["_id"]  ← Use MongoDB ObjectId!
        )
        if crops_result["success"]:
            print(f"Available Crops in {state['name']}:")
            for crop in crops_result["crops"]:
                local_name, english_name, display = extract_crop_display(crop['combinedName'])
                # Shows both English and local language
                print(f"  - {english_name} (Local: {local_name if local_name != crop['combinedName'] else 'N/A'})")
            crop_ids = [c["id"] for c in crops_result["crops"]]
      
      Example 2: Search for a specific crop by name (supports all Indian languages)
        result = await soilhealth_get_crop_registries(state="63f9ce47519359b7438e76fa")
        if result["success"]:
            wheat = [c for c in result["crops"] 
                     if "wheat" in c["combinedName"].lower()]
            if wheat:
                local_name, english_name, display = extract_crop_display(wheat[0]['combinedName'])
                print(f"Found: {english_name}")
                if local_name:
                    print(f"Local name: {local_name}")
                print(f"Crop ID: {wheat[0]['id']}")
      
      Example 3: Get all crops (including non-GFR)
        result = await soilhealth_get_crop_registries(
            state="63f9ce47519359b7438e76fa",
            gfr_only=False
        )
        gfr_count = len([c for c in result["crops"] 
                         if c.get("GFRavailable", "").lower() == "yes"])
        print(f"Total: {len(result['crops'])}, GFR-available: {gfr_count}")
    
    ⚠️ IMPORTANT FIELD NAMES:
      - Crop name is in "combinedName" field (NOT "name")
      - Crop ID is in "id" field (NOT "_id")
      
      ✓ Correct: crop_names = [c["combinedName"] for c in crops]
      ✓ Correct: crop_ids = [c["id"] for c in crops]
      
      ❌ Wrong: [c["name"] for c in crops]  ← Field doesn't exist
      ❌ Wrong: [c["_id"] for c in crops]   ← Wrong field
      
      ❌ Ignoring the crop IDs returned
         → Next tool (recommendations) REQUIRES these crop IDs as input
      ✓ Extract: crop_ids = [c["_id"] for c in result["crops"]]
      ✓ Pass to soilhealth_get_fertilizer_recommendations(..., crops=crop_ids)
    
    → CRITICAL USAGE:
      The crop IDs returned here MUST be included in the next call to
      soilhealth_get_fertilizer_recommendations() for correct dosage calculations.
      
      DO NOT skip this step!
      DO NOT try to pass arbitrary crop names to recommendations tool!
    
    → NEXT STEPS:
      Extract crop._id values and pass the list to:
      soilhealth_get_fertilizer_recommendations(..., crops=[crop_ids])
    """
    variables = {
        "state": state,
    }

    try:
        result = await _soilhealth_graphql(SOILHEALTH_GET_CROP_REGISTRIES_QUERY, variables)
        if result.get("success") is False:
            return result

        crops = result.get("data", {}).get("getCropRegistries", [])
        if gfr_only and isinstance(crops, list):
            crops = [crop for crop in crops if str(crop.get("GFRavailable", "")).lower() == "yes"]

        return {
            "success": True,
            "source": "soilhealth4.dac.gov.in",
            "count": len(crops) if isinstance(crops, list) else 0,
            "crops": crops,
        }
    except Exception as exc:
        return {
            "success": False,
            "error": "request_failed",
            "detail": str(exc),
        }

@mcp.tool()
async def soilhealth_get_fertilizer_recommendations(
    state: str,
    n: float,
    p: float,
    k: float,
    oc: float,
    district: str | None = None,
    crops: list[str] | None = None,
    natural_farming: bool = False,
) -> dict[str, Any]:
    """
    Fetch crop-specific fertilizer dosage recommendations based on soil test results.
    
    This is the FINAL STEP in the soil health workflow. It returns specific fertilizer
    quantities (NPK dosages) for each crop based on soil test data.
    
    → WHEN TO CALL:
      1. FINAL STEP after obtaining soil test results (NPK, OC values)
      2. After calling soilhealth_get_states() to get state ID
      3. After calling soilhealth_get_crop_registries() to get crop IDs
      4. Optional: After soilhealth_get_districts_by_state() for better precision
    
    → REQUIRED DEPENDENCIES (MUST call these first):
      ✓ soilhealth_get_states() → get state._id
      ✓ soilhealth_get_crop_registries() → get crop._id list
      
    → OPTIONAL DEPENDENCIES:
      • soilhealth_get_districts_by_state() → for district._id (improves accuracy)
    
    → PARAMETERS - SOIL TEST RESULTS (ALL REQUIRED):
      - state (REQUIRED str): State MongoDB ID (from soilhealth_get_states())
        • Example: "507f191e810c19729de860ea"
      
      - n (REQUIRED float): Nitrogen level from soil test
        • Unit: mg/kg (milligrams per kilogram)
        • Typical range: 0-1000
        • Type: Can be int or float; automatically converted
      
      - p (REQUIRED float): Phosphorus level from soil test
        • Unit: mg/kg
        • Typical range: 0-500
      
      - k (REQUIRED float): Potassium level from soil test
        • Unit: mg/kg
        • Typical range: 0-2000
      
      - oc (REQUIRED float): Organic Carbon percentage
        • Unit: % (percentage)
        • Typical range: 0-5
        • Often abbreviated as "OC" in soil reports
    
    → PARAMETERS - CROP & LOCATION (RECOMMENDED):
      - crops (OPTIONAL list[str]): Crop MongoDB IDs to get recommendations for
        • Source: From soilhealth_get_crop_registries() ["crops"][i]["_id"]
        • If None: System returns recommendations for ALL crops in state
        • Recommendation: ALWAYS provide this from soilhealth_get_crop_registries()
        • Example: ["507f1...", "507f2...", "507f3..."]
      
      - district (OPTIONAL str): District MongoDB ID for geographic specificity
        • Source: From soilhealth_get_districts_by_state() ["districts"][i]["_id"]
        • If None: Uses state-level recommendations
        • Improves: Recommendations become more location-specific
        • Example: "507f191e810c19729de860ea"
      
      - natural_farming (OPTIONAL bool, default=False): Use organic/natural farming
        • If True: Returns recommendations for organic farming practices
        • If False: Conventional fertilizer recommendations
        • Use case: For organic farming certification systems
    
    → RETURN VALUE (on success):
      {
          "success": True,
          "source": "soilhealth4.dac.gov.in",
          "count": int,            ← Number of crop recommendations
          "recommendations": [
              {
                  "crop": "Crop Name",
                  "cropId": "MONGODB_ID",
                  "recommendedDosage": {
                      "nitrogen": "quantity_kg_ha",
                      "phosphorus": "quantity_kg_ha",
                      "potassium": "quantity_kg_ha",
                      "organicMatter": "quantity_tons_ha"
                  },
                  "alternativeFertilizers": [...],
                  ...other details...
              },
              ...
          ]
      }
    
    → RETURN VALUE (on error):
      {
          "success": False,
          "error": "request_failed" | "graphql_error",
          "detail": "error details"
      }
    
    → COMPLETE WORKFLOW EXAMPLE (Human-Readable):
      
      # STEP 1: Get states and let user select
      states = await soilhealth_get_states()
      print("Available States:")
      for state in states["states"]:
          print(f"  {state['name']}")
      # User inputs or selects: "ANDAMAN & NICOBAR"
      selected_state = next(s for s in states["states"] 
                           if s["name"] == "ANDAMAN & NICOBAR")
      
      # STEP 2: Get crops available for that state
      crops_result = await soilhealth_get_crop_registries(
          state=selected_state["_id"]
      )
      print(f"\nCrops available in {selected_state['name']}:")
      for crop in crops_result["crops"][:10]:  # Show first 10
          local_name, english_name, display = extract_crop_display(crop['combinedName'])
          # Supports all languages: Telugu, Hindi, Tamil, Kannada, Marathi, etc.
          print(f"  - {english_name} (Local: {local_name[:20]}...)")
      crop_ids = [c["id"] for c in crops_result["crops"]]
      
      # STEP 3: Get fertilizer recommendations for soil test
      recommendations = await soilhealth_get_fertilizer_recommendations(
          state=selected_state["_id"],
          n=150.5,
          p=25.0,
          k=180.0,
          oc=2.5,
          crops=crop_ids
      )
      
      # STEP 4: Display results by crop NAME
      print(f"\nFertilizer Recommendations for soil N={150.5}, P={25.0}, K={180.0}:")
      for rec in recommendations["recommendations"]:
          print(f"\n{rec['crop']}:")  # Crop name, not ID!
          dosages = rec.get('recommendedDosage', rec.get('fertilizersdata', []))
          if isinstance(dosages, dict):
              print(f"  N: {dosages.get('nitrogen', 'N/A')} kg/ha")
              print(f"  P: {dosages.get('phosphorus', 'N/A')} kg/ha")
              print(f"  K: {dosages.get('potassium', 'N/A')} kg/ha")
          elif isinstance(dosages, list):
              for fert in dosages:
                  if isinstance(fert, dict):
                      print(f"  {fert.get('name', 'N/A')}: {fert.get('values', 'N/A')} {fert.get('unit', '')}")
    
    → MINIMAL EXAMPLE:
      result = await soilhealth_get_fertilizer_recommendations(
          state="63f9ce47519359b7438e76fa",
          n=150, p=25, k=180, oc=2.5
      )
      for rec in result["recommendations"]:
          print(f"{rec['crop']}: {rec.get('recommendedDosage', {})}")
    
    → DISPLAY HUMAN-READABLE NAMES:
      # DON'T show IDs to users:
      ❌ print(f"State ID: {state_id}, Crop IDs: {crop_ids}")
      
      # DO show names:
      ✓ print(f"State: {state_name}, Crops: {', '.join(crop_names)}")
      ✓ print(f"\nRecommendations for {state_name}:")
      ✓ for rec in recommendations:
            print(f"  {rec['crop']}: ...")  # Use crop name field
    
    ⚠️ CRITICAL REQUIREMENTS:
      ✓ ALL soil test values (n, p, k, oc) must be provided
      ✓ State ID must be valid ObjectId from soilhealth_get_states()
      ✓ Crop IDs (if provided) must be from soilhealth_get_crop_registries()
      ✓ District ID (if provided) must be from soilhealth_get_districts_by_state()
      
      ❌ Missing any soil value → GraphQL error
      ❌ Invalid state/crop/district ID → GraphQL error or empty results
      ❌ Forgetting to call soilhealth_get_crop_registries() first → May get
         incorrect recommendations for the state
    
    → ERROR HANDLING:
      - If "success": False and "error": "graphql_error"
        → Check that soil values are numeric (not strings)
        → Check that IDs are valid MongoDB ObjectIds
        → Check the "errors" field for specific GraphQL errors
      
      - If recommendations list is empty
        → Verify that crop IDs are correct
        → Try without crops parameter (get all state-level recommendations)
        → Check that state ID is valid
    
    → DATA INTERPRETATION:
      - All dosages in recommendations are in kg/hectare (kg/ha)
      - To convert to smaller plots: multiply by (plot_area_hectares)
      - Compare returned dosages with farmer's current practice
      - Recommendations are state/district optimized based on soil type
    
    → NEXT STEPS:
      After receiving recommendations:
      1. Format results for farmer-friendly display
      2. Calculate fertilizer quantities for farmer's plot size
      3. Recommend specific fertilizer products matching the NPK ratios
      4. Create action plan with application timings
    """
    variables = {
        "state": state,
        "district": district,
        "crops": crops,
        "naturalFarming": natural_farming,
        "results": {
            "n": n,
            "p": p,
            "k": k,
            "OC": oc,
        },
    }

    try:
        result = await _soilhealth_graphql(SOILHEALTH_GET_RECOMMENDATIONS_QUERY, variables)
        if result.get("success") is False:
            return result
        recommendations = result.get("data", {}).get("getRecommendations", [])
        
        # ===================================================================
        # DATA STRUCTURE ENHANCEMENT: Names only (no IDs)
        # ===================================================================
        # The API returns multiple fertilizer combinations that should be
        # presented as alternatives. All ID fields are removed - only
        # human-readable names are returned for frontend display.
        
        enhanced_recommendations = []
        for rec in recommendations if isinstance(recommendations, list) else []:
            if not isinstance(rec, dict):
                continue  # Skip non-dict entries
            
            # Extract the three fertilizer datasets
            primary_fertilizers = rec.get("fertilizersdata", [])
            alt_fertilizers = rec.get("fertilizersdatacombTwo", [])
            organic_ferts = rec.get("organicFertilizer", {})
            
            # Filter fertilizers to remove IDs - keep only name/values/unit
            def clean_fertilizer_list(ferts):
                """Extract only name, values, unit from fertilizer data"""
                cleaned = []
                for fert in ferts if isinstance(ferts, list) else []:
                    if isinstance(fert, dict):
                        cleaned.append({
                            "name": fert.get("name", ""),
                            "values": fert.get("values", ""),
                            "unit": fert.get("unit", "")
                        })
                return cleaned
            
            # Clean organic fertilizer details - remove _id fields
            def clean_organic_details(organic):
                """Remove ID fields from organic fertilizer details"""
                if not isinstance(organic, dict):
                    return {}
                cleaned = {}
                id_fields = {"_id", "id"}
                for key, val in organic.items():
                    if key not in id_fields:
                        cleaned[key] = val
                return cleaned
            
            # Build recommendation structure - NAMES ONLY
            enhanced_rec = {
                "crop": rec.get("crop", ""),
                "recommendations": {
                    "primary": {
                        "label": "Primary Fertilizer Combination",
                        "fertilizers": clean_fertilizer_list(primary_fertilizers)
                    },
                    "alternative": {
                        "label": "Alternative Fertilizer Combination",
                        "fertilizers": clean_fertilizer_list(alt_fertilizers)
                    },
                    "organic": {
                        "label": "Organic Farming Recommendations",
                        "details": clean_organic_details(organic_ferts)
                    }
                }
            }
            
            enhanced_recommendations.append(enhanced_rec)
        
        return {
            "success": True,
            "source": "soilhealth4.dac.gov.in",
            "count": len(enhanced_recommendations) if isinstance(enhanced_recommendations, list) else 0,
            "recommendations": enhanced_recommendations,
        }
    except Exception as exc:
        return {
            "success": False,
            "error": "request_failed",
            "detail": str(exc),
        }

if __name__ == "__main__":
    mcp.run(transport=MCP_TRANSPORT)
