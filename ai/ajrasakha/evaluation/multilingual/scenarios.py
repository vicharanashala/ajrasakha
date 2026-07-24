"""30 canonical farming scenarios for the AjraSakha Multilingual Testing Suite.

These are the language-agnostic seed records. The case generator expands each
scenario × 6 languages = 180 executable test cases.

Design rules
------------
- Each scenario has a stable ID (S01–S30) that never changes.
- Queries are in English; the case generator adapts location per language.
- Scenarios marked stable=False involve live dynamic data (weather, market).
  They are excluded from the --stable-only CI gate in live mode, but mock
  mode always runs them using fixture responses.
- terminology_seeds are English agri-terms expected in the response. The
  terminology validator checks their presence (case-insensitive).
- expected_2hr_disclaimer: True for GDB/knowledge_base queries (expert review
  goes through the 2-hour SLA queue).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class Scenario:
    """Canonical farming scenario — language-agnostic seed record."""
    id: str                     # e.g. "S01"
    name: str                   # snake_case identifier
    domain: str                 # Canonical domain from agents/domains.py
    query: str                  # English query text
    location: Optional[dict]    # {city, state} or None
    expected_tools: tuple[str, ...]
    expected_nodes: tuple[str, ...]
    expected_plan: dict
    terminology_seeds: tuple[str, ...]  # Agri terms expected in response
    disclaimer_2hr_required: bool
    stable: bool                # False = live dynamic data involved


SCENARIOS: list[Scenario] = [
    # ── Cultural Practices ─────────────────────────────────────────────────
    Scenario(
        id="S01",
        name="paddy_cultural_practices",
        domain="Cultural Practices",
        query="How do I grow paddy in Punjab? What are the main cultivation steps?",
        location={"city": "Ropar", "state": "Punjab"},
        expected_tools=("upload_question_to_reviewer_system", "gdb"),
        expected_nodes=("planner", "execute_plan", "retrieval_sanitizer",
                        "assemble_answer_body", "translate_answer"),
        expected_plan={"knowledge_base": True, "state": "Punjab", "crop": "Paddy", "is_complete": True},
        terminology_seeds=("paddy", "cultivation", "transplanting", "nursery"),
        disclaimer_2hr_required=True,
        stable=True,
    ),
    # ── Plant Protection ───────────────────────────────────────────────────
    Scenario(
        id="S02",
        name="wheat_pest_yellow_rust",
        domain="Plant Protection",
        query="How do I treat yellow rust disease in wheat in Haryana?",
        location={"city": "Karnal", "state": "Haryana"},
        expected_tools=("upload_question_to_reviewer_system", "gdb"),
        expected_nodes=("planner", "execute_plan", "retrieval_sanitizer",
                        "assemble_answer_body", "translate_answer"),
        expected_plan={"knowledge_base": True, "state": "Haryana", "crop": "Wheat", "is_complete": True},
        terminology_seeds=("yellow rust", "fungicide", "wheat"),
        disclaimer_2hr_required=True,
        stable=True,
    ),
    # ── Nutrient Management ────────────────────────────────────────────────
    Scenario(
        id="S03",
        name="rice_nutrient_mgmt",
        domain="Nutrient Management",
        query="What is the recommended fertilizer dose for rice in Andhra Pradesh?",
        location={"city": "Guntur", "state": "Andhra Pradesh"},
        expected_tools=("upload_question_to_reviewer_system", "gdb"),
        expected_nodes=("planner", "execute_plan", "retrieval_sanitizer",
                        "assemble_answer_body", "translate_answer"),
        expected_plan={"knowledge_base": True, "state": "Andhra Pradesh", "crop": "Paddy", "is_complete": True},
        terminology_seeds=("nitrogen", "fertilizer", "rice"),
        disclaimer_2hr_required=True,
        stable=True,
    ),
    # ── Varieties ──────────────────────────────────────────────────────────
    Scenario(
        id="S04",
        name="cotton_variety_selection",
        domain="Varieties",
        query="Which cotton varieties are best suited for Maharashtra?",
        location={"city": "Nagpur", "state": "Maharashtra"},
        expected_tools=("upload_question_to_reviewer_system", "gdb"),
        expected_nodes=("planner", "execute_plan", "retrieval_sanitizer",
                        "assemble_answer_body", "translate_answer"),
        expected_plan={"knowledge_base": True, "state": "Maharashtra", "crop": "Cotton", "is_complete": True},
        terminology_seeds=("cotton", "variety", "hybrid"),
        disclaimer_2hr_required=True,
        stable=True,
    ),
    # ── Water Management ───────────────────────────────────────────────────
    Scenario(
        id="S05",
        name="sugarcane_water_mgmt",
        domain="Water Management",
        query="What is the irrigation schedule for sugarcane in Tamil Nadu?",
        location={"city": "Coimbatore", "state": "Tamil Nadu"},
        expected_tools=("upload_question_to_reviewer_system", "gdb"),
        expected_nodes=("planner", "execute_plan", "retrieval_sanitizer",
                        "assemble_answer_body", "translate_answer"),
        expected_plan={"knowledge_base": True, "state": "Tamil Nadu", "crop": "Sugarcane", "is_complete": True},
        terminology_seeds=("sugarcane", "irrigation", "water"),
        disclaimer_2hr_required=True,
        stable=True,
    ),
    # ── Organic Farming ────────────────────────────────────────────────────
    Scenario(
        id="S06",
        name="tomato_organic_farming",
        domain="Organic Farming",
        query="How to grow tomatoes using organic methods in Karnataka?",
        location={"city": "Mysuru", "state": "Karnataka"},
        expected_tools=("upload_question_to_reviewer_system", "gdb"),
        expected_nodes=("planner", "execute_plan", "retrieval_sanitizer",
                        "assemble_answer_body", "translate_answer"),
        expected_plan={"knowledge_base": True, "state": "Karnataka", "crop": "Tomato", "is_complete": True},
        terminology_seeds=("tomato", "organic", "compost"),
        disclaimer_2hr_required=True,
        stable=True,
    ),
    # ── Seeds ──────────────────────────────────────────────────────────────
    Scenario(
        id="S07",
        name="mustard_seed_treatment",
        domain="Seeds",
        query="What is the seed treatment procedure for mustard in Rajasthan?",
        location={"city": "Jaipur", "state": "Rajasthan"},
        expected_tools=("upload_question_to_reviewer_system", "gdb"),
        expected_nodes=("planner", "execute_plan", "retrieval_sanitizer",
                        "assemble_answer_body", "translate_answer"),
        expected_plan={"knowledge_base": True, "state": "Rajasthan", "crop": "Mustard", "is_complete": True},
        terminology_seeds=("mustard", "seed treatment", "fungicide"),
        disclaimer_2hr_required=True,
        stable=True,
    ),
    # ── Post Harvest Preservation ──────────────────────────────────────────
    Scenario(
        id="S08",
        name="mango_postharvest",
        domain="Post Harvest Preservation",
        query="How do I store mangoes after harvest to keep them fresh longer?",
        location={"city": "Guntur", "state": "Andhra Pradesh"},
        expected_tools=("upload_question_to_reviewer_system", "gdb"),
        expected_nodes=("planner", "execute_plan", "retrieval_sanitizer",
                        "assemble_answer_body", "translate_answer"),
        expected_plan={"knowledge_base": True, "state": "Andhra Pradesh", "crop": "Mango", "is_complete": True},
        terminology_seeds=("mango", "storage", "post-harvest"),
        disclaimer_2hr_required=True,
        stable=True,
    ),
    # ── Field Preparation ──────────────────────────────────────────────────
    Scenario(
        id="S09",
        name="banana_field_prep",
        domain="Field Preparation",
        query="How should I prepare the field before planting banana in Tamil Nadu?",
        location={"city": "Trichy", "state": "Tamil Nadu"},
        expected_tools=("upload_question_to_reviewer_system", "gdb"),
        expected_nodes=("planner", "execute_plan", "retrieval_sanitizer",
                        "assemble_answer_body", "translate_answer"),
        expected_plan={"knowledge_base": True, "state": "Tamil Nadu", "crop": "Banana", "is_complete": True},
        terminology_seeds=("banana", "field preparation", "ploughing"),
        disclaimer_2hr_required=True,
        stable=True,
    ),
    # ── Weed Management ────────────────────────────────────────────────────
    Scenario(
        id="S10",
        name="maize_weed_mgmt",
        domain="Weed Management",
        query="What are the best methods for weed control in maize in Madhya Pradesh?",
        location={"city": "Indore", "state": "Madhya Pradesh"},
        expected_tools=("upload_question_to_reviewer_system", "gdb"),
        expected_nodes=("planner", "execute_plan", "retrieval_sanitizer",
                        "assemble_answer_body", "translate_answer"),
        expected_plan={"knowledge_base": True, "state": "Madhya Pradesh", "crop": "Maize", "is_complete": True},
        terminology_seeds=("maize", "weed", "herbicide"),
        disclaimer_2hr_required=True,
        stable=True,
    ),
    # ── Market Prices (dynamic — stable=False) ─────────────────────────────
    Scenario(
        id="S11",
        name="wheat_market_price",
        domain="Market Prices",
        query="What is the price of wheat in Sirsa mandi, Haryana today?",
        location={"city": "Sirsa", "state": "Haryana"},
        expected_tools=("upload_question_to_reviewer_system", "market"),
        expected_nodes=("planner", "execute_plan", "assemble_answer_body", "translate_answer"),
        expected_plan={"mandi": True, "state": "Haryana", "crop": "Wheat", "is_complete": True},
        terminology_seeds=("wheat", "mandi", "price"),
        disclaimer_2hr_required=False,
        stable=False,
    ),
    Scenario(
        id="S12",
        name="paddy_market_karnal",
        domain="Market Prices",
        query="What is the current price of paddy in Karnal mandi, Haryana?",
        location={"city": "Karnal", "state": "Haryana"},
        expected_tools=("upload_question_to_reviewer_system", "market"),
        expected_nodes=("planner", "execute_plan", "assemble_answer_body", "translate_answer"),
        expected_plan={"mandi": True, "state": "Haryana", "crop": "Paddy", "is_complete": True},
        terminology_seeds=("paddy", "mandi", "price"),
        disclaimer_2hr_required=False,
        stable=False,
    ),
    # ── Government Schemes ─────────────────────────────────────────────────
    Scenario(
        id="S13",
        name="drip_irrigation_scheme",
        domain="Government Schemes",
        query="How can I get a government subsidy for drip irrigation in Rajasthan?",
        location={"city": "Jaipur", "state": "Rajasthan"},
        expected_tools=("upload_question_to_reviewer_system", "schemes"),
        expected_nodes=("planner", "execute_plan", "assemble_answer_body", "translate_answer"),
        expected_plan={"schemes": True, "state": "Rajasthan", "crop": "all", "is_complete": True},
        terminology_seeds=("drip irrigation", "subsidy", "scheme"),
        disclaimer_2hr_required=False,
        stable=True,
    ),
    Scenario(
        id="S14",
        name="pm_kisan_scheme",
        domain="Government Schemes",
        query="What is the PM-Kisan scheme and how do I register for it in Punjab?",
        location={"city": "Ludhiana", "state": "Punjab"},
        expected_tools=("upload_question_to_reviewer_system", "schemes"),
        expected_nodes=("planner", "execute_plan", "assemble_answer_body", "translate_answer"),
        expected_plan={"schemes": True, "state": "Punjab", "crop": "all", "is_complete": True},
        terminology_seeds=("PM-Kisan", "scheme", "registration"),
        disclaimer_2hr_required=False,
        stable=True,
    ),
    # ── Soil NPK / Nutrient Management ────────────────────────────────────
    Scenario(
        id="S15",
        name="soil_npk_paddy",
        domain="Nutrient Management",
        query="My soil test shows N=120, P=40, K=30. What fertilizer dose is recommended for paddy in Punjab?",
        location={"city": "Ropar", "state": "Punjab"},
        expected_tools=("upload_question_to_reviewer_system", "gdb"),
        expected_nodes=("planner", "execute_plan", "retrieval_sanitizer",
                        "assemble_answer_body", "translate_answer"),
        expected_plan={"knowledge_base": True, "state": "Punjab", "crop": "Paddy", "is_complete": True},
        terminology_seeds=("nitrogen", "phosphorus", "potassium", "paddy"),
        disclaimer_2hr_required=True,
        stable=True,
    ),
    # ── Weather (dynamic — stable=False) ──────────────────────────────────
    Scenario(
        id="S16",
        name="weather_today_ropar",
        domain="Weather",
        query="What is the weather today in Ropar district of Punjab?",
        location={"city": "Ropar", "state": "Punjab"},
        expected_tools=("upload_question_to_reviewer_system", "weather"),
        expected_nodes=("planner", "execute_plan", "assemble_answer_body", "translate_answer"),
        expected_plan={"weather": True, "state": "Punjab", "crop": "all", "is_complete": True},
        terminology_seeds=("weather", "temperature"),
        disclaimer_2hr_required=False,
        stable=False,
    ),
    Scenario(
        id="S17",
        name="weather_forecast_ludhiana",
        domain="Weather",
        query="What is the weather forecast for Ludhiana, Punjab for the next few days?",
        location={"city": "Ludhiana", "state": "Punjab"},
        expected_tools=("upload_question_to_reviewer_system", "weather"),
        expected_nodes=("planner", "execute_plan", "assemble_answer_body", "translate_answer"),
        expected_plan={"weather": True, "state": "Punjab", "crop": "all", "is_complete": True},
        terminology_seeds=("weather", "forecast", "rain"),
        disclaimer_2hr_required=False,
        stable=False,
    ),
    # ── General / Non-Agriculture ──────────────────────────────────────────
    Scenario(
        id="S18",
        name="non_agri_quick_money",
        domain="General",
        query="How can I make money quickly?",
        location={"city": "Ropar", "state": "Punjab"},
        expected_tools=("upload_question_to_reviewer_system",),
        expected_nodes=("planner", "ensure_location", "upload_reviewer_only", "non_agriculture_reply"),
        expected_plan={"is_agriculture_related": False, "is_complete": True},
        terminology_seeds=(),
        disclaimer_2hr_required=False,
        stable=True,
    ),
    Scenario(
        id="S19",
        name="greeting_hello",
        domain="General",
        query="Hello, who are you?",
        location=None,
        expected_tools=(),
        expected_nodes=("planner", "execute_plan", "assemble_answer_body", "translate_answer"),
        expected_plan={"knowledge_base": True, "is_complete": False},
        terminology_seeds=("AjraSakha", "agriculture"),
        disclaimer_2hr_required=False,
        stable=True,
    ),
    # ── Crop Insurance ─────────────────────────────────────────────────────
    Scenario(
        id="S20",
        name="crop_insurance_wheat",
        domain="Crop Insurance",
        query="How do I enroll my wheat crop in crop insurance in Haryana?",
        location={"city": "Karnal", "state": "Haryana"},
        expected_tools=("upload_question_to_reviewer_system", "gdb"),
        expected_nodes=("planner", "execute_plan", "retrieval_sanitizer",
                        "assemble_answer_body", "translate_answer"),
        expected_plan={"knowledge_base": True, "state": "Haryana", "crop": "Wheat", "is_complete": True},
        terminology_seeds=("insurance", "wheat", "premium"),
        disclaimer_2hr_required=True,
        stable=True,
    ),
    # ── Bio-Pesticides ─────────────────────────────────────────────────────
    Scenario(
        id="S21",
        name="bio_pesticide_cotton",
        domain="Bio-Pesticides and Bio-Fertilizers",
        query="What bio-pesticides can I use for bollworm control in cotton in Maharashtra?",
        location={"city": "Nagpur", "state": "Maharashtra"},
        expected_tools=("upload_question_to_reviewer_system", "gdb"),
        expected_nodes=("planner", "execute_plan", "retrieval_sanitizer",
                        "assemble_answer_body", "translate_answer"),
        expected_plan={"knowledge_base": True, "state": "Maharashtra", "crop": "Cotton", "is_complete": True},
        terminology_seeds=("cotton", "bollworm", "bio-pesticide"),
        disclaimer_2hr_required=True,
        stable=True,
    ),
    # ── Agriculture Mechanization ──────────────────────────────────────────
    Scenario(
        id="S22",
        name="agri_mech_tractor",
        domain="Agriculture Mechanization",
        query="Which tractor is best for small farms in Uttar Pradesh?",
        location={"city": "Lucknow", "state": "Uttar Pradesh"},
        expected_tools=("upload_question_to_reviewer_system", "gdb"),
        expected_nodes=("planner", "execute_plan", "retrieval_sanitizer",
                        "assemble_answer_body", "translate_answer"),
        expected_plan={"knowledge_base": True, "state": "Uttar Pradesh", "crop": "all", "is_complete": True},
        terminology_seeds=("tractor", "mechanization", "farm"),
        disclaimer_2hr_required=True,
        stable=True,
    ),
    # ── Horticulture ──────────────────────────────────────────────────────
    Scenario(
        id="S23",
        name="horticulture_apple",
        domain="Horticulture & Allied Agriculture",
        query="What are the recommended practices for apple cultivation in Himachal Pradesh?",
        location={"city": "Shimla", "state": "Himachal Pradesh"},
        expected_tools=("upload_question_to_reviewer_system", "gdb"),
        expected_nodes=("planner", "execute_plan", "retrieval_sanitizer",
                        "assemble_answer_body", "translate_answer"),
        expected_plan={"knowledge_base": True, "state": "Himachal Pradesh", "crop": "Apple", "is_complete": True},
        terminology_seeds=("apple", "horticulture", "pruning"),
        disclaimer_2hr_required=True,
        stable=True,
    ),
    # ── Sowing Time ────────────────────────────────────────────────────────
    Scenario(
        id="S24",
        name="sowing_time_wheat",
        domain="Sowing Time and Weather",
        query="What is the best sowing time for wheat in Punjab?",
        location={"city": "Ludhiana", "state": "Punjab"},
        expected_tools=("upload_question_to_reviewer_system", "gdb"),
        expected_nodes=("planner", "execute_plan", "retrieval_sanitizer",
                        "assemble_answer_body", "translate_answer"),
        expected_plan={"knowledge_base": True, "state": "Punjab", "crop": "Wheat", "is_complete": True},
        terminology_seeds=("wheat", "sowing", "October"),
        disclaimer_2hr_required=True,
        stable=True,
    ),
    # ── Fertilizer Use ─────────────────────────────────────────────────────
    Scenario(
        id="S25",
        name="fertilizer_urea_paddy",
        domain="Fertilizer Use and Availability",
        query="How should I apply urea fertilizer to paddy crop in West Bengal?",
        location={"city": "Kolkata", "state": "West Bengal"},
        expected_tools=("upload_question_to_reviewer_system", "gdb"),
        expected_nodes=("planner", "execute_plan", "retrieval_sanitizer",
                        "assemble_answer_body", "translate_answer"),
        expected_plan={"knowledge_base": True, "state": "West Bengal", "crop": "Paddy", "is_complete": True},
        terminology_seeds=("urea", "fertilizer", "paddy"),
        disclaimer_2hr_required=True,
        stable=True,
    ),
    # ── Storage ────────────────────────────────────────────────────────────
    Scenario(
        id="S26",
        name="storage_wheat_grains",
        domain="Storage",
        query="How do I properly store wheat grains to prevent pest damage?",
        location={"city": "Sirsa", "state": "Haryana"},
        expected_tools=("upload_question_to_reviewer_system", "gdb"),
        expected_nodes=("planner", "execute_plan", "retrieval_sanitizer",
                        "assemble_answer_body", "translate_answer"),
        expected_plan={"knowledge_base": True, "state": "Haryana", "crop": "Wheat", "is_complete": True},
        terminology_seeds=("wheat", "storage", "pest"),
        disclaimer_2hr_required=True,
        stable=True,
    ),
    # ── Soil Health Card ───────────────────────────────────────────────────
    Scenario(
        id="S27",
        name="soil_health_card",
        domain="Soil Health Card",
        query="How do I apply for a soil health card in Karnataka?",
        location={"city": "Bengaluru", "state": "Karnataka"},
        expected_tools=("upload_question_to_reviewer_system", "gdb"),
        expected_nodes=("planner", "execute_plan", "assemble_answer_body", "translate_answer"),
        expected_plan={"knowledge_base": True, "state": "Karnataka", "crop": "all", "is_complete": True},
        terminology_seeds=("soil health card", "soil test"),
        disclaimer_2hr_required=True,
        stable=True,
    ),
    # ── Livestock ──────────────────────────────────────────────────────────
    Scenario(
        id="S28",
        name="livestock_goat_feeding",
        domain="Livestock & Animal Husbandry",
        query="What is the recommended feeding schedule for goats in Rajasthan?",
        location={"city": "Jaipur", "state": "Rajasthan"},
        expected_tools=("upload_question_to_reviewer_system", "gdb"),
        expected_nodes=("planner", "execute_plan", "assemble_answer_body", "translate_answer"),
        expected_plan={"knowledge_base": True, "state": "Rajasthan", "crop": "all", "is_complete": True},
        terminology_seeds=("goat", "feeding", "livestock"),
        disclaimer_2hr_required=True,
        stable=True,
    ),
    # ── Fisheries ─────────────────────────────────────────────────────────
    Scenario(
        id="S29",
        name="fisheries_pond_mgmt",
        domain="Fisheries & Aquaculture",
        query="How do I manage a fish pond for rohu and catla in Andhra Pradesh?",
        location={"city": "Vijayawada", "state": "Andhra Pradesh"},
        expected_tools=("upload_question_to_reviewer_system", "gdb"),
        expected_nodes=("planner", "execute_plan", "assemble_answer_body", "translate_answer"),
        expected_plan={"knowledge_base": True, "state": "Andhra Pradesh", "crop": "all", "is_complete": True},
        terminology_seeds=("fish", "pond", "aquaculture"),
        disclaimer_2hr_required=True,
        stable=True,
    ),
    # ── Multi-tool (dynamic — stable=False) ───────────────────────────────
    Scenario(
        id="S30",
        name="multi_tool_weather_pest",
        domain="Plant Protection",
        query="What is the weather forecast for Ludhiana and what should I do for yellow rust in wheat?",
        location={"city": "Ludhiana", "state": "Punjab"},
        expected_tools=("upload_question_to_reviewer_system", "weather", "gdb"),
        expected_nodes=("planner", "execute_plan", "retrieval_sanitizer",
                        "assemble_answer_body", "translate_answer"),
        expected_plan={
            "weather": True, "knowledge_base": True,
            "state": "Punjab", "crop": "Wheat", "is_complete": True,
        },
        terminology_seeds=("wheat", "yellow rust", "weather"),
        disclaimer_2hr_required=True,
        stable=False,
    ),
]

# Quick lookup by ID
SCENARIO_BY_ID: dict[str, Scenario] = {s.id: s for s in SCENARIOS}

assert len(SCENARIOS) == 30, f"Expected 30 scenarios, got {len(SCENARIOS)}"
assert len(SCENARIO_BY_ID) == 30, "Duplicate scenario IDs detected"
