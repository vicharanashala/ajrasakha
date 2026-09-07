#!/usr/bin/env python3
"""Generate domain-classified, angle-wise short-answer summaries from expert Q&A pairs using Anthropic Message Batches.

The script reads approved expert answers from MongoDB, detects the domain for each Q&A
(using an LLM pre-call), then selects 2-6 relevant angles per Q&A from domain-specific
angle lists (via another LLM pre-call). Finally, it submits one strict-summarization
request per angle (with the FULL unmodified answer) to Anthropic's asynchronous
Message Batches API. Each request uses a ``focus_angle`` with its description to guide
the LLM toward the most relevant content without hallucinating.

Each angle produces a REFORMULATED QUESTION plus a 3-4 sentence SUMMARY of
the full expert answer scoped to that angle. The prompt enforces strict source
fidelity (no hallucination, no use of general agricultural knowledge) and
preserves all numerical / technical information exactly as stated.

The generated FFVs include:
- The detected domain (stored in "domain" and "metadata.domain")
- The selected angles with descriptions (stored in "selected_angles" and "metadata.selected_angles")
- The angle description used for this FFV (stored in "metadata.angle_description")

The --from-csv flag supports dry-run mode: pass a CSV with answer_ids and
the script fetches only those Q&As from MongoDB.

Available domains with their specific angles are defined in DOMAIN_ANGLES.

Required environment variables:
  ANTHROPIC_API_KEY  Anthropic API key
  MONGO_URI          MongoDB connection string
  MONGO_DB           Database name (default: agriai)

Optional environment variables:
  CLAUDE_MODEL                  default: claude-sonnet-4-5
  BATCH_POLL_INTERVAL_SECONDS   default: 30
  BATCH_MAX_WAIT_HOURS          default: 24
  BATCH_MAX_REQUESTS            default: 100000
  BATCH_MAX_BYTES               default: 268435456 (256 MiB)
  LOG_LEVEL                     default: INFO
"""
from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import anthropic
from bson import ObjectId
from pymongo import MongoClient


def _load_dotenv(path: str = ".env") -> None:
    """Load KEY=VALUE pairs from a .env file into os.environ (only if not already set).

    Dependency-free subset of python-dotenv. Real exported env vars always win
    over values in .env. Quotes are stripped; blank lines and lines starting
    with ``#`` are ignored.
    """
    try:
        with open(path, "r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except FileNotFoundError:
        pass


_load_dotenv()

CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-5")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
MONGO_URI = os.getenv("MONGO_URI", "")
MONGO_DB = os.getenv("MONGO_DB", "agriai")
QUESTIONS_COLL = "questions"
ANSWERS_COLL = "answers"
FFV_COLL = "ffv_qa_pairs"

BATCH_POLL_INTERVAL_SECONDS = int(os.getenv("BATCH_POLL_INTERVAL_SECONDS", "30"))
BATCH_MAX_WAIT_HOURS = float(os.getenv("BATCH_MAX_WAIT_HOURS", "24"))
BATCH_MAX_REQUESTS = int(os.getenv("BATCH_MAX_REQUESTS", "100000"))
BATCH_MAX_BYTES = int(os.getenv("BATCH_MAX_BYTES", str(256 * 1024 * 1024)))
BATCH_MAX_TOKENS = int(os.getenv("BATCH_MAX_TOKENS_PER_REQUEST", "4000"))
BATCH_TEMPERATURE = float(os.getenv("BATCH_TEMPERATURE", "1.0"))

STATE_FILE = Path(".batch_state.json")
LOG_FILE = "ffv_generation.log"

log = logging.getLogger("generate_ffvs")


def _setup_logging(level: str = "INFO") -> None:
    root = logging.getLogger()
    for h in list(root.handlers):
        root.removeHandler(h)
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.FileHandler(LOG_FILE, mode="a"),
            logging.StreamHandler(sys.stdout),
        ],
    )


