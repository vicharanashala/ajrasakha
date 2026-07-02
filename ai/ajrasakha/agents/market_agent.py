import json
import logging
import re
from typing import Any, Optional, Dict, List, Tuple
from datetime import datetime, timedelta
import asyncio

import httpx
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from pydantic import BaseModel

from ajrasakha.tools.market.market_agmarknet_tool import (
    get_states as agm_get_states,
    get_districts as agm_get_districts,
    get_commodities as agm_get_commodities,
    get_price_arrivals as agm_get_price_arrivals
)
from ajrasakha.tools.market.market_enam_tool import (
    get_state_list_from_enam,
    get_apmc_list_from_enam,
    get_commodity_list_from_enam,
    get_trade_data_from_enam
)
from ajrasakha.agents.prompts import MARKET_GEMMA_RESOLUTION_PROMPT, MARKET_QUERY_ANALYSIS_PROMPT

logger = logging.getLogger(__name__)

import os
from dotenv import load_dotenv
load_dotenv()
MARKET_GEMMA_BASE_URL = os.getenv("WEATHER_GEMMA_BASE_URL", "http://100.100.108.44:8014/v1")

# --- IN-MEMORY CACHES ---
_AGM_CACHE = {
    "states": None,
    "commodities": None,
    "districts": {} # keyed by state_id
}
_ENAM_CACHE = {
    "states": None,
    "apmcs": {} # keyed by state_id
}

class MarketInput(BaseModel):
    query: str        # e.g., "What is the current price of rice in Rangareddy?"
    state: str        # e.g., "Telangana"
    district: str     # e.g., "Rangareddy"
    crop: str         # e.g., "Rice"
    date: str | None = None  # Optional: "YYYY-MM-DD", defaults to today if omitted

def _normalize(s: str) -> str:
    """Normalize a string for robust matching."""
    if not s:
        return ""
    # Lowercase, remove non-alphanumeric, strip spaces
    return re.sub(r'[^a-z0-9]', '', str(s).lower())

def resolve_date_programmatically(date_str: str | None, day_str: str | None) -> str:
    today = datetime.now()
    if date_str:
        try:
            from dateutil.parser import parse
            parsed = parse(date_str)
            return parsed.strftime("%Y-%m-%d")
        except Exception:
            pass
            
    if day_str:
        day_str = day_str.lower().strip()
        if day_str == "today":
            return today.strftime("%Y-%m-%d")
        elif day_str == "yesterday":
            return (today - timedelta(days=1)).strftime("%Y-%m-%d")
        
        days_of_week = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        for d in days_of_week:
            if d in day_str:
                target_weekday = days_of_week.index(d)
                current_weekday = today.weekday()
                diff = current_weekday - target_weekday
                if diff < 0:
                    diff += 7
                return (today - timedelta(days=diff)).strftime("%Y-%m-%d")

    return today.strftime("%Y-%m-%d")

async def resolve_market_entities_via_gemma(failures: list[dict]) -> dict[str, str]:
    """
    Given a list of failed string matches, query Gemma once to resolve them.
    failures format: [{"field": "crop", "user_term": "Kapas", "options": ["Cotton", "Wheat", "Paddy"]}, ...]
    """
    if not failures:
        return {}

    prompt_parts = MARKET_GEMMA_RESOLUTION_PROMPT.copy()
    
    for fail in failures:
        opts = fail["options"]
        prompt_parts.append(f"Field: {fail['field']}")
        prompt_parts.append(f"User Term: {fail['user_term']}")
        prompt_parts.append(f"Options: {opts}")
        prompt_parts.append("---")

    prompt = "\\n".join(prompt_parts)

    url = f"{MARKET_GEMMA_BASE_URL.rstrip('/')}/chat/completions"
    payload = {
        "model": "google/gemma-4-E4B-it",
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.0,
        "max_tokens": 1500
    }
    headers = {"Content-Type": "application/json"}
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers, timeout=10.0)
            if response.status_code == 200:
                result = response.json()
                message = result["choices"][0]["message"]
                content = message.get("content", "") or ""
                reasoning = message.get("reasoning", "") or ""
                
                # Combine both because Gemma sometimes puts the JSON in the reasoning block
                full_text = content + "\\n" + reasoning
                
                # Try to extract JSON from the markdown block if it exists
                if "```json" in full_text:
                    content_to_parse = full_text.split("```json")[1].split("```")[0].strip()
                elif "```" in full_text:
                    content_to_parse = full_text.split("```")[1].split("```")[0].strip()
                else:
                    # Fallback: Extract everything between the first { and last }
                    start_idx = full_text.find('{')
                    end_idx = full_text.rfind('}')
                    if start_idx != -1 and end_idx != -1:
                        content_to_parse = full_text[start_idx:end_idx+1]
                    else:
                        content_to_parse = full_text
                
                logger.info(f"RAW GEMMA RESOLUTION OUTPUT:\\n{content_to_parse}")
                return json.loads(content_to_parse)
    except Exception as e:
        logger.warning("Gemma 4 market resolution failed: %s", e)
        
    return {}

