"""Check whether an answer includes sources and source page numbers."""

from __future__ import annotations

import json
import re
from typing import Any

from normalizer import AnswerContext
from result_state import FAIL, PASS, check_result, not_applicable_result


_PLACEHOLDER_PAGE_VALUES = {
    "na", "n/a", "n.a.", "n.a", "nil", "none", "-", "--", "tbd", "0", "00",
}


def _is_plausible_page_value(page: str) -> bool:
    """Reject placeholder or non-page text; accept digits/ranges/lists."""
    normalized = page.strip().strip(".").casefold()
    if normalized in _PLACEHOLDER_PAGE_VALUES:
        return False
    return bool(re.search(r"\d", page))


def check_sources(context: AnswerContext) -> dict[str, Any]:
    """Check source presence and require a page value for every source."""
    sources = context["sources"]
    source_list = sources if isinstance(sources, list) else []
    valid_sources = [
        source
        for source in source_list
        if isinstance(source, dict)
        and any(
            str(source.get(field) or "").strip()
            for field in ("source", "sourceName", "sourceType", "page")
        )
    ]
    source_present = bool(valid_sources)

    if not source_present:
        return {
            "source_present": check_result(
                FAIL, "No source attached to answer"
            ),
            "page_number_present": not_applicable_result(
                "Cannot evaluate page number because no source is attached",
            ),
        }

    missing_page_count = 0
    invalid_page_count = 0
    for source in valid_sources:
        page = str(source.get("page") or "").strip()
        if not page:
            missing_page_count += 1
        elif not _is_plausible_page_value(page):
            invalid_page_count += 1
    page_number_present = missing_page_count == 0 and invalid_page_count == 0

    if page_number_present:
        page_detail = "Every source includes a page number."
    elif missing_page_count and invalid_page_count:
        page_detail = (
            f"{missing_page_count} source(s) have no page number and "
            f"{invalid_page_count} have a non-page placeholder value."
        )
    elif invalid_page_count:
        page_detail = (
            f"{invalid_page_count} source(s) have a page value that is not "
            "a real page number (e.g. 'N/A' or 'TBD')."
        )
    else:
        page_detail = f"{missing_page_count} source(s) have no page number."

    return {
        "source_present": check_result(
            PASS, f"{len(valid_sources)} source(s) provided."
        ),
        "page_number_present": check_result(
            PASS if page_number_present else FAIL, page_detail
        ),
    }


if __name__ == "__main__":
    test_cases = {
        "empty_sources": [],
        "source_without_page": [
            {
                "source": "https://example.com/wheat-guide",
                "page": "",
                "sourceName": "Package of Practices Wheat Punjab",
            }
        ],
        "source_with_page": [
            {
                "source": "https://example.com/wheat-guide",
                "page": "12,13",
                "sourceName": "Package of Practices Wheat Punjab",
            }
        ],
    }

    for case_name, case_sources in test_cases.items():
        print(f"{case_name}:")
        from normalizer import normalize_answer

        context = normalize_answer({"sources": case_sources})
        print(json.dumps(check_sources(context), indent=2))
