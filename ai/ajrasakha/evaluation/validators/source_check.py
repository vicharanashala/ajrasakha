import re


def evaluate_source_attribution(result: dict, case: dict) -> dict:
    response = str(result.get("response_text", ""))
    observed_tools = set(
        tool.strip()
        for tool in str(result.get("observed_tools", "")).split(",")
        if tool.strip()
    )
    expected_tools = set(case.get("expected_tools", []) or [])
    source_url_required = bool(case.get("source_url_required"))
    has_source_url = bool(re.search(r"https?://", response))
    source_url_pass = not source_url_required or has_source_url
    source_url_reason = "" if source_url_pass else "Source URL required but no URL found"

    needs_source = "gdb" in observed_tools or "gdb" in expected_tools

    if not needs_source:
        return {
            "source_check_required": False,
            "source_attribution_pass": True,
            "source_attribution_reason": "",
            "source_url_pass": source_url_pass,
            "source_url_reason": source_url_reason,
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
        "source_url_pass": source_url_pass,
        "source_url_reason": source_url_reason,
    }  