async def analyze_query_with_gemma(query: str) -> dict:
    prompt_parts = MARKET_QUERY_ANALYSIS_PROMPT + [
        f"Query: {query}",
        "---"
    ]
    prompt = "\\n".join(prompt_parts)
    
    url = f"{MARKET_GEMMA_BASE_URL.rstrip('/')}/chat/completions"
    payload = {
        "model": "google/gemma-4-E4B-it",
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.0,
        "max_tokens": 1500
    }
    headers = {"Content-Type": "application/json"}
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers, timeout=10.0)
            if response.status_code == 200:
                result = response.json()
                message = result["choices"][0]["message"]
                content = message.get("content", "") or ""
                reasoning = message.get("reasoning", "") or ""
                
                full_text = content + "\\n" + reasoning
                
                json_blocks = re.findall(r'```(?:json)?(.*?)```', full_text, re.DOTALL)
                if json_blocks:
                    content_to_parse = json_blocks[0].strip()
                else:
                    # fallback to extracting content between { and }
                    match = re.search(r'\\{[^{}]*\\}', full_text)
                    if match:
                        content_to_parse = match.group(0).strip()
                    else:
                        content_to_parse = full_text
                        
                logger.info(f"RAW GEMMA QUERY ANALYSIS OUTPUT:\\n{content_to_parse}")
                data = json.loads(content_to_parse)
                return data
    except Exception as e:
        logger.warning(f"Query analysis failed: {e}")
    return {}

# --- DECOUPLED PIPELINE PHASE 1: Entity Resolution ---
async def resolve_agmarknet_entities(state: str, district: str, crop: str) -> Dict[str, Any]:
    norm_state = _normalize(state)
    norm_dist = _normalize(district)
    norm_crop = _normalize(crop)
    
    ag_ids = {"state_id": None, "dist_id": None, "cmdt_id": None}
    failures = []

    # 1. State
    if _AGM_CACHE["states"] is None:
        res = await agm_get_states()
        if res.get("success"):
            _AGM_CACHE["states"] = {s["name"]: s["id"] for s in res["data"]}
    
    state_options = _AGM_CACHE["states"] or {}
    for name, s_id in state_options.items():
        if _normalize(name) == norm_state:
            ag_ids["state_id"] = s_id
            break
            
    if not ag_ids["state_id"]:
        failures.append({"field": "state", "user_term": state, "options": list(state_options.keys())})

    # 2. Commodity
    if crop.lower() in ("all", "any"):
        ag_ids["cmdt_id"] = 100001
        cmdt_options = {}
    else:
        if _AGM_CACHE["commodities"] is None:
            res = await agm_get_commodities()
            if res.get("success"):
                _AGM_CACHE["commodities"] = {c["name"]: c["id"] for c in res["data"]}
        
        cmdt_options = _AGM_CACHE["commodities"] or {}
        for name, c_id in cmdt_options.items():
            if _normalize(name) == norm_crop:
                ag_ids["cmdt_id"] = c_id
                break
                
        if not ag_ids["cmdt_id"]:
            failures.append({"field": "crop", "user_term": crop, "options": list(cmdt_options.keys())})

    # Resolve State/Crop Failures
    if failures:
        resolutions = await resolve_market_entities_via_gemma(failures)
        if not ag_ids["state_id"] and resolutions.get("state") in state_options:
            ag_ids["state_id"] = state_options[resolutions["state"]]
        if not ag_ids["cmdt_id"] and resolutions.get("crop") in cmdt_options:
            ag_ids["cmdt_id"] = cmdt_options[resolutions["crop"]]

    if not ag_ids["state_id"]:
        return {"error": f"State '{state}' not found in Agmarknet"}
    if not ag_ids["cmdt_id"]:
        return {"error": f"Crop '{crop}' not found in Agmarknet"}

    # 3. District
    if district.lower() in ("all", "any"):
        ag_ids["dist_id"] = 100007
    else:
        s_id = ag_ids["state_id"]
        if s_id not in _AGM_CACHE["districts"]:
            res = await agm_get_districts(s_id)
            if res.get("success"):
                _AGM_CACHE["districts"][s_id] = {d["name"]: d["id"] for d in res["data"]}
        
        dist_options = _AGM_CACHE["districts"].get(s_id, {})
        for name, d_id in dist_options.items():
            if norm_dist in _normalize(name):
                ag_ids["dist_id"] = d_id
                break
                
        if not ag_ids["dist_id"] and dist_options:
            res = await resolve_market_entities_via_gemma([
                {"field": "district", "user_term": district, "options": list(dist_options.keys())}
            ])
            if res.get("district") in dist_options:
                ag_ids["dist_id"] = dist_options[res["district"]]

    if not ag_ids["dist_id"]:
        return {"error": f"District '{district}' not found in Agmarknet"}

    return {"success": True, "ids": ag_ids}