# ==============================================================================
# DOMAIN & ANGLE TAXONOMY
# ==============================================================================
# Loaded from domain_angles.py or defined inline:
agricultural_domains = [
    {
        "Domain_Name": "Soil Health and Nutrient Management",
        "Angles": {
            "Soil Testing": "Questions about testing soil to determine nutrient status, pH, salinity or other soil properties and using results for recommendations.",
            "Soil Type": "Questions about suitability, characteristics or management recommendations for different soil types.",
            "Soil Health": "Questions concerning maintaining or improving physical, chemical or biological condition of soil.",
            "Nutrient Requirement": "Questions about the amount or type of nutrients required by a crop.",
            "Nutrient Deficiency": "Identification of nutrient deficiencies based on symptoms and recommendations for correction.",
            "Fertilizer Selection": "Choosing an appropriate fertilizer or fertilizer combination for a crop or situation.",
            "Fertilizer Dose": "Recommended quantity of fertilizer to apply per acre, hectare, plant or other unit.",
            "Fertilizer Source": "Specific fertilizer products or materials used to supply a required nutrient.",
            "Nutrient Role / Function": "Explains the role of a nutrient in plant growth, development, yield or quality.",
            "Application Method": "How fertilizer or nutrient inputs should physically be applied.",
            "Application Timing": "When fertilizer or nutrient inputs should be applied.",
            "Stage-specific Management": "Nutrient management recommendations linked to a particular crop growth stage.",
            "Soil-specific Recommendation": "Nutrient or fertilizer recommendations that change according to soil type or soil condition.",
            "Micronutrient Management": "Management of micronutrients such as zinc, boron, iron, manganese or copper.",
            "Organic Inputs": "Use and management of FYM, compost, vermicompost, green manure and other organic nutrient sources.",
            "Fertilizer Mixing / Compatibility": "Compatibility, sequence or method of mixing different fertilizers or inputs.",
            "Fertilizer Storage": "Proper storage conditions and handling of fertilizers to maintain quality.",
            "Safety & Precautions": "Precautions required during fertilizer handling, application and storage.",
            "Expected Benefits": "Expected crop, soil, yield or economic benefits from a nutrient-management practice."
        }
    },
    {
        "Domain_Name": "Irrigation and Water Management",
        "Angles": {
            "Water Requirement": "Quantity of water required by a crop or plant.",
            "Irrigation Scheduling": "Planning irrigation according to crop, soil, weather and growth stage.",
            "Irrigation Timing": "Appropriate time or interval for irrigation.",
            "Irrigation Method": "Method used to deliver water, such as flood, drip, sprinkler or furrow irrigation.",
            "Critical Irrigation Stages": "Crop growth stages at which adequate water is particularly important.",
            "Water Source": "Suitability or management of available water sources for agriculture.",
            "Water Quality": "Assessment or management of irrigation-water quality, including salinity or other constraints.",
            "Irrigation Dose / Quantity": "Amount of water to apply during an irrigation event.",
            "Irrigation Frequency": "How often irrigation should be carried out.",
            "Drainage": "Removal or management of excess water from agricultural land.",
            "Waterlogging Management": "Prevention, diagnosis and mitigation of excess water accumulation in the root zone.",
            "Drought / Water Stress": "Identification, prevention and management of crop stress caused by inadequate water.",
            "Rainwater Harvesting": "Collection and storage of rainwater for agricultural use.",
            "Expected Benefits": "Expected crop, yield or economic benefits from proper irrigation management."
        }
    },
    {
        "Domain_Name": "Pest and Disease Management",
        "Angles": {
            "Pest Identification": "Identification of an insect, mite, nematode or other arthropod pest affecting a crop.",
            "Pest Symptoms": "Visible damage symptoms caused by a pest.",
            "Pest Biology": "Life cycle, habits and characteristics of the pest.",
            "Pest Survival and Spread": "How a pest survives between seasons and spreads within or between fields.",
            "Monitoring / Scouting": "Methods for regularly observing, detecting and assessing pest populations.",
            "Economic Threshold Level": "Pest population level at which control becomes economically justified.",
            "Prevention": "Practices used to prevent pest establishment or infestation.",
            "Cultural Control": "Crop-management practices used to suppress pest populations.",
            "Mechanical Control": "Physical removal, trapping or destruction of pests.",
            "Biological Control": "Use of predators, parasitoids, pathogens or other biological agents to control pests.",
            "Chemical Control": "Use of insecticides or other chemical products to control pests.",
            "Integrated Pest Management": "Combination of compatible cultural, mechanical, biological and chemical approaches.",
            "Insecticide Selection": "Choosing an appropriate insecticide for a specific pest and crop.",
            "Insecticide Dose": "Recommended concentration or quantity of insecticide.",
            "Application Method": "Method by which the pest-control treatment should be applied.",
            "Application Timing": "Appropriate timing or crop/pest stage for pest-control application.",
            "Resistance Management": "Practices for preventing or managing pest resistance to pesticides.",
            "Safety & Precautions": "Safe handling, application, storage and use precautions for pest-control measures."
        }
    },
    {
        "Domain_Name": "Crop Production and Management",
        "Angles": {
            "Variety / Hybrid Selection": "Selecting a suitable crop variety or hybrid for a location, season or purpose.",
            "Seed Rate / Spacing": "Recommended seed rate, plant spacing or population for a crop.",
            "Sowing / Planting Time": "Appropriate time or window for sowing or transplanting a crop.",
            "Sowing / Planting Method": "Method of sowing or planting, including seedbed preparation.",
            "Land Preparation": "Field preparation practices before sowing or planting.",
            "Crop Rotation": "Sequencing different crops on the same land across seasons.",
            "Intercropping": "Growing two or more crops simultaneously in the same field.",
            "Weed Management": "Identification and control of weeds that compete with the crop.",
            "Mulching": "Use of organic or synthetic mulch materials for moisture, weed or temperature management.",
            "Canopy Management": "Training, pruning or managing crop canopy for better growth and yield.",
            "Growth Monitoring": "Observing and assessing crop growth, development and health.",
            "Expected Yield": "Anticipated harvest quantity from a crop based on variety, management and conditions.",
            "Expected Benefits": "Expected economic or other benefits from a crop-management practice.",
            "Harvesting Time": "Determining the appropriate stage and time for harvesting.",
            "Harvesting Method": "How the crop should be harvested."
        }
    },
    {
        "Domain_Name": "Weather and Climate",
        "Angles": {
            "Weather Forecast": "Predicted weather conditions relevant to agricultural decision-making.",
            "Climate Pattern": "Long-term climate trends or patterns affecting agriculture.",
            "Seasonal Planning": "Agricultural planning based on seasons, monsoon or cropping calendars.",
            "Extreme Weather Events": "Preparation for and management of extreme weather events.",
            "Rainfall Patterns": "Distribution and variability of rainfall affecting crops.",
            "Temperature Effects": "Impact of temperature (heat, cold, frost) on crops.",
            "Climate-smart Agriculture": "Practices that adapt to or mitigate climate change effects.",
            "Microclimate": "Local climate conditions specific to a farm or field.",
            "Expected Benefits": "Expected benefits from following weather-based or climate-smart agricultural practices."
        }
    },
    {
        "Domain_Name": "Harvesting and Post-Harvest",
        "Angles": {
            "Harvesting Time": "Determining the appropriate stage and time for harvesting.",
            "Harvesting Method": "How the crop should be harvested.",
            "Post-Harvest Handling": "Immediate post-harvest care and handling of produce.",
            "Drying": "Methods for drying harvested produce to safe moisture levels.",
            "Storage": "Proper storage conditions and facilities for harvested produce.",
            "Processing": "Transformation of raw produce into processed products.",
            "Value Addition": "Increasing the value of produce through processing or packaging.",
            "Transportation": "Safe transport of harvested produce from field to storage or market.",
            "Quality Assessment": "Methods for assessing the quality of harvested produce.",
            "Shelf Life": "Expected storage life of produce under different conditions.",
            "Loss Reduction": "Practices to minimize post-harvest losses.",
            "Expected Benefits": "Expected economic or quality benefits from proper post-harvest management."
        }
    },
    {
        "Domain_Name": "Marketing and Economics",
        "Angles": {
            "Market Information": "Prices, demand, supply and market trends for agricultural produce.",
            "Market Selection": "Choosing the most suitable market for selling produce.",
            "Value Chain": "Stages and actors involved in getting produce from farm to consumer.",
            "Cost of Cultivation": "Breakdown of costs involved in crop production.",
            "Profitability Analysis": "Assessment of income, expenses and profit from a crop or practice.",
            "Price Forecasting": "Prediction of future prices for agricultural commodities.",
            "Government Procurement": "Procurement schemes and minimum support prices.",
            "Contract Farming": "Formal agreements between farmers and buyers.",
            "Direct Marketing": "Selling produce directly to consumers without intermediaries.",
            "Expected Benefits": "Expected economic benefits from market-related decisions.",
            "Risk Management": "Strategies for managing price, market or production risks.",
            "Insurance": "Agricultural insurance products and their use."
        }
    },
    {
        "Domain_Name": "Government Schemes and Subsidies",
        "Angles": {
            "Scheme Eligibility": "Criteria that determine farmer eligibility for a government scheme.",
            "Scheme Benefits": "Specific benefits, subsidies or support provided under a scheme.",
            "Application Process": "How to apply or register for a government scheme.",
            "Document Required": "Documents needed to apply for a scheme or benefit.",
            "Scheme Coverage": "Geographical or crop coverage of a government scheme.",
            "Scheme Type": "Nature of support: subsidy, loan, insurance, training, etc.",
            "Implementation Agency": "Government body or agency implementing the scheme.",
            "Expected Benefits": "Expected financial or practical benefits from a government scheme.",
            "Timeline": "Important dates, deadlines or duration of scheme implementation.",
            "Status Checking": "How to check the status of an application or claim."
        }
    },
    {
        "Domain_Name": "Organic Farming",
        "Angles": {
            "Organic Certification": "Process and requirements for obtaining organic certification.",
            "Organic Standards": "Rules and regulations for organic production.",
            "Organic Inputs": "Approved organic fertilizers, pesticides and other inputs.",
            "Organic Nutrient Management": "Managing soil fertility using organic methods.",
            "Organic Pest Management": "Managing pests and diseases using organic methods.",
            "Organic Weed Management": "Controlling weeds in organic farming systems.",
            "Conversion Period": "Transition period from conventional to organic farming.",
            "Organic Compost": "Production and use of organic compost.",
            "Biofertilizers": "Use of microbial inoculants and biofertilizers.",
            "Biopesticides": "Use of biological or botanical pest-control products.",
            "Mixed Farming": "Combining crop and livestock production in organic systems.",
            "Expected Benefits": "Expected benefits from organic farming practices."
        }
    },
    {
        "Domain_Name": "Technology and Innovation",
        "Angles": {
            "Precision Agriculture": "Use of GPS, sensors and data for precise farm management.",
            "Drone Technology": "Use of drones for surveying, spraying or monitoring.",
            "Remote Sensing": "Use of satellite or aerial imagery for crop monitoring.",
            "Mobile Applications": "Agricultural information or management delivered through mobile apps.",
            "Internet of Things": "Connected sensors and devices for farm monitoring and automation.",
            "Artificial Intelligence": "AI tools for crop management, prediction or decision support.",
            "Decision Support Systems": "Software tools helping farmers make management decisions.",
            "Mechanization": "Use of machines and equipment for farm operations.",
            "Protected Cultivation": "Greenhouses, polyhouses and other protected growing structures.",
            "Hydroponics / Soilless": "Soilless cultivation methods such as hydroponics or aeroponics.",
            "Vertical Farming": "Multi-layer growing systems, often in controlled environments.",
            "Expected Benefits": "Expected benefits from adopting agricultural technology or innovation."
        }
    },
    {
        "Domain_Name": "Livestock and Animal Husbandry",
        "Angles": {
            "Breed Selection": "Choosing an appropriate breed for a location, purpose or climate.",
            "Feeding and Nutrition": "Feed types, formulations and feeding practices for livestock.",
            "Feeding Schedule": "Timing, frequency and quantity of feeding.",
            "Fodder Management": "Cultivation and management of fodder crops for livestock.",
            "Housing / Shelter": "Design and management of animal shelters.",
            "Health Management": "Prevention, diagnosis and treatment of animal diseases.",
            "Vaccination": "Vaccination schedules and practices for livestock.",
            "Reproduction / Breeding": "Breeding methods, calving/mating management and reproductive health.",
            "Milking Management": "Milking practices, schedules and milk quality management.",
            "Manure Management": "Collection, processing and use of animal manure.",
            "Expected Benefits": "Expected benefits from proper livestock management practices."
        }
    },
    {
        "Domain_Name": "Training and Advisory",
        "Angles": {
            "Training Programme": "Agricultural training programmes available to farmers.",
            "Skill Development": "Development of technical or entrepreneurial agricultural skills.",
            "Advisory Services": "Access to expert agricultural advice and recommendations.",
            "Extension Services": "Agricultural extension activities that transfer knowledge and technologies to farmers.",
            "Expert Consultation": "Seeking guidance or consultation from an agricultural expert.",
            "Demonstration": "Practical demonstration of an agricultural technology or practice.",
            "Awareness": "Information intended to increase awareness about agricultural practices, programmes or risks.",
            "Best Practices": "Recommended or demonstrated practices that improve agricultural outcomes.",
            "Knowledge Resources": "Sources of agricultural information, documentation and learning material."
        }
    },
    {
        "Domain_Name": "Rural Infrastructure",
        "Angles": {
            "Roads": "Rural roads and connectivity relevant to agricultural movement and access.",
            "Farm-to-Market Connectivity": "Infrastructure connecting farms with markets and collection centres.",
            "Warehousing": "Facilities and systems for storing agricultural commodities.",
            "Cold Storage": "Temperature-controlled storage for perishable agricultural produce.",
            "Irrigation Infrastructure": "Physical infrastructure used to provide or distribute irrigation water.",
            "Rural Electricity": "Availability and reliability of electricity for agricultural and rural activities.",
            "Agricultural Markets / Mandis": "Physical market infrastructure for buying and selling agricultural produce.",
            "Collection Centres": "Facilities where produce is aggregated before transport, processing or marketing.",
            "Processing Infrastructure": "Facilities and equipment used for agricultural processing and value addition.",
            "Transport Infrastructure": "Infrastructure supporting movement of inputs, machinery and agricultural produce.",
            "Expected Benefits": "Expected benefits from rural infrastructure development."
        }
    }
]

