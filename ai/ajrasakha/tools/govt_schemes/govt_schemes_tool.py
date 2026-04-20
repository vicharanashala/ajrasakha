import json
import httpx
import os
from typing import Optional
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from dotenv import load_dotenv

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
    
    Args:
        state: State name (e.g., 'Jammu and Kashmir', 'Gujarat').
        gender: 'Male', 'Female', or 'Transgender'.
        age: Exact age of the farmer in years.
        caste: 'General', 'Scheduled Caste (SC)', 'Scheduled Tribe (ST)', 'Other Backward Class (OBC)', 'Particularly Vulnerable Tribal Group (PVTG)'.
        residence: 'Rural' or 'Urban'.
        benefit_type: 'Cash', 'In Kind', 'Composite'.
        employment_status: 'Employed', 'Self-Employed/ Entrepreneur', 'Unemployed'.
        occupation: e.g., 'Farmer', 'Dairy Farmer', 'Fishermen'.
        is_minority: True if user belongs to a minority.
        is_differently_abled: True if user is physically challenged.
        is_bpl: True if Below Poverty Line.
        is_economic_distress: True if in economic distress.
        is_student: True if user is a student.
        is_govt_employee: True if user is a government employee.
        is_dbt_scheme: True if specifically looking for Direct Benefit Transfer schemes.
    """
    
    q_params = [{"identifier": "schemeCategory", "value": "Agriculture,Rural & Environment"}]
    
    if state and state.lower() != "all":
        q_params.append({"identifier": "beneficiaryState", "value": "All"})
        q_params.append({"identifier": "beneficiaryState", "value": state})

    if gender and gender.lower() != "all": q_params.append({"identifier": "gender", "value": gender})
    if caste and caste.lower() != "all": q_params.append({"identifier": "caste", "value": caste})
    if residence and residence.lower() not in ["both", "all"]: q_params.append({"identifier": "residence", "value": residence})
    if employment_status and employment_status.lower() != "all": q_params.append({"identifier": "employmentStatus", "value": employment_status})
    if occupation and occupation.lower() != "all": q_params.append({"identifier": "occupation", "value": occupation})
    if benefit_type and benefit_type.lower() != "all": q_params.append({"identifier": "benefitTypes", "value": benefit_type})

    if age is not None:
        if age <= 0:
            min_age, max_age = 0, 10
        else:
            min_age = ((age - 1) // 10) * 10 + 1
            max_age = min_age + 9
        q_params.append({"identifier": "age-general", "min": min_age, "max": max_age})

    if is_bpl: q_params.append({"identifier": "isBpl", "value": "Yes"})
    if is_differently_abled: q_params.append({"identifier": "disability", "value": "Yes"})
    if is_minority: q_params.append({"identifier": "minority", "value": "Yes"})
    if is_student: q_params.append({"identifier": "isStudent", "value": "Yes"})
    if is_govt_employee: q_params.append({"identifier": "isGovEmployee", "value": "Yes"})
    if is_economic_distress: q_params.append({"identifier": "isEconomicDistress", "value": "Yes"})
    if is_dbt_scheme: q_params.append({"identifier": "dbtScheme", "value": "Yes"})

    url = "https://api.myscheme.gov.in/search/v6/schemes"
    params = {
        "lang": "en",
        "q": json.dumps(q_params), 
        "from": 0,
        "size": 10
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
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
        "x-api-key": os.getenv("MYSCHEME_API_KEY", "")
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, headers=headers, timeout=15.0)
            response.raise_for_status()
            data = response.json()
            
            items = data.get("data", {}).get("hits", {}).get("items", [])
            total_schemes = data.get("data", {}).get("summary", {}).get("total", 0)
            
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
    
    Args:
        slug: The unique identifier (slug) of the scheme (e.g., 'dsmphsfcclomuk').
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
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
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
