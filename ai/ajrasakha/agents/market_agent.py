import json
import logging
import re
from typing import Any, Optional

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
    get_trade_data_from_enam,
    get_today_date_for_enam
)
from ajrasakha.agents.prompts import MARKET_GEMMA_RESOLUTION_PROMPT, MARKET_CROP_VERIFICATION_PROMPT

logger = logging.getLogger(__name__)

import os
from dotenv import load_dotenv
load_dotenv()
MARKET_GEMMA_BASE_URL = os.getenv("WEATHER_GEMMA_BASE_URL", "http://100.100.108.44:8014/v1")

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

async def resolve_market_entities_via_gemma(failures: list[dict]) -> dict[str, str]:
    """
    Given a list of failed string matches, query Gemma once to resolve them.
    failures format: [{"field": "crop", "user_term": "Kapas", "options": ["Cotton", "Wheat", "Paddy"]}, ...]
    """
    if not failures:
        return {}

    prompt_parts = MARKET_GEMMA_RESOLUTION_PROMPT
    
    for fail in failures:
        opts = fail["options"]
        
        prompt_parts.append(f"Field: {fail['field']}")
        prompt_parts.append(f"User Term: {fail['user_term']}")
        prompt_parts.append(f"Options: {opts}")
        prompt_parts.append("---")

    prompt = "\n".join(prompt_parts)

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
                full_text = content + "\n" + reasoning
                
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
                
                print(f"RAW GEMMA OUTPUT:\n{content_to_parse}")
                return json.loads(content_to_parse)
    except Exception as e:
        logger.warning("Gemma 4 market resolution failed: %s", e)
        
    return {}


async def verify_crop_with_gemma(query: str) -> str | None:
    prompt_parts = MARKET_CROP_VERIFICATION_PROMPT + [
        f"Query: {query}",
        "---"
    ]
    prompt = "\n".join(prompt_parts)
    
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
                
                full_text = content + "\n" + reasoning
                
                if "```json" in full_text:
                    content_to_parse = full_text.split("```json")[1].split("```")[0].strip()
                elif "```" in full_text:
                    content_to_parse = full_text.split("```")[1].split("```")[0].strip()
                else:
                    start_idx = full_text.find('{')
                    end_idx = full_text.rfind('}')
                    if start_idx != -1 and end_idx != -1:
                        content_to_parse = full_text[start_idx:end_idx+1]
                    else:
                        content_to_parse = full_text
                        
                data = json.loads(content_to_parse)
                return data.get("crop")
    except Exception as e:
        logger.warning(f"Crop verification failed: {e}")
    return None

async def fetch_agmarknet_data(state: str, district: str, crop: str, date: str) -> dict:
    # 1. States
    states_res = await agm_get_states()
    if not states_res.get("success"):
        return {"success": False, "source": "Agmarknet", "error": "Failed to fetch states"}
    
    state_options = {s["name"]: s["id"] for s in states_res["data"]}
    norm_state = _normalize(state)
    
    matched_state_id = None
    for name, s_id in state_options.items():
        if _normalize(name) == norm_state:
            matched_state_id = s_id
            break

    # 2. Commodities
    matched_cmdt_id = None
    if crop.lower() == "all" or crop.lower() == "any":
        matched_cmdt_id = 100001
        cmdt_options = {}
    else:
        cmdt_res = await agm_get_commodities()
        if not cmdt_res.get("success"):
            return {"success": False, "source": "Agmarknet", "error": "Failed to fetch commodities"}
        
        cmdt_options = {c["name"]: c["id"] for c in cmdt_res["data"]}
        norm_crop = _normalize(crop)
        
        for name, c_id in cmdt_options.items():
            if _normalize(name) == norm_crop:
                matched_cmdt_id = c_id
                break

    # Resolve State/Crop Failures
    failures = []
    if not matched_state_id:
        failures.append({"field": "state", "user_term": state, "options": list(state_options.keys())})
    if not matched_cmdt_id:
        failures.append({"field": "crop", "user_term": crop, "options": list(cmdt_options.keys())})
        
    if failures:
        resolutions = await resolve_market_entities_via_gemma(failures)
        if not matched_state_id and resolutions.get(state) in state_options:
            matched_state_id = state_options[resolutions[state]]
        if not matched_cmdt_id and resolutions.get(crop) in cmdt_options:
            matched_cmdt_id = cmdt_options[resolutions[crop]]

    if not matched_state_id:
        return {"success": False, "source": "Agmarknet", "error": f"State '{state}' not found"}
    if not matched_cmdt_id:
        return {"success": False, "source": "Agmarknet", "error": f"Crop '{crop}' not found"}

    # 3. Districts
    matched_dist_id = None
    if district.lower() == "all" or district.lower() == "any":
        matched_dist_id = 100007
    else:
        dist_res = await agm_get_districts(matched_state_id)
        if not dist_res.get("success"):
            return {"success": False, "source": "Agmarknet", "error": "Failed to fetch districts"}
        
        dist_options = {d["name"]: d["id"] for d in dist_res["data"]}
        norm_dist = _normalize(district)
        
        for name, d_id in dist_options.items():
            if norm_dist in _normalize(name): # Substring match for districts
                matched_dist_id = d_id
                break
                
        if not matched_dist_id and dist_options:
            res = await resolve_market_entities_via_gemma([
                {"field": "district", "user_term": district, "options": list(dist_options.keys())}
            ])
            if res.get(district) in dist_options:
                matched_dist_id = dist_options[res[district]]

    if not matched_dist_id:
        return {"success": False, "source": "Agmarknet", "error": f"District '{district}' not found"}

    # 4. Fetch Price Data
    data = await agm_get_price_arrivals(state=matched_state_id, district=matched_dist_id, commodity=matched_cmdt_id, date=date)
    
    # Extract only the inner data to keep payload size small
    extracted_data = data.get("data", {}).get("data", []) if isinstance(data.get("data"), dict) else data.get("data", [])
    
    return {"success": True, "source": "Agmarknet", "data": extracted_data}


