from typing import List
import asyncio
from fastmcp import FastMCP
import pymongo
from llama_index.core import Settings
from llama_index.embeddings.huggingface import HuggingFaceEmbedding

from functions import get_retriever
from constants import DB_NAME, COLLECTION_POP, COLLECTION_QA, EMBEDDING_MODEL, MONGODB_URI
from functions import process_nodes_pop, process_nodes_qa
from models import ContextPOP, ContextQuestionAnswerPair
from llama_index.core.settings import Settings

mcp = FastMCP("POP")

Settings.embed_model = HuggingFaceEmbedding(
    model_name=EMBEDDING_MODEL, cache_folder="./hf_cache", trust_remote_code=True
)

client: pymongo.MongoClient = pymongo.MongoClient(MONGODB_URI)

retriever_qa = get_retriever(
    client=client, collection_name=COLLECTION_QA, similarity_top_k=4
)
retriever_pop = get_retriever(
    client=client, collection_name=COLLECTION_POP, similarity_top_k=5
)



@mcp.tool()
async def get_states_for_pop() -> dict:
    """
    Retrieve the list of available Indian states supported by the Package of Practices dataset, 
    along with their corresponding two-letter codes.
    """
    try:
        raw_states = client[DB_NAME][COLLECTION_POP].distinct("metadata.state")
    except Exception as e:
        print(f"Error fetching states from DB: {e}")
        return {"PUNJAB": "PB"}  # Fallback

    STATE_CODE_MAP = {
        "ANDHRA_PRADESH": "AP", "ARUNACHAL_PRADESH": "AR", "ASSAM": "AS",
        "BIHAR": "BR", "CHHATTISGARH": "CG", "CHATTISGARH": "CG", "GOA": "GA", "GUJARAT": "GJ",
        "HARYANA": "HR", "HIMACHAL_PRADESH": "HP", "JHARKHAND": "JH",
        "KARNATAKA": "KA", "KERALA": "KL", "MADHYA_PRADESH": "MP",
        "MAHARASHTRA": "MH", "MANIPUR": "MN", "MEGHALAYA": "ML",
        "MIZORAM": "MZ", "NAGALAND": "NL", "ODISHA": "OR", "ORISSA": "OR", "PUNJAB": "PB",
        "RAJASTHAN": "RJ", "SIKKIM": "SK", "TAMILNADU": "TN", "TAMIL_NADU": "TN", "TELANGANA": "TG",
        "TRIPURA": "TR", "UTTAR_PRADESH": "UP", "UTTARAKHAND": "UK", "UTTARANCHAL": "UK",
        "WEST_BENGAL": "WB", 
        "ANDAMAN_AND_NICOBAR": "AN", "ANDAMAN_AND_NICOBAR_ISLANDS": "AN",
        "CHANDIGARH": "CH", 
        "DADRA_AND_NAGAR_HAVELI": "DN", "DAMAN_AND_DIU": "DD", 
        "DADRA_AND_NAGAR_HAVELI_AND_DAMAN_AND_DIU": "DN",
        "DELHI": "DL", "NATIONAL_CAPITAL_TERRITORY_OF_DELHI": "DL",
        "JAMMU_AND_KASHMIR": "JK", 
        "LADAKH": "LA", 
        "LAKSHADWEEP": "LD", 
        "PUDUCHERRY": "PY", "PONDICHERRY": "PY",
        "POPS_MULTIPLE_STATES": "MULTIPLE"
    }

    state_codes = {}
    for state in raw_states:
        if not state: continue
        normalized = str(state).strip().upper().replace(" ", "_")
        if normalized in STATE_CODE_MAP:
            state_codes[normalized] = STATE_CODE_MAP[normalized]

    return state_codes