# Build a flat dict: "Domain Name" -> { "Angle": "description", ... }
DOMAIN_ANGLES: Dict[str, Dict[str, str]] = {
    d["Domain_Name"]: d["Angles"] for d in agricultural_domains
}

DOMAIN_LIST = list(DOMAIN_ANGLES.keys())
DOMAIN_LIST_STR = "\n".join(f"{i+1}. {d}" for i, d in enumerate(DOMAIN_ANGLES))


# ==============================================================================
# PROMPTS
# ==============================================================================

DOMAIN_CLASSIFICATION_PROMPT_TEMPLATE = """You are an agricultural domain-classification assistant.

Given a question and its detailed expert answer below, classify the topic into ONE of the following domains:

{DOMAIN_LIST}

Return ONLY a JSON object with this exact structure, no preamble, no markdown:
{{"domain": "EXACT_DOMAIN_NAME"}}

QUESTION:
{question}

ANSWER:
{answer}"""


ANGLE_SELECTION_PROMPT_TEMPLATE = """You are an agricultural angle-selection assistant.

Given a question, its expert answer, and a domain, select 2-6 angles from the list below that are MOST RELEVANT to the specific content in this answer.

Return ONLY a JSON array of angle names (exact strings from the list), no preamble, no markdown:
{angle_list}

Domain: {domain}

QUESTION:
{question}

ANSWER:
{answer}"""


