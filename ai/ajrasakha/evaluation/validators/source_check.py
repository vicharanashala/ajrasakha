import re


def evaluate_source_attribution(result: dict, case: dict) -> dict:
    response = str(result.get("response_text", ""))
    category = str(case.get("category", ""))
    expert_source_required = bool(
        case.get("expert_source_required", category == "gdb_semantic")
    )
    source_url_required = bool(case.get("source_url_required"))
    has_source_url = bool(re.search(r"https?://", response))
    source_url_pass = not source_url_required or has_source_url
    source_url_reason = "" if source_url_pass else "Source URL required but no URL found"

    if not expert_source_required:
        return {
            "source_check_required": source_url_required,
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
