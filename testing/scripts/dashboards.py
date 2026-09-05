#!/usr/bin/env python3
"""
dashboards.py - Generate a self-contained HTML dashboard from the latest CSVs.

Reads:
  results/aggregated/_runs.csv
  results/<scenario>/aggregated.csv       (per-endpoint p50/p95/p99/max/err)
  results/<scenario>/sla_summary.csv      (S1..S7 gate results)
  results/<scenario>/reputation_drift.csv (S6 drift detail)

Writes:
  results/dashboards/index.html           (open in any browser)

The output is fully static (no JS fetches at load time), so opening it
via `file://` works in Chrome/Firefox/Edge without a server.

Usage:
  python testing/scripts/dashboards.py            # build for all 3 scenarios
  python testing/scripts/dashboards.py --scenario 1x_locust
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import sys
from pathlib import Path
from typing import Any, Dict, List


SCENARIOS = ["1x_locust", "5x_locust", "10x_locust"]


def _read_csv(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    with open(path, "r", newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _load_scenario(repo: Path, scenario: str) -> Dict[str, Any]:
    scen_dir = repo / "results" / scenario
    return {
        "scenario": scenario,
        "aggregated": _read_csv(scen_dir / "aggregated.csv"),
        "sla":       _read_csv(scen_dir / "sla_summary.csv"),
        "drift":     _read_csv(scen_dir / "reputation_drift.csv"),
    }


HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Ajrasakha Load Test Dashboard</title>
<style>
  :root {{
    --bg: #0f172a;
    --panel: #1e293b;
    --panel-2: #273449;
    --ink: #e2e8f0;
    --ink-dim: #94a3b8;
    --pass: #22c55e;
    --fail: #ef4444;
    --warn: #f59e0b;
    --accent: #38bdf8;
  }}
  * {{ box-sizing: border-box; }}
  body {{ font: 14px/1.45 -apple-system, system-ui, "Segoe UI", Roboto, sans-serif;
         margin: 0; background: var(--bg); color: var(--ink); }}
  header {{ padding: 18px 28px; border-bottom: 1px solid #334155;
           display: flex; justify-content: space-between; align-items: baseline; }}
  header h1 {{ margin: 0; font-size: 18px; font-weight: 600; }}
  header small {{ color: var(--ink-dim); }}
  main {{ padding: 24px 28px; max-width: 1400px; margin: 0 auto; }}
  section {{ background: var(--panel); border-radius: 8px; padding: 20px;
            margin-bottom: 20px; }}
  section h2 {{ margin: 0 0 16px; font-size: 15px; font-weight: 600;
               color: var(--accent); letter-spacing: 0.04em;
               text-transform: uppercase; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
  th, td {{ padding: 7px 10px; text-align: left; border-bottom: 1px solid #334155; }}
  th {{ color: var(--ink-dim); font-weight: 500; font-size: 11px;
       text-transform: uppercase; letter-spacing: 0.05em; }}
  tr:last-child td {{ border-bottom: none; }}
  .num {{ text-align: right; font-variant-numeric: tabular-nums; }}
  .ok  {{ color: var(--pass); }}
  .ng  {{ color: var(--fail); font-weight: 600; }}
  .pill {{ display: inline-block; padding: 2px 8px; border-radius: 10px;
          font-size: 11px; font-weight: 600; }}
  .pill-ok  {{ background: rgba(34, 197, 94, 0.15);  color: var(--pass); }}
  .pill-ng  {{ background: rgba(239, 68, 68, 0.15);  color: var(--fail); }}
  .grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }}
  .card {{ background: var(--panel-2); border-radius: 6px; padding: 16px; }}
  .card h3 {{ margin: 0 0 4px; font-size: 12px; font-weight: 500;
             color: var(--ink-dim); text-transform: uppercase;
             letter-spacing: 0.04em; }}
  .card .big {{ font-size: 28px; font-weight: 600;
               font-variant-numeric: tabular-nums; }}
  .legend {{ font-size: 11px; color: var(--ink-dim); margin-top: 12px; }}
  details summary {{ cursor: pointer; color: var(--accent); }}
  .bar {{ display: inline-block; height: 6px; background: var(--accent);
         border-radius: 3px; vertical-align: middle; margin-left: 8px; }}
</style>
</head>
<body>
<header>
  <h1>Ajrasakha Reviewer Load Test Dashboard</h1>
  <small>generated {generated_at} - SLA budgets from testing/config/sla.yaml</small>
</header>
<main>
  <section>
    <h2>Scenario summary</h2>
    <div class="grid">
      {summary_cards}
    </div>
  </section>

  <section>
    <h2>SLA gates (S1-S7)</h2>
    <table>
      <thead>
        <tr>
          <th>Scenario</th>
          <th>S1 queue_wait</th>
          <th>S2 allocator_p95</th>
          <th>S3 queue_drained</th>
          <th>S4 per_endpoint_p95</th>
          <th>S5 http_5xx</th>
          <th>S6 reputation</th>
          <th>S7 cosine_p95</th>
          <th class="num">Total</th>
        </tr>
      </thead>
      <tbody>
        {sla_rows}
      </tbody>
    </table>
  </section>

  {per_scenario_sections}
</main>
</body>
</html>
"""


