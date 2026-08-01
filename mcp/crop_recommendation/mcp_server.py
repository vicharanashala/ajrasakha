"""
mcp_server.py — FastMCP server exposing the `recommend_crop` tool.

Runs as a standalone service (default port 9020) that the Ajrasakha AI agent
layer calls via MCP HTTP transport.

Usage:
    cd mcp/crop_recommendation
    python mcp_server.py                    # default port 9020
    CROP_REC_MCP_PORT=9021 python mcp_server.py  # custom port

The model must be trained first:
    python train_model.py
"""

import os
import logging
from typing import Optional

from fastmcp import FastMCP

from inference import CropRecommender, CropRecommenderError

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
MCP_PORT = int(os.getenv("CROP_REC_MCP_PORT", "9020"))
MCP_HOST = os.getenv("CROP_REC_MCP_HOST", "0.0.0.0")

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# ---------------------------------------------------------------------------
# MCP Server + Model Initialization
# ---------------------------------------------------------------------------
mcp = FastMCP("CropRecommendation")

# Load model once at startup (singleton — thread-safe for reads)
try:
    recommender = CropRecommender()
    logger.info("CropRecommender model loaded successfully.")
except FileNotFoundError as e:
    logger.error(
        "Failed to load crop recommendation model: %s\n"
        "Run 'python train_model.py' first to generate model artifacts.",
        e,
    )
    raise SystemExit(1) from e


# ---------------------------------------------------------------------------
# MCP Tool: recommend_crop
# ---------------------------------------------------------------------------
@mcp.tool()
async def recommend_crop(
    nitrogen: float,
    phosphorus: float,
    potassium: float,
    temperature: float,
    humidity: float,
    ph: float,
    rainfall: float,
) -> dict:
    """
    Recommend the best crop to cultivate based on soil nutrients and climate conditions.

    Use this tool when a farmer asks which crop to grow, or provides soil test
    parameters (N, P, K, pH) and/or weather conditions (temperature, humidity, rainfall).

    Args:
        nitrogen:    Nitrogen content in soil (kg/ha). Typical range: 0–140.
        phosphorus:  Phosphorus content in soil (kg/ha). Typical range: 5–145.
        potassium:   Potassium content in soil (kg/ha). Typical range: 5–205.
        temperature: Average temperature in degrees Celsius. Typical range: 8–45.
        humidity:    Relative humidity as percentage. Typical range: 14–100.
        ph:          Soil pH value. Typical range: 3.5–10.
        rainfall:    Annual or seasonal rainfall in mm. Typical range: 20–300.

    Returns:
        Dictionary with:
            - recommended_crop (str):  The best crop for the given conditions.
            - confidence (float):      Model confidence (0–1).
            - top_3_crops (list):      Top 3 crop recommendations with probabilities.
            - input_summary (dict):    Echo of the input parameters.
            - all_crops (list):        All 22 crops the model can recommend.
    """
    try:
        result = recommender.predict(
            nitrogen=nitrogen,
            phosphorus=phosphorus,
            potassium=potassium,
            temperature=temperature,
            humidity=humidity,
            ph=ph,
            rainfall=rainfall,
        )
        logger.info(
            "recommend_crop: N=%.1f P=%.1f K=%.1f temp=%.1f hum=%.1f pH=%.2f rain=%.1f → %s (%.2f%%)",
            nitrogen, phosphorus, potassium, temperature, humidity, ph, rainfall,
            result["recommended_crop"], result["confidence"] * 100,
        )
        return result

    except CropRecommenderError as e:
        # Validation error — return structured error so the agent can inform the farmer
        logger.warning("recommend_crop validation error: %s", e)
        return {
            "error": True,
            "error_type": "validation",
            "message": str(e),
            "hint": (
                "Please provide valid soil and climate parameters. "
                "Required: nitrogen (N), phosphorus (P), potassium (K), "
                "temperature (°C), humidity (%), pH, and rainfall (mm)."
            ),
        }
    except Exception as e:
        logger.error("recommend_crop unexpected error: %s", e, exc_info=True)
        return {
            "error": True,
            "error_type": "internal",
            "message": f"Crop recommendation service encountered an error: {type(e).__name__}",
        }


@mcp.tool()
async def list_supported_crops() -> dict:
    """
    List all crops that the recommendation model can suggest.

    Use this when a farmer asks what crops the system supports, or for validation
    before making a recommendation.

    Returns:
        Dictionary with:
            - crops (list): Sorted list of all 22 supported crop names.
            - count (int):  Number of supported crops.
    """
    crops = recommender.supported_crops
    return {"crops": crops, "count": len(crops)}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print(f"Starting Crop Recommendation MCP server on {MCP_HOST}:{MCP_PORT}")
    print(f"  Supported crops: {recommender.supported_crops}")
    print(f"  Tools: recommend_crop, list_supported_crops")
    mcp.run(transport="streamable-http", host=MCP_HOST, port=MCP_PORT)
