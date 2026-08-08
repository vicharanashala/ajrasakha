import json
from pathlib import Path

GDB_FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "gdb_samples.json"
REPRESENTATIVE_TREATMENT_FIXTURE_PATH = (
    Path(__file__).resolve().parent / "fixtures" / "representative_treatment_samples.json"
)

# Domains where "treatment/recommendation" is a coherent concept to check at
# all. A weather forecast or scheme-eligibility answer has no treatment to
# get right or wrong - that's a category mismatch, not missing data, so
# those domains get TreatmentCorrectness reason "treatment_not_applicable_to_domain"
# rather than being treated as a data gap. Only these two domains genuinely
# involve a treatment/recommendation an answer could match or miss.
TREATMENT_APPLICABLE_DOMAINS = frozenset({"GDB queries", "Soil"})

# No longer auto-backfilled into every case's expected_answer (see
# find_reference_answer below) - a placeholder string was previously always
# truthy, so GDBMatchScore fired an LLM-judge call against boilerplate text
# for every domain, not just cases with a real expert-validated reference.
# Kept only for callers that explicitly want a human-readable "why is this
# missing" message (e.g. a report footnote), not as a scoring input.
PLACEHOLDER_ANSWER = (
    "No expert-validated reference answer is available for this domain yet; "
    "answer-quality scoring will run without a ground-truth comparison."
)


