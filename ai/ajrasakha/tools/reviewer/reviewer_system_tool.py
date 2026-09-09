import os
import json
import logging
import requests
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from typing import Dict, Any, Optional
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

IST = timezone(timedelta(hours=5, minutes=30))


class ISTFormatter(logging.Formatter):
    def formatTime(self, record, datefmt=None):
        dt = datetime.fromtimestamp(record.created, IST)
        return dt.strftime(datefmt or "%Y-%m-%d %H:%M:%S") + " IST"


_handler = logging.StreamHandler()
_handler.setFormatter(ISTFormatter("%(asctime)s %(levelname)s: %(message)s"))
logging.basicConfig(level=logging.INFO, handlers=[_handler])
log = logging.getLogger(__name__)
load_dotenv()

CREATE_QUESTION_URL = os.getenv("CREATE_QUESTION_URL", "https://reviewer-backend-239934307367.asia-south2.run.app/api/questions")

INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY")

if not INTERNAL_API_KEY:
    log.warning("INTERNAL_API_KEY is missing! Tool will fail authentication.")

_REVIEWER_MCP_HOST = os.getenv("REVIEWER_MCP_HOST", "0.0.0.0").strip()
_REVIEWER_MCP_PORT = int(os.getenv("REVIEWER_MCP_PORT", "9007"))
_REVIEWER_MCP_PATH = os.getenv("REVIEWER_MCP_PATH", "/mcp").strip() or "/mcp"

mcp = FastMCP(
    "ajrasakha-reviewer-mcp",
    host=_REVIEWER_MCP_HOST,
    port=_REVIEWER_MCP_PORT,
    streamable_http_path=_REVIEWER_MCP_PATH,
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=False
    ),
)

# ============================================================
# STANDARDIZED DOMAINS TAXONOMY & NORMALIZATION
# ============================================================

STANDARDIZED_DOMAINS: list[str] = [
    "Soil Health and Nutrient Management",
    "Irrigation and Water Management",
    "Insect - Pest Management",
    "Disease Management",
    "Seed and Variety Selection",
    "Cultural and Crop Management Practices",
    "Organic and Natural Farming",
    "Weed Management",
    "Climate, Weather & Stress Management",
    "Farm Tools & Mechanisation",
    "Post-Harvest Management & Storage",
    "Market Prices, MSP & Marketing",
    "Agricultural Schemes & Subsidies",
    "Credit, Loan & Insurance",
    "Capacity Building, Extension and Communication",
    "Rural Infrastructure",
    "Animal Husbandry & Livestock",
    "Fisheries & Aquaculture",
    "Allied Agricultural Activities",
]

