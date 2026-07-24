"""Deterministic mock responses for the Multilingual Testing Suite.

These fixtures simulate what the live agent would return, keyed by
(scenario_id, language_code). They are used in mock/CI mode to allow
all 180 cases to run without credentials or a live API endpoint.

Design rules
------------
- Mock responses must contain the expected script characters for the language
  (so language_match validator passes).
- Mock responses must contain the testing_disclaimer from the catalog
  (so disclaimer_check validator passes).
- Mock responses must contain the English terminology seeds
  (so terminology validator passes in English mode; non-English cases
  annotate as review_required, which is expected in mock mode).
- Mock responses must NOT contain real user data, API keys, or secrets.
- For non-English languages, responses include a sample sentence in the
  correct script to satisfy the Unicode pattern check.

The fixture system uses a fallback hierarchy:
  1. Exact (scenario_id, language_code) match
  2. English version of the same scenario (for structure)
  3. Generic mock response
"""

from __future__ import annotations

from ajrasakha.evaluation.multilingual.case_schema import MultilingualCase

# Script seed strings — minimal native-script text to satisfy pattern checks.
# These are sample sentences in each language (translation of "This is a test").
_SCRIPT_SEEDS: dict[str, str] = {
    "EN": "",  # No seed needed — English is always in the response
    "HI": "यह एक परीक्षण उत्तर है। ",      # Devanagari seed
    "KN": "ಇದು ಒಂದು ಪರೀಕ್ಷಾ ಉತ್ತರ. ",      # Kannada seed
    "TA": "இது ஒரு சோதனை பதில். ",           # Tamil seed
    "PA": "ਇਹ ਇੱਕ ਟੈਸਟ ਜਵਾਬ ਹੈ। ",          # Gurmukhi seed
    "TE": "ఇది ఒక పరీక్ష సమాధానం. ",         # Telugu seed
}


def build_mock_response(case: MultilingualCase) -> dict:
    """Build a mock executor result dict for the given MultilingualCase.

    Returns the same shape as run_mock_case() in evaluation/executors.py,
    with the response_text enriched to satisfy multilingual validators.
    """
    script_seed = _SCRIPT_SEEDS.get(case.language_code, "")

    # Build a response that satisfies all deterministic validators:
    # 1. Contains script characters for the language (language_match)
    # 2. Contains the testing disclaimer (disclaimer_check)
    # 3. Contains terminology seeds in English (terminology validator)
    # 4. Does not trigger lang_switch (seeds are small, within threshold)

    terminology_text = ""
    if case.terminology_assertions:
        terms = [a.term for a in case.terminology_assertions if not a.must_be_absent]
        terminology_text = f"[Mock agri content covers: {', '.join(terms)}] "

    response_body = (
        f"{script_seed}"
        f"[MOCK RESPONSE for {case.case_id}] "
        f"Domain: {case.domain}. "
        f"Query language: {case.expected_vocal}. "
        f"{terminology_text}"
    )

    # Append 2-hour disclaimer first (when required) so it appears before testing disclaimer.
    # The disclaimer_check validator requires both when disclaimer_2hr_required=True.
    suffix_parts = []
    if case.disclaimer_2hr_required and case.expected_2hr_disclaimer:
        suffix_parts.append(case.expected_2hr_disclaimer)

    # Append testing disclaimer last (must be at bottom of response)
    if case.expected_testing_disclaimer:
        suffix_parts.append(case.expected_testing_disclaimer)

    if suffix_parts:
        full_response = response_body.rstrip() + "\n" + "\n".join(suffix_parts)
    else:
        full_response = response_body

    # Build expected_tools / expected_nodes from the case
    expected_tools = list(case.expected_tools)
    expected_nodes = list(case.expected_nodes)

    trace = {
        "nodes": expected_nodes,
        "plan": case.expected_plan,
        "tools": expected_tools,
        "mcp_services": [f"mcp-{t}" for t in expected_tools],
        "errors": [],
    }

    return {
        "name": case.case_id,
        "query": case.query,
        "expected_tools": ",".join(expected_tools),
        "observed_tools": ",".join(expected_tools),
        "http_status": 200,
        "graph_status": "success",
        "latency_seconds": 0.01,
        "response_text": full_response,
        "error": "",
        "trace": trace,
    }


def build_blocked_response(case: MultilingualCase, reason: str = "API not reachable") -> dict:
    """Build a BLOCKED result dict when live API is unavailable."""
    return {
        "name": case.case_id,
        "query": case.query,
        "expected_tools": ",".join(case.expected_tools),
        "observed_tools": "",
        "http_status": None,
        "graph_status": "blocked",
        "latency_seconds": 0.0,
        "response_text": "",
        "error": f"BLOCKED: {reason}",
        "trace": {
            "nodes": [],
            "plan": {},
            "tools": [],
            "mcp_services": [],
            "errors": [f"BLOCKED: {reason}"],
        },
    }
