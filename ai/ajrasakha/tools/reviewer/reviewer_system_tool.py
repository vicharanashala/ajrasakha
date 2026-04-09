import requests
import os
from dotenv import load_dotenv
from typing import List, Dict, Any
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

load_dotenv()

CREATE_QUESTION_URL = "https://desk.vicharanashala.ai/api/questions"
CHECK_STATUS_URL = "https://desk.vicharanashala.ai/api/questions/check-status"

INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")

mcp = FastMCP(
    "ajrasakha-reviewer-mcp",
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=False
    )
)

@mcp.tool()
def upload_question_to_reviewer_system(
    question: str, 
    state_name: str, 
    crop: str, 
    details: Dict[str, str]
) -> Dict[str, Any]:
    """
    Pushes a question to the reviewer system for the agri team to review.
    Returns the question ID if the question is successfully submitted.
    """
    payload = {
        "question": question,
        "state_name": state_name,
        "crop": crop,
        "details": details,
        "source": "whatsapp" 
    }
    
    headers = {
        "x-internal-api-key": INTERNAL_API_KEY
    }
    
    try:
        response = requests.post(
            CREATE_QUESTION_URL, 
            json=payload, 
            headers=headers, 
            timeout=10
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error submitting question: {e}")
        return {"error": str(e)}

if __name__ == "__main__":
    mcp.run(transport="streamable-http")