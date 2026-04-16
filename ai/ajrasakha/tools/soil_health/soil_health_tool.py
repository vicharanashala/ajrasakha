import os
import requests
import logging
from typing import Any, Dict
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)

GRAPHQL_URL = "https://soilhealth4.dac.gov.in/"

HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Origin": "https://soilhealth4.dac.gov.in",
    "Referer": "https://soilhealth4.dac.gov.in/"
}

mcp = FastMCP(
    "ajrasakha-soilhealth-mcp",
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=False
    )
)

def _execute_graphql(operation_name: str, query: str, variables: Dict[str, Any]) -> Dict[str, Any]:
    """Helper to send POST requests to the GraphQL endpoint."""
    payload = {
        "operationName": operation_name,
        "query": query,
        "variables": variables
    }
    try:
        response = requests.post(GRAPHQL_URL, json=payload, headers=HEADERS, timeout=15)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as exc:
        err_msg = str(exc)
        # Agar 400/500 aata hai, toh server ka asal message nikalne ki koshish karo
        if hasattr(exc, 'response') and exc.response is not None:
            err_msg += f" | Details: {exc.response.text}"
        log.error(f"GraphQL API Error ({operation_name}): {err_msg}")
        return {"error": err_msg, "success": False}



@mcp.tool()
def get_states() -> Dict[str, Any]:
    """
    Returns the list of all Indian states along with their unique MongoDB '_id's.
    Use the '_id' from this list for other tools requiring a state_id.
    """
    # EXACT string from your trace
    query = "query GetState($getStateId: String, $code: String) {\n  getState(id: $getStateId, code: $code)\n}"
    
    data = _execute_graphql("GetState", query, {})
    if "error" in data:
        return data
    
    return {"success": True, "states": data.get("data", {}).get("getState", [])}



@mcp.tool()
def get_districts(state_id: str) -> Dict[str, Any]:
    """
    Returns the list of districts for a given state.
    
    Args:
        state_id: The 24-character hex string ID of the state (e.g., '63f20ca84fadd776ffd9d608').
    """
    # EXACT string from your trace
    query = "query GetdistrictAndSubdistrictBystate($getdistrictAndSubdistrictBystateId: String, $name: String, $state: ID, $subdistrict: Boolean, $code: String, $aspirationaldistrict: Boolean) {\n  getdistrictAndSubdistrictBystate(\n    id: $getdistrictAndSubdistrictBystateId\n    name: $name\n    state: $state\n    subdistrict: $subdistrict\n    code: $code\n    aspirationaldistrict: $aspirationaldistrict\n  )\n}"
    
    variables = {"state": state_id}
    data = _execute_graphql("GetdistrictAndSubdistrictBystate", query, variables)
    
    if "error" in data:
        return data
        
    districts = data.get("data", {}).get("getdistrictAndSubdistrictBystate", [])
    return {"success": True, "districts": districts}



@mcp.tool()
def get_crops(state_id: str) -> Dict[str, Any]:
    """
    Returns the list of crops for which fertilizer dosage can be computed in a state.
    
    Args:
        state_id: The 24-character hex string ID of the state.
    """
    # EXACT string from your trace
    query = "query GetCropRegistries($state: String) {\n  getCropRegistries(state: $state) {\n    GFRavailable\n    id\n    combinedName\n    __typename\n  }\n}"
    
    variables = {"state": state_id}
    data = _execute_graphql("GetCropRegistries", query, variables)
    
    if "error" in data:
        return data
        
    crops = data.get("data", {}).get("getCropRegistries", [])
    return {"success": True, "crops": crops}


@mcp.tool()
def get_fertilizer_dosage(
    state_id: str,
    district_id: str,
    crop_id: str,
    n: float,
    p: float,
    k: float,
    oc: float
) -> Dict[str, Any]:
    """
    Fetches the fertilizer dosage recommendation from the Soil Health GraphQL API.

    Args:
        state_id:    Numeric/Hex state ID (from get_states).
        district_id: Numeric/Hex district ID (from get_districts).
        crop_id:     Numeric/Hex crop ID (from get_crops).
        n:           Available Nitrogen (kg/ha).
        p:           Available Phosphorus (kg/ha).
        k:           Available Potassium (kg/ha).
        oc:          Organic Carbon (%).
    """
    # EXACT string from your trace
    query = "query GetRecommendations($state: ID!, $results: JSON!, $district: ID, $crops: [ID!], $naturalFarming: Boolean) {\n  getRecommendations(\n    state: $state\n    results: $results\n    district: $district\n    crops: $crops\n    naturalFarming: $naturalFarming\n  )\n}"
    
    variables = {
        "state": state_id,
        "district": district_id,
        "crops": [crop_id],
        "naturalFarming": False,
        "results": {
            "n": str(n),
            "p": str(p),
            "k": str(k),
            "OC": str(oc)
        }
    }

    data = _execute_graphql("GetRecommendations", query, variables)
    
    if "error" in data:
        return data
        
    recommendations = data.get("data", {}).get("getRecommendations", [])
    return {
        "success": True,
        "soil_test_inputs": variables["results"],
        "recommendations": recommendations
    }

if __name__ == "__main__":
    mcp.run(transport="stdio")