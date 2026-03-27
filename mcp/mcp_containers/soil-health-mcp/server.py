from __future__ import annotations

import asyncio
import difflib
import io
import logging
import os
import sys
from typing import Any

import httpx
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
from data import SOILHEALTH_DATA

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


def _normalize_text(value: str | None) -> str:
    """Normalize text for case/space-insensitive matching."""
    if not value:
        return ""
    return " ".join(str(value).strip().casefold().split())

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
        district
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
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS, follow_redirects=True) as client:
            response = await client.post(SOILHEALTH_GRAPHQL_URL, json=body, headers=headers)
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
async def soilhealth_get_fertilizer_recommendations(
    state: str,
    n: float | None = None,
    p: float | None = None,
    k: float | None = None,
    oc: float | None = None,
    district: str | None = None,
    crops: list[str] | None = None,
    natural_farming: bool = False,
) -> dict[str, Any]:
    """
    Fetch crop-specific fertilizer dosage recommendations based on soil test results.
    
    This tool now supports both Names and MongoDB IDs for state, district, and crops.
    If names are provided with minor spelling mistakes, it will attempt to find the closest match.
    
    → PARAMETERS:
      - state (str): State Name (e.g., "ASSAM") or MongoDB ID
      - n, p, k (float): Nutrient levels in mg/kg (REQUIRED)
      - oc (float): Organic Carbon percentage (REQUIRED)
      - district (str, optional): District Name or ID
      - crops (list[str], optional): List of Crop Names or IDs
      - natural_farming (bool): Use organic recommendations
    """
    # 1. Validate mandatory soil values
    missing = []
    if n is None: missing.append("Nitrogen (n)")
    if p is None: missing.append("Phosphorus (p)")
    if k is None: missing.append("Potassium (k)")
    if oc is None: missing.append("Organic Carbon (oc)")
    
    if missing:
        return {
            "success": False,
            "error": "missing_required_parameters",
            "detail": f"INCOMPLETE INFORMATION PROVIDED: This tool requires several mandatory soil test values to calculate recommendations. The following parameters are missing: {', '.join(missing)}. Please provide these values to get accurate fertilizer recommendations."
        }

    def find_best_match(target, choices_dict):
        if not target: return None
        # Exact match
        if target in choices_dict: return choices_dict[target]
        # ID match (case check)
        if target in [v for v in choices_dict.values()]: return target
        
        # Case-insensitive match
        target_upper = target.strip().upper()
        for name, cid in choices_dict.items():
            if name.upper() == target_upper:
                return cid
        
        # 1. Flexible substring match (e.g., "Potato" in "आलू (Potato) (All Variety)")
        # If multiple matches are found, we pick the one with the shortest name 
        # (closest length match) to prioritize "Agra" over "Agra Block".
        target_lower = target.strip().lower()
        substring_matches = []
        for name, cid in choices_dict.items():
            if target_lower in name.lower():
                substring_matches.append((name, cid))
        
        if substring_matches:
            # Sort by name length and return the CID of the shortest one
            substring_matches.sort(key=lambda x: len(x[0]))
            return substring_matches[0][1]
        
        # 2. Fuzzy match (lower cutoff for short names)
        import difflib
        cutoff = 0.4 if len(target) < 10 else 0.6
        matches = difflib.get_close_matches(target, choices_dict.keys(), n=1, cutoff=cutoff)
        if matches:
            return choices_dict[matches[0]]
        return target # Fallback to original if no match found (might be an ID)

    def is_valid_mongodb_id(oid):
        if not isinstance(oid, str): return False
        if len(oid) != 24: return False
        try:
            int(oid, 16)
            return True
        except ValueError:
            return False

    # 2. Look up state ID
    state_id = find_best_match(state, SOILHEALTH_DATA["states"])
    
    # 3. Look up district ID if provided
    district_id = district
    if district and state_id in SOILHEALTH_DATA["districts"]:
        district_id = find_best_match(district, SOILHEALTH_DATA["districts"][state_id])
    
    # Validate district_id - if it's not a valid MongoDB ID, unset it to avoid 400 error
    if district_id and not is_valid_mongodb_id(district_id):
        print(f"WARN: District '{district}' could not be resolved to a valid ID. Falling back to state-level.")
        district_id = None
    
    # 4. Look up crop IDs if provided
    crop_ids = crops
    if crops and state_id in SOILHEALTH_DATA["crops"]:
        crop_ids = []
        for c in crops:
            cid = find_best_match(c, SOILHEALTH_DATA["crops"][state_id])
            crop_ids.append(cid)

    variables = {
        "state": state_id,
        "district": district_id,
        "crops": crop_ids,
        "naturalFarming": natural_farming,
        "results": {
            "n": n,
            "p": p,
            "k": k,
            "OC": oc,
        },
    }

    try:
        # 5. Fetch recommendations
        res = await _soilhealth_graphql(SOILHEALTH_GET_RECOMMENDATIONS_QUERY, variables)
        
        # 6. Fallback if District is Invalid (common portal issue for some states like Bihar/UP)
        if not res.get("success") and res.get("error") == "graphql_error":
            errors = res.get("errors", [])
            is_invalid_district = any("Invalid District" in str(e.get("message", "")) for e in errors)
            
            if is_invalid_district and variables.get("district"):
                # Try again without district
                print(f"WARN: Invalid District '{district}' for state '{state}'. Falling back to state-level recommendations.")
                variables["district"] = None
                res = await _soilhealth_graphql(SOILHEALTH_GET_RECOMMENDATIONS_QUERY, variables)
                if res.get("success"):
                    res["warning"] = f"District '{district}' is not recognized for this specific portal query. Showing general recommendations for state '{state}' instead."
        
        if res.get("success") is False:
            return res
        
        recommendations = res.get("data", {}).get("getRecommendations", [])
        
        enhanced_recommendations = []
        for rec in recommendations if isinstance(recommendations, list) else []:
            if not isinstance(rec, dict):
                continue
            
            primary_fertilizers = rec.get("fertilizersdata", [])
            alt_fertilizers = rec.get("fertilizersdatacombTwo", [])
            organic_ferts = rec.get("organicFertilizer", {})
            
            def clean_fertilizer_list(ferts):
                cleaned = []
                for fert in ferts if isinstance(ferts, list) else []:
                    if isinstance(fert, dict):
                        cleaned.append({
                            "name": fert.get("name", ""),
                            "values": fert.get("values", ""),
                            "unit": fert.get("unit", "")
                        })
                return cleaned
            
            def clean_organic_details(organic):
                if not isinstance(organic, dict): return {}
                cleaned = {}
                id_fields = {"_id", "id"}
                for key, val in organic.items():
                    if key not in id_fields:
                        cleaned[key] = val
                return cleaned
            
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
            "count": len(enhanced_recommendations),
            "recommendations": enhanced_recommendations,
        }
    except Exception as exc:
        return {"success": False, "error": "request_failed", "detail": str(exc)}

if __name__ == "__main__":
    mcp.run(transport=MCP_TRANSPORT)