DOMAIN_TAXONOMY_RAW: list[tuple[str, str, list[str]]] = [
    (
        "Soil Health and Nutrient Management",
        "SHNM",
        [
            "Fertilizer Use and Availability",
            "Nutrient Management",
            "Soil Testing",
            "Dosage",
            "Soil Health Card",
            "Nutrient Deficiency/Excessiveness Management",
            "Problem Of Soil",
            "Fertiizer and Nutrient",
            "Fertilizer Management",
            "Fertilizer alternatives",
            "Fertilizer and Nutrient",
            "Fertilizer and nutrient management",
            "Foliar Spray",
            "Micronutrient management",
            "Micronutrient deficiency management",
            "Nitrogen fertilizer management",
            "Nutrient",
            "Nutrition Management",
            "Soil & Nutrient Management",
            "Soil Health and Fertilizer",
            "Soil Management",
            "Soil and Fertilizer Management",
            "Soil and Fertilizers",
            "Soil and Nutrient Management",
            "fertilizers and soil health",
            "soil health",
            "Biofertilizer application",
        ],
    ),
    (
        "Irrigation and Water Management",
        "IWM",
        [
            "Water Management",
            "Water Management Micro Irrigation",
            "Micro Irrigation",
            "Irrigation Management",
            "Irrigation",
            "Fertigation",
            "Fertigation and Irrigation Management",
        ],
    ),
    (
        "Insect - Pest Management",
        "INPM",
        [
            "Insect Management",
            "Biological Pest Management",
            "Insect Pest Management",
            "Insect–Pest Management",
            "Pest",
            "Pest Management",
            "Pesticides",
            "Plant Protection",
        ],
    ),
    (
        "Disease Management",
        "PDM",
        [
            "Disease Management",
            "Disease",
            "Disease Reporting",
            "Pathogenic Disease Management",
            "Disease (Viral)",
            "Disease (Bacterial)",
            "Crop Health and Disease Management",
            "Fungicide",
            "crop disease management",
            "ਬਿਮਾਰੀ ਪ੍ਰਬੰਧਨ",
            "Disease management - red rot",
        ],
    ),
    (
        "Seed and Variety Selection",
        "SVS",
        [
            "Varieties",
            "Varities",
            "Vegetative Propagation and Tissue Culture",
            "Seed Sowing And Treatment",
            "Varietal Selection",
            "Crop Varieties",
            "Crop Variety",
            "Crop Variety Selection",
            "Seed",
            "Seed Availability",
            "Seed Management",
            "Seed Suppliers",
            "Seed Treatment",
            "Seeds",
            "Seeds and Planting Material",
            "Seeds and Varieties",
            "Variety",
            "Variety Information",
            "Variety Selection",
            "Seed Quality and Complaints",
            "Seed Availability and Planting Time",
        ],
    ),
    (
        "Cultural and Crop Management Practices",
        "CCMP",
        [
            "Cultural Practices",
            "Cultivation Conditions",
            "Field Preparation",
            "Management",
            "Integrated Farming System",
            "Hormonic Imbalance",
            "Hormone Imbalance Management",
            "Nursery Management",
            "Agronomy",
            "Agronomy and Crop Management",
            "Agronomy and Planting",
            "Crop Cultivation",
            "Crop Growth Stages",
            "Crop Health",
            "Crop Improvement",
            "Crop Management",
            "Crop Planning",
            "Crop Practices",
            "Crop Production",
            "Crop Selection",
            "Crop Suitability",
            "Intercropping",
            "Nursery Raising",
            "Plant growth",
            "Plant growth regulators",
            "Planting methods",
            "Pruning and detrashing practices",
            "Ratoon management and gap filling",
            "Tillering phase management",
            "crop rotation",
            "cultivation",
            "cultivation practices",
            "Crop Residue Management",
        ],
    ),
    (
        "Organic and Natural Farming",
        "ONF",
        [
            "Organic Farming",
            "Bio-Pesticides and Bio-Fertilizers",
            "Organic Fertilizer",
            "Organic Inputs",
            "Organic fertilizer application",
            "Organic weed management",
        ],
    ),
    (
        "Weed Management",
        "WDM",
        [
            "Weed Management",
            "Weed",
            "Weed Control",
            "Weedicide",
            "Herbicide",
        ],
    ),
    (
        "Climate, Weather & Stress Management",
        "CWSM",
        [
            "Weather",
            "Sowing Time and Weather",
            "Abiotic Stress Management",
            "Climate Weather and Stress Management",
            "Disaster Management and Crop Recovery",
        ],
    ),
    (
        "Farm Tools & Mechanisation",
        "FTM",
        [
            "Agriculture Mechanization",
            "Plasticulture",
            "Farm Machinery",
            "Farm Machinery and Equipment",
            "Farm Inputs and Supplies",
        ],
    ),
    (
        "Post-Harvest Management & Storage",
        "PHMS",
        [
            "Storage",
            "Post Harvest Preservation",
            "Post Harvest Management Cleaning Grading Packaging Food Processing Cool Chain etc",
            "Cold Storage",
            "Post Harvest Management (Cleaning, Grading, Packaging, Food Processing, Cool Chain etc.)",
            "Harvesting Management",
            "Post Harvest Management - Abiotic",
            "Post Harvest Management - Biotic",
            "Post Harvest Management",
            "Post-Harvest & Value Addition",
            "Post-harvest Management",
            "Storage Pest Management",
            "Crop Harvesting",
        ],
    ),
    (
        "Market Prices, MSP & Marketing",
        "MPM",
        [
            "Market Information",
            "Economics",
            "Market & Schemes",
            "Market Price",
            "Market Prices",
            "Market and Pricing",
            "market advisory",
            "Economics and Marketing",
        ],
    ),
    (
        "Agricultural Schemes & Subsidies",
        "AGSS",
        [
            "Government Schemes",
        ],
    ),
    (
        "Credit, Loan & Insurance",
        "CLI",
        [
            "Credit",
            "Loans",
            "Crop Insurance",
            "Insurance",
            "Financial & Institutional Services",
        ],
    ),
    (
        "Capacity Building, Extension and Communication",
        "CEE",
        [
            "Training",
            "Training and Exposure Visits",
            "Capacity Building & Extension",
            "Extension & Capacity Building",
            "Extension Services",
            "Farmer Services",
        ],
    ),
    (
        "Rural Infrastructure",
        "RI",
        [
            "Power Roads etc",
            "Power, Roads etc.",
            "Infrastructure & Utilities",
        ],
    ),
    (
        "Animal Husbandry & Livestock",
        "AHL",
        [
            "Dairy Production",
            "Animal Husbandry",
            "Poultry",
            "Feed",
            "Animal Production Piggery Goatery Sheep Farming etc",
            "Livestock Products Processing and Packaging",
            "Animal Nutrition",
            "Animal Breeding",
            "Cattle shed Planning and Management",
            "Artificial Insemination",
            "Animal Production (Piggery, Goatery, Sheep Farming etc.)",
            "Vaccine - Viral",
            "Breeding -Inbreeding",
            "Disease - External Parasitic",
            "Animal Health",
            "Fodder Cultivation",
            "Livestock & Animal Husbandry",
            "Veterinary & Animal Health",
        ],
    ),
    (
        "Fisheries & Aquaculture",
        "FA",
        [
            "Coastal Aquaculture",
            "Tank Pond and Reservoir Management",
            "Fish Marketing",
            "Breeding of freshwater prawn",
            "Freshwater Pearl Farming",
            "Fishery Nutrition",
            "Fish Fingerling Production",
            "Fishery Mechanization",
            "Magur Breeding and Culture",
            "Breeding and culture of ornamental fish",
            "Freshwater pearl culture",
            "Water Testing for Fish Production",
            "Seaweed Cultivation",
            "Fish Dressing Drying",
            "Deep Sea Fishing and Processing",
            "Fishing Harbours and Landing Centre",
            "Tank, Pond and Reservoir Management",
            "Fisheries",
        ],
    ),
    (
        "Allied Agricultural Activities",
        "AAA",
        [
            "Beekeeping",
            "Mushroom Production",
        ],
    ),
]