FFV_GENERATION_PROMPT_TEMPLATE = """You are an agricultural content specialist preparing concise farmer-advisory content for an Indian agri-bot.

Given a detailed expert Q&A pair, generate ONE farmer-friendly answer focused exclusively on the angle described below.

ANGLE: {angle}
ANGLE DESCRIPTION: {angle_description}

REQUIREMENTS:
- Write 3-4 sentences only
- Answer should be 150-300 words
- Use simple, clear English understandable to a farmer
- Second-person address ("you", "your")
- Stay focused ONLY on the specified angle
- DO NOT add information not present in the expert answer
- DO NOT use general agricultural knowledge beyond what's in the answer
- Preserve all numbers, doses, timings exactly as stated

QUESTION:
{question}

DETAILED EXPERT ANSWER:
{answer}

Return ONLY this JSON, no preamble, no markdown:
{{"question": "...", "answer": "..."}}"""


# ==============================================================================
# UTILITIES
# ==============================================================================

def _parse_json_fences(raw: str) -> str:
    """Strip markdown fences from a JSON string."""
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.splitlines()
        raw = "\n".join(lines[1:-1] if lines[-1].strip().startswith("```") else lines[1:])
    return raw


def parse_json_or_raise(raw: str) -> dict:
    """Parse JSON, stripping fences first; raise ValueError on failure."""
    try:
        return json.loads(_parse_json_fences(raw))
    except json.JSONDecodeError as exc:
        raise ValueError(f"JSON parse error: {exc}\nRaw: {raw[:500]}")


def format_angle_list_for_prompt(domain: str) -> str:
    """Return a formatted list of angles for a given domain."""
    angles = DOMAIN_ANGLES.get(domain, {})
    if not angles:
        return "[]"
    return "\n".join(f'- "{name}": {desc}' for name, desc in angles.items())


# ==============================================================================
# MONGODB
# ==============================================================================

def build_client() -> MongoClient:
    """Build MongoDB client, validating credentials."""
    if not MONGO_URI:
        raise ValueError(
            "MONGO_URI environment variable is not set. "
            "Copy .env.example to .env and fill in your MongoDB connection string."
        )
    if not ANTHROPIC_API_KEY:
        raise ValueError(
            "ANTHROPIC_API_KEY environment variable is not set. "
            "Copy .env.example to .env and fill in your Anthropic API key."
        )
    return MongoClient(MONGO_URI, serverSelectionTimeoutMS=10000)


