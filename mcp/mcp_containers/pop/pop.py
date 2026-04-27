from typing import List, Optional
import asyncio
from fastmcp import FastMCP
import pymongo
from llama_index.core import Settings
from llama_index.embeddings.huggingface import HuggingFaceEmbedding

from functions import get_retriever
from constants import DB_NAME, COLLECTION_POP, COLLECTION_QA, EMBEDDING_MODEL, MONGODB_URI
from functions import process_nodes_pop, process_nodes_qa
from models import ContextPOP, ContextQuestionAnswerPair, POPComplianceNotice, POPContextResponse
from llama_index.core.settings import Settings
from chemical_guard import filter_pop_contexts_for_chemical_compliance

mcp = FastMCP("POP")

Settings.embed_model = HuggingFaceEmbedding(
    model_name=EMBEDDING_MODEL, cache_folder="./hf_cache", trust_remote_code=True
)

client: pymongo.MongoClient = pymongo.MongoClient(MONGODB_URI, tlsAllowInvalidCertificates=True)

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
        print(f"[POP] get_states_for_pop: fetched {len(raw_states)} raw states from DB", flush=True)
    except Exception as e:
        print(f"[POP] get_states_for_pop: error fetching states from DB: {e}", flush=True)
        return {}

    STATE_CODE_MAP = {
        "ANDHRA_PRADESH": "AP", "ARUNACHAL_PRADESH": "AR", "ASSAM": "AS",
        "BIHAR": "BR", "CHATTISGARH": "CG", "CHHATTISGARH": "CG", "GOA": "GA", "GUJARAT": "GJ",
        "HARYANA": "HR", "JAMMU_AND_KASHMIR": "JK", "JAMMU_&_KASHMIR": "JK", "JHARKHAND": "JH",
        "KARNATAKA": "KA",
        "KERALA": "KL", "MAHARASHTRA": "MH", "MANIPUR": "MN", "MEGHALAYA": "ML",
        "MIZORAM": "MZ", "NAGALAND": "NL", "ODISHA": "OR", "ORISSA": "OR", "PUNJAB": "PB",
        "RAJASTHAN": "RJ", "SIKKIM": "SK", "TAMILNADU": "TN", "TAMIL_NADU": "TN",
        "TRIPURA": "TR", "UTTAR_PRADESH": "UP", "UTTARPRADESH": "UP", "UTTARAKHAND": "UK",
        "WEST_BENGAL": "WB",
        "POPS_MULTIPLE_STATES": "MULTIPLE"
    }

    state_codes = {}
    for state in raw_states:
        if not state: continue
        normalized = str(state).strip().upper().replace("&", "AND").replace(" ", "_")
        if normalized in STATE_CODE_MAP:
            state_codes[normalized] = STATE_CODE_MAP[normalized]

    print(f"[POP] get_states_for_pop: mapped {len(state_codes)} states to codes", flush=True)
    return state_codes

@mcp.tool()
async def get_context_from_package_of_practices(query: str, state_code : str)-> POPContextResponse:
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
    "AP": "Andhra Pradesh",
    "AR": "Arunachal Pradesh",
    "AS": "Assam",
    "BR": "Bihar",
    "CG": "Chattisgarh",
    "GA": "Goa",
    "GJ": "Gujarat",
    "HR": "Haryana",
    "JH": "Jharkhand",
    "KA": "Karnataka",
    "KL": "Kerala",
    "MH": "Maharashtra",
    "MN": "Manipur",
    "ML": "Meghalaya",
    "MZ": "Mizoram",
    "NL": "Nagaland",
    "OR": "Odisha",
    "PB": "Punjab",
    "RJ": "Rajasthan",
    "SK": "Sikkim",
    "TN": "Tamil Nadu",
    "TR": "Tripura",
    "UP": "Uttar Pradesh",
    "UK": "Uttarakhand",
    "WB": "West Bengal",
    "JK": "Jammu & Kashmir",
    "MULTIPLE": "Pops_Multiple_States"
}

    normalized_state_code = (state_code or "").strip().upper()
    valid_state_codes = sorted(STATE_CODE_TO_NAME.keys())
    valid_state_codes_str = ", ".join(valid_state_codes)
    print(
        f"[POP] get_context_from_package_of_practices: received state_code='{state_code}', normalized='{normalized_state_code}'",
        flush=True,
    )

    if not normalized_state_code:
        raise ValueError(
            f"Missing required parameter: state_code. Available state_code values are: {valid_state_codes_str}"
        )

    if normalized_state_code not in STATE_CODE_TO_NAME:
        raise ValueError(
            f"Invalid state_code '{state_code}'. Available state_code values are: {valid_state_codes_str}"
        )

    state_value = STATE_CODE_TO_NAME[normalized_state_code]
    print(
        f"[POP] get_context_from_package_of_practices: resolved state_code='{normalized_state_code}' to state_value='{state_value}'",
        flush=True,
    )
    
    nodes = await retriever_pop.aretrieve(query, state_value=state_value)
    print(
        f"[POP] get_context_from_package_of_practices: retrieved {len(nodes)} nodes for state='{state_value}'",
        flush=True,
    )

    processed_nodes = await process_nodes_pop(nodes)
    compliant_nodes, restricted_flags, blocked_chemical_names = (
        filter_pop_contexts_for_chemical_compliance(processed_nodes)
    )
    restricted_chemical_names = [flag.chemical_name for flag in restricted_flags]
    print(
        (
            "[POP] get_context_from_package_of_practices: returning "
            f"{len(compliant_nodes)} compliant nodes, "
            f"restricted_flags={len(restricted_flags)}, "
            f"blocked_non_restricted={len(blocked_chemical_names)}"
        ),
        flush=True,
    )
    print(
        (
            "[POP] chemical_compliance: "
            f"restricted={restricted_chemical_names or []}, "
            f"blocked_non_restricted={blocked_chemical_names or []}"
        ),
        flush=True,
    )

    compliance_notice = None
    if restricted_flags or blocked_chemical_names:
        message_parts: list[str] = []
        blocked_message = None

        if restricted_flags:
            message_parts.append(
                "Restricted chemical detected. Content is permitted only if usage complies with allowed_usage. Note: Use the retrieved context and source_name to answer the question only if passed the compliance check otherwise skip the source_name"
            )

        if blocked_chemical_names:
            blocked_str = ", ".join(f'"{name}"' for name in blocked_chemical_names)
            blocked_message = (
                f"Banned chemical(s) {blocked_str} found from retrieved text, so compliance check skipped that data."
            )
            message_parts.append(blocked_message)

        compliance_notice = POPComplianceNotice(
            message=" ".join(message_parts),
            restricted_chemicals=restricted_flags,
            blocked_non_restricted_chemicals=blocked_chemical_names,
            blocked_message=blocked_message,
        )

    return POPContextResponse(
        contexts=compliant_nodes,
        compliance_notice=compliance_notice,
    )




if __name__ == "__main__":
    mcp.run(transport='streamable-http', host='0.0.0.0', port=9002)
