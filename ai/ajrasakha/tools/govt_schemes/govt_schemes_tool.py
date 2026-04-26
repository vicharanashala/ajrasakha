import asyncio
import copy
import json
import os
from typing import Optional

import httpx
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

load_dotenv()

mcp = FastMCP(
    "ajrasakha-govt-schemes-mcp",
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=False
    )
)


@mcp.tool()
async def govt_schemes(
    state: Optional[str] = None,
    gender: Optional[str] = None,
    age: Optional[int] = None,
    caste: Optional[str] = None,
    residence: Optional[str] = None,
    benefit_type: Optional[str] = None,
    employment_status: Optional[str] = None,
    occupation: Optional[str] = None,
    is_minority: Optional[bool] = False,
    is_differently_abled: Optional[bool] = False,
    is_bpl: Optional[bool] = False,
    is_economic_distress: Optional[bool] = False,
    is_student: Optional[bool] = False,
    is_govt_employee: Optional[bool] = False,
    is_dbt_scheme: Optional[bool] = False
) -> str:
    """
    Fetches a list of active agricultural, rural, and environmental government schemes.
    IMPORTANT: Use this tool FIRST to search for schemes based on user demographics.
    It returns a list of schemes along with their 'slug' (unique ID).
    """

    # 1. BASE QUERY: Only Category, State, and Age (Open to everyone)
    base_q = [{"identifier": "schemeCategory", "value": "Agriculture,Rural & Environment"}]

    if state and state.lower() != "all":
        base_q.append({"identifier": "beneficiaryState", "value": "All"})
        base_q.append({"identifier": "beneficiaryState", "value": state})

    if age is not None:
        if age <= 0:
            min_age, max_age = 0, 10
        else:
            min_age = ((age - 1) // 10) * 10 + 1
            max_age = min_age + 9
        base_q.append({"identifier": "age-general", "min": min_age, "max": max_age})

    # 2. SPECIFIC QUERY: Add strict demographic filters
    specific_q = copy.deepcopy(base_q)
    has_specific = False

    if gender and gender.lower() != "all":
        specific_q.append({"identifier": "gender", "value": gender})
        has_specific = True
    if caste and caste.lower() != "all":
        specific_q.append({"identifier": "caste", "value": caste})
        has_specific = True
    if residence and residence.lower() not in ["both", "all"]:
        specific_q.append({"identifier": "residence", "value": residence})
        has_specific = True
    if employment_status and employment_status.lower() != "all":
        specific_q.append({"identifier": "employmentStatus", "value": employment_status})
        has_specific = True
    if occupation and occupation.lower() != "all":
        specific_q.append({"identifier": "occupation", "value": occupation})
        has_specific = True
    if benefit_type and benefit_type.lower() != "all":
        specific_q.append({"identifier": "benefitTypes", "value": benefit_type})
        has_specific = True

    if is_bpl:
        specific_q.append({"identifier": "isBpl", "value": "Yes"})
        has_specific = True
    if is_differently_abled:
        specific_q.append({"identifier": "disability", "value": "Yes"})
        has_specific = True
    if is_minority:
        specific_q.append({"identifier": "minority", "value": "Yes"})
        has_specific = True
    if is_student:
        specific_q.append({"identifier": "isStudent", "value": "Yes"})
        has_specific = True
    if is_govt_employee:
        specific_q.append({"identifier": "isGovEmployee", "value": "Yes"})
        has_specific = True
    if is_economic_distress:
        specific_q.append({"identifier": "isEconomicDistress", "value": "Yes"})
        has_specific = True
    if is_dbt_scheme:
        specific_q.append({"identifier": "dbtScheme", "value": "Yes"})
        has_specific = True

    url = "https://api.myscheme.gov.in/search/v6/schemes"
    headers = {
        "accept": "application/json, text/plain, */*",
        "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
        "origin": "https://www.myscheme.gov.in",
        "sec-ch-ua": '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
        "x-api-key": os.getenv("MYSCHEME_API_KEY", "")
    }

    async def fetch_api(client, q_payload):
        params = {"lang": "en", "q": json.dumps(q_payload), "from": 0, "size": 10}
        resp = await client.get(url, params=params, headers=headers, timeout=15.0)
        resp.raise_for_status()
        return resp.json().get("data", {})

    try:
        async with httpx.AsyncClient() as client:
            if has_specific:
                res_spec, res_gen = await asyncio.gather(
                    fetch_api(client, specific_q),
                    fetch_api(client, base_q)
                )

                items_spec = res_spec.get("hits", {}).get("items", [])
                items_gen = res_gen.get("hits", {}).get("items", [])

                seen_slugs = set()
                merged_items = []

                for item in items_spec + items_gen:
                    slug = item.get("fields", {}).get("slug", "N/A")
                    if slug not in seen_slugs:
                        seen_slugs.add(slug)
                        merged_items.append(item)

                items = merged_items[:10]
                total_schemes = max(res_gen.get("summary", {}).get("total", 0), len(merged_items))
            else:
                res_gen = await fetch_api(client, base_q)
                items = res_gen.get("hits", {}).get("items", [])
                total_schemes = res_gen.get("summary", {}).get("total", 0)

            if not items:
                return "No agricultural schemes found for the provided criteria."

            formatted_results = f"Found {total_schemes} matching schemes. Here are the top results:\n\n"

            for item in items:
                fields = item.get("fields", {})
                scheme_name = fields.get("schemeName", "Unknown Scheme")
                description = fields.get("briefDescription", "No description available.")
                tags = ", ".join(fields.get("tags", []))
                slug = fields.get("slug", "N/A")

                formatted_results += f"### {scheme_name}\n"
                formatted_results += f"**Slug:** {slug}\n"
                formatted_results += f"**Description:** {description.strip()}\n"
                formatted_results += f"**Tags:** {tags}\n"
                formatted_results += "---\n"

            return formatted_results

    except httpx.HTTPStatusError as e:
        return f"API responded with an error (Status {e.response.status_code}). WAF blocked the request."
    except Exception as e:
        return f"An unexpected error occurred: {str(e)}"


@mcp.tool()
async def get_scheme_details(slug: str) -> str:
    """
    Fetches the deep-dive details (eligibility, benefits, application process) of a specific scheme.
    IMPORTANT: Use this tool SECOND. Only call this after using 'govt_schemes' to get the exact 'slug'.
    """
    url = "https://api.myscheme.gov.in/schemes/v6/public/schemes"
    params = {
        "slug": slug,
        "lang": "en"
    }

    headers = {
        "accept": "application/json, text/plain, */*",
        "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
        "origin": "https://www.myscheme.gov.in",
        "sec-ch-ua": '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
        "x-api-key": os.getenv("MYSCHEME_API_KEY", "")
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, headers=headers, timeout=15.0)
            response.raise_for_status()
            data = response.json()

            scheme_data = data.get("data", {}).get("en", {})
            if not scheme_data:
                return f"Could not find detailed information for the scheme with slug: {slug}"

            scheme_name = scheme_data.get("basicDetails", {}).get("schemeName", "Unknown Scheme")

            content = scheme_data.get("schemeContent", {})
            details_md = content.get("detailedDescription_md", "No detailed description available.")
            benefits_md = content.get("benefits_md", "No benefits information available.")

            eligibility = scheme_data.get("eligibilityCriteria", {})
            eligibility_md = eligibility.get("eligibilityDescription_md", "No eligibility criteria found.")

            app_process = scheme_data.get("applicationProcess", [])
            process_md = "No application process details found."
            if app_process and len(app_process) > 0:
                process_md = app_process[0].get("process_md", process_md)

            result = f"# {scheme_name}\n\n"
            result += f"## Detailed Description\n{details_md}\n\n"
            result += f"## Eligibility Criteria\n{eligibility_md}\n\n"
            result += f"## Benefits\n{benefits_md}\n\n"
            result += f"## Application Process\n{process_md}\n"

            return result

    except httpx.HTTPStatusError as e:
        return f"API responded with an error (Status {e.response.status_code}). WAF blocked the request."
    except Exception as e:
        return f"An unexpected error occurred while fetching details: {str(e)}"


if __name__ == "__main__":
    mcp.run()