def fetch_random_approved(
    mongo_client: MongoClient,
    limit: int,
    state: Optional[Dict] = None,
) -> List[Tuple[dict, dict]]:
    """Fetch random approved Q&A pairs from MongoDB.

    If ``state`` has "skipped_ids", those are excluded (ids already processed
    in a previous run).
    """
    db = mongo_client[MONGO_DB]
    questions_col = db[QUESTIONS_COLL]
    answers_col = db[ANSWERS_COLL]

    skipped_ids = set(ObjectId(oid) for oid in state.get("skipped_ids", [])) if state else set()

    pipeline = [
        {"$match": {
            "approval_status": "approved",
            "detailed_answer": {"$exists": True, "$ne": ""},
            "is_active": True,
            "_id": {"$nin": list(skipped_ids)} if skipped_ids else {"$exists": True},
        }},
        {"$sample": {"size": limit}},
    ]

    pairs = []
    for a_doc in answers_col.aggregate(pipeline):
        q_doc = questions_col.find_one({"_id": a_doc.get("question_id")})
        if not q_doc:
            continue
        pairs.append((q_doc, a_doc))

    log.info("Fetched %d random approved Q&A pairs (skipped %d)", len(pairs), len(skipped_ids))
    return pairs


def fetch_from_csv(csv_path: str, mongo_client: MongoClient) -> List[Tuple[dict, dict]]:
    """Fetch Q&A pairs where answer_id appears in a CSV file."""
    db = mongo_client[MONGO_DB]
    questions_col = db[QUESTIONS_COLL]
    answers_col = db[ANSWERS_COLL]

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        answer_ids = [row["answer_id"].strip() for row in reader if row.get("answer_id")]

    log.info("CSV contains %d answer_ids", len(answer_ids))

    pairs = []
    for aid_str in answer_ids:
        try:
            a_doc = answers_col.find_one({"_id": ObjectId(aid_str)})
        except Exception:
            continue
        if not a_doc:
            continue
        q_doc = questions_col.find_one({"_id": a_doc.get("question_id")})
        if not q_doc:
            continue
        pairs.append((q_doc, a_doc))

    log.info("Resolved %d Q&A pairs from CSV", len(pairs))
    return pairs


def save_skipped_ids(state: Dict, answer_ids: List[str]) -> None:
    """Update skipped_ids in state and persist to disk."""
    existing = set(state.get("skipped_ids", []))
    existing.update(answer_ids)
    state["skipped_ids"] = list(existing)
    STATE_FILE.write_text(json.dumps(state, indent=2))


# ==============================================================================
# LLM CALLS
# ==============================================================================

def build_anthropic_client() -> anthropic.Anthropic:
    if not ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY not set")
    return anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


def classify_domain(
    client: anthropic.Anthropic,
    question: str,
    answer: str,
) -> str:
    """Classify a Q&A pair into one of the defined domains."""
    prompt = DOMAIN_CLASSIFICATION_PROMPT_TEMPLATE.format(
        DOMAIN_LIST=DOMAIN_LIST_STR,
        question=question[:500],
        answer=answer[:2000],
    )
    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=256,
        temperature=0.0,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = response.content[0].text.strip()
    try:
        obj = parse_json_or_raise(raw)
        domain = obj.get("domain", "").strip()
        # Validate domain is in our list
        if domain not in DOMAIN_ANGLES:
            # Try fuzzy match
            for known in DOMAIN_ANGLES:
                if known.lower() in domain.lower() or domain.lower() in known.lower():
                    domain = known
                    break
            else:
                log.warning("Unknown domain '%s', using first domain", domain)
                domain = DOMAIN_LIST[0]
        return domain
    except (ValueError, KeyError) as exc:
        log.warning("Domain classification failed: %s. Raw: %s", exc, raw[:200])
        return DOMAIN_LIST[0]


def select_angles(
    client: anthropic.Anthropic,
    domain: str,
    question: str,
    answer: str,
    max_angles: int = 6,
) -> List[str]:
    """Select 2-max_angles relevant angles for a Q&A pair within a domain."""
    angle_list = format_angle_list_for_prompt(domain)
    prompt = ANGLE_SELECTION_PROMPT_TEMPLATE.format(
        angle_list=angle_list,
        domain=domain,
        question=question[:500],
        answer=answer[:2000],
    )
    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=512,
        temperature=0.0,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = response.content[0].text.strip()
    try:
        obj = parse_json_or_raise(raw)
        if isinstance(obj, list):
            angles = obj
        elif isinstance(obj, dict) and "angles" in obj:
            angles = obj["angles"]
        else:
            raise ValueError(f"Unexpected angle selection format: {raw[:200]}")
        # Validate angles exist in domain
        valid_angles = list(DOMAIN_ANGLES.get(domain, {}).keys())
        selected = [a for a in angles if a in valid_angles][:max_angles]
        if not selected:
            # Fallback: return first 2 angles
            selected = valid_angles[:2]
            log.warning("No valid angles selected, using defaults: %s", selected)
        return selected
    except (ValueError, KeyError) as exc:
        log.warning("Angle selection failed: %s. Raw: %s", exc, raw[:200])
        return list(DOMAIN_ANGLES.get(domain, {}).keys())[:2]


def generate_ffv_for_angle(
    client: anthropic.Anthropic,
    question: str,
    answer: str,
    angle: str,
    angle_description: str,
) -> Optional[dict]:
    """Generate a single FFV for one angle."""
    prompt = FFV_GENERATION_PROMPT_TEMPLATE.format(
        angle=angle,
        angle_description=angle_description,
        question=question,
        answer=answer,
    )
    try:
        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=BATCH_MAX_TOKENS,
            temperature=BATCH_TEMPERATURE,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()
        ffv = parse_json_or_raise(raw)
        # Basic validation
        if not ffv.get("question") or not ffv.get("answer"):
            raise ValueError("Missing question or answer in FFV")
        return ffv
    except Exception as exc:
        log.warning("FFV generation failed for angle '%s': %s", angle, exc)
        return None


# ==============================================================================
# BATCH PROCESSING
# ==============================================================================

