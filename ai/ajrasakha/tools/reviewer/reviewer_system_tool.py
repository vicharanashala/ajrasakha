import os
import logging
import requests
from dotenv import load_dotenv
from typing import Dict, Any
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

logging.basicConfig(level=logging.ERROR, format="%(levelname)s: %(message)s")
load_dotenv()

CREATE_QUESTION_URL = "https://desk.vicharanashala.ai/api/questions"

INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY")

if not INTERNAL_API_KEY:
    logging.error("INTERNAL_API_KEY is missing! Tool will fail authentication.")

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
    details: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Pushes a farmer's question to the reviewer system for the Agri team to review.
    
    Expected Input Schema:
    - question (str): The actual query asked by the user. Must not be empty.
    - state_name (str): State from where the query originated. Must not be empty.
    - crop (str): Name of the crop related to the query. Must not be empty.
    - details (Dict[str, Any]): Strict contextual info. MUST contain exactly:
        {"state": "...", "district": "...", "crop": "...", "season": "...", "domain": "..."}
    """

    if not isinstance(question, str) or not question.strip():
        return {"status": "error", "status_code": 400, "message": "'question' is required."}
    
    if not isinstance(state_name, str) or not state_name.strip():
        return {"status": "error", "status_code": 400, "message": "'state_name' is required."}
        
    if not isinstance(crop, str) or not crop.strip():
        return {"status": "error", "status_code": 400, "message": "'crop' is required."}
        
    if not isinstance(details, dict):
        return {"status": "error", "status_code": 400, "message": "'details' must be a dictionary."}
        
    required_keys = ["state", "district", "crop", "season", "domain"]
    missing = [k for k in required_keys if k not in details or not isinstance(details[k], str) or not details[k].strip()]
    if missing:
        return {
            "status": "error", 
            "status_code": 400, 
            "message": f"Missing or empty required keys in 'details': {', '.join(missing)}"
        }

    payload = {
        "question": question.strip(),
        "state_name": state_name.strip(),
        "crop": crop.strip(),
        "details": details,
        "source": "WHATSAPP" 
    }
    
    headers = {
        "x-internal-api-key": INTERNAL_API_KEY,
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(
            CREATE_QUESTION_URL, 
            json=payload, 
            headers=headers, 
            timeout=10
        )
        response.raise_for_status()
        
        return {
            "status": "success", 
            "status_code": response.status_code, 
            "data": response.json()
        }
        
    except requests.exceptions.HTTPError:
        logging.error(f"API Error {response.status_code}: {response.text}")
        return {
            "status": "error", 
            "status_code": response.status_code, 
            "message": response.text
        }
        
    except requests.exceptions.Timeout:
        logging.error("Request Timed Out to Reviewer System.")
        return {
            "status": "error", 
            "status_code": 504, 
            "message": "Request Timed Out. The reviewer system took too long to respond."
        }
        
    except requests.exceptions.RequestException as e:
        logging.error(f"Network Error: {str(e)}")
        return {
            "status": "error", 
            "status_code": 500, 
            "message": f"Network or Request Error: {str(e)}"
        }

if __name__ == "__main__":
    mcp.run(transport="streamable-http")
