import json
import httpx
import os
from typing import Optional
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

# AjraSakha standard initialization with DNS rebinding protection disabled
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
    Fetches active agricultural, rural, and environmental government schemes.
    
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
    
    q_params = [
        {"identifier": "schemeCategory", "value": "Agriculture,Rural & Environment"}
    ]
    
    # Only State needs the "All" fallback to ensure Central schemes are included
    if state and state.lower() != "all":
        q_params.append({"identifier": "beneficiaryState", "value": "All"})
        q_params.append({"identifier": "beneficiaryState", "value": state})

    # Exact matches for other parameters (Backend automatically handles generic availability)
    if gender and gender.lower() != "all":
        q_params.append({"identifier": "gender", "value": gender})
        
    if caste and caste.lower() != "all":
        q_params.append({"identifier": "caste", "value": caste})
        
    if residence and residence.lower() not in ["both", "all"]:
        q_params.append({"identifier": "residence", "value": residence})
        
    if employment_status and employment_status.lower() != "all":
        q_params.append({"identifier": "employmentStatus", "value": employment_status})
        
    if occupation and occupation.lower() != "all":
        q_params.append({"identifier": "occupation", "value": occupation})

    if benefit_type and benefit_type.lower() != "all":
        q_params.append({"identifier": "benefitTypes", "value": benefit_type})

    # Advanced Age Bracket Logic
    if age is not None:
        if age <= 0:
            min_age, max_age = 0, 10
        else:
            min_age = ((age - 1) // 10) * 10 + 1
            max_age = min_age + 9
        q_params.append({"identifier": "age-general", "min": min_age, "max": max_age})

    # Boolean Custom Facets
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

    # Anti-Bot Headers
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
        "x-api-key": "tYTy5eEhlu9rFjyxuCr7ra7ACp4dv1RH8gWuHTDc"
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
                
                formatted_results += f"### {scheme_name}\n"
                formatted_results += f"**Description:** {description.strip()}\n"
                formatted_results += f"**Tags:** {tags}\n"
                formatted_results += "---\n"
                
            return formatted_results

    except httpx.HTTPStatusError as e:
        return f"API responded with an error (Status {e.response.status_code}). WAF blocked the request."
    except Exception as e:
        return f"An unexpected error occurred: {str(e)}"

if __name__ == "__main__":
    mcp.run()