def classify_and_select_angles_for_pairs(
    client: anthropic.Anthropic,
    pairs: List[Tuple[dict, dict]],
) -> Tuple[List[Tuple[dict, dict]], Dict[int, str], Dict[int, List[str]]]:
    """Classify domains and select angles for all pairs.

    Returns:
        eligible: pairs that were successfully classified
        pair_domains: {pair_index: domain}
        pair_angles: {pair_index: [angle1, angle2, ...]}
    """
    eligible = []
    pair_domains: Dict[int, str] = {}
    pair_angles: Dict[int, List[str]] = {}

    for idx, (q_doc, a_doc) in enumerate(pairs):
        question = q_doc.get("question_text", "")
        answer = a_doc.get("detailed_answer", "")

        if not question or not answer:
            log.warning("Skipping pair %d: missing question or answer", idx)
            continue

        try:
            domain = classify_domain(client, question, answer)
            angles = select_angles(client, domain, question, answer)

            eligible.append((q_doc, a_doc))
            pair_idx = len(eligible) - 1
            pair_domains[pair_idx] = domain
            pair_angles[pair_idx] = angles

            log.info("Pair %d: domain=%s, angles=%s", pair_idx, domain, angles)
        except Exception as exc:
            log.error("Classification failed for pair %d: %s", idx, exc)

    log.info(
        "Classification complete: %d/%d eligible (%.1f%%)",
        len(eligible), len(pairs),
        100 * len(eligible) / len(pairs) if pairs else 0,
    )
    return eligible, pair_domains, pair_angles


def build_batch_requests(
    eligible: List[Tuple[dict, dict]],
    pair_angles: Dict[int, List[str]],
    pair_domains: Dict[int, str],
) -> Tuple[List[dict], Dict[str, Tuple[int, int, int, str]]]:
    """Build Anthropic Message Batch requests for all eligible pairs+angles.

    Returns:
        requests: list of request dicts for Message Batches API
        request_map: {custom_id: (pair_index, angle_idx, total_angles, angle)}
    """
    requests = []
    request_map: Dict[str, Tuple[int, int, int, str]] = {}

    for pair_idx, (q_doc, a_doc) in enumerate(eligible):
        if pair_idx not in pair_angles:
            continue

        question = q_doc.get("question_text", "")
        answer = a_doc.get("detailed_answer", "")
        domain = pair_domains.get(pair_idx, "Unknown")
        angles = pair_angles[pair_idx]
        total_angles = len(angles)
        angle_descriptions = DOMAIN_ANGLES.get(domain, {})

        for angle_idx, angle in enumerate(angles):
            angle_desc = angle_descriptions.get(angle, "")
            custom_id = f"answer-p{pair_idx}-angle-{angle_idx}-of-{total_angles}"

            prompt = FFV_GENERATION_PROMPT_TEMPLATE.format(
                angle=angle,
                angle_description=angle_desc,
                question=question,
                answer=answer,
            )

            request = {
                "custom_id": custom_id,
                "params": {
                    "model": CLAUDE_MODEL,
                    "max_tokens": BATCH_MAX_TOKENS,
                    "temperature": BATCH_TEMPERATURE,
                    "messages": [{"role": "user", "content": prompt}],
                },
            }
            requests.append(request)
            request_map[custom_id] = (pair_idx, angle_idx, total_angles, angle)

    log.info("Built %d batch requests for %d pairs", len(requests), len(eligible))
    return requests, request_map


def submit_batch(
    client: anthropic.Anthropic,
    requests: List[dict],
    request_map: Dict[str, Tuple[int, int, int, str]],
    tag: Optional[str] = None,
) -> str:
    """Submit requests to Anthropic Message Batches API."""
    if not requests:
        raise ValueError("No requests to submit")

    tag = tag or f"ffv-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"
    log.info("Submitting batch with %d requests (tag=%s)", len(requests), tag)

    batch = client.messages.batches.create(
        model=CLAUDE_MODEL,
        requests=requests,
        metadata={"tag": tag},
    )
    batch_id = batch.id
    log.info("Batch submitted: id=%s", batch_id)

    # Save state
    state = {
        "batch_id": batch_id,
        "tag": tag,
        "request_map": {k: list(v) for k, v in request_map.items()},
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    }
    STATE_FILE.write_text(json.dumps(state, indent=2))
    log.info("State saved to %s", STATE_FILE)

    return batch_id


def poll_batch(
    client: anthropic.Anthropic,
    batch_id: str,
    poll_interval: int = BATCH_POLL_INTERVAL_SECONDS,
    max_wait_hours: float = BATCH_MAX_WAIT_HOURS,
) -> None:
    """Poll until batch is complete or timed out."""
    start_time = time.time()
    max_wait_s = max_wait_hours * 3600

    while True:
        elapsed = time.time() - start_time
        if elapsed > max_wait_s:
            raise TimeoutError(f"Batch {batch_id} exceeded max wait time of {max_wait_hours}h")

        batch = client.messages.batches.retrieve(batch_id)
        status = batch.status
        log.info("Batch %s status: %s (elapsed %.1fs)", batch_id, status, elapsed)

        if status == "ended":
            log.info("Batch %s completed successfully!", batch_id)
            return
        elif status == "failed":
            err_msg = getattr(batch, "error", {}) or {}
            raise RuntimeError(f"Batch {batch_id} failed: {err_msg}")
        elif status == "expired":
            raise RuntimeError(f"Batch {batch_id} expired before completion")

        time.sleep(poll_interval)


