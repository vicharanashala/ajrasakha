"""Coverage heatmap: which domain x state (x crop) combinations the GDB covers well.

    coverage_score = gdb_count / (gdb_count + disclaimer_count) * 100

A cell with many GDB entries and few disclaimers is "good"; many disclaimers and
few/no entries is a "gap". Cells with neither are omitted (nothing to say).
GDB entries whose state is unknown are treated as national and credited to every
state that has at least one disclaimer in that domain, at a reduced weight
(``NATIONAL_WEIGHT``) so a single generic answer does not mask real regional gaps.
"""

from __future__ import annotations

from collections import Counter, defaultdict

from backend.app.models import CoverageStats, DisclaimerQuery, GdbEntry, HeatmapCell

NATIONAL_WEIGHT = 0.5
UNKNOWN_STATE = "Unknown"


def _status(score: float, good: float, partial: float) -> str:
    if score >= good * 100:
        return "good"
    if score >= partial * 100:
        return "partial"
    return "gap"


def build_heatmap(
    queries: list[DisclaimerQuery],
    entries: list[GdbEntry],
    good: float,
    partial: float,
    by_crop: bool = False,
) -> CoverageStats:
    """Domain x state (x crop when ``by_crop``) coverage cells."""

    def key(domain: str | None, state: str | None, crop: str | None):
        return (domain or "General", state or UNKNOWN_STATE, crop if by_crop else None)

    disc: Counter = Counter(key(q.domain, q.state, q.crop) for q in queries)

    gdb: defaultdict = defaultdict(float)
    national: defaultdict = defaultdict(float)  # (domain, crop) -> count of state-less entries
    for e in entries:
        if e.state:
            gdb[key(e.domain, e.state, e.crop)] += 1.0
        else:
            national[(e.domain or "General", e.crop if by_crop else None)] += 1.0

    cells: list[HeatmapCell] = []
    all_keys = set(disc) | set(gdb)
    for domain, state, crop in sorted(all_keys, key=lambda k: (k[0], k[1], k[2] or "")):
        g = gdb.get((domain, state, crop), 0.0) + NATIONAL_WEIGHT * national.get(
            (domain, crop), 0.0
        )
        d = disc.get((domain, state, crop), 0)
        if g == 0 and d == 0:
            continue
        score = round(100.0 * g / (g + d), 1) if (g + d) > 0 else 0.0
        cells.append(
            HeatmapCell(
                domain=domain,
                state=state,
                crop=crop,
                gdb_count=int(round(g)),
                disclaimer_count=d,
                coverage_score=score,
                status=_status(score, good, partial),  # type: ignore[arg-type]
            )
        )

    counts = Counter(c.status for c in cells)
    return CoverageStats(
        heatmap=cells,
        total_combinations=len(cells),
        covered=counts.get("good", 0),
        partial=counts.get("partial", 0),
        gaps=counts.get("gap", 0),
    )


def gaps_by(cells: list[HeatmapCell], field: str) -> list[dict]:
    """[{<field>: name, gap_count: n}] for cells whose status is "gap", sorted by count."""
    c: Counter = Counter()
    for cell in cells:
        if cell.status == "gap" and getattr(cell, field) is not None:
            c[getattr(cell, field)] += cell.disclaimer_count
    return [{field: name, "gap_count": n} for name, n in c.most_common()]
