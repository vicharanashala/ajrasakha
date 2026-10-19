from collections import defaultdict
import logging
from gdb_gap_detector.models import (
    CoverageCell,
    DisclaimerLog,
    GdbEntry,
    OutreachRecommendation,
)

logger = logging.getLogger("gdb_gap_detector.coverage")


def calculate_coverage_heatmap(
    gdb_entries: list[GdbEntry],
    disclaimer_logs: list[DisclaimerLog],
) -> tuple[list[CoverageCell], list[OutreachRecommendation]]:
    """Stage 6: Calculate Coverage Heatmap Matrix and generate Outreach Recommendations."""

    gdb_counts: dict[tuple[str, str], int] = defaultdict(int)
    disclaimer_counts: dict[tuple[str, str], int] = defaultdict(int)

    all_domains: set[str] = set()
    all_states: set[str] = set()

    for gdb in gdb_entries:
        domain = (gdb.domain or "General").strip()
        state = (gdb.state or "None").strip()
        gdb_counts[(domain, state)] += 1
        all_domains.add(domain)
        all_states.add(state)

    for disc in disclaimer_logs:
        domain = (disc.domain or "General").strip()
        state = (disc.state or "None").strip()
        disclaimer_counts[(domain, state)] += 1
        all_domains.add(domain)
        all_states.add(state)

    # Remove fallback 'None' or 'All' if specific states exist
    clean_states = [s for s in all_states if s and s.lower() not in ["none", "null"]]
    if not clean_states and all_states:
        clean_states = ["All"]

    clean_domains = [d for d in all_domains if d and d.lower() not in ["none", "null"]]
    if not clean_domains and all_domains:
        clean_domains = ["General"]

    heatmap_cells: list[CoverageCell] = []
    recommendations: list[OutreachRecommendation] = []

    if not clean_domains or not clean_states:
        return heatmap_cells, recommendations

    for dom in clean_domains:
        for st in clean_states:
            g_count = gdb_counts.get((dom, st), 0)
            d_count = disclaimer_counts.get((dom, st), 0)
            total = g_count + d_count

            if total == 0:
                score = 0.0
                status = "no_data"
            elif d_count == 0:
                score = 100.0
                status = "good"
            else:
                score = round((g_count / total) * 100.0, 1)
                if score >= 70.0:
                    status = "good"
                elif score >= 30.0:
                    status = "partial"
                else:
                    status = "gap"

            cell = CoverageCell(
                domain=dom,
                state=st,
                gdb_count=g_count,
                disclaimer_count=d_count,
                coverage_score=score,
                status=status,
            )
            heatmap_cells.append(cell)

            # Generate Outreach Recommendation if disclaimers exist and status is gap
            if d_count > 0 and status in ["gap", "partial"]:
                rec_priority = "CRITICAL" if score < 15.0 else ("HIGH" if score < 30.0 else "MEDIUM")
                rec_text = (
                    f"Target field engagement in {st} for {dom}. "
                    f"Coverage is at {score}% with {d_count} unanswered farmer disclaimers."
                )
                recommendations.append(
                    OutreachRecommendation(
                        target_state=st,
                        focus_domain=dom,
                        gap_questions=d_count,
                        recommendation=rec_text,
                        priority=rec_priority,
                    )
                )

    # Sort recommendations by gap_questions descending
    recommendations.sort(key=lambda r: r.gap_questions, reverse=True)
    logger.info(f"Generated {len(heatmap_cells)} heatmap cells and {len(recommendations)} outreach recommendations.")
    return heatmap_cells, recommendations