def collect_results(
    client: anthropic.Anthropic,
    batch_id: str,
    request_map: Dict[str, Tuple[int, int, int, str]],
    expected_pairs: int,
) -> Tuple[Dict[int, List[Optional[dict]]], Dict[int, List[str]]]:
    """Collect results from a completed batch.

    Returns:
        grouped: {pair_idx: [ffv_or_None for each angle]}
        errors: {pair_idx: [error_message_strings]}
    """
    grouped: Dict[int, List[Optional[dict]]] = {i: [] for i in range(expected_pairs)}
    errors: Dict[int, List[str]] = {i: [] for i in range(expected_pairs)}

    # Count total requests
    total_requests = len(request_map)
    results_retrieved = 0

    for result in client.messages.batches.list_results(batch_id, limit=100):
        results_retrieved += 1
        custom_id = result.custom_id
        if custom_id not in request_map:
            log.warning("Unknown custom_id: %s", custom_id)
            continue

        pair_idx, angle_idx, total_angles, angle = request_map[custom_id]

        if result.type == "succeeded":
            try:
                raw = result.content[0].text
                ffv = parse_json_or_raise(raw)
                if not ffv.get("question") or not ffv.get("answer"):
                    raise ValueError("Missing question or answer")
                grouped[pair_idx].append(ffv)
            except Exception as exc:
                log.error("Parse error for %s: %s", custom_id, exc)
                grouped[pair_idx].append(None)
                errors[pair_idx].append(f"angle '{angle}': parse error - {exc}")
        else:
            err_msg = getattr(result, "error", {}) or "Unknown error"
            log.error("Request %s failed: %s", custom_id, err_msg)
            grouped[pair_idx].append(None)
            errors[pair_idx].append(f"angle '{angle}': {err_msg}")

        log.debug(
            "Progress: %d/%d results (pair_idx=%d, angle=%s)",
            results_retrieved, total_requests, pair_idx, angle,
        )

    # Verify all angles accounted for
    for pair_idx, ffv_list in grouped.items():
        total_angles = len(request_map.get(f"answer-p{pair_idx}-angle-0-of-{len(ffv_list) if ffv_list else '?'}", [None, None, None, None]))
        if len(ffv_list) != total_angles:
            log.warning("Pair %d: expected %d FFVs, got %d", pair_idx, total_angles, len(ffv_list))

    return grouped, errors


def build_ffv_documents(
    q_doc: dict,
    a_doc: dict,
    ffv_list: List[dict],
    selected_angles: List[str],
    domain: str,
) -> List[dict]:
    """Build FFV MongoDB documents from Q&A and generated FFVs."""
    docs = []
    created_at = datetime.now(timezone.utc)
    parent_id = a_doc["_id"]

    for ffv, angle in zip(ffv_list, selected_angles):
        if not ffv:
            continue

        doc = {
            "parent_question_id": q_doc["_id"],
            "parent_answer_id": parent_id,
            "question": ffv.get("question", ""),
            "answer": ffv.get("answer", ""),
            "domain": domain,
            "angle": angle,
            "metadata": {
                "domain": domain,
                "angle": angle,
                "selected_angles": selected_angles,
                "created_at": created_at.isoformat(),
                "source_question_id": str(q_doc["_id"]),
                "source_answer_id": str(parent_id),
            },
            "is_active": True,
            "created_at": created_at,
        }
        docs.append(doc)

    return docs


def export_samples(
    csv_path: str,
    eligible: List[Tuple[dict, dict]],
    grouped: Dict[int, List[Optional[dict]]],
    errors: Dict[int, List[str]],
    pair_angles: Dict[int, List[str]],
    pair_domains: Dict[int, str],
) -> None:
    """Export a sample of results to CSV for inspection."""
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "answer_id", "domain", "angle",
            "ffv_question", "ffv_answer", "error"
        ])

        for idx, (q_doc, a_doc) in enumerate(eligible):
            domain = pair_domains.get(idx, "Unknown")
            angles = pair_angles.get(idx, [])
            ffvs = grouped.get(idx, [])
            errs = errors.get(idx, [])

            for angle, ffv in zip(angles, ffvs):
                error = ""
                if not ffv:
                    error = errs[angles.index(angle)] if angles.index(angle) < len(errs) else "Unknown error"

                writer.writerow([
                    str(a_doc["_id"]),
                    domain,
                    angle,
                    ffv.get("question", "") if ffv else "",
                    ffv.get("answer", "") if ffv else "",
                    error,
                ])

    log.info("Exported %d rows to %s", sum(len(grouped.get(i, [])) for i in range(len(eligible))), csv_path)


