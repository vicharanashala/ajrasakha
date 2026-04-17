import httpx
from typing import List, Dict, Any
from langchain.tools import tool
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

CREATE_QUESTION_URL = "https://desk.vicharanashala.ai/api/questions"
CHECK_STATUS_URL = "https://desk.vicharanashala.ai/api/questions/check-status"

mcp = FastMCP(
    "ajrasakha-reviewer-mcp",
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
)


@tool
@mcp.tool()
async def upload_question_to_reviewer_system(
    question: str, state_name: str, crop: str, details: Dict[str, str]
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
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(CREATE_QUESTION_URL, json=payload)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        print(f"Error submitting question: {e}")
        return {"error": str(e)}


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