def _normalize_key(text: str) -> str:
    cleaned = str(text or "").strip().lower()
    cleaned = cleaned.replace("–", "-").replace("—", "-")
    return " ".join(cleaned.split())


def _build_domain_lookup() -> dict[str, str]:
    lookup: dict[str, str] = {}

    def _register(alias: str, canonical: str) -> None:
        k = _normalize_key(alias)
        if not k:
            return
        lookup[k] = canonical
        if "-" in k:
            lookup[" ".join(k.replace(" - ", "-").split())] = canonical
            lookup[" ".join(k.replace("-", " - ").split())] = canonical
        if " & " in k:
            lookup[k.replace(" & ", " and ")] = canonical
        if " and " in k:
            lookup[k.replace(" and ", " & ")] = canonical

    for std_name, code, fragmented_list in DOMAIN_TAXONOMY_RAW:
        _register(std_name, std_name)
        _register(code, std_name)
        for frag in fragmented_list:
            _register(frag, std_name)

    return lookup


_DOMAIN_LOOKUP: dict[str, str] = _build_domain_lookup()


def standardize_domain(domain: str) -> str:
    """Map any fragmented domain, alias, code, or standardized domain to its canonical name."""
    if not isinstance(domain, str):
        return str(domain or "").strip()
    trimmed = domain.strip()
    if not trimmed:
        return ""
    k = _normalize_key(trimmed)
    if k in _DOMAIN_LOOKUP:
        return _DOMAIN_LOOKUP[k]
    if "-" in k:
        k_no_space = " ".join(k.replace(" - ", "-").split())
        if k_no_space in _DOMAIN_LOOKUP:
            return _DOMAIN_LOOKUP[k_no_space]
        k_with_space = " ".join(k.replace("-", " - ").split())
        if k_with_space in _DOMAIN_LOOKUP:
            return _DOMAIN_LOOKUP[k_with_space]
    if " & " in k and k.replace(" & ", " and ") in _DOMAIN_LOOKUP:
        return _DOMAIN_LOOKUP[k.replace(" & ", " and ")]
    if " and " in k and k.replace(" and ", " & ") in _DOMAIN_LOOKUP:
        return _DOMAIN_LOOKUP[k.replace(" and ", " & ")]
    return trimmed


def standardize_domains(domains: Any) -> list[str]:
    """Standardize a list or string of domains, deduplicating while preserving order."""
    if isinstance(domains, str):
        raw_list = [domains]
    elif isinstance(domains, (list, tuple, set)):
        raw_list = list(domains)
    else:
        return []

    result: list[str] = []
    seen: set[str] = set()
    for d in raw_list:
        std = standardize_domain(str(d or ""))
        if std and std not in seen:
            seen.add(std)
            result.append(std)
    return result


