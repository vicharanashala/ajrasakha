"""
mandi_mcp_server.py

FastMCP server exposing tools to query APMC mandi price data from MongoDB.

Schema (per document):
    state, district, market, date, commodity, commodity_group,
    variety, grade, unit, arrival_qty,
    min_price, max_price, modal_price, wholesale_rate, retail_price,
    as_on_price, msp_price, trend,
    one_day_ago_price, two_day_ago_price,
    one_day_ago_arrival, two_day_ago_arrival,
    source_url, source_name, method, source_state, ingested_at

Tools:
    1. get_mandi_prices   — query by any combination of the schema fields
    2. get_unique_markets — list unique markets (optionally filtered by state)
"""

from __future__ import annotations

import asyncio
import difflib
import json
import logging
import os
import re

from dateutil import parser as date_parser
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

load_dotenv()

MONGO_URI       = os.getenv("MONGO_URI")
DB_NAME         = os.getenv("MANDI_DB_NAME", "mandi_db")
COLLECTION_NAME = os.getenv("MANDI_COLLECTION", "market_prices")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mandi-mcp")

MCP_TRANSPORT  = os.getenv("MANDI_MCP_TRANSPORT", os.getenv("MCP_TRANSPORT", "streamable-http")).strip().lower()
MCP_HOST       = os.getenv("MANDI_MCP_HOST", os.getenv("MCP_HOST", "0.0.0.0")).strip()
MCP_PORT       = int(os.getenv("MANDI_MCP_PORT", "9010"))
MCP_MOUNT_PATH = os.getenv("MANDI_MCP_MOUNT_PATH", os.getenv("MCP_MOUNT_PATH", "/")).strip() or "/"

mcp = FastMCP(
    "mandi-price-server",
    host=MCP_HOST,
    port=MCP_PORT,
    mount_path=MCP_MOUNT_PATH,
    instructions=(
        "Query APMC mandi commodity prices from MongoDB."
        "Supports any combination of filters: commodity, market, state, "
        "district, date, commodity_group, variety, grade, and source_name.\n\n"
        "CRITICAL RULES FOR MANDI NAME HANDLING:\n"
        "1. If get_mandi_prices returns no results AND a market/mandi name was used, "
        "you MUST call find_similar_mandis with the original mandi name.\n"
        "2. Present the numbered list of suggestions to the USER and ask them to "
        "choose. Do NOT silently pick one yourself.\n"
        "3. Do NOT retry get_mandi_prices with a different market name, a state-only "
        "query, or any other workaround — wait for the user to pick from the list.\n"
        "4. Only call get_mandi_prices again once the user has confirmed an exact "
        "mandi name from the suggestions."
    ),
)

# ---------------------------------------------------------------------------
# MongoDB helpers
# ---------------------------------------------------------------------------

def _get_collection():
    if not MONGO_URI:
        raise ValueError("MONGO_URI is not set in environment.")
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=6_000)
    client.admin.command("ping")
    return client[DB_NAME][COLLECTION_NAME], client


# ---------------------------------------------------------------------------
# Date helper
# ---------------------------------------------------------------------------

def _parse_query_date(raw: str) -> str | None:
    """
    Try to normalise an arbitrary date string to YYYY-MM-DD for exact
    matching against the stored `date` field.
    Returns None if parsing fails (caller falls back to regex).
    """
    if not raw:
        return None
    try:
        dt = date_parser.parse(raw.strip(), dayfirst=True)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Core query helpers
# ---------------------------------------------------------------------------

def _build_regex(value: str) -> dict:
    """Case-insensitive safe regex filter for a single string value, escaping special characters to prevent ReDoS."""
    escaped_value = re.escape(value.strip())
    return {"$regex": escaped_value, "$options": "i"}


def _query_prices(
    commodity: str | None,
    market: str | None,
    state: str | None,
    district: str | None,
    date: str | None,
    commodity_group: str | None,
    variety: str | None,
    grade: str | None,
    source_name: str | None,
    limit: int,
) -> list[dict]:
    col, client = _get_collection()
    try:
        and_clauses: list[dict] = []

        # --- commodity (required by the tool, but kept optional here for reuse) ---
        if commodity:
            and_clauses.append({"commodity": _build_regex(commodity)})

        # --- optional filters ---
        if market:
            and_clauses.append({"market": _build_regex(market)})

        if state:
            and_clauses.append({"state": _build_regex(state)})

        if district:
            and_clauses.append({"district": _build_regex(district)})

        if commodity_group:
            and_clauses.append({"commodity_group": _build_regex(commodity_group)})

        if variety:
            and_clauses.append({"variety": _build_regex(variety)})

        if grade:
            and_clauses.append({"grade": _build_regex(grade)})

        if source_name:
            and_clauses.append({"source_name": _build_regex(source_name)})

        # --- date: prefer exact YYYY-MM-DD, fall back to regex ---
        if date:
            parsed = _parse_query_date(date)
            if parsed:
                and_clauses.append({"date": parsed})
            else:
                and_clauses.append({"date": _build_regex(date)})

        query = {"$and": and_clauses} if and_clauses else {}

        # Exclude internal Mongo / ingest metadata from the response
        projection = {"_id": 0, "ingested_at": 0}

        return list(col.find(query, projection).limit(limit))
    finally:
        client.close()