def _summary_cards(data: List[Dict[str, Any]]) -> str:
    cards = []
    for s in data:
        total = len(s["sla"])
        passed = sum(1 for r in s["sla"] if r.get("passed") == "1")
        cards.append(
            f'<div class="card">'
            f'<h3>{html.escape(s["scenario"])}</h3>'
            f'<div class="big">{passed}/{total}</div>'
            f'<div class="legend">SLA gates passing</div>'
            f'</div>'
        )
    return "\n".join(cards)


def _sla_row(s: Dict[str, Any]) -> str:
    by_id = {r["sla_id"]: r for r in s["sla"]}
    def cell(gate_id: str) -> str:
        r = by_id.get(gate_id)
        if not r:
            return '<td class="num">-</td>'
        passed = r["passed"] == "1"
        cls = "pill-ok" if passed else "pill-ng"
        sym = "&#10003;" if passed else "&#10007;"
        # truncate long details
        d = html.escape(r["detail"][:48] + ("..." if len(r["detail"]) > 48 else ""))
        return (f'<td><span class="pill {cls}">{sym}</span>'
                f' <span class="legend">{d}</span></td>')

    total = len(s["sla"])
    passed = sum(1 for r in s["sla"] if r["passed"] == "1")
    return (
        f"<tr><td><b>{html.escape(s['scenario'])}</b></td>"
        + cell("S1") + cell("S2") + cell("S3") + cell("S4")
        + cell("S5") + cell("S6") + cell("S7")
        + f'<td class="num">{passed}/{total}</td></tr>'
    )


def _sla_rows(data: List[Dict[str, Any]]) -> str:
    return "\n".join(_sla_row(s) for s in data)


def _per_scenario_section(s: Dict[str, Any]) -> str:
    rows = []
    for r in s["aggregated"]:
        err_ratio = r.get("err_ratio", "0.0000%")
        cls = "ng" if err_ratio not in ("0.0000%", "") else ""
        rows.append(
            f"<tr><td>{html.escape(r['name'])}</td>"
            f'<td class="num">{r["count"]}</td>'
            f'<td class="num">{r["p50_ms"]}</td>'
            f'<td class="num">{r["p95_ms"]}</td>'
            f'<td class="num">{r["p99_ms"]}</td>'
            f'<td class="num">{r["max_ms"]}</td>'
            f'<td class="num {cls}">{err_ratio}</td>'
            f"</tr>"
        )
    body = "\n".join(rows)
    drift_rows = "".join(
        f"<tr><td>{html.escape(r['user_id'])}</td>"
        f'<td class="num">{r["snapshot"]}</td>'
        f'<td class="num">{r["live"]}</td>'
        f'<td class="num">{r["abs_delta"]}</td>'
        f'<td class="num">{r["drift"]}</td></tr>'
        for r in s["drift"][:20]
    )
    drift_count = sum(1 for r in s["drift"] if r.get("drift") == "1")
    return f"""
  <section>
    <h2>{html.escape(s["scenario"])} - per-endpoint breakdown</h2>
    <table>
      <thead><tr>
        <th>Endpoint</th><th class="num">count</th>
        <th class="num">p50 ms</th><th class="num">p95 ms</th>
        <th class="num">p99 ms</th><th class="num">max ms</th>
        <th class="num">err %</th>
      </tr></thead>
      <tbody>{body}</tbody>
    </table>

    <details style="margin-top: 16px;">
      <summary>S6 reputation drift ({drift_count} flagged users)</summary>
      <table style="margin-top: 12px;">
        <thead><tr>
          <th>user_id</th>
          <th class="num">snapshot</th><th class="num">live</th>
          <th class="num">|delta|</th><th class="num">drift</th>
        </tr></thead>
        <tbody>{drift_rows or "<tr><td colspan=5>(none)</td></tr>"}</tbody>
      </table>
    </details>
  </section>
    """


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenario", choices=SCENARIOS + ["all"], default="all")
    args = ap.parse_args()

    repo = Path(__file__).resolve().parents[2]
    scenarios = SCENARIOS if args.scenario == "all" else [args.scenario]
    data = [_load_scenario(repo, s) for s in scenarios]

    import datetime
    generated_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    out = repo / "results" / "dashboards" / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(HTML.format(
        generated_at=generated_at,
        summary_cards=_summary_cards(data),
        sla_rows=_sla_rows(data),
        per_scenario_sections="\n".join(_per_scenario_section(s) for s in data),
    ), encoding="utf-8")

    print(f"[dashboards] wrote {out} ({len(data)} scenario(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