@mcp.tool()
def upload_question_to_reviewer_system(
    question: str,
    state_name: str,
    crop: str,
    details: Dict[str, Any],
    source: str,
    thread_id: str,
    tools_used: Optional[list[str]] = None,
    user_id: Optional[str] = None,
    message_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Pushes a farmer's question to the reviewer system for the Agri team to review.

    Expected Input Schema:
    - question (str): The actual query asked by the user. Must not be empty.
    - state_name (str): State from where the query originated. Must not be empty.
    - crop (str): Name of the crop related to the query. Must not be empty.
    - details (Dict[str, Any]): Strict contextual info. MUST contain exactly:
        {"state": "...", "district": "...", "crop": "...", "season": "...", "domain": [...], "tools_used": [...]}
        Note: The 'domain' field must be a list of domain names, which are automatically standardized
        into the 19 standard agricultural domains before uploading.
    - source (str): Question channel identifier (e.g. AJRASAKHA, WHATSAPP, AJRASAKHA_WEBAPP).
    - thread_id (str): LangGraph conversation id (from x-conversation-id). Injected by the agent, not inferred by the LLM.
    - tools_used (list[str], optional): List of tools used to generate the answer (e.g. ["knowledge_base", "weather", "mandi"]). Empty list for non-agriculture queries.
    - user_id (str, optional): LibreChat user id (from x-user-id). Injected by the agent for AJRASAKHA uploads.
    - message_id (str, optional): LibreChat message id (from x-message-id). Injected by the agent for AJRASAKHA uploads.
    """

    if not isinstance(question, str) or not question.strip():
        return {"status": "error", "status_code": 400, "message": "'question' is required."}

    if not isinstance(state_name, str) or not state_name.strip():
        return {"status": "error", "status_code": 400, "message": "'state_name' is required."}

    if not isinstance(crop, str) or not crop.strip():
        return {"status": "error", "status_code": 400, "message": "'crop' is required."}

    if not isinstance(source, str) or not source.strip():
        return {"status": "error", "status_code": 400, "message": "'source' is required."}

    if not isinstance(thread_id, str) or not thread_id.strip():
        return {"status": "error", "status_code": 400, "message": "'thread_id' is required."}

    normalized_source = source.strip()

    if not isinstance(details, dict):
        return {"status": "error", "status_code": 400, "message": "'details' must be a dictionary."}

    required_keys = ["state", "district", "crop", "season", "domain"]
    # domain is now a list of strings, other fields are strings
    def _is_valid_field(key: str) -> bool:
        if key not in details:
            return False
        val = details[key]
        if key == "domain":
            return isinstance(val, list) and len(val) > 0 and all(isinstance(d, str) and d.strip() for d in val)
        return isinstance(val, str) and val.strip()
    missing = [k for k in required_keys if not _is_valid_field(k)]
    if missing:
        return {
            "status": "error",
            "status_code": 400,
            "message": f"Missing or empty required keys in 'details': {', '.join(missing)}"
        }

    # Standardize domain names into the 19 standard agricultural domains
    standardized_details = dict(details)
    std_domains = standardize_domains(details["domain"])
    standardized_details["domain"] = std_domains if std_domains else [d.strip() for d in details["domain"]]

    payload = {
        "question": question.strip(),
        "state_name": state_name.strip(),
        "crop": crop.strip(),
        "details": standardized_details,
        "source": normalized_source,
        "tools_used": tools_used if tools_used is not None else [],
        "threadId": thread_id.strip(),
    }
    if user_id and str(user_id).strip():
        payload["userId"] = str(user_id).strip()
    if message_id and str(message_id).strip():
        payload["messageId"] = str(message_id).strip()

    headers = {
        "x-internal-api-key": INTERNAL_API_KEY,
        "Content-Type": "application/json"
    }

    log.info(
        "Uploading question to reviewer system: url=%s payload=%s",
        CREATE_QUESTION_URL,
        json.dumps(payload, ensure_ascii=False),
    )

    try:
        response = requests.post(
            CREATE_QUESTION_URL,
            json=payload,
            headers=headers,
            timeout=10
        )
        response.raise_for_status()

        response_data = response.json()
        log.info(
            "Reviewer upload success: status_code=%s response=%s",
            response.status_code,
            json.dumps(response_data, ensure_ascii=False),
        )

        return {
            "status": "success",
            "status_code": response.status_code,
            "data": response_data
        }

    except requests.exceptions.HTTPError:
        log.error("API Error %s: %s | payload=%s", response.status_code, response.text, json.dumps(payload, ensure_ascii=False))
        return {
            "status": "error",
            "status_code": response.status_code,
            "message": response.text
        }

    except requests.exceptions.Timeout:
        log.error("Request timed out to reviewer system | payload=%s", json.dumps(payload, ensure_ascii=False))
        return {
            "status": "error",
            "status_code": 504,
            "message": "Request Timed Out. The reviewer system took too long to respond."
        }

    except requests.exceptions.RequestException as e:
        log.error("Network error: %s | payload=%s", e, json.dumps(payload, ensure_ascii=False))
        return {
            "status": "error",
            "status_code": 500,
            "message": f"Network or Request Error: {str(e)}"
        }


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
