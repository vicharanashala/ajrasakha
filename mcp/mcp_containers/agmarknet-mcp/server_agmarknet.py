from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import date as date_type
from typing import Any

import httpx
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_URL = os.getenv("AGMARKNET_BASE_URL", "https://api.agmarknet.gov.in/v1").rstrip("/")
TIMEOUT_SECONDS = float(os.getenv("AGMARKNET_TIMEOUT_SECONDS", "30"))
MAX_RETRIES = int(os.getenv("AGMARKNET_MAX_RETRIES", "3"))
INITIAL_BACKOFF = float(os.getenv("AGMARKNET_INITIAL_BACKOFF", "0.5"))

MCP_TRANSPORT = os.getenv("AGMARKNET_MCP_TRANSPORT", os.getenv("MCP_TRANSPORT", "streamable-http")).strip().lower()
MCP_HOST = os.getenv("AGMARKNET_MCP_HOST", os.getenv("MCP_HOST", "0.0.0.0")).strip()
MCP_PORT = int(os.getenv("AGMARKNET_MCP_PORT", "9004"))
MCP_MOUNT_PATH = os.getenv("AGMARKNET_MCP_MOUNT_PATH", os.getenv("MCP_MOUNT_PATH", "/")).strip() or "/"

mcp = FastMCP(
    "agmarknet-mcp",
    host=MCP_HOST,
    port=MCP_PORT,
    mount_path=MCP_MOUNT_PATH,
)


def _encode_list(values: list[int] | None) -> str | None:
    if values is None:
        return None
    return json.dumps(values)


def _normalize_query_value(value: Any) -> Any:
    if isinstance(value, list):
        return json.dumps(value)
    return value


def _clean_params(params: dict[str, Any] | None = None) -> dict[str, Any]:
    if not params:
        return {}
    return {k: _normalize_query_value(v) for k, v in params.items() if v is not None}


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