async def fetch_enam_data(state: str, district: str, crop: str, date: str) -> dict:
    # 1. State
    state_res = await get_state_list_from_enam()
    if not state_res.get("success"):
        return {"success": False, "source": "eNAM", "error": "Failed to fetch states"}
    
    state_data = state_res["data"].get("data", []) if isinstance(state_res.get("data"), dict) else []
    state_options = {s["state_name"]: s["state_id"] for s in state_data if "state_name" in s}
    norm_state = _normalize(state)
    
    matched_state_name = None
    matched_state_id = None
    for name, s_id in state_options.items():
        if _normalize(name) == norm_state:
            matched_state_name = name
            matched_state_id = s_id
            break

    failures = []
    if not matched_state_id:
        failures.append({"field": "state", "user_term": state, "options": list(state_options.keys())})
        
    if failures:
        res = await resolve_market_entities_via_gemma(failures)
        if res.get(state) in state_options:
            matched_state_name = res[state]
            matched_state_id = state_options[res[state]]

    if not matched_state_id:
        return {"success": False, "source": "eNAM", "error": f"State '{state}' not found"}

    # 2. Mandi (APMC)
    apmc_res = await get_apmc_list_from_enam(matched_state_id)
    if not apmc_res.get("success"):
        return {"success": False, "source": "eNAM", "error": "Failed to fetch APMCs"}
        
    apmc_data = apmc_res["data"].get("data", []) if isinstance(apmc_res.get("data"), dict) else []
    apmc_options = [a["apmc_name"] for a in apmc_data if "apmc_name" in a]
    
    target_apmcs = []
    if district.lower() == "all" or district.lower() == "any":
        target_apmcs = apmc_options
    else:
        norm_dist = _normalize(district)
        matched_apmc_name = None
        for name in apmc_options:
            if norm_dist in _normalize(name):
                matched_apmc_name = name
                break
                
        if not matched_apmc_name and apmc_options:
            res = await resolve_market_entities_via_gemma([
                {"field": "mandi", "user_term": district, "options": apmc_options}
            ])
            if res.get(district) in apmc_options:
                matched_apmc_name = res[district]
                
        if matched_apmc_name:
            target_apmcs = [matched_apmc_name]
        else:
            return {"success": False, "source": "eNAM", "error": f"No APMC found for district '{district}'"}

    # 3. Commodity & Trade Data Looping
    all_extracted_data = []
    import asyncio
    semaphore = asyncio.Semaphore(15)
    
    async def fetch_for_apmc(apmc_name: str):
        target_crops = []
        if crop.lower() == "all" or crop.lower() == "any":
            cmdt_res = await get_commodity_list_from_enam(matched_state_name, apmc_name, date, date)
            if cmdt_res.get("success"):
                cmdt_data = cmdt_res["data"].get("data", []) if isinstance(cmdt_res.get("data"), dict) else []
                target_crops = [c["commodity_name"] for c in cmdt_data if "commodity_name" in c]
        else:
            cmdt_res = await get_commodity_list_from_enam(matched_state_name, apmc_name, date, date)
            if cmdt_res.get("success"):
                cmdt_data = cmdt_res["data"].get("data", []) if isinstance(cmdt_res.get("data"), dict) else []
                cmdt_options = [c["commodity_name"] for c in cmdt_data if "commodity_name" in c]
                norm_crop = _normalize(crop)
                matched_cmdt_name = None
                for name in cmdt_options:
                    if _normalize(name) == norm_crop:
                        matched_cmdt_name = name
                        break
                if not matched_cmdt_name and cmdt_options:
                    res = await resolve_market_entities_via_gemma([
                        {"field": "crop", "user_term": crop, "options": cmdt_options}
                    ])
                    if res.get(crop) in cmdt_options:
                        matched_cmdt_name = res[crop]
                if matched_cmdt_name:
                    target_crops = [matched_cmdt_name]

        apmc_results = []
        for c_name in target_crops:
            async with semaphore:
                data = await get_trade_data_from_enam(matched_state_name, apmc_name, c_name, date, date)
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
        if date is None:
            date = date_type.today().isoformat()
            
        if crop.lower() == "all" or crop.lower() == "any":
            verified_crop = await verify_crop_with_gemma(query)
            if verified_crop and verified_crop.lower() != "all":
                logger.info(f"Gemma hallucination check overridden 'all' with '{verified_crop}'")
                crop = verified_crop

        import asyncio
        results = await asyncio.gather(
            fetch_agmarknet_data(state, district, crop, date),
            fetch_enam_data(state, district, crop, date),
            return_exceptions=True
        )
        
        final_output = {"query_context": {"state": state, "district": district, "crop": crop, "date": date}}
        
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