async def resolve_enam_entities(state: str, district: str, crop: str, from_date: str, to_date: str) -> Dict[str, Any]:
    norm_state = _normalize(state)
    norm_dist = _normalize(district)
    norm_crop = _normalize(crop)
    
    en_ids = {"state_name": None, "state_id": None, "apmcs": [], "crops": []}
    failures = []

    # 1. State
    if _ENAM_CACHE["states"] is None:
        res = await get_state_list_from_enam()
        if res.get("success"):
            state_data = res["data"].get("data", []) if isinstance(res.get("data"), dict) else []
            _ENAM_CACHE["states"] = {s["state_name"]: s["state_id"] for s in state_data if "state_name" in s}
            
    state_options = _ENAM_CACHE["states"] or {}
    for name, s_id in state_options.items():
        if _normalize(name) == norm_state:
            en_ids["state_name"] = name
            en_ids["state_id"] = s_id
            break

    if not en_ids["state_id"]:
        failures.append({"field": "state", "user_term": state, "options": list(state_options.keys())})
        
    if failures:
        res = await resolve_market_entities_via_gemma(failures)
        if res.get("state") in state_options:
            en_ids["state_name"] = res["state"]
            en_ids["state_id"] = state_options[res["state"]]

    if not en_ids["state_id"]:
        return {"error": f"State '{state}' not found in eNAM"}

    # 2. Mandi (APMC)
    s_id = en_ids["state_id"]
    if s_id not in _ENAM_CACHE["apmcs"]:
        res = await get_apmc_list_from_enam(s_id)
        if res.get("success"):
            apmc_data = res["data"].get("data", []) if isinstance(res.get("data"), dict) else []
            _ENAM_CACHE["apmcs"][s_id] = [a["apmc_name"] for a in apmc_data if "apmc_name" in a]
            
    apmc_options = _ENAM_CACHE["apmcs"].get(s_id, [])
    if district.lower() in ("all", "any"):
        en_ids["apmcs"] = apmc_options
    else:
        matched_apmc_name = None
        for name in apmc_options:
            if norm_dist in _normalize(name):
                matched_apmc_name = name
                break
                
        if not matched_apmc_name and apmc_options:
            res = await resolve_market_entities_via_gemma([
                {"field": "mandi", "user_term": district, "options": apmc_options}
            ])
            if res.get("mandi") in apmc_options:
                matched_apmc_name = res["mandi"]
                
        if matched_apmc_name:
            en_ids["apmcs"] = [matched_apmc_name]
        else:
            return {"error": f"No APMC found for district '{district}'"}

    # 3. We do not pre-fetch commodity list for eNAM here because it depends on apmc_name AND date.
    # We will resolve commodity names directly inside fetch_enam_prices_by_id.
    en_ids["target_crop_raw"] = crop
    return {"success": True, "ids": en_ids}