async def _request(path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{BASE_URL}/{path.lstrip('/')}"
    cleaned_params = _clean_params(params)

    async def make_request():
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.get(url, params=cleaned_params)
            response.raise_for_status()
            return response

    response = await _retry_with_backoff(make_request)
    return response.json()


@mcp.tool()
async def get_dashboard_data(
    dashboard: str,
    date: str | None = None,
    group: list[int] | None = None,
    commodity: list[int] | None = None,
    variety: int | None = None,
    state: int | None = None,
    district: list[int] | None = None,
    market: list[int] | None = None,
    grades: list[int] | None = None,
    limit: int = 10,
    page: int | None = None,
    format: str = "json",
) -> dict[str, Any]:
    """Fetch Agmarknet dashboard data with filters and pagination."""
    if limit < 1:
        raise ValueError("limit must be >= 1")

    if date is None:
        date = date_type.today().isoformat()

    params = {
        "dashboard": dashboard,
        "date": date,
        "group": _encode_list(group),
        "commodity": _encode_list(commodity),
        "variety": variety,
        "state": state,
        "district": _encode_list(district),
        "market": _encode_list(market),
        "grades": _encode_list(grades),
        "limit": limit,
        "page": page,
        "format": format,
    }

    try:
        return await _request("dashboard-data/", params=params)
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code if exc.response is not None else None
        message = ""
        if exc.response is not None:
            try:
                message = exc.response.text[:300]
            except Exception:
                message = str(exc)
        logger.warning("Agmarknet get_dashboard_data failed: %s", status)
        return {
            "success": False,
            "error": "api_error",
            "status_code": status,
            "message": message,
        }
    except Exception as exc:
        logger.error("Agmarknet get_dashboard_data request failed: %s", exc)
        return {
            "success": False,
            "error": "request_failed",
            "detail": str(exc),
        }


@mcp.tool()
async def get_by_absolute_url(url: str) -> dict[str, Any]:
    """Follow Agmarknet pagination links such as pagination.next_page."""

    async def make_request():
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response

    try:
        response = await _retry_with_backoff(make_request)
        return response.json()
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code if exc.response is not None else None
        message = exc.response.text[:300] if exc.response is not None else str(exc)
        return {
            "success": False,
            "error": "api_error",
            "status_code": status,
            "message": message,
        }
    except Exception as exc:
        return {
            "success": False,
            "error": "request_failed",
            "detail": str(exc),
        }


@mcp.tool()
async def agmarknet_get(path: str, query: dict[str, Any] | None = None) -> dict[str, Any]:
    """Generic Agmarknet GET request for dynamic endpoints."""
    params = _clean_params(query)

    try:
        return await _request(path=path, params=params)
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code if exc.response is not None else None
        message = exc.response.text[:300] if exc.response is not None else str(exc)
        return {
            "success": False,
            "error": "api_error",
            "status_code": status,
            "message": message,
        }
    except Exception as exc:
        return {
            "success": False,
            "error": "request_failed",
            "detail": str(exc),
        }


@mcp.tool()
async def get_dashboard_filters(
    dashboard_name: str = "marketwise_price_arrival",
    state_name: str | None = None,
    district_name: str | None = None,
    market_name: str | None = None,
) -> dict[str, Any]:
    """Resolve human-readable names (State, District, Market) to numeric IDs used by Agmarknet API.

    Call this FIRST to get the required integer IDs before calling get_dashboard_data.
    Leave filter args as None to return all available options.

    Example:
        get_dashboard_filters(state_name="Kerala", district_name="Alappuzha", market_name="Aroor APMC")
    """
    try:
        data = await _request(
            "dashboard-filters/",
            params={"dashboard_name": dashboard_name},
        )
        if not data.get("status"):
            return {"success": False, "error": "api_returned_failure", "raw": data}

        raw = data.get("data", {})
        state_data = raw.get("state_data", [])
        market_data = raw.get("market_data", [])

        result: dict[str, Any] = {"success": True, "dashboard": dashboard_name}

        matched_state: dict[str, Any] | None = None
        if state_name:
            for s in state_data:
                if s.get("state_name", "").strip().lower() == state_name.strip().lower():
                    matched_state = s
                    break
            if matched_state:
                result["state"] = {
                    "name": matched_state.get("state_name"),
                    "id": matched_state.get("state_id"),
                }
            else:
                result["state"] = {"error": f"State '{state_name}' not found"}
                result["available_states"] = [
                    {"name": s.get("state_name"), "id": s.get("state_id")} for s in state_data
                ]
                return result
        else:
            result["available_states"] = [
                {"name": s.get("state_name"), "id": s.get("state_id")} for s in state_data
            ]

        state_id = matched_state.get("state_id") if matched_state else None
        district_markets = [m for m in market_data if state_id is None or m.get("state_id") == state_id]
        districts_seen: dict[int, str] = {}
        for m in district_markets:
            did = m.get("district_id")
            dname = m.get("district_name", "")
            if did and did not in districts_seen:
                districts_seen[did] = dname

        matched_district_id: int | None = None
        if district_name:
            for did, dname in districts_seen.items():
                if dname.strip().lower() == district_name.strip().lower():
                    matched_district_id = did
                    break
            if matched_district_id:
                result["district"] = {"name": district_name, "id": matched_district_id}
            else:
                result["district"] = {"error": f"District '{district_name}' not found"}
                result["available_districts"] = [
                    {"name": n, "id": i} for i, n in sorted(districts_seen.items())
                ]
        else:
            result["available_districts"] = [
                {"name": n, "id": i} for i, n in sorted(districts_seen.items())
            ]

        candidate_markets = [
            m for m in market_data
            if (state_id is None or m.get("state_id") == state_id)
            and (matched_district_id is None or m.get("district_id") == matched_district_id)
        ]
        if market_name:
            matched_market = next(
                (m for m in candidate_markets if m.get("mkt_name", "").strip().lower() == market_name.strip().lower()),
                None,
            )
            if matched_market:
                result["market"] = {
                    "name": matched_market.get("mkt_name"),
                    "id": matched_market.get("id"),
                }
            else:
                result["market"] = {"error": f"Market '{market_name}' not found"}
                result["available_markets"] = [
                    {"name": m.get("mkt_name"), "id": m.get("id")} for m in candidate_markets[:50]
                ]
        else:
            result["available_markets"] = [
                {"name": m.get("mkt_name"), "id": m.get("id")} for m in candidate_markets[:50]
            ]

        return result

    except Exception as exc:
        return {"success": False, "error": "request_failed", "detail": str(exc)}



@mcp.tool()
async def marketwise_price_arrival(
    group: list[int],
    commodity: list[int],
    district: list[int],
    market: list[int],
    variety: int,
    state: int,
    grades: list[int] | None = None,
    date: str | None = None,
    limit: int = 10,
    page: int | None = None,
) -> dict[str, Any]:
    """Convenience wrapper for the marketwise_price_arrival dashboard."""
    return await get_dashboard_data(
        dashboard="marketwise_price_arrival",
        date=date,
        group=group,
        commodity=commodity,
        variety=variety,
        state=state,
        district=district,
        market=market,
        grades=grades,
        limit=limit,
        page=page,
        format="json",
    )


@mcp.tool()
async def marketwise_price_arrival_dynamic(
    date: str | None = None,
    commodity_contains: str | None = None,
    commodity_group_contains: str | None = None,
    trend: str | None = None,
    limit_per_page: int = 50,
    max_pages: int = 10,
) -> dict[str, Any]:
    """Fetch marketwise data dynamically without requiring hardcoded ID filters."""
    if date is None:
        date = date_type.today().isoformat()

    commodity_q = commodity_contains.lower().strip() if commodity_contains else None
    group_q = commodity_group_contains.lower().strip() if commodity_group_contains else None
    trend_q = trend.lower().strip() if trend else None

    records: list[dict[str, Any]] = []
    pages_fetched = 0
    total_count: int | None = None

    for page_no in range(1, max_pages + 1):
        response = await get_dashboard_data(
            dashboard="marketwise_price_arrival",
            date=date,
            limit=limit_per_page,
            page=page_no,
            format="json",
        )

        if response.get("success") is False:
            return response

        pages_fetched += 1
        pagination = response.get("pagination", {})
        if total_count is None:
            try:
                total_count = int(pagination.get("total_count"))
            except (TypeError, ValueError):
                total_count = None

        page_records = response.get("data", {}).get("records", []) or []
        if not page_records:
            break

        for record in page_records:
            cmdt_name = str(record.get("cmdt_name", "")).lower()
            cmdt_group = str(record.get("cmdt_grp_name", "")).lower()
            record_trend = str(record.get("trend", "")).lower()

            if commodity_q and commodity_q not in cmdt_name:
                continue
            if group_q and group_q not in cmdt_group:
                continue
            if trend_q and trend_q != record_trend:
                continue

            records.append(record)

        if not pagination.get("next_page"):
            break

    unique_groups = sorted({str(r.get("cmdt_grp_name", "")).strip() for r in records if r.get("cmdt_grp_name")})
    unique_commodities = sorted({str(r.get("cmdt_name", "")).strip() for r in records if r.get("cmdt_name")})

    return {
        "status": "success",
        "query": {
            "date": date,
            "commodity_contains": commodity_contains,
            "commodity_group_contains": commodity_group_contains,
            "trend": trend,
            "limit_per_page": limit_per_page,
            "max_pages": max_pages,
        },
        "meta": {
            "pages_fetched": pages_fetched,
            "reported_total_count": total_count,
            "matched_count": len(records),
            "unique_groups": unique_groups,
            "unique_commodities": unique_commodities,
        },
        "records": records,
    }


if __name__ == "__main__":
    mcp.run(transport=MCP_TRANSPORT)