@mcp.tool()
async def get_context_from_package_of_practices(query: str, state_code : str)-> List[ContextPOP]:
    """
    Retrieve context from the package of practices dataset.

    The query should:
    - Be concise and directly related to agriculture, climate, or closely associated domains.
    - Exclude any meta-instructions (e.g., "use mcp tools", "use package of practices dataset").
    - Avoid unnecessary details or formatting outside the main concern.

    Args:
        query (str): A plain-text query strictly describing the agricultural, climate, 
                     or related issue of concern.
        state_code (str): A two-letter state code (e.g., "TN" for Tamil Nadu, "PB" for Punjab)
                          used to narrow the search context to region-specific questions.
    """
    STATE_CODE_TO_NAME = {
    "AP": "ANDHRA_PRADESH",
    "AR": "ARUNACHAL_PRADESH",
    "AS": "ASSAM",
    "BR": "BIHAR",
    "CG": "CHHATTISGARH",
    "GA": "GOA",
    "GJ": "GUJARAT",
    "HR": "HARYANA",
    "HP": "HIMACHAL_PRADESH",
    "JH": "JHARKHAND",
    "KA": "KARNATAKA",
    "KL": "KERALA",
    "MP": "MADHYA_PRADESH",
    "MH": "MAHARASHTRA",
    "MN": "MANIPUR",
    "ML": "MEGHALAYA",
    "MZ": "MIZORAM",
    "NL": "NAGALAND",
    "OR": "ODISHA",
    "PB": "PUNJAB",
    "RJ": "RAJASTHAN",
    "SK": "SIKKIM",
    "TN": "TAMIL_NADU",
    "TG": "TELANGANA",
    "TR": "TRIPURA",
    "UP": "UTTAR_PRADESH",
    "UK": "UTTARAKHAND",
    "WB": "WEST_BENGAL",
    "AN": "ANDAMAN_AND_NICOBAR",
    "CH": "CHANDIGARH",
    "DN": "DADRA_AND_NAGAR_HAVELI_AND_DAMAN_AND_DIU",
    "DD": "DAMAN_AND_DIU",
    "DL": "DELHI",
    "JK": "JAMMU_AND_KASHMIR",
    "LA": "LADAKH",
    "LD": "LAKSHADWEEP",
    "PY": "PUDUCHERRY",
    "MULTIPLE": "POPS_MULTIPLE_STATES"
}

    state_value = STATE_CODE_TO_NAME.get(state_code.upper(), state_code.upper())
    
    nodes = await retriever_pop.aretrieve(
        query,
    filters={"metadata.state": state_value}
)
    processed_nodes = await process_nodes_pop(nodes)
    return processed_nodes


import requests

@mcp.tool()
async def upload_question_to_reviewer_system(question: str, state_name: str, crop: str, details: dict) -> dict:
    """
    Upload the question to the reviewer system for further review by human experts.
    This function is called when the system is unable to find a satisfactory answer from both the datasets (golden dataset and package of practices dataset) 
    for the particular state and crop.

    Parameters:
    - question (str): The question that needs to be reviewed by human experts. 
                      This should be a string containing the query related to crop protection or any other agricultural query.
    - state_name (str): The name of the state in which the query is relevant. 
                        This is typically a string corresponding to the full state name (e.g., "Punjab").
    - crop (str): The type of crop associated with the query. This will be a string like "Paddy" or other crop names.
    - details (dict): A dictionary containing detailed information about the location, crop, season, and domain of the query.
                      The dictionary should have the following structure:
                      {
                        "state": str,       # Name of the state (e.g., "Punjab")
                        "district": str,    # Name of the district (e.g., "Chandigarh")
                        "crop": str,        # Crop name (e.g., "Paddy")
                        "season": str,      # Season of the year (e.g., "Kharif")
                        "domain": str       # Domain of the query, such as "Crop Protection"
                      }
    """
    
    # Define constant values
    source = "AJRASAKHA"
    priority = "high"
    context = ""  # Empty string as context for now
    
    # Ensure all required fields are non-empty
    required_fields = ["state", "district", "crop", "season", "domain"]
    for field in required_fields:
        if not details.get(field):
            if field == "district":
                details[field] = "Not specified"
            elif field == "season":
                details[field] = "General"
            else:
                details[field] = "Not specified"

    # Construct the payload according to the schema
    payload = {
        "question": question,
        "priority": priority,
        "source": source,
        "details": details,
        "context": context
    }
    
    # Send the POST request
    url = "https://desk.vicharanashala.ai/api/questions"
    headers = {"Content-Type": "application/json"}

    print(f"DEBUG: Sending to URL: {url}", flush=True)
    try:
        response = await asyncio.to_thread(requests.post, url, json=payload, headers=headers, timeout=10)
        
        if response.status_code == 201:
            return {"status": "Uploaded Successfully"}
        else:
            return {"status": "Failed", "message": response.text}

    except requests.exceptions.RequestException as e:
        return {"status": "Error", "message": str(e)}




if __name__ == "__main__":
    mcp.run(transport='streamable-http', host='0.0.0.0', port=9002)
