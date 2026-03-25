from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

import httpx
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

load_dotenv()

# Configure logging similar to admin reference implementation.
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SOILHEALTH_GRAPHQL_URL = os.getenv("SOILHEALTH_GRAPHQL_URL", "https://soilhealth4.dac.gov.in").rstrip("/")
TIMEOUT_SECONDS = float(os.getenv("SOILHEALTH_TIMEOUT_SECONDS", "30"))
MCP_TRANSPORT = os.getenv("MCP_TRANSPORT", "streamable-http").strip().lower()
MCP_HOST = os.getenv("MCP_HOST", "0.0.0.0").strip()
MCP_PORT = int(os.getenv("SOILHEALTH_MCP_PORT", "9005"))
MCP_MOUNT_PATH = os.getenv("MCP_MOUNT_PATH", "/").strip() or "/"
MAX_RETRIES = int(os.getenv("SOILHEALTH_MAX_RETRIES", "3"))
INITIAL_BACKOFF = float(os.getenv("SOILHEALTH_INITIAL_BACKOFF", "0.5"))

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
    """Fetch Soil Health states from live portal GraphQL backend."""
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
    """Fetch Soil Health districts for a given state ID."""
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
    """Fetch crop registries used by Soil Health fertilizer recommendation screen."""
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
    """Fetch crop-specific fertilizer dosage recommendations from Soil Health portal."""
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
        return {
            "success": True,
            "source": "soilhealth4.dac.gov.in",
            "count": len(recommendations) if isinstance(recommendations, list) else 0,
            "recommendations": recommendations,
        }
    except Exception as exc:
        return {
            "success": False,
            "error": "request_failed",
            "detail": str(exc),
        }

if __name__ == "__main__":
    mcp.run(transport=MCP_TRANSPORT)
