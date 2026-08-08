from ajrasakha.evaluation.run import run_case


def test_run_case_carries_expected_domain_into_the_result_dict():
    """
    Bug fix: run_mock_case()/run_live_case() build their result dict from
    scratch and never copy case["expected_domain"] into it, so
    build_domain_quality_breakdown()'s result.get("expected_domain") lookup
    silently fell back to "Unknown" for every real pipeline run - it only
    ever worked in unit tests against hand-built dicts and hand-seeded demo
    data, never through an actual run_case() call. run.py now injects it
    explicitly into the combined dict.
    """
    case = {
        "name": "domain_passthrough_check",
        "query": "What is the weather today?",
        "expected_domain": "Weather",
        "expected_tools": [],
        "expected_nodes": [],
    }

    result = run_case(case, mode="mock")

    assert result["expected_domain"] == "Weather"