def _get_unique_markets_from_db(state: str | None = None) -> list[str]:
    col, client = _get_collection()
    try:
        pipeline: list[dict] = []

        if state:
            pipeline.append(
                {"$match": {"state": _build_regex(state)}}
            )

        pipeline += [
            {"$group": {"_id": None, "markets": {"$addToSet": "$market"}}},
            {"$project": {"_id": 0, "markets": 1}},
        ]

        result = list(col.aggregate(pipeline))
        if not result:
            return []
        return sorted([m for m in result[0].get("markets", []) if m])
    finally:
        client.close()


def _find_similar_markets(query: str, state: str | None = None, n: int = 8, cutoff: float = 0.35) -> list[str]:
    """
    Return up to *n* market names from the database that are closest to *query*.
    Uses difflib.get_close_matches for fuzzy matching.
    Falls back to a simple substring search when difflib finds nothing.
    """
    all_markets = _get_unique_markets_from_db(state)
    if not all_markets:
        return []

    query_lower = query.strip().lower()
    markets_lower = [m.lower() for m in all_markets]

    # difflib similarity
    close = difflib.get_close_matches(query_lower, markets_lower, n=n, cutoff=cutoff)

    # Preserve original casing by mapping back
    lower_to_original = {m.lower(): m for m in all_markets}
    results = [lower_to_original[c] for c in close if c in lower_to_original]

    # Supplement with substring matches if we have fewer than n results
    if len(results) < n:
        for orig, low in zip(all_markets, markets_lower):
            if query_lower in low and orig not in results:
                results.append(orig)
            if len(results) >= n:
                break

    return results


# ---------------------------------------------------------------------------
# FastMCP Tools
# ---------------------------------------------------------------------------

@mcp.tool()
async def get_mandi_prices(
    commodity: str = "",
    market: str = "",
    state: str = "",
    district: str = "",
    date: str = "",
    commodity_group: str = "",
    variety: str = "",
    grade: str = "",
    source_name: str = "",
    limit: int = 50,
) -> str:
    """
    Fetch mandi (APMC) commodity prices from the database.

    All parameters are optional — supply any combination to narrow the search.
    At least one filter should be provided to get meaningful results.

    IMPORTANT: If this tool returns no results and a market name was provided,
    you MUST call find_similar_mandis next and present the suggestions to the user.
    Do NOT retry with a different query on your own.

    Args:
        commodity:       Commodity name, e.g. "onion", "tomato", "wheat".
        market:          Market / mandi name, e.g. "azadpur apmc", "yeotmal".
        state:           State name, e.g. "nct of delhi", "karnataka".
        district:        District name, e.g. "north west delhi".
        date:            Date filter. Accepts most formats:
                         "2026-05-23", "23/05/2026", "23 May 2026", etc.
        commodity_group: Commodity group, e.g. "vegetables", "cereals".
        variety:         Variety of the commodity, e.g. "local", "hybrid".
        grade:           Grade, e.g. "FAQ", "A".
        source_name:     Data source, e.g. "agmarknet", "nafed".
        limit:           Maximum records to return (default 50).
    """
    # Normalise empties to None
    def _v(s: str) -> str | None:
        return s.strip() or None

    commodity_val    = _v(commodity)
    market_val       = _v(market)
    state_val        = _v(state)
    district_val     = _v(district)
    date_val         = _v(date)
    comm_group_val   = _v(commodity_group)
    variety_val      = _v(variety)
    grade_val        = _v(grade)
    source_name_val  = _v(source_name)

    # Guard: require at least one filter
    if not any([
        commodity_val, market_val, state_val, district_val,
        date_val, comm_group_val, variety_val, grade_val, source_name_val,
    ]):
        return (
            "Error: Please provide at least one search parameter "
            "(commodity, market, state, district, date, commodity_group, "
            "variety, grade, or source_name)."
        )

    try:
        records = await asyncio.to_thread(
            _query_prices,
            commodity_val,
            market_val,
            state_val,
            district_val,
            date_val,
            comm_group_val,
            variety_val,
            grade_val,
            source_name_val,
            limit,
        )
    except ConnectionFailure as e:
        return f"MongoDB connection error: {e}"
    except Exception as e:
        return f"Query error: {e}"

    if not records:
        # Build a human-readable "no results" message listing all active filters
        active = []
        if commodity_val:    active.append(f"commodity='{commodity_val}'")
        if market_val:       active.append(f"market='{market_val}'")
        if state_val:        active.append(f"state='{state_val}'")
        if district_val:     active.append(f"district='{district_val}'")
        if date_val:         active.append(f"date='{date_val}'")
        if comm_group_val:   active.append(f"commodity_group='{comm_group_val}'")
        if variety_val:      active.append(f"variety='{variety_val}'")
        if grade_val:        active.append(f"grade='{grade_val}'")
        if source_name_val:  active.append(f"source_name='{source_name_val}'")
        base_msg = "No records found for " + ", ".join(active) + "."

        # If the user specified a mandi name, suggest similar ones
        if market_val:
            try:
                similar = await asyncio.to_thread(
                    _find_similar_markets, market_val, state_val
                )
            except Exception:
                similar = []

            if similar:
                numbered = "\n".join(f"  {i+1}. {m}" for i, m in enumerate(similar))
                return (
                    f"{base_msg}\n\n"
                    f"The mandi '{market_val}' was not found in the database. "
                    f"Did you mean one of these?\n{numbered}\n\n"
                    f"Please retry with the exact mandi name from the list above."
                )
            else:
                return (
                    f"{base_msg}\n\n"
                    f"The mandi '{market_val}' was not found and no similar markets "
                    f"could be located in the database. "
                    f"Use the get_unique_markets tool to browse all available mandis."
                )

        return base_msg

    # Build header
    parts = []
    if commodity_val:   parts.append(f"'{commodity_val}'")
    if market_val:      parts.append(f"in '{market_val}'")
    if state_val:       parts.append(f"({state_val})")
    if district_val:    parts.append(f"district '{district_val}'")
    if date_val:        parts.append(f"on {date_val}")
    if comm_group_val:  parts.append(f"group '{comm_group_val}'")
    if variety_val:     parts.append(f"variety '{variety_val}'")
    if grade_val:       parts.append(f"grade '{grade_val}'")
    if source_name_val: parts.append(f"source '{source_name_val}'")

    header = f"Found {len(records)} record(s)" + (" for " if parts else "") + " ".join(parts)

    output = json.dumps(records, ensure_ascii=False, indent=2, default=str)
    return f"{header}:\n\n{output}"


