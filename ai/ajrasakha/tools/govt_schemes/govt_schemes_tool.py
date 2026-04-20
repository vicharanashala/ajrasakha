import json
import httpx
from mcp.server.fastmcp import FastMCP
from typing import Optional

# Initialize FastMCP Server
mcp = FastMCP("GovtSchemesProvider")

@mcp.tool()
async def govt_schemes(
    state: Optional[str] = None,
    gender: Optional[str] = None,
    caste: Optional[str] = None,
) -> str:
    """
    Fetches active agricultural, rural, and environmental government schemes 
    for farmers from the myScheme portal based on their demographics.
    
    Args:
        state: The user's state (e.g., 'Jammu and Kashmir', 'Gujarat').
        gender: The user's gender ('Male', 'Female').
        caste: The user's caste category ('General', 'Scheduled Caste (SC)', 'Scheduled Tribe (ST)', 'Other Backward Class (OBC)').
    """
    
    # Base filter: We only want Agriculture related schemes
    q_params = [
        {"identifier": "schemeCategory", "value": "Agriculture,Rural & Environment"}
    ]
    
    # Dynamically append user-specific filters
    if state and state.lower() != "all":
        q_params.append({"identifier": "beneficiaryState", "value": state})
    if gender and gender.lower() != "all":
        q_params.append({"identifier": "gender", "value": gender})
    if caste and caste.lower() != "all":
        q_params.append({"identifier": "caste", "value": caste})

    url = "https://api.myscheme.gov.in/search/v6/schemes"
    
    # Query parameters (httpx will handle the URL encoding for 'q')
    params = {
        "lang": "en",
        "q": json.dumps(q_params), 
        "from": 0,
        "size": 10 # Limiting to 10 so we don't overwhelm the LLM's context
    }

    # EXACT headers copied from your browser cURL to bypass the WAF
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
        # Firing the async request
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, headers=headers, timeout=15.0)
            response.raise_for_status()
            data = response.json()
            
            # Parsing the JSON response
            items = data.get("data", {}).get("hits", {}).get("items", [])
            total_schemes = data.get("data", {}).get("summary", {}).get("total", 0)
            
            if not items:
                return "No agricultural schemes found for the provided criteria."
            
            # Formatting the output for the LLM to easily read and summarize
            formatted_results = f"Found {total_schemes} total schemes. Here are the top results:\n\n"
            
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
        return f"API API responded with an error (Status {e.response.status_code}). WAF blocked the request."
    except Exception as e:
        return f"An unexpected error occurred: {str(e)}"

if __name__ == "__main__":
    mcp.run()