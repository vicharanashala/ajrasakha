"""
Renders ai/ajrasakha/evaluation/quality_trends.html from the score history in
trends_store.py (Postgres when DATABASE_URL is set, SQLite otherwise - see
that module's docstring). Plain HTML/CSS, no charting library, no external
requests - safe to regenerate on every evaluation run. `db_path` below is
only meaningful on the SQLite fallback path; fetch_history() ignores it when
Postgres is active.
"""

import html
from datetime import datetime
from pathlib import Path

from ajrasakha.evaluation.trends_store import DEFAULT_DB_PATH, fetch_history

DEFAULT_HTML_PATH = Path(__file__).resolve().parent / "quality_trends.html"

REGRESSION_THRESHOLD = 0.10  # relative drop vs the immediately preceding run


def _detect_regressions(runs: list[dict]) -> list[dict]:
    """
    Compare each run's domain+metric score to the immediately preceding run.
    A metric absent from the previous run (no prior baseline) is never flagged.
    """
    regressions = []

    for i in range(1, len(runs)):
        prev_run = runs[i - 1]
        curr_run = runs[i]

        for domain, metrics in curr_run["domains"].items():
            prev_metrics = prev_run["domains"].get(domain, {})

            for metric, new_score in metrics.items():
                prev_score = prev_metrics.get(metric)
                if prev_score is None or prev_score == 0:
                    continue

                drop = (prev_score - new_score) / prev_score
                if drop > REGRESSION_THRESHOLD:
                    regressions.append(
                        {
                            "domain": domain,
                            "metric": metric,
                            "prev_score": prev_score,
                            "new_score": new_score,
                            "drop_pct": drop * 100,
                            "prev_ts": prev_run["run_timestamp"],
                            "new_ts": curr_run["run_timestamp"],
                        }
                    )

    return regressions


def _collect_series(runs: list[dict]) -> dict:
    """domain -> metric -> [score-or-None per run, aligned to run order]."""
    domain_metrics = set()
    for run in runs:
        for domain, metrics in run["domains"].items():
            for metric in metrics:
                domain_metrics.add((domain, metric))

    series: dict[str, dict[str, list]] = {}
    for domain, metric in sorted(domain_metrics):
        values = [run["domains"].get(domain, {}).get(metric) for run in runs]
        series.setdefault(domain, {})[metric] = values

    return series


def _format_timestamp(ts: str) -> str:
    """Display-only formatting; falls back to the raw string if it isn't ISO-8601."""
    try:
        dt = datetime.fromisoformat(ts)
        return dt.strftime("%b %d, %H:%M UTC")
    except ValueError:
        return ts


def _score_bar(score, drop_pct: float | None = None) -> str:
    if score is None:
        return '<span class="na">—</span>'

    pct = max(0, min(100, round(score * 100)))
    badge = f'<span class="drop-badge">▼ {drop_pct:.0f}%</span>' if drop_pct else ""
    return (
        '<div class="bar-cell">'
        f'<div class="bar-track"><div class="bar-fill" style="width:{pct}%"></div></div>'
        f'<span class="bar-label">{score:.2f}</span>{badge}'
        "</div>"
    )


LEGEND_HTML = """
<div class="legend">
  <span class="legend-item"><span class="legend-swatch swatch-ok"></span>score (higher is better)</span>
  <span class="legend-item"><span class="legend-swatch swatch-regression"></span>flagged regression (&gt;10% drop vs. previous run)</span>
  <span class="legend-item"><span class="na">—</span>&nbsp;no data for this run</span>
</div>
"""


def _stat_card(label: str, value, status: str = "") -> str:
    cls = f"stat-card status-{status}" if status else "stat-card"
    value_cls = f"stat-value {status}" if status else "stat-value"
    return (
        f'<div class="{cls}">'
        f'<div class="stat-label">{html.escape(label)}</div>'
        f'<div class="{value_cls}">{value}</div>'
        "</div>"
    )


