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
- All cases ship with translation_review_status="pending" until a human
  agri-team member explicitly validates the disclaimers and terminology.
"""

from __future__ import annotations

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

_SCHEMA_VERSION = "1.0.0"


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

    return MultilingualCase(
        case_id=case_id,
        scenario_id=scenario.id,
        language_code=lang.code,
        domain=scenario.domain,
        query=scenario.query,
        location=scenario.location,
        expected_script=lang.catalog_script,
        expected_vocal=lang.catalog_vocal,
        expected_catalog_script=lang.catalog_script,
        expected_tools=scenario.expected_tools,
        expected_nodes=scenario.expected_nodes,
        expected_plan=scenario.expected_plan,
        disclaimer_2hr_required=scenario.disclaimer_2hr_required,
        expected_testing_disclaimer=testing_disclaimer,
        expected_2hr_disclaimer=two_hr_disclaimer if scenario.disclaimer_2hr_required else "",
        terminology_assertions=term_assertions,
        stable=scenario.stable,
        translation_review_status="pending",
        translation_reviewer=None,
        provenance={
            "schema_version": _SCHEMA_VERSION,
            "generator": "ajrasakha.evaluation.multilingual.case_generator",
            "scenario_id": scenario.id,
            "language_code": lang.code,
            "catalog_script": lang.catalog_script,
            "catalog_vocal": lang.catalog_vocal,
        },
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
        print(f"  {case.case_id}: {case.domain} | {case.expected_vocal} | "
              f"stable={case.stable} | review={case.translation_review_status}")
    print("  ...")
    print(f"  {cases[-1].case_id}")