# ==============================================================================
# MAIN
# ==============================================================================

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate domain-classified, angle-wise FFVs using Anthropic Claude."
    )
    parser.add_argument(
        "--limit", type=int, default=10,
        help="Number of random approved answers to sample (default 10)"
    )
    parser.add_argument(
        "--from-csv", metavar="CSV",
        help="Instead of random sampling, read answer_ids from a CSV file"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Classify and select angles but do NOT write to MongoDB"
    )
    parser.add_argument(
        "--export", metavar="CSV",
        help="Export results to CSV file"
    )
    parser.add_argument(
        "--batch-tag", metavar="TAG",
        help="Custom tag for the Anthropic batch job"
    )
    parser.add_argument(
        "--resume-batch-id", metavar="BATCH_ID",
        help="Resume from an existing batch ID instead of creating a new one"
    )
    parser.add_argument(
        "--poll-interval", type=int, default=BATCH_POLL_INTERVAL_SECONDS,
        help=f"Poll interval in seconds (default {BATCH_POLL_INTERVAL_SECONDS})"
    )
    parser.add_argument(
        "--max-wait-hours", type=float, default=BATCH_MAX_WAIT_HOURS,
        help=f"Max wait time in hours (default {BATCH_MAX_WAIT_HOURS})"
    )
    parser.add_argument(
        "--log-level", default=None,
        help=f"Log level (default: INFO or LOG_LEVEL env var)"
    )
    args = parser.parse_args()

    _setup_logging(args.log_level or os.getenv("LOG_LEVEL", "INFO"))

    log.info("=" * 72)
    log.info("FFV GENERATION PIPELINE")
    log.info("=" * 72)

    mongo_client = build_client()

    try:
        # 1. Load or fetch Q&A pairs
        if args.from_csv:
            pairs = fetch_from_csv(args.from_csv, mongo_client)
        else:
            pairs = fetch_random_approved(mongo_client, args.limit)

        if not pairs:
            log.error("No Q&A pairs found")
            return 1

        # 2. Classify domains and select angles (using LLM)
        log.info("Step 1: Domain classification and angle selection...")
        claude_client = build_anthropic_client()
        eligible, pair_domains, pair_angles = classify_and_select_angles_for_pairs(
            claude_client, pairs
        )

        if not eligible:
            log.error("No pairs successfully classified")
            return 1

        # Log stats
        angle_counts = [len(pair_angles.get(i, [])) for i in range(len(eligible))]
        avg_angles = sum(angle_counts) / len(angle_counts) if angle_counts else 0
        domains_count: Dict[str, int] = {}
        for idx, domain in pair_domains.items():
            domains_count[domain] = domains_count.get(domain, 0) + 1

        log.info("Average angles/pair: %.1f", avg_angles)
        log.info("Domain distribution: %s", domains_count)

        # 3. Build and submit batch
        requests, request_map = build_batch_requests(
            eligible,
            pair_angles=pair_angles,
            pair_domains=pair_domains
        )

        batch_id = args.resume_batch_id
        if batch_id:
            state = json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {}
            if state.get("batch_id") != batch_id:
                raise RuntimeError("--resume-batch-id does not match .batch_state.json")
            # Reconstruct request_map by parsing each custom_id of the form
            # ``answer-p{pair_index}-angle-{angle_idx}-of-{total_angles}``.
            # Restore full request_map including focus_angle from state file
            request_map_raw = state.get("request_map", {})
            request_map: Dict[str, Tuple[int, int, int, str]] = {}
            for custom_id, values in request_map_raw.items():
                try:
                    request_map[custom_id] = tuple(values)  # (pair_index, angle_idx, total_angles, focus_angle)
                except (TypeError, ValueError):
                    log.warning("Skipping malformed request_map entry for custom_id=%s", custom_id)
            log.info("Resuming batch %s with %d requests", batch_id, len(request_map))
        else:
            batch_id = submit_batch(claude_client, requests, request_map, args.batch_tag)
            poll_batch(claude_client, batch_id, args.poll_interval, args.max_wait_hours)

        # 4. Collect results
        grouped, errors = collect_results(claude_client, batch_id, request_map, len(eligible))

        # 5. Build FFV documents and optionally write to MongoDB
        ffv_coll = mongo_client[MONGO_DB][FFV_COLL]
        success = failed = 0
        failed_ids = []

        for index, (q_doc, a_doc) in enumerate(eligible):
            if index in errors:
                failed += 1
                failed_ids.append(str(a_doc["_id"]))
                log.error("FAILED answer_id=%s: %s", a_doc["_id"], "; ".join(errors.get(index, [])))
                continue

            ffv_list = grouped.get(index, [])
            if not ffv_list:
                failed += 1
                failed_ids.append(str(a_doc["_id"]))
                log.error("FAILED answer_id=%s: no FFVs returned", a_doc["_id"])
                continue

            docs = build_ffv_documents(
                q_doc, a_doc, ffv_list,
                selected_angles=pair_angles.get(index, []),
                domain=pair_domains.get(index)
            )

            if args.dry_run:
                log.info(
                    "DRY-RUN answer_id=%s (domain=%s, angles=%s): would insert %d angle-wise FFVs",
                    a_doc["_id"], pair_domains.get(index), pair_angles.get(index, []), len(docs)
                )
            else:
                # Archive old active FFVs for this answer
                ffv_coll.update_many(
                    {"parent_answer_id": a_doc["_id"], "is_active": True},
                    {"$set": {"is_active": False, "archived_at": datetime.now(timezone.utc)}}
                )
                ffv_coll.insert_many(docs)
                log.info(
                    "Inserted %d angle-wise FFVs for answer_id=%s (domain=%s, angles=%s)",
                    len(docs), a_doc["_id"], pair_domains.get(index), pair_angles.get(index, [])
                )
            success += 1

        # 6. Save failed IDs for retry
        if failed_ids:
            Path("failed_qa_ids.json").write_text(json.dumps(failed_ids, indent=2))
            log.info("Saved %d failed IDs to failed_qa_ids.json", len(failed_ids))

        # 7. Export to CSV if requested
        if args.export:
            export_samples(
                args.export, eligible, grouped, errors,
                pair_angles=pair_angles, pair_domains=pair_domains
            )

        # 8. Log cost and timing summary
        batch = claude_client.messages.batches.retrieve(batch_id)
        processing_time = time.time()

        log.info("")
        log.info("=" * 72)
        log.info("PIPELINE COMPLETE")
        log.info("=" * 72)
        log.info("Batch ID:            %s", batch_id)
        log.info("Tag:                 %s", getattr(batch, "tag", "N/A"))
        log.info("Total pairs:         %d", len(pairs))
        log.info("Eligible pairs:      %d", len(eligible))
        log.info("Successful pairs:    %d", success)
        log.info("Failed pairs:        %d", failed)
        log.info("Total FFVs generated: %d", sum(len(v) for v in grouped.values()))
        log.info("=" * 72)

        return 0 if failed == 0 else 1

    except Exception as exc:
        log.error("Pipeline failed: %s", exc)
        import traceback
        log.error(traceback.format_exc())
        return 2
    finally:
        mongo_client.close()


if __name__ == "__main__":
    sys.exit(main())