def render_html(runs: list[dict], regressions: list[dict]) -> str:
    timestamps = [run["run_timestamp"] for run in runs]
    series = _collect_series(runs)
    regression_drop = {(r["domain"], r["metric"], r["new_ts"]): r["drop_pct"] for r in regressions}

    # Presentation-only aggregation for the stat-card row - pure counts over
    # data already computed above (runs / series / regressions); no new
    # detection logic, nothing recomputed.
    domain_count = len(series)
    metric_count = len({metric for metrics in series.values() for metric in metrics})
    regression_count = len(regressions)

    stat_cards_html = (
        _stat_card("Runs tracked", len(runs))
        + _stat_card(
            "Regressions detected",
            regression_count,
            status="critical" if regression_count else "good",
        )
        + _stat_card("Domains covered", domain_count)
        + _stat_card("Metrics tracked", metric_count)
    )

    if regressions:
        items = "".join(
            "<li>"
            f'<strong>{html.escape(r["domain"])} — {html.escape(r["metric"])}</strong> '
            f'dropped {r["prev_score"]:.2f} → {r["new_score"]:.2f} '
            f'({r["drop_pct"]:.0f}% drop) since last run'
            "</li>"
            for r in regressions
        )
        alert_html = (
            '<div class="alert-banner">'
            '<div class="alert-icon">⚠</div>'
            '<div class="alert-body">'
            '<div class="alert-title">Quality regressions detected</div>'
            f"<ul>{items}</ul>"
            "</div></div>"
        )
    else:
        alert_html = (
            '<div class="ok-banner">'
            '<div class="alert-icon">✓</div>'
            '<div class="alert-body"><div class="alert-title">No regressions detected.</div></div>'
            "</div>"
        )

    header_cells = "".join(f"<th>{html.escape(_format_timestamp(ts))}</th>" for ts in timestamps)

    if not runs:
        rows_html = '<tr><td>No quality data logged yet.</td></tr>'
    else:
        rows_html = ""
        for domain in sorted(series):
            colspan = len(timestamps) + 1
            rows_html += (
                f'<tr class="domain-row"><td colspan="{colspan}">{html.escape(domain)}</td></tr>'
            )

            for metric in sorted(series[domain]):
                values = series[domain][metric]
                cells = ""
                for i, score in enumerate(values):
                    ts = timestamps[i]
                    drop_pct = regression_drop.get((domain, metric, ts))
                    cls = ' class="regression-cell"' if drop_pct else ""
                    cells += f"<td{cls}>{_score_bar(score, drop_pct)}</td>"
                rows_html += f'<tr><td class="metric-name">{html.escape(metric)}</td>{cells}</tr>'

    return f"""<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>AjraSakha Quality Trends</title>
<style>
  :root {{
    --bg: #0b0f14;
    --surface: #11161d;
    --surface-2: #161b22;
    --border: #21262d;
    --ink: #e6edf3;
    --ink-secondary: #9198a1;
    --ink-muted: #6e7681;
    --accent: #58a6ff;
    --good: #3fb950;
    --good-bg: #0d2818;
    --good-border: #2ea043;
    --good-text: #7ee2a8;
    --critical: #f85149;
    --critical-bg: #3d1418;
    --critical-text: #ffb3b8;
    --radius: 10px;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--ink);
    margin: 0;
    padding: 40px 24px 64px;
  }}
  .page {{ max-width: 920px; margin: 0 auto; }}

  .report-header {{ margin-bottom: 28px; }}
  h1 {{ font-size: 26px; font-weight: 650; letter-spacing: -0.01em; margin: 0 0 6px; }}
  .tagline {{ color: var(--ink-secondary); font-size: 14px; margin: 0 0 10px; }}
  .subtitle {{ color: var(--ink-muted); font-size: 12.5px; margin: 0; }}

  .stat-row {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin: 24px 0 28px; }}
  .stat-card {{ background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; }}
  .stat-card.status-critical {{ border-color: rgba(248,81,73,0.35); background: linear-gradient(180deg, rgba(248,81,73,0.08), var(--surface) 65%); }}
  .stat-card.status-good {{ border-color: rgba(63,185,80,0.30); background: linear-gradient(180deg, rgba(63,185,80,0.07), var(--surface) 65%); }}
  .stat-label {{ font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-muted); margin-bottom: 10px; }}
  .stat-value {{ font-size: 30px; font-weight: 650; line-height: 1; color: var(--ink); }}
  .stat-value.critical {{ color: var(--critical); }}
  .stat-value.good {{ color: var(--good); }}

  .legend {{ display:flex; flex-wrap:wrap; gap:16px; margin-bottom:20px; padding:12px 16px; background: var(--surface); border:1px solid var(--border); border-radius: var(--radius); font-size:12px; color: var(--ink-secondary); }}
  .legend-item {{ display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }}
  .legend-swatch {{ width:12px; height:12px; border-radius:3px; display:inline-block; }}
  .swatch-ok {{ background: var(--good); }}
  .swatch-regression {{ background: var(--critical); }}

  .alert-banner, .ok-banner {{
    display: flex; align-items: flex-start; gap: 14px;
    border-radius: var(--radius); margin-bottom: 24px; padding: 16px 20px;
  }}
  .alert-banner {{ background: var(--critical-bg); border: 1px solid rgba(248,81,73,0.55); box-shadow: 0 0 0 1px rgba(248,81,73,0.12), 0 8px 24px -12px rgba(248,81,73,0.45); }}
  .ok-banner {{ background: var(--good-bg); border: 1px solid var(--good-border); }}
  .alert-icon {{
    flex-shrink: 0; width: 30px; height: 30px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; font-weight: 700;
  }}
  .alert-banner .alert-icon {{ background: rgba(248,81,73,0.18); color: var(--critical); }}
  .ok-banner .alert-icon {{ background: rgba(63,185,80,0.18); color: var(--good); }}
  .alert-title {{ font-size: 15px; font-weight: 650; }}
  .alert-banner .alert-title {{ color: var(--critical-text); }}
  .ok-banner .alert-title {{ color: var(--good-text); }}
  .alert-banner ul {{ margin: 10px 0 0; padding: 0 0 0 18px; color: var(--critical-text); font-size: 13px; line-height: 1.6; }}

  .table-card {{ background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }}
  .table-scroll {{ overflow-x: auto; }}
  table {{ border-collapse: collapse; width: 100%; font-size: 13px; min-width: 480px; }}
  th, td {{ padding: 10px 16px; border-bottom: 1px solid var(--border); text-align: left; }}
  th {{ color: var(--ink-muted); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; position: sticky; top: 0; background: var(--surface-2); }}
  .domain-row td {{ font-weight: 650; background: var(--surface-2); color: var(--accent); padding-top: 18px; border-bottom-color: var(--border); }}
  .metric-name {{ color: var(--ink); padding-left: 28px; }}
  tbody tr:not(.domain-row):hover td {{ background: rgba(255,255,255,0.025); }}
  .regression-cell {{ background: rgba(248,81,73,0.10); }}
  .regression-cell:hover {{ background: rgba(248,81,73,0.10) !important; }}
  .bar-cell {{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }}
  .bar-track {{ width:64px; height:6px; background: var(--border); border-radius:3px; overflow:hidden; flex-shrink:0; }}
  .bar-fill {{ height:100%; background: var(--good); }}
  .regression-cell .bar-fill {{ background: var(--critical); }}
  .bar-label {{ font-variant-numeric: tabular-nums; color: var(--ink); }}
  .drop-badge {{ font-size:11px; font-weight: 600; color: var(--critical-text); background: rgba(248,81,73,0.16); border:1px solid rgba(248,81,73,0.5); border-radius:4px; padding:2px 6px; }}
  .na {{ color: var(--ink-muted); }}

  .page-footer {{ margin-top: 20px; color: var(--ink-muted); font-size: 11.5px; }}
</style>
</head>
<body>
<div class="page">
  <header class="report-header">
    <h1>AjraSakha Answer-Quality Trends</h1>
    <p class="tagline">Per-domain, per-metric regression tracking for the answer evaluation pipeline.</p>
    <p class="subtitle">{len(runs)} run(s) tracked · regression threshold: {int(REGRESSION_THRESHOLD * 100)}% drop vs previous run</p>
  </header>

  <div class="stat-row">{stat_cards_html}</div>

  {LEGEND_HTML}
  {alert_html}

  <div class="table-card">
  <div class="table-scroll">
  <table>
    <thead><tr><th>Metric</th>{header_cells}</tr></thead>
    <tbody>{rows_html}</tbody>
  </table>
  </div>
  </div>

  <p class="page-footer">Generated by generate_trend_report.py · static HTML, no JS, regenerated on every pipeline run.</p>
</div>
</body>
</html>"""


def generate_trend_report(
    db_path: Path = DEFAULT_DB_PATH,
    output_path: Path = DEFAULT_HTML_PATH,
    last_n_runs: int = 10,
    force_sqlite: bool = False,
) -> Path:
    runs = fetch_history(db_path=db_path, last_n_runs=last_n_runs, force_sqlite=force_sqlite)
    regressions = _detect_regressions(runs)
    html_content = render_html(runs, regressions)

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html_content, encoding="utf-8")

    return output_path


if __name__ == "__main__":
    path = generate_trend_report()
    print(f"Quality trend report written to: {path.resolve()}")
