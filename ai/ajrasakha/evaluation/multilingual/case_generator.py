"""Deterministic case generator for the AjraSakha Multilingual Testing Suite.

generate_cases() expands 30 canonical SCENARIOS × 6 LANGUAGES = 180
MultilingualCase objects. Cases are generated in stable, reproducible order:
    for scenario in SCENARIOS:          # S01 … S30
        for language in LANGUAGES:      # EN HI KN TA PA TE

Disclaimer strings are pulled at generation time from the existing
translation catalog (agents/translation_catalog.py), making the expected
values authoritative and preventing manual drift.

Design decisions
----------------
- Queries stay in English for both mock and live modes. In production the
  system detects language from the user's phone metadata / query script; the
  test exercises that detection by asserting the response language, not the
  query language. This is consistent with how the production pipeline works.
- Location is taken from the scenario record; it is not varied per language
  (regional variation is covered by the 30 scenario locations, not 6×30).
- All cases ship with translation_review_status="draft_pending_agri_validation"
  until a human agri-team member explicitly validates the disclaimers and
  terminology.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Allow running as a script from the ai/ directory
_AI_ROOT = Path(__file__).resolve().parents[4]
if str(_AI_ROOT) not in sys.path:
    sys.path.insert(0, str(_AI_ROOT))

from ajrasakha.evaluation.multilingual.case_schema import (
    MultilingualCase,
    TerminologyAssertion,
)
from ajrasakha.evaluation.multilingual.languages import LANGUAGES, LanguageRecord
from ajrasakha.evaluation.multilingual.scenarios import SCENARIOS, Scenario

# Translation catalog import — reuse existing module, no duplication
from ajrasakha.agents.translation_catalog import (
    get_testing_disclaimer,
    get_two_hour_disclaimer,
)

# Sentinel value used when a non-English translation is absent from the artifact.
# The runner detects this and returns CaseStatus.SKIPPED_MISSING_TRANSLATION
# so that blank English fallbacks never silently inflate Indic language metrics.
_MISSING_TRANSLATION_SENTINEL = "MISSING_TRANSLATION"

_SCHEMA_VERSION = "1.0.0"

# Path to the multilingual query data artifact (Step 008)
_QUERIES_PATH = Path(__file__).parent / "data" / "multilingual_queries.json"

# ── Domain group mapping ──────────────────────────────────────────────────────
# Maps Scenario.domain display labels to the 5 canonical domain_group values.
_DOMAIN_GROUP_MAP: dict[str, str] = {
    # Weather group
    "Weather": "weather",
    "Sowing Time and Weather": "weather",
    # Pest / Plant Protection group
    "Plant Protection": "pest",
    "Bio-Pesticides and Bio-Fertilizers": "pest",
    # Government Schemes group
    "Government Schemes": "schemes",
    "Crop Insurance": "schemes",
    # Soil / Nutrient Management group
    "Nutrient Management": "soil",
    "Soil Health Card": "soil",
    "Soil NPK": "soil",
    # Market group
    "Market Prices": "market",
}


def _get_domain_group(domain: str) -> str:
    """Map a scenario domain display label to its canonical domain_group."""
    return _DOMAIN_GROUP_MAP.get(domain, "soil")  # safe default


def _get_disclaimer_mode(scenario: Scenario) -> str:
    """Derive the disclaimer_mode from scenario properties.

    - GDB-backed scenarios with disclaimer_2hr_required: "required"
    - Weather/Market (no GDB, no 2hr): "forbidden"
    - General/non-agri: "optional"
    """
    if scenario.disclaimer_2hr_required:
        return "required"
    if "weather" in scenario.expected_tools or "market" in scenario.expected_tools:
        return "forbidden"
    return "optional"


# Load multilingual query data artifact once at module load
def _load_query_artifact() -> dict[str, dict[str, str]]:
    """Load multilingual queries from the data artifact.

    Returns a dict mapping scenario_id -> {lang_code -> query_text}.
    Falls back gracefully if the artifact is missing.
    """
    if not _QUERIES_PATH.exists():
        return {}
    try:
        payload = json.loads(_QUERIES_PATH.read_text(encoding="utf-8"))
        result: dict[str, dict[str, str]] = {}
        for entry in payload.get("scenarios", []):
            sid = entry.get("id", "")
            if sid:
                result[sid] = dict(entry.get("queries", {}))
        return result
    except Exception:
        return {}


_QUERY_ARTIFACT: dict[str, dict[str, str]] = _load_query_artifact()


def _make_case(scenario: Scenario, lang: LanguageRecord) -> MultilingualCase:
    """Generate one MultilingualCase from a (Scenario, LanguageRecord) pair."""
    case_id = f"ML-{scenario.id}-{lang.code}"

    # Pull disclaimer strings from the existing catalog — authoritative source.
    # Uses the language's catalog_script/catalog_vocal keys.
    try:
        testing_disclaimer = get_testing_disclaimer(lang.catalog_script, lang.catalog_vocal)
    except Exception:
        testing_disclaimer = ""

    try:
        two_hr_disclaimer = get_two_hour_disclaimer(lang.catalog_script, lang.catalog_vocal)
    except Exception:
        two_hr_disclaimer = ""

    # Build terminology assertions from the scenario's seed terms.
    term_assertions = tuple(
        TerminologyAssertion(term=t, description=f"Expected agri-term: '{t}'")
        for t in scenario.terminology_seeds
    )

    # Determine query source and text.
    # For non-English languages: if the artifact translation is absent or empty,
    # DO NOT silently fall back to English. Instead, flag the case with the
    # _MISSING_TRANSLATION_SENTINEL so the runner can emit SKIPPED_MISSING_TRANSLATION.
    # For English (EN): always use the scenario's canonical query.
    artifact_queries = _QUERY_ARTIFACT.get(scenario.id, {})
    if lang.code == "EN":
        query = scenario.query
        query_translation_source = "data_artifact"  # EN source is always canonical
    elif lang.code in artifact_queries and artifact_queries[lang.code].strip():
        query = artifact_queries[lang.code]
        query_translation_source = "data_artifact"
    else:
        # Translation absent — mark as missing rather than falling back to English.
        query = _MISSING_TRANSLATION_SENTINEL
        query_translation_source = "missing_translation"

    # Derive domain_group and disclaimer_mode
    domain_group = _get_domain_group(scenario.domain)
    disclaimer_mode = _get_disclaimer_mode(scenario)

    return MultilingualCase(
        case_id=case_id,
        scenario_id=scenario.id,
        language_code=lang.code,
        domain=scenario.domain,
        domain_group=domain_group,
        query=query,
        query_translation_source=query_translation_source,
        location=scenario.location,
        expected_script=lang.catalog_script,
        expected_vocal=lang.catalog_vocal,
        expected_catalog_script=lang.catalog_script,
        expected_tools=scenario.expected_tools,
        expected_nodes=scenario.expected_nodes,
        expected_plan=scenario.expected_plan,
        disclaimer_mode=disclaimer_mode,
        disclaimer_2hr_required=scenario.disclaimer_2hr_required,
        expected_testing_disclaimer=testing_disclaimer,
        expected_2hr_disclaimer=two_hr_disclaimer if scenario.disclaimer_2hr_required else "",
        expected_gdb_no_match=False,
        terminology_assertions=term_assertions,
        stable=scenario.stable,
        translation_review_status="draft_pending_agri_validation",
        translation_reviewer=None,
        provenance={
            "schema_version": _SCHEMA_VERSION,
            "generator": "ajrasakha.evaluation.multilingual.case_generator",
            "scenario_id": scenario.id,
            "language_code": lang.code,
            "catalog_script": lang.catalog_script,
            "catalog_vocal": lang.catalog_vocal,
        },
        expected_gdb_id=None,  # Populated only when live GDB fingerprints are available
    )


def generate_cases(
    *,
    scenario_ids: list[str] | None = None,
    language_codes: list[str] | None = None,
    stable_only: bool = False,
) -> list[MultilingualCase]:
    """Generate the full (or filtered) set of multilingual test cases.

    Parameters
    ----------
    scenario_ids    If given, only generate cases for these scenario IDs.
    language_codes  If given, only generate cases for these language codes.
    stable_only     If True, exclude scenarios marked stable=False.

    Returns
    -------
    List of MultilingualCase in deterministic order (scenario × language).
    Total without filters: 30 × 6 = 180 cases.
    """
    scenarios = SCENARIOS
    languages = LANGUAGES

    if scenario_ids is not None:
        scenarios = [s for s in scenarios if s.id in set(scenario_ids)]
    if language_codes is not None:
        languages = [l for l in languages if l.code in set(language_codes)]
    if stable_only:
        scenarios = [s for s in scenarios if s.stable]

    cases = []
    for scenario in scenarios:
        for lang in languages:
            cases.append(_make_case(scenario, lang))

    return cases


def assert_case_count(cases: list[MultilingualCase]) -> None:
    """Assert expected case counts — call after generate_cases() with no filters."""
    total = len(SCENARIOS) * len(LANGUAGES)  # 30 × 6 = 180
    assert len(cases) == total, (
        f"Expected {total} cases (30 scenarios × 6 languages), got {len(cases)}"
    )
    # All case IDs must be unique
    ids = [c.case_id for c in cases]
    assert len(ids) == len(set(ids)), "Duplicate case IDs detected"


if __name__ == "__main__":
    cases = generate_cases()
    assert_case_count(cases)
    print(f"Generated {len(cases)} cases")
    for case in cases[:6]:
        print(f"  {case.case_id}: {case.domain} ({case.domain_group}) | {case.expected_vocal} | "
              f"stable={case.stable} | review={case.translation_review_status}")
    print("  ...")
    print(f"  {cases[-1].case_id}")
