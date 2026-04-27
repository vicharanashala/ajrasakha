"""
Mandi Prices MCP Tool Server
=============================
Exposes a single unified ``get_mandi_price`` tool via FastMCP that routes
queries for AP, Assam, TN (Agmarknet) and Sikkim (Indian Spices Board)
to the appropriate backend in ``mandi_prices.py``.

Run standalone:
    python mandi_prices_tool.py
"""

from __future__ import annotations

import json
import logging
from datetime import date as date_type
from typing import Any, Optional

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from ajrasakha.tools.market.mandi_prices import (
    AGMARKNET_STATE_IDS,
    get_agmarknet_data,
    get_indian_spices_data,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# MCP server setup
# ---------------------------------------------------------------------------

mcp = FastMCP(
    "ajrasakha-mandi-prices-mcp",
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=False
    ),
)

# States handled by the Indian Spices Board scraper (case-insensitive lookup)
SPICES_STATES = {"sikkim"}

# Combined alias map for user-friendly state name resolution
STATE_ALIASES: dict[str, str] = {
    "ap": "andhra pradesh",
    "a.p": "andhra pradesh",
    "a.p.": "andhra pradesh",
    "tn": "tamil nadu",
    "t.n": "tamil nadu",
    "t.n.": "tamil nadu",
}


def _resolve_state(state: str) -> str:
    """Normalise user-supplied state name."""
    normalised = state.strip().lower()
    return STATE_ALIASES.get(normalised, normalised)


def _format_agmarknet_output(result: dict[str, Any]) -> str:
    """Convert Agmarknet result dict into a clean, readable string."""
    if not result.get("success"):
        return f"❌ Error: {result.get('error', 'Unknown error')}"

    records = result.get("records", [])
    if not records:
        return (
            f"No mandi price records found for state_id={result.get('state_id')} "
            f"on {result.get('date')}. Try an earlier date."
        )

    lines = [
        f"📊 Mandi Prices — State ID: {result['state_id']} | "
        f"Date: {result['date']} | Records: {result['total_records']}",
        "=" * 70,
    ]

    for r in records:
        lines.append(
            f"  Market: {r.get('market_name', 'N/A')}\n"
            f"  Commodity: {r.get('commodity', 'N/A')} | "
            f"Variety: {r.get('variety', 'N/A')} | "
            f"Grade: {r.get('grade', 'N/A')}\n"
            f"  Min Price: ₹{r.get('min_price', 'N/A')} | "
            f"Max Price: ₹{r.get('max_price', 'N/A')} | "
            f"Modal Price: ₹{r.get('modal_price', 'N/A')}\n"
            f"  Arrival: {r.get('arrival', 'N/A')} | "
            f"Date: {r.get('reported_date', 'N/A')}"
        )
        lines.append("-" * 70)

    return "\n".join(lines)


def _format_spices_output(result: dict[str, Any]) -> str:
    """Convert Indian Spices Board result dict into a clean, readable string."""
    if not result.get("success"):
        return f"❌ Error: {result.get('error', 'Unknown error')}"

    records = result.get("records", [])
    if not records:
        return (
            f"No spice price data found for {result.get('state', 'Unknown')}. "
            f"Try different date filters."
        )

    lines = [
        f"🌶️ Spice Market Prices — State: {result['state']} | "
        f"Filter: {result.get('spice_filter', 'all')} | "
        f"Records: {result['total_records']}",
        "=" * 70,
    ]

    columns = result.get("columns", [])
    if columns:
        lines.append("  | ".join(columns))
        lines.append("-" * 70)

    for r in records:
        if columns:
            row_vals = [str(r.get(col, "")) for col in columns]
            lines.append("  | ".join(row_vals))
        else:
            lines.append(json.dumps(r, ensure_ascii=False))

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# MCP tool
# ---------------------------------------------------------------------------

@mcp.tool()
async def get_mandi_price(
    state: str,
    commodity: Optional[str] = None,
    district: Optional[str] = None,
    date: Optional[str] = None,
) -> str:
    """
    Fetch mandi (market) prices for agricultural commodities.

    Supports 4 states:
      - Andhra Pradesh (Agmarknet API, state_id=2)
      - Assam (Agmarknet API, state_id=4)
      - Tamil Nadu (Agmarknet API, state_id=31)
      - Sikkim (Indian Spices Board, HTML scraping)

    Parameters
    ----------
    state : str
        State name (e.g. "Tamil Nadu", "Sikkim", "AP", "Assam").
    commodity : str | None
        Commodity or spice name to filter by. For Agmarknet states this
        is currently unused (returns all commodities). For Sikkim this
        filters by spice name.
    district : str | None
        District filter. Currently unused (returns all districts).
    date : str | None
        Date in YYYY-MM-DD format. Defaults to today.

    Returns
    -------
    str
        Human-readable formatted price data including Market Name,
        Commodity, Variety, Grade, Min/Max/Modal prices.
    """
    resolved = _resolve_state(state)

    if date is None:
        date = date_type.today().isoformat()

    # ---- Route: Sikkim → Indian Spices Board ----
    if resolved in SPICES_STATES:
        result = await get_indian_spices_data(
            state_name=resolved.upper(),
            spice_name=commodity or "",
        )
        return _format_spices_output(result)

    # ---- Route: AP / Assam / TN → Agmarknet ----
    if resolved in AGMARKNET_STATE_IDS:
        state_id = AGMARKNET_STATE_IDS[resolved]
        result = await get_agmarknet_data(
            state_id=state_id,
            date=date,
        )
        return _format_agmarknet_output(result)

    # ---- Unsupported state ----
    supported = list(AGMARKNET_STATE_IDS.keys()) + list(SPICES_STATES)
    return (
        f"❌ State '{state}' is not yet supported by the Mandi Prices tool.\n"
        f"Supported states: {', '.join(s.title() for s in supported)}\n"
        f"For other states, use the Agmarknet or eNAM tools directly."
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run(
        transport="streamable-http",
        host="0.0.0.0",
        port=9007,
    )
