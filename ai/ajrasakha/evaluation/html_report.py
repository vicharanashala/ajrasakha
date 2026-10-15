"""
Visual Interactive HTML Dashboard Generator for Ajrasakha Evaluation Pipeline.
Generates modern, self-contained dashboard reports with 6-domain breakdown cards, metric gauges, and side-by-side diff viewers.
"""

import html
import json
from pathlib import Path
from typing import List, Dict, Any


def write_html_dashboard(
    results: List[Dict[str, Any]],
    summary: Dict[str, Any],
    output_file: str = "evaluation_dashboard.html",
    run_id: str = "eval-run",
    mode: str = "mock",
) -> str:
    """Generates an interactive HTML dashboard for the evaluation run."""
    output_path = Path(output_file)

    total_cases = summary.get("total_cases", len(results))
    technical_passed = summary.get("technical_passed", 0)
    quality_passed = summary.get("quality_passed", 0)
    domain_breakdown = summary.get("domain_breakdown", {})

    tech_rate = f"{(technical_passed / total_cases * 100):.1f}%" if total_cases > 0 else "0%"
    quality_rate = f"{(quality_passed / total_cases * 100):.1f}%" if total_cases > 0 else "0%"

    # Compute overall metric averages
    rel_scores = [r.get("relevance_score") for r in results if isinstance(r.get("relevance_score"), (int, float))]
    faith_scores = [r.get("faithfulness_score") for r in results if isinstance(r.get("faithfulness_score"), (int, float))]
    gdb_scores = [r.get("gdb_match_score") for r in results if isinstance(r.get("gdb_match_score"), (int, float))]
    agri_scores = [r.get("agri_correctness_score") for r in results if isinstance(r.get("agri_correctness_score"), (int, float))]

    avg_rel = round(sum(rel_scores) / len(rel_scores), 2) if rel_scores else 0.0
    avg_faith = round(sum(faith_scores) / len(faith_scores), 2) if faith_scores else 0.0
    avg_gdb = round(sum(gdb_scores) / len(gdb_scores), 2) if gdb_scores else 0.0
    avg_agri = round(sum(agri_scores) / len(agri_scores), 2) if agri_scores else 0.0

    # 6 Domain Cards HTML
    domain_cards_html = ""
    domain_icons = {
        "weather": "🌦️",
        "market": "📈",
        "soil": "🌱",
        "schemes": "🏛️",
        "gdb_queries": "🌾",
        "greetings": "🙏",
    }

    for d_name, d_data in domain_breakdown.items():
        icon = domain_icons.get(d_name.lower(), "📁")
        pass_rate_str = d_data.get("pass_rate", "0%")
        d_score = d_data.get("overall_domain_score", 0.0)

        domain_cards_html += f"""
        <div class="card domain-card">
            <div class="domain-header">
                <div class="domain-title-group">
                    <span class="domain-icon">{icon}</span>
                    <span class="domain-name">{html.escape(d_name.upper())}</span>
                </div>
                <span class="domain-badge">{pass_rate_str}</span>
            </div>
            <div class="domain-score-row">
                <span class="score-label">Domain Score:</span>
                <span class="score-val">{d_score} / 1.0</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: {pass_rate_str};"></div>
            </div>
            <div class="domain-stats-grid">
                <div class="d-stat"><span>Rel:</span> <strong>{d_data.get('avg_relevance', 0.0)}</strong></div>
                <div class="d-stat"><span>Faith:</span> <strong>{d_data.get('avg_faithfulness', 0.0)}</strong></div>
                <div class="d-stat"><span>GDB:</span> <strong>{d_data.get('avg_gdb_match', 0.0)}</strong></div>
                <div class="d-stat"><span>Agri:</span> <strong>{d_data.get('avg_agri_correctness', 0.0)}</strong></div>
            </div>
        </div>
        """

    # Table rows HTML
    table_rows_html = ""
    for idx, r in enumerate(results):
        case_name = r.get("name", "unnamed")
        domain = r.get("domain", "gdb_queries")
        query = r.get("query", "")
        actual = r.get("response_text", "")
        expected = r.get("expected_output", "")
        tech_pass = r.get("technical_pass", False)
        qual_pass = r.get("quality_overall_passed", False)
        
        rel_s = r.get("relevance_score", 0.0)
        faith_s = r.get("faithfulness_score", 0.0)
        gdb_s = r.get("gdb_match_score", 0.0)
        agri_s = r.get("agri_correctness_score", 0.0)

        tech_badge = '<span class="badge badge-success">PASS</span>' if tech_pass else '<span class="badge badge-danger">FAIL</span>'
        qual_badge = '<span class="badge badge-success">PASS</span>' if qual_pass else '<span class="badge badge-warning">CHECK</span>'

        modal_id = f"diff-modal-{idx}"
        diff_payload = json.dumps({
            "name": case_name,
            "domain": domain,
            "query": query,
            "actual": actual,
            "expected": expected,
            "rel": rel_s,
            "faith": faith_s,
            "gdb": gdb_s,
            "agri": agri_s,
            "rel_reason": r.get("relevance_reason", ""),
            "faith_reason": r.get("faithfulness_reason", ""),
            "gdb_reason": r.get("gdb_match_reason", ""),
            "agri_reason": r.get("agri_correctness_reason", ""),
        })

        table_rows_html += f"""
        <tr class="test-row" data-domain="{html.escape(domain)}">
            <td class="col-name"><strong>{html.escape(case_name)}</strong></td>
            <td class="col-domain"><span class="tag-domain">{html.escape(domain)}</span></td>
            <td class="col-tech">{tech_badge}</td>
            <td class="col-qual">{qual_badge}</td>
            <td class="col-score"><strong>{rel_s}</strong></td>
            <td class="col-score"><strong>{faith_s}</strong></td>
            <td class="col-score"><strong>{gdb_s}</strong></td>
            <td class="col-score"><strong>{agri_s}</strong></td>
            <td class="col-action">
                <button class="btn-diff" onclick='openDiffModal({diff_payload})'>View Diff</button>
            </td>
        </tr>
        """

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ajrasakha Evaluation Dashboard | {html.escape(mode.upper())}</title>
    <style>
        :root {{
            --bg-primary: #090d16;
            --bg-secondary: #111827;
            --bg-card: #1f2937;
            --border: #374151;
            --text-main: #f9fafb;
            --text-muted: #9ca3af;
            --accent-green: #10b981;
            --accent-blue: #38bdf8;
            --accent-purple: #a855f7;
            --accent-yellow: #f59e0b;
            --accent-red: #ef4444;
        }}
        * {{ box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }}
        body {{ background-color: var(--bg-primary); color: var(--text-main); padding: 2rem; line-height: 1.5; }}
        .container {{ max-width: 1350px; margin: 0 auto; }}
        header {{ display: flex; justify-content: space-between; align-items: center; padding-bottom: 2rem; border-bottom: 1px solid var(--border); margin-bottom: 2rem; }}
        .brand h1 {{ font-size: 1.8rem; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 0.5rem; }}
        .brand p {{ color: var(--text-muted); font-size: 0.95rem; margin-top: 0.25rem; }}

        .badge {{ padding: 0.35rem 0.75rem; border-radius: 9999px; font-weight: 700; font-size: 0.75rem; }}
        .badge-success {{ background: rgba(16, 185, 129, 0.2); color: var(--accent-green); border: 1px solid var(--accent-green); }}
        .badge-warning {{ background: rgba(245, 158, 11, 0.2); color: var(--accent-yellow); border: 1px solid var(--accent-yellow); }}
        .badge-danger {{ background: rgba(239, 68, 68, 0.2); color: var(--accent-red); border: 1px solid var(--accent-red); }}

        .kpi-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem; margin-bottom: 2rem; }}
        .card {{ background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; }}
        .kpi-title {{ font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }}
        .kpi-val {{ font-size: 2.2rem; font-weight: 800; color: #fff; }}
        .kpi-sub {{ font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem; }}

        .metric-gauges {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.25rem; margin-bottom: 2.5rem; }}
        .gauge-card {{ background: linear-gradient(145deg, #1f2937, #111827); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; }}
        .gauge-header {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }}
        .gauge-title {{ font-size: 0.9rem; font-weight: 600; color: #e5e7eb; }}
        .gauge-score {{ font-size: 1.7rem; font-weight: 800; color: var(--accent-blue); }}
        .gauge-thresh {{ font-size: 0.75rem; color: var(--text-muted); }}

        .section-title {{ font-size: 1.3rem; margin-bottom: 1.25rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; }}

        .domain-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.25rem; margin-bottom: 2.5rem; }}
        .domain-card {{ display: flex; flex-direction: column; justify-content: space-between; gap: 0.75rem; }}
        .domain-header {{ display: flex; justify-content: space-between; align-items: center; }}
        .domain-title-group {{ display: flex; align-items: center; gap: 0.5rem; }}
        .domain-icon {{ font-size: 1.3rem; }}
        .domain-name {{ font-weight: 700; font-size: 0.95rem; }}
        .domain-badge {{ font-size: 0.8rem; font-weight: 700; color: var(--accent-green); background: rgba(16, 185, 129, 0.15); padding: 0.2rem 0.5rem; border-radius: 6px; }}
        .domain-score-row {{ display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--text-muted); }}
        .domain-stats-grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; font-size: 0.75rem; background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 6px; text-align: center; }}
        .d-stat span {{ color: var(--text-muted); display: block; }}
        .d-stat strong {{ color: #e5e7eb; }}

        .progress-bar {{ width: 100%; height: 6px; background: rgba(255,255,255,0.08); border-radius: 9999px; overflow: hidden; }}
        .progress-fill {{ height: 100%; background: var(--accent-green); border-radius: 9999px; }}

        .controls-bar {{ display: flex; gap: 1rem; margin-bottom: 1rem; }}
        .search-input {{ flex: 1; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 0.6rem 1rem; color: #fff; font-size: 0.9rem; }}
        .filter-select {{ background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 0.6rem 1rem; color: #fff; font-size: 0.9rem; }}

        .table-card {{ padding: 0; overflow: hidden; margin-bottom: 2rem; }}
        table {{ width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem; }}
        th {{ background: #111827; padding: 0.9rem 1rem; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); border-bottom: 1px solid var(--border); }}
        td {{ padding: 1rem; border-bottom: 1px solid var(--border); }}
        tr:last-child td {{ border-bottom: none; }}
        tr:hover {{ background: rgba(255,255,255,0.02); }}

        .tag-domain {{ background: rgba(56, 189, 248, 0.15); color: var(--accent-blue); padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; }}
        .btn-diff {{ background: #374151; color: #fff; border: 1px solid #4b5563; padding: 0.35rem 0.75rem; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 600; }}
        .btn-diff:hover {{ background: #4b5563; }}

        /* Modal styling */
        .modal {{ display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); }}
        .modal-content {{ background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; width: 90%; max-width: 1000px; margin: 3% auto; padding: 2rem; max-height: 90vh; overflow-y: auto; color: var(--text-main); }}
        .modal-header {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 1rem; }}
        .close-btn {{ font-size: 1.5rem; font-weight: 700; color: var(--text-muted); cursor: pointer; background: none; border: none; }}
        .diff-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-top: 1rem; }}
        .diff-box {{ background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }}
        .diff-box h4 {{ font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem; text-transform: uppercase; }}
        .diff-box p {{ font-size: 0.9rem; line-height: 1.6; white-space: pre-wrap; }}
        .modal-metrics {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }}
        .m-card {{ background: rgba(0,0,0,0.25); border-radius: 8px; padding: 0.75rem; text-align: center; border: 1px solid var(--border); }}
        .m-card span {{ font-size: 0.75rem; color: var(--text-muted); display: block; }}
        .m-card strong {{ font-size: 1.2rem; color: var(--accent-blue); }}

        footer {{ text-align: center; color: var(--text-muted); font-size: 0.85rem; padding-top: 2rem; }}
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="brand">
                <h1>🌾 Ajrasakha Answer Evaluation Dashboard</h1>
                <p>Automated Golden Dataset (GDB) Validation, DeepEval Metrics & 6-Domain Tracking</p>
            </div>
            <div>
                <span class="badge badge-success">RUN ID: {html.escape(run_id)}</span>
            </div>
        </header>

        <div class="kpi-grid">
            <div class="card">
                <div class="kpi-title">Total Test Cases</div>
                <div class="kpi-val">{total_cases}</div>
                <div class="kpi-sub">Across 6 Agricultural Domains</div>
            </div>
            <div class="card">
                <div class="kpi-title">Technical Pass Rate</div>
                <div class="kpi-val" style="color: var(--accent-green);">{tech_rate}</div>
                <div class="kpi-sub">{technical_passed} / {total_cases} Scenarios Executed</div>
            </div>
            <div class="card">
                <div class="kpi-title">Quality Pass Rate</div>
                <div class="kpi-val" style="color: var(--accent-blue);">{quality_rate}</div>
                <div class="kpi-sub">{quality_passed} / {total_cases} Met Quality Thresholds</div>
            </div>
            <div class="card">
                <div class="kpi-title">Execution Mode</div>
                <div class="kpi-val" style="font-size: 1.8rem; text-transform: uppercase;">{html.escape(mode)}</div>
                <div class="kpi-sub">Deterministic Dry-Run Suite</div>
            </div>
        </div>

        <h2 class="section-title">📊 4 Core Quality Metrics</h2>
        <div class="metric-gauges">
            <div class="gauge-card">
                <div class="gauge-header">
                    <span class="gauge-title">1. Answer Relevancy</span>
                    <span class="gauge-score">{avg_rel}</span>
                </div>
                <div class="progress-bar"><div class="progress-fill" style="width: {int(avg_rel * 100)}%;"></div></div>
                <div class="gauge-thresh">Threshold: ≥ 0.70 (Anthropic Claude Judge)</div>
            </div>
            <div class="gauge-card">
                <div class="gauge-header">
                    <span class="gauge-title">2. Faithfulness</span>
                    <span class="gauge-score">{avg_faith}</span>
                </div>
                <div class="progress-bar"><div class="progress-fill" style="width: {int(avg_faith * 100)}%;"></div></div>
                <div class="gauge-thresh">Threshold: ≥ 0.70 (Hallucination Resistance)</div>
            </div>
            <div class="gauge-card">
                <div class="gauge-header">
                    <span class="gauge-title">3. GDB Match Score</span>
                    <span class="gauge-score">{avg_gdb}</span>
                </div>
                <div class="progress-bar"><div class="progress-fill" style="width: {int(avg_gdb * 100)}%;"></div></div>
                <div class="gauge-thresh">Threshold: ≥ 0.70 (Expert Golden Semantic Match)</div>
            </div>
            <div class="gauge-card">
                <div class="gauge-header">
                    <span class="gauge-title">4. Agricultural Correctness</span>
                    <span class="gauge-score">{avg_agri}</span>
                </div>
                <div class="progress-bar"><div class="progress-fill" style="width: {int(avg_agri * 100)}%;"></div></div>
                <div class="gauge-thresh">Threshold: ≥ 0.75 (Safety & Safe Dosages)</div>
            </div>
        </div>

        <h2 class="section-title">🌐 6-Domain Breakdown</h2>
        <div class="domain-grid">
            {domain_cards_html}
        </div>

        <h2 class="section-title">📋 Test Case Explorer & Diff Comparator</h2>
        <div class="controls-bar">
            <input type="text" id="searchInput" class="search-input" placeholder="Search test cases by query or name..." onkeyup="filterCases()">
            <select id="domainFilter" class="filter-select" onchange="filterCases()">
                <option value="all">All Domains</option>
                <option value="weather">Weather</option>
                <option value="market">Market Prices</option>
                <option value="soil">Soil Nutrient</option>
                <option value="schemes">Govt Schemes</option>
                <option value="gdb_queries">Cultural & Crop Protection</option>
                <option value="greetings">Greetings</option>
            </select>
        </div>

        <div class="card table-card">
            <table>
                <thead>
                    <tr>
                        <th>Case Name</th>
                        <th>Domain</th>
                        <th>Technical</th>
                        <th>Quality</th>
                        <th>Relevancy</th>
                        <th>Faithfulness</th>
                        <th>GDB Match</th>
                        <th>Agri Safety</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody id="caseTableBody">
                    {table_rows_html}
                </tbody>
            </table>
        </div>

        <footer>
            Ajrasakha Evaluation Pipeline • Powered by DeepEval & Anthropic Claude LLM Judge
        </footer>
    </div>

    <!-- Diff Modal -->
    <div id="diffModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <div>
                    <h3 id="modalCaseName" style="font-size: 1.3rem;">Case Details</h3>
                    <span id="modalDomain" class="tag-domain">Domain</span>
                </div>
                <button class="close-btn" onclick="closeDiffModal()">&times;</button>
            </div>

            <div class="modal-metrics">
                <div class="m-card"><span>Answer Relevancy</span><strong id="mRel">0.0</strong></div>
                <div class="m-card"><span>Faithfulness</span><strong id="mFaith">0.0</strong></div>
                <div class="m-card"><span>GDB Match</span><strong id="mGDB">0.0</strong></div>
                <div class="m-card"><span>Agricultural Safety</span><strong id="mAgri">0.0</strong></div>
            </div>

            <div style="margin-bottom: 1rem;">
                <h4 style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase;">User Query:</h4>
                <p id="modalQuery" style="font-weight: 600; font-size: 1.05rem; margin-top: 0.25rem; color: #fff;"></p>
            </div>

            <div class="diff-grid">
                <div class="diff-box">
                    <h4 style="color: var(--accent-blue);">Candidate Actual Output</h4>
                    <p id="modalActual" style="color: #e2e8f0;"></p>
                </div>
                <div class="diff-box">
                    <h4 style="color: var(--accent-green);">Expert Golden Expected Output (GDB)</h4>
                    <p id="modalExpected" style="color: #e2e8f0;"></p>
                </div>
            </div>
        </div>
    </div>

    <script>
        function filterCases() {{
            const search = document.getElementById('searchInput').value.toLowerCase();
            const domain = document.getElementById('domainFilter').value.toLowerCase();
            const rows = document.querySelectorAll('.test-row');

            rows.forEach(row => {{
                const text = row.innerText.toLowerCase();
                const rowDomain = row.getAttribute('data-domain').toLowerCase();
                const matchSearch = text.includes(search);
                const matchDomain = (domain === 'all' || rowDomain.includes(domain));
                row.style.display = (matchSearch && matchDomain) ? '' : 'none';
            }});
        }}

        function openDiffModal(data) {{
            document.getElementById('modalCaseName').innerText = data.name;
            document.getElementById('modalDomain').innerText = data.domain;
            document.getElementById('modalQuery').innerText = data.query;
            document.getElementById('modalActual').innerText = data.actual || '(No response text)';
            document.getElementById('modalExpected').innerText = data.expected || '(No golden output specified)';
            document.getElementById('mRel').innerText = data.rel;
            document.getElementById('mFaith').innerText = data.faith;
            document.getElementById('mGDB').innerText = data.gdb;
            document.getElementById('mAgri').innerText = data.agri;
            document.getElementById('diffModal').style.display = 'block';
        }}

        function closeDiffModal() {{
            document.getElementById('diffModal').style.display = 'none';
        }}

        window.onclick = function(event) {{
            const modal = document.getElementById('diffModal');
            if (event.target == modal) {{
                modal.style.display = "none";
            }}
        }}
    </script>
</body>
</html>
"""

    with open(output_path, mode="w", encoding="utf-8") as f:
        f.write(html_content)

    print(f"[Eval Dashboard] Visual HTML dashboard written to: {output_path.resolve()}")
    return str(output_path.resolve())

