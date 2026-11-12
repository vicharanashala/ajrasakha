import logging
from typing import Any
from gdb_gap_detector.core import settings

logger = logging.getLogger("gdb_gap_detector.overlap")


def triage_query_overlaps(
    unique_map: dict[str, dict[str, Any]],
    low_threshold: float | None = None,
    high_threshold: float | None = None,
) -> tuple[dict[str, str], dict[str, int]]:
    """Stage 3: GDB Gap Triage Model.

    Categorizes unique queries into:
    - 'real_gap' (score < 0.4 or None)
    - 'near_miss' (0.4 <= score < 0.7)
    - 'almost_covered' (score >= 0.7)

    Returns:
        tuple containing:
        - dict[query_hash, triage_status_str]
        - dict[triage_status_str, total_count]
    """
    low_t = low_threshold if low_threshold is not None else settings.near_miss_low_threshold
    high_t = high_threshold if high_threshold is not None else settings.near_miss_high_threshold

    triage_map: dict[str, str] = {}
    summary_counts: dict[str, int] = {
        "real_gap": 0,
        "near_miss": 0,
        "almost_covered": 0,
    }

    for q_hash, data in unique_map.items():
        scores = data.get("best_match_scores", [])
        if not scores:
            status = "real_gap"
        else:
            avg_score = float(sum(scores) / len(scores))
            if avg_score >= high_t:
                status = "almost_covered"
            elif avg_score >= low_t:
                status = "near_miss"
            else:
                status = "real_gap"

        triage_map[q_hash] = status
        summary_counts[status] += data.get("count", 1)

    logger.info(f"Triage Model Summary: {summary_counts}")
    return triage_map, summary_counts