def load_gdb_fixture(path: Path = GDB_FIXTURE_PATH) -> list[dict]:
    """Read the static GDB reference-answer fixture. Returns [] if missing/invalid."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def load_representative_treatment_fixture(path: Path = REPRESENTATIVE_TREATMENT_FIXTURE_PATH) -> list[dict]:
    """
    Read the hand-authored representative-treatment fixture (see
    fixtures/representative_treatment_samples.json's _comment) - fills a
    domain's TreatmentCorrectness ground truth only where real MongoDB-sourced
    data doesn't cover it. Returns [] if missing/invalid, same as
    load_gdb_fixture.
    """
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def find_reference_answer(expected_domain: str | None, fixture: list[dict]) -> str | None:
    """
    Find a real expert-validated fixture sample matching expected_domain.

    Returns None (not a placeholder) when no real reference exists, so callers
    - and GDBMatchScore's existing `if reference_answer and ...` gate in
    deepeval_metrics.py - correctly treat "no real reference" as "not
    applicable" rather than as a fake truthy answer to judge against.
    """
    if expected_domain:
        for sample in fixture:
            sample_domains = sample.get("domains") or []
            if expected_domain == sample.get("expected_domain") or expected_domain in sample_domains:
                answer = sample.get("expected_answer")
                if answer and str(answer).strip():
                    return answer

    return None


def find_treatment_reference(
    expected_domain: str | None,
    gdb_fixture: list[dict],
    representative_fixture: list[dict],
) -> tuple[str | None, str]:
    """
    Real, expert-validated GDB content takes priority; a clearly-labeled
    "representative_authored" fallback fills the one domain (Soil) where a
    treatment concept applies but no real MongoDB-sourced reference exists
    (see REPRESENTATIVE_TREATMENT_FIXTURE_PATH's _comment). Returns
    (reference_text_or_None, source), where source is one of:
      - "real_gdb_fixture"       - a real expert-validated match
      - "representative_authored" - a hand-authored, clearly-labeled stand-in
      - "data_gap"               - treatment applies here but no reference exists yet
      - "not_applicable"         - this domain has no treatment/recommendation
                                    concept at all (e.g. Weather, Greetings)
    FIX 6: TreatmentCorrectness previously used expected_domain itself as
    the "expected treatment" (a category-label proxy, not real content) -
    this replaces that with a genuine content reference, gated the same way
    GDBMatchScore is gated in deepeval_metrics.py.
    """
    if expected_domain not in TREATMENT_APPLICABLE_DOMAINS:
        return None, "not_applicable"

    real_answer = find_reference_answer(expected_domain, gdb_fixture)
    if real_answer:
        return real_answer, "real_gdb_fixture"

    for sample in representative_fixture:
        sample_domains = sample.get("domains") or []
        if expected_domain == sample.get("expected_domain") or expected_domain in sample_domains:
            text = sample.get("expected_treatment")
            if text and str(text).strip():
                return text, "representative_authored"

    return None, "data_gap"


TEST_CASES = [
    # "General" and, further below, "Plant Protection" (multi_tool_question)
    # are intentionally NOT relabeled to one of the brief's 6 domains
    # (Weather/Market/Soil/Schemes/"GDB queries"/Greetings). They aren't
    # mislabeled duplicates of a real domain - they're functional test
    # categories (out-of-scope/non-agriculture detection, multi-tool
    # routing), not domain-specific answer-quality cases, so they're
    # correctly excluded from domain_quality_breakdown. See product.md.
    {
        "name": "non_agriculture_question_english",
        "query": "How can I make money quickly?",
        "location": {"city": "Ropar", "state": "Punjab"},
        "expected_domain": "General",
        "stable": False,
        "expected_nodes": [
            "planner",
            "ensure_location",
            "upload_reviewer_only",
            "non_agriculture_reply",
        ],
        "expected_tools": ["upload_question_to_reviewer_system"],
        "expected_plan": {
            "is_agriculture_related": False,
            "is_complete": True,
            "state": "Punjab",
            "crop": "all",
        },
    },
    {
        "name": "weather_question_1",
        "query": "What is the weather today in Ropar district of Punjab state?",
        "location": {"city": "Ropar", "state": "Punjab"},
        "expected_domain": "Weather",
        "stable": True,
        "expected_nodes": ["planner", "execute_plan", "assemble_answer_body", "translate_answer"],
        "expected_tools": ["upload_question_to_reviewer_system", "weather"],
        "expected_plan": {
            "weather": True,
            "mandi": False,
            
            "soil": False,
            "schemes": False,
            "knowledge_base": False,
            "is_complete": True,
            "state": "Punjab",
            "crop": "all",
        },
    },
    {
        "name": "weather_question_2",
        "query": "Will it rain in Delhi today?",
        "location": {"city": "Delhi", "state": "Delhi"},
        "expected_domain": "Weather",
        "stable": False,
        "expected_nodes": ["planner", "execute_plan", "assemble_answer_body", "translate_answer"],
        "expected_tools": ["upload_question_to_reviewer_system", "weather"],
        "expected_plan": {
            "weather": True,
           # "stable": False,
            "state": "Delhi",
            "crop": "all",
            "is_complete": True,
        },
    },
    {
        "name": "weather_question_3",
        "query": "What is the weather forecast for Ludhiana, Punjab for the next few days?",
        "location": {"city": "Ludhiana", "state": "Punjab"},
        "stable": False,
        "expected_domain": "Weather",
        "expected_nodes": ["planner", "execute_plan", "assemble_answer_body", "translate_answer"],
        "expected_tools": ["upload_question_to_reviewer_system", "weather"],
        "expected_plan": {
            "weather": True,
            "state": "Punjab",
            "stable": False,
            "crop": "all",
            "is_complete": True,
        },
    },
    {
        "name": "market_question_1",
        "query": "What is the price of wheat in Sirsa mandi, Haryana?",
        "location": {"city": "Sirsa", "state": "Haryana"},
        "expected_domain": "Market",
        "stable": True,
        "expected_nodes": ["planner", "execute_plan", "assemble_answer_body", "translate_answer"],
        "expected_tools": ["upload_question_to_reviewer_system", "market"],
        "expected_plan": {
            "mandi": True,
            "state": "Haryana",
            #"stable": True,
            "crop": "Wheat",
            "is_complete": True,
        },
    },
    {
        "name": "market_question_2",
        "query": "What is the current price of rice in Karnal mandi, Haryana?",
        "location": {"city": "Karnal", "state": "Haryana"},
        "expected_domain": "Market",
        "stable": False,
        "expected_nodes": ["planner", "execute_plan", "assemble_answer_body", "translate_answer"],
        "expected_tools": ["upload_question_to_reviewer_system", "market"],
        "expected_plan": {
            "mandi": True,
            "state": "Haryana",
            "crop": "Paddy",
            "is_complete": True,
        },
    },
    {
        "name": "soil_question_1",
        "query": "My soil test shows Nitrogen 120, Phosphorus 40, Potassium 30, and OC 0.5%. What is the fertilizer dosage for Rice in Ropar, Punjab?",
        "location": {"city": "Ropar", "state": "Punjab"},
        "expected_domain": "Soil",
        "stable": True,
        "expected_nodes": ["planner", "execute_plan", "assemble_answer_body", "translate_answer"],
        "expected_tools": ["upload_question_to_reviewer_system", "gdb"],
        "expected_plan": {
            "soil": False,
            "state": "Punjab",
    
            "crop": "Paddy",
            "is_complete": True,
        },
    },
    {
        "name": "scheme_question_1",
        "query": "I am a 35-year-old male farmer from Jaipur, Rajasthan. How can I get subsidy for drip irrigation?",
        "location": {"city": "Jaipur", "state": "Rajasthan"},
        "expected_domain": "Schemes",
        "stable": True,
        "expected_nodes": ["planner", "execute_plan", "assemble_answer_body", "translate_answer"],
        "expected_tools": ["upload_question_to_reviewer_system", "schemes"],
        "expected_plan": {
            "schemes": True,
            "state": "Rajasthan",
            
            "crop": "all",
            "is_complete": True,
        },
    },
    {
        "name": "scheme_question_2",
        "query": "I am a 42-year-old female farmer from Nashik, Maharashtra. Which government schemes can help me buy drip irrigation equipment?",
        "location": {"city": "Nashik", "state": "Maharashtra"},
        "expected_domain": "Schemes",
        "stable": False,
        "expected_nodes": ["planner", "execute_plan", "assemble_answer_body", "translate_answer"],
        "expected_tools": ["upload_question_to_reviewer_system", "schemes"],
        "expected_plan": {
            "schemes": True,
            "state": "Maharashtra",
          
            "crop": "all",
            "is_complete": True,
        },
    },
    {
        "name": "gdb_question_1",
        "query": "How to grow paddy in punjab",
        "location": {"city": "Ropar", "state": "Punjab"},
        "expected_domain": "GDB queries",
        "stable": True,
        "expected_nodes": ["planner", "execute_plan", "retrieval_sanitizer", "assemble_answer_body", "translate_answer"],
        "expected_tools": ["upload_question_to_reviewer_system", "gdb"],
        "expected_plan": {
            "knowledge_base": True,
            "state": "Punjab",
            "crop": "Paddy",
            
            "is_complete": True,
        },
    },
    {
        "name": "greeting_question",
        "query": "Namaste Ajrasakha!",
        "location": None,
        "stable": True,
        "expected_domain": "Greetings",
        "expected_nodes": ["planner", "execute_plan", "assemble_answer_body", "translate_answer"],
        "expected_tools": [],
        "expected_plan": {
            "knowledge_base": True,
            "is_complete": False,
          },
    },
    {
        "name": "no_tool_greeting_2",
        "query": "Hello, who are you?",
        "location": None,
        "stable": False,
        "expected_domain": "Greetings",
        "expected_nodes": ["planner", "execute_plan", "assemble_answer_body", "translate_answer"],
        "expected_tools": [],
        "expected_plan": {
            "knowledge_base": True,
            "is_complete": False,
        },
    },
    {
        "name": "simple_weather_control",
        "query": "What is the weather today in Delhi?",
        "location": {"city": "Delhi", "state": "Delhi"},
        "expected_domain": "Weather",
        "stable": False,
        "expected_nodes": ["planner", "execute_plan", "assemble_answer_body", "translate_answer"],
        "expected_tools": ["upload_question_to_reviewer_system", "weather"],
        "expected_plan": {
            "weather": True,
            "state": "Delhi",
            "crop": "all",
            "is_complete": True,
        },
    },
    {
        "name": "multi_tool_question",
        "query": "What is the weather forecast for Ludhiana, Punjab and what should I do for yellow rust in wheat?",
        "location": {"city": "Ludhiana", "state": "Punjab"},
        "expected_domain": "Plant Protection",
        "stable": False,
        "expected_nodes": ["planner", "execute_plan", "retrieval_sanitizer", "assemble_answer_body", "translate_answer"],
        "expected_tools": ["upload_question_to_reviewer_system", "weather", "gdb"],
        "expected_plan": {
            "weather": True,
            "knowledge_base": True,
            "state": "Punjab",
            "crop": "Wheat",
            "is_complete": True,
        },
    },
    {
    "name": "mandya_paddy_price",
    "query": "What is the price of paddy in Mandya Mandi?",
    "stable": False,
    "expected_domain": "Market",
    "expected_tools": [
        "upload_question_to_reviewer_system",
        "mandi"
    ],
    "expected_plan": {
        "mandi": True,
        "weather": False,
        "soil": False,
        "schemes": False,
    },
},
]

_gdb_fixture = load_gdb_fixture()
_representative_treatment_fixture = load_representative_treatment_fixture()

for _case in TEST_CASES:
    _case.setdefault(
        "expected_answer",
        find_reference_answer(_case.get("expected_domain"), _gdb_fixture),
    )

    _treatment_text, _treatment_source = find_treatment_reference(
        _case.get("expected_domain"), _gdb_fixture, _representative_treatment_fixture
    )
    _case.setdefault("expected_treatment", _treatment_text)
    _case.setdefault("treatment_reference_source", _treatment_source)