@mcp.tool()
async def find_similar_mandis(
    mandi_name: str,
    state: str = "",
) -> str:
    """
    Find mandi/market names in the database that are similar to a given name.

    Call this tool when get_mandi_prices returns no results for a market name.
    Present the numbered suggestions to the USER and ask them to choose.
    Do NOT call get_mandi_prices again until the user has picked a name.

    Args:
        mandi_name: The mandi name the user typed (exact string, even if misspelled).
        state:      Optional state to narrow the search, e.g. "maharashtra".
    """
    state_val = state.strip() or None
    query = mandi_name.strip()

    if not query:
        return "Error: mandi_name cannot be empty."

    try:
        similar = await asyncio.to_thread(_find_similar_markets, query, state_val)
    except ConnectionFailure as e:
        return f"MongoDB connection error: {e}"
    except Exception as e:
        return f"Error finding similar mandis: {e}"

    if not similar:
        return (
            f"No similar mandis found for '{query}'"
            + (f" in state '{state_val}'" if state_val else "")
            + ". Use get_unique_markets to browse all available mandis."
        )

    numbered = "\n".join(f"  {i+1}. {m}" for i, m in enumerate(similar))
    header = f"Mandi '{query}' not found"
    if state_val:
        header += f" in state '{state_val}'"
    return (
        f"{header}. Here are the closest matches:\n{numbered}\n\n"
        f"Please ask the user to choose one and retry get_mandi_prices with the exact name."
    )


@mcp.tool()
async def get_unique_markets(
    state: str = "",
) -> str:
    """
    List all unique market names stored in the mandi database.

    Args:
        state: Optionally filter by state name, e.g. "karnataka". Leave blank
               to return markets from all states.
    """
    state_val = state.strip() or None

    try:
        markets = await asyncio.to_thread(_get_unique_markets_from_db, state_val)
    except ConnectionFailure as e:
        return f"MongoDB connection error: {e}"
    except Exception as e:
        return f"Error fetching markets: {e}"

    if not markets:
        return "No markets found" + (f" for state '{state_val}'." if state_val else ".")

    body   = "\n".join(f"  {m}" for m in markets)
    header = f"Unique markets ({len(markets)} total)"
    if state_val:
        header += f" in state '{state_val}'"

    return f"{header}:\n{body}"


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run(transport=MCP_TRANSPORT)