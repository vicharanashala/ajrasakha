def evaluate_source_attribution(result: dict, case: dict) -> dict:
    response = str(result.get("response_text", ""))
    observed_tools = set(result.get("observed_tools", []) or [])
    expected_tools = set(case.get("expected_tools", []) or [])

    needs_source = "gdb" in observed_tools or "gdb" in expected_tools

    if not needs_source:
        return {
            "source_check_required": False,
            "source_attribution_pass": True,
            "source_attribution_reason": "",
        }

    markers = [
        "Source:",
        "📚 Source",
        "Agri Expert",
        "👨‍🌾 Agri Expert",
        "approved materials",
    ]

    has_source = any(marker.lower() in response.lower() for marker in markers)

    return {
        "source_check_required": True,
        "source_attribution_pass": has_source,
        "source_attribution_reason": "" if has_source else "GDB response missing source attribution",
    }  