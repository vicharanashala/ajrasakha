"""Export of the weekly GDB Gap Report as Markdown / CSV (for email, Slack, outreach planning)."""
from __future__ import annotations

import csv
import io


def to_csv(report: dict) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["rank", "crop", "domain", "intent", "representative_question", "open_queries", "last_7d", "prev_7d",
                "growth", "trend", "states", "priority_score"])
    for c in report["top_clusters"]:
        w.writerow([c["rank"], c["crop"], c["domain"], c["intent"], c["label"], c["open"], c["recent_7d"], c["prev_7d"],
                    c["growth"], c["trend"], "; ".join(f"{s['state']} ({s['count']})" for s in c["states"][:4]), c["priority_score"]])
    return buf.getvalue()


def to_markdown(report: dict) -> str:
    s, p = report["summary"], report["params"]
    gen = report["generated_at"]
    lines = [
        f"# GDB Gap Report — {report['_id']}",
        f"_Generated {gen:%Y-%m-%d %H:%M} UTC · window {p['lookback_days']} days · embeddings: {p['embedding_backend']}_",
        "",
        "## Summary",
        f"- Disclaimer-triggered queries: **{s['disclaimer_queries']}** ({s['open_gaps']} still unanswered)",
        f"- Question clusters: **{s['clusters_total']}** ({s['clusters_ranked']} large enough to rank, {s['growing_clusters']} growing)",
        f"- States affected: **{s['states_affected']}**",
        "",
        f"## Top {len(report['top_clusters'])} question types needing GDB coverage",
        "| # | Crop | Domain | Representative question | Open | 7d | Trend | States | Score |",
        "|---|------|--------|-------------------------|-----:|---:|-------|--------|------:|",
    ]
    for c in report["top_clusters"]:
        st = ", ".join(x["state"] for x in c["states"][:3])
        q = c["label"].replace("|", "/")
        lines.append(f"| {c['rank']} | {c['crop']} | {c['domain']} | {q} | {c['open']} | {c['recent_7d']} | {c['trend']} | {st} | {c['priority_score']} |")
    lines += ["", "## Outreach priorities by state"]
    for o in report["outreach"][:10]:
        lines.append(f"- **{o['state']}** — {o['recommendation']}")
    return "\n".join(lines) + "\n"