# --- DECOUPLED PIPELINE PHASE 2: Price Fetching ---
async def fetch_agmarknet_prices_by_id(ag_ids: dict, target_date: str) -> dict:
    if "error" in ag_ids:
        return {"success": False, "source": "Agmarknet", "error": ag_ids["error"]}
        
    s_id = ag_ids["ids"]["state_id"]
    d_id = ag_ids["ids"]["dist_id"]
    c_id = ag_ids["ids"]["cmdt_id"]
    
    target_dt = datetime.strptime(target_date, "%Y-%m-%d")
    dates_to_fetch = [(target_dt - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(5)]
    
    async def fetch_for_date(d: str):
        data = await agm_get_price_arrivals(state=s_id, district=d_id, commodity=c_id, date=d)
        return data.get("data", {}).get("data", []) if isinstance(data.get("data"), dict) else data.get("data", [])

    # Limit concurrency to 5
    results = await asyncio.gather(*[fetch_for_date(d) for d in dates_to_fetch], return_exceptions=True)
    
    extracted_data = []
    for res in results:
        if isinstance(res, list):
            extracted_data.extend(res)
        elif isinstance(res, dict):
            if "records" in res:
                extracted_data.extend(res["records"])
            else:
                extracted_data.append(res)
    
    return {"success": True, "source": "Agmarknet", "data": extracted_data}


async def fetch_enam_prices_by_id(en_ids: dict, target_date: str) -> dict:
    if "error" in en_ids:
        return {"success": False, "source": "eNAM", "error": en_ids["error"]}
        
    target_dt = datetime.strptime(target_date, "%Y-%m-%d")
    to_date = target_dt.strftime("%Y-%m-%d")
    from_date = (target_dt - timedelta(days=4)).strftime("%Y-%m-%d")
    
    state_name = en_ids["ids"]["state_name"]
    target_apmcs = en_ids["ids"]["apmcs"]
    crop_raw = en_ids["ids"]["target_crop_raw"]
    norm_crop = _normalize(crop_raw)
    
    all_extracted_data = []
    semaphore = asyncio.Semaphore(15)
    
    async def fetch_for_apmc(apmc_name: str):
        target_crops = []
        if crop_raw.lower() in ("all", "any"):
            cmdt_res = await get_commodity_list_from_enam(state_name, apmc_name, from_date, to_date)
            if cmdt_res.get("success"):
                cmdt_data = cmdt_res["data"].get("data", []) if isinstance(cmdt_res.get("data"), dict) else []
                target_crops = [c["commodity_name"] for c in cmdt_data if "commodity_name" in c]
        else:
            # We must fetch the list of available commodities to find the exact match string
            cmdt_res = await get_commodity_list_from_enam(state_name, apmc_name, from_date, to_date)
            if cmdt_res.get("success"):
                cmdt_data = cmdt_res["data"].get("data", []) if isinstance(cmdt_res.get("data"), dict) else []
                cmdt_options = [c["commodity_name"] for c in cmdt_data if "commodity_name" in c]
                
                matched_cmdt_name = None
                for name in cmdt_options:
                    if _normalize(name) == norm_crop:
                        matched_cmdt_name = name
                        break
                        
                if not matched_cmdt_name and cmdt_options:
                    res = await resolve_market_entities_via_gemma([
                        {"field": "crop", "user_term": crop_raw, "options": cmdt_options}
                    ])
                    if res.get("crop") in cmdt_options:
                        matched_cmdt_name = res["crop"]
                        
                if matched_cmdt_name:
                    target_crops = [matched_cmdt_name]

        apmc_results = []
        for c_name in target_crops:
            async with semaphore:
                data = await get_trade_data_from_enam(state_name, apmc_name, c_name, from_date, to_date)
                extracted = data.get("data", {}).get("data", []) if isinstance(data.get("data"), dict) else []
                apmc_results.extend(extracted)
        return apmc_results

    results = await asyncio.gather(*[fetch_for_apmc(apmc) for apmc in target_apmcs], return_exceptions=True)
    for res in results:
        if isinstance(res, list):
            all_extracted_data.extend(res)

    return {"success": True, "source": "eNAM", "data": all_extracted_data}


@tool(args_schema=MarketInput)
async def market(query: str, state: str, district: str, crop: str, date: str | None, config: RunnableConfig) -> str:
    """
    Query the market price agent.
    Use when the user asks for mandi prices, APMC rates, or commodity arrivals.
    Always pass the user's state, district, crop of interest, and a focused query.
    """
    try:
        from datetime import date as date_type
        target_date = date
        if crop.lower() in ("all", "any") or date is None:
            analysis = await analyze_query_with_gemma(query)
            extracted_crop = analysis.get("crop")
            extracted_date = analysis.get("date")
            extracted_day = analysis.get("day")
            
            if crop.lower() in ("all", "any") and extracted_crop and extracted_crop.lower() != "all":
                logger.info(f"Gemma query analysis overridden 'all' with '{extracted_crop}'")
                crop = extracted_crop
                
            if date is None:
                target_date = resolve_date_programmatically(extracted_date, extracted_day)
        
        if target_date is None:
            target_date = date_type.today().isoformat()

        # Phase 1: Entity Resolution (Cached)
        ag_ids, en_ids = await asyncio.gather(
            resolve_agmarknet_entities(state, district, crop),
            resolve_enam_entities(state, district, crop, target_date, target_date), # dates only needed for fallback, actually it ignores dates in resolve now
            return_exceptions=True
        )

        if isinstance(ag_ids, Exception):
            logger.error(f"Agmarknet resolution failed: {ag_ids}")
            ag_ids = {"error": str(ag_ids)}
        if isinstance(en_ids, Exception):
            logger.error(f"eNAM resolution failed: {en_ids}")
            en_ids = {"error": str(en_ids)}
            
        # Fast Fail: If both failed to resolve the core entities, abort early.
        if "error" in ag_ids and "error" in en_ids:
            return json.dumps({
                "query_context": {"state": state, "district": district, "crop": crop, "target_date": target_date},
                "agmarknet": {"success": False, "error": ag_ids["error"]},
                "enam": {"success": False, "error": en_ids["error"]}
            }, indent=2)

        # Phase 2: Price Fetching
        results = await asyncio.gather(
            fetch_agmarknet_prices_by_id(ag_ids, target_date),
            fetch_enam_prices_by_id(en_ids, target_date),
            return_exceptions=True
        )
        
        # Helper to check if results contain any data
        def has_data(res):
            if isinstance(res, Exception): return False
            return res.get("success") and len(res.get("data", [])) > 0

        # Fallback Case 1: If user requested specific date and no data was found, fallback to today
        today_str = date_type.today().isoformat()
        if target_date != today_str:
            if not has_data(results[0]) and not has_data(results[1]):
                logger.info(f"No data found for 5-day window ending {target_date}. Falling back to 5-day window ending today.")
                target_date = today_str
                results = await asyncio.gather(
                    fetch_agmarknet_prices_by_id(ag_ids, target_date),
                    fetch_enam_prices_by_id(en_ids, target_date),
                    return_exceptions=True
                )
                
        # Fallback Case 2: Deep Search 30-day loop
        if not has_data(results[0]) and not has_data(results[1]):
            from datetime import timedelta
            logger.info(f"No data found for 5-day window ending {today_str}. Searching backwards up to 30 days for latest data...")
            
            for chunk_idx in range(1, 6):  # 5 chunks of 5 days = 25 additional days (total 30 days)
                chunk_end_dt = date_type.today() - timedelta(days=chunk_idx * 5)
                chunk_target_date = chunk_end_dt.isoformat()
                
                logger.info(f"Checking 5-day chunk ending {chunk_target_date}...")
                chunk_results = await asyncio.gather(
                    fetch_agmarknet_prices_by_id(ag_ids, chunk_target_date),
                    fetch_enam_prices_by_id(en_ids, chunk_target_date),
                    return_exceptions=True
                )
                
                if has_data(chunk_results[0]) or has_data(chunk_results[1]):
                    logger.info(f"Found latest data in 5-day chunk ending {chunk_target_date}")
                    results = chunk_results
                    target_date = chunk_target_date
                    break
        
        final_output = {"query_context": {"state": state, "district": district, "crop": crop, "target_date": target_date}}
        
        agmarknet_res = results[0]
        if isinstance(agmarknet_res, Exception):
            final_output["agmarknet"] = {"error": str(agmarknet_res)}
        else:
            final_output["agmarknet"] = agmarknet_res
            
        enam_res = results[1]
        if isinstance(enam_res, Exception):
            final_output["enam"] = {"error": str(enam_res)}
        else:
            final_output["enam"] = enam_res
            
        return json.dumps(final_output, indent=2, ensure_ascii=False)
    except Exception as exc:
        logger.error("market sub-agent failed: %s", exc, exc_info=True)
        return f"⚠️ The market price service is temporarily unavailable. Error: {type(exc).__name__}"
