"""Helper: writes the (new, clean) dashboard.html to the demo folder.

Run once after editing the chunks below.  Each chunk is a triple-quoted
raw-string so we don't fight Python's escaping rules.
"""
from pathlib import Path

# Chunk 1: HTML head + header + KPI section
CHUNK_1 = r"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GDB Gap Detector &mdash; Visual Demo</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
    .badge-critical { background:#fee2e2; color:#991b1b; }
    .badge-high     { background:#ffedd5; color:#9a3412; }
    .badge-medium   { background:#fef9c3; color:#854d0e; }
    .badge-low      { background:#f3f4f6; color:#374151; }
    .bar { transition: width .35s ease; }
  </style>
</head>
<body class="bg-slate-50 text-slate-900">

  <header class="bg-white border-b border-slate-200">
    <div class="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
      <div class="w-9 h-9 rounded bg-emerald-600 grid place-items-center text-white font-bold">G</div>
      <div>
        <h1 class="text-lg font-semibold leading-tight">GDB Coverage Gap Detector</h1>
        <p class="text-xs text-slate-500">Visual demo &mdash; calls live <code>POST /gdb/gap-report</code></p>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <button id="btn-refresh"
                class="px-3 py-2 text-sm rounded bg-emerald-600 hover:bg-emerald-700 text-white">
          Refresh report
        </button>
        <button id="btn-run-now"
                class="px-3 py-2 text-sm rounded bg-indigo-600 hover:bg-indigo-700 text-white">
          Run scheduler now
        </button>
        <button id="btn-invalidate"
                class="px-3 py-2 text-sm rounded bg-slate-200 hover:bg-slate-300 text-slate-700">
          Invalidate cache
        </button>
      </div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-6 py-6 space-y-6">

    <section id="kpis" class="grid grid-cols-2 md:grid-cols-6 gap-3"></section>

"""

# Chunk 2: Top gaps table + coverage + recos (right column)
CHUNK_2 = r"""
    <section class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="bg-white rounded-lg border border-slate-200 p-4 lg:col-span-2">
        <div class="flex items-center mb-3">
          <h2 class="font-semibold">Top priority gaps</h2>
          <span class="ml-2 text-xs text-slate-400">sorted by priority_score</span>
          <select id="priority-filter"
                  class="ml-auto text-xs border border-slate-300 rounded px-2 py-1">
            <option value="all">All priorities</option>
            <option value="critical">Critical only</option>
            <option value="high">High only</option>
            <option value="medium">Medium only</option>
            <option value="low">Low only</option>
          </select>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
              <tr>
                <th class="text-left py-2 pr-3">Theme</th>
                <th class="text-left py-2 pr-3">Crop</th>
                <th class="text-left py-2 pr-3">State</th>
                <th class="text-right py-2 pr-3">Cur / Prev</th>
                <th class="text-right py-2 pr-3">Growth</th>
                <th class="text-right py-2 pr-3">Score</th>
                <th class="text-left py-2">Priority</th>
              </tr>
            </thead>
            <tbody id="gap-rows" class="divide-y divide-slate-100">
              <tr><td colspan="7" class="py-6 text-center text-slate-400">loading&hellip;</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="space-y-4">
        <div class="bg-white rounded-lg border border-slate-200 p-4">
          <h2 class="font-semibold mb-3">GDB coverage</h2>
          <div id="coverage-bands" class="space-y-2 text-sm">
            <div class="text-slate-400">loading&hellip;</div>
          </div>
        </div>
        <div class="bg-white rounded-lg border border-slate-200 p-4">
          <h2 class="font-semibold mb-3">Recommendations</h2>
          <ul id="recos" class="space-y-3 text-sm">
            <li class="text-slate-400">loading&hellip;</li>
          </ul>
        </div>
      </div>
    </section>

"""

# Chunk 3: clusters list, scheduler, raw JSON, footer, </main>, <script>
CHUNK_3 = r"""
    <section class="bg-white rounded-lg border border-slate-200 p-4">
      <h2 class="font-semibold mb-3">Clusters &mdash; full list</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
            <tr>
              <th class="text-left py-2 pr-3">Theme</th>
              <th class="text-left py-2 pr-3">Priority</th>
              <th class="text-right py-2 pr-3">Size</th>
              <th class="text-right py-2 pr-3">Score</th>
              <th class="text-right py-2 pr-3">Growth</th>
              <th class="text-left py-2 pr-3">Crops</th>
              <th class="text-left py-2 pr-3">States</th>
              <th class="text-left py-2">Sample</th>
            </tr>
          </thead>
          <tbody id="cluster-rows" class="divide-y divide-slate-100">
            <tr><td colspan="8" class="py-6 text-center text-slate-400">loading&hellip;</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="bg-white rounded-lg border border-slate-200 p-4">
      <div class="flex items-center mb-3">
        <h2 class="font-semibold">Scheduler</h2>
        <button id="btn-state"
                class="ml-auto text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200">
          Reload state
        </button>
      </div>
      <div id="scheduler-state" class="text-sm text-slate-600">loading&hellip;</div>
    </section>

    <section class="bg-slate-900 text-slate-100 rounded-lg p-4">
      <details>
        <summary class="cursor-pointer text-sm font-semibold">Raw report JSON</summary>
        <pre id="raw-json" class="mt-3 text-xs whitespace-pre-wrap break-words overflow-auto max-h-96"></pre>
      </details>
    </section>

    <p class="text-center text-xs text-slate-400 py-4">
      Demo &mdash; in-memory corpus, deterministic seed.  Real deployment uses MongoDB + sentence-transformers + Firebase auth.
    </p>

  </main>

<script>
/* ---------- tiny helpers ---------- */
const fmtPct = x => (x == null) ? "\u2014" : (x >= 0 ? "+" : "") + x.toFixed(1) + "%";
const escape = s => String(s ?? "").replace(/[&<>]/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

async function getJSON(url, opts) {
  const r = await fetch(url, Object.assign(
    { headers: { "Content-Type": "application/json" } }, opts || {}));
  if (!r.ok) throw new Error(url + " -> " + r.status);
  return r.json();
}

async function postJSON(url, body) {
  return getJSON(url, { method: "POST", body: JSON.stringify(body || {}) });
}

/* ---------- data loaders ---------- */
async function loadReport(refresh = false) {
  const report = await postJSON("/gdb/gap-report", { refresh });
  renderKPIs(report);
  renderGapTable(report);
  renderCoverage(report);
  renderRecos(report);
  renderClusters(report);
  document.getElementById("raw-json").textContent = JSON.stringify(report, null, 2);
  return report;
}

async function loadState() {
  try {
    const s = await getJSON("/gdb/scheduler/state");
    renderState(s);
    return s;
  } catch (e) {
    const el = document.getElementById("scheduler-state");
    if (el) el.innerHTML =
      '<div class="text-rose-500">scheduler unreachable: ' + escape(e.message) + '</div>';
    return null;
  }
}
"""
# Chunk 4a: renderers (KPIs, GapTable, Coverage, Recos)
CHUNK_4A = r"""
/* ---------- renderers ---------- */
function renderKPIs(r) {
  const gaps = r.gaps_by_priority || {};
  const cards = [
    { label: "Queries analysed",  value: r.total_queries_analyzed ?? 0 },
    { label: "Clusters",          value: r.total_clusters_found ?? 0 },
    { label: "Critical gaps",     value: gaps.critical ?? 0 },
    { label: "High gaps",         value: gaps.high ?? 0 },
    { label: "Medium gaps",       value: gaps.medium ?? 0 },
    { label: "Demand (cur/prev)", value: (r.current_query_count ?? 0) + " / " + (r.previous_query_count ?? 0) },
  ];
  document.getElementById("kpis").innerHTML = cards.map(c => `
    <div class="bg-white rounded-lg border border-slate-200 p-3">
      <div class="text-xs text-slate-500">${escape(c.label)}</div>
      <div class="text-2xl font-semibold mt-1">${escape(c.value)}</div>
    </div>`).join("");
}

function renderGapTable(r) {
  const filter = document.getElementById("priority-filter").value;
  const rows = (r.top_gaps || []).filter(
    g => filter === "all" || g.priority === filter);
  const tbody = document.getElementById("gap-rows");
  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="py-6 text-center text-slate-400">no gaps match the filter</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(g => {
    const badge = "badge-" + (g.priority || "low");
    const growth = fmtPct(g.avg_weekly_growth_pct);
    const score = (g.priority_score ?? 0).toFixed(1);
    return `
      <tr>
        <td class="py-2 pr-3 font-medium">${escape(g.theme)}</td>
        <td class="py-2 pr-3">${escape(g.top_crop || "\u2014")}</td>
        <td class="py-2 pr-3">${escape(g.top_state || "\u2014")}</td>
        <td class="py-2 pr-3 text-right tabular-nums">${g.query_count ?? 0} / ${g.previous_query_count ?? 0}</td>
        <td class="py-2 pr-3 text-right tabular-nums">${growth}</td>
        <td class="py-2 pr-3 text-right tabular-nums">${score}</td>
        <td class="py-2"><span class="inline-block px-2 py-0.5 rounded text-xs font-semibold ${badge}">${escape(g.priority)}</span></td>
      </tr>`;
  }).join("");
}

function renderCoverage(r) {
  const bands = r.coverage_bands || {};
  const total = Object.values(bands).reduce((a, b) => a + b, 0) || 1;
  const labels = { STRONG: "Strong", PARTIAL: "Partial", GAP: "Gap" };
  const colors = { STRONG: "bg-emerald-500", PARTIAL: "bg-amber-500", GAP: "bg-rose-500" };
  const html = Object.keys(labels).map(k => {
    const v = bands[k] ?? 0;
    const pct = (v / total * 100).toFixed(1);
    return `
      <div>
        <div class="flex justify-between text-xs">
          <span>${labels[k]}</span><span class="tabular-nums">${v} (${pct}%)</span>
        </div>
        <div class="h-2 bg-slate-100 rounded mt-1 overflow-hidden">
          <div class="h-2 ${colors[k]} bar" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join("");
  document.getElementById("coverage-bands").innerHTML = html;
}

function renderRecos(r) {
  const ul = document.getElementById("recos");
  const items = r.recommendations || [];
  if (!items.length) {
    ul.innerHTML = '<li class="text-slate-400">no recommendations</li>';
    return;
  }
  ul.innerHTML = items.map(s => `
    <li class="flex gap-2">
      <span class="text-emerald-500 mt-0.5">&#9656;</span>
      <span class="text-slate-700">${escape(s)}</span>
    </li>`).join("");
}
"""

# Chunk 4b: renderers (Clusters, State) + event wiring + bootstrap + closing tags
CHUNK_4B = r"""
function renderClusters(r) {
  const tbody = document.getElementById("cluster-rows");
  const clusters = (r.clusters || [])
    .slice()
    .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));
  if (!clusters.length) {
    tbody.innerHTML =
      '<tr><td colspan="8" class="py-6 text-center text-slate-400">no clusters</td></tr>';
    return;
  }
  tbody.innerHTML = clusters.map(c => `
    <tr>
      <td class="py-2 pr-3 font-medium">${escape(c.theme)}</td>
      <td class="py-2 pr-3"><span class="inline-block px-2 py-0.5 rounded text-xs font-semibold badge-${c.priority}">${escape(c.priority)}</span></td>
      <td class="py-2 pr-3 text-right tabular-nums">${c.total_query_count ?? c.query_count ?? 0}</td>
      <td class="py-2 pr-3 text-right tabular-nums">${(c.priority_score ?? 0).toFixed(1)}</td>
      <td class="py-2 pr-3 text-right tabular-nums">${fmtPct(c.avg_weekly_growth_pct)}</td>
      <td class="py-2 pr-3 text-xs">${escape((c.crops || []).join(", ") || "\u2014")}</td>
      <td class="py-2 pr-3 text-xs">${escape((c.states || []).join(", ") || "\u2014")}</td>
      <td class="py-2 text-xs text-slate-500 max-w-md truncate">${escape((c.sample_queries || []).slice(0, 2).join("  \u00b7  "))}</td>
    </tr>`).join("");
}

function renderState(s) {
  const el = document.getElementById("scheduler-state");
  if (!el) return;
  if (!s || typeof s !== "object") {
    el.innerHTML = '<div class="text-slate-400">no scheduler state available</div>';
    return;
  }
  const last = s.last_run || null;
  const lastAt  = last && last.at ? new Date(last.at).toLocaleString() : "\u2014";
  const lastN   = last ? (last.clusters ?? "\u2014") : "\u2014";
  const lastGaps = last ? JSON.stringify(last.priority_gaps || {}) : "\u2014";
  el.innerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div>
        <div class="text-xs text-slate-400">Running</div>
        <div>${s.running ? "yes" : "no"}</div>
      </div>
      <div>
        <div class="text-xs text-slate-400">Last run</div>
        <div>${escape(lastAt)}</div>
      </div>
      <div>
        <div class="text-xs text-slate-400">Last clusters</div>
        <div>${escape(lastN)}</div>
      </div>
      <div>
        <div class="text-xs text-slate-400">Last gap buckets</div>
        <div class="font-mono text-xs">${escape(lastGaps)}</div>
      </div>
    </div>`;
}

/* ---------- event wiring ---------- */
document.getElementById("btn-refresh").onclick    = () => loadReport(true);
document.getElementById("btn-run-now").onclick    = async () => {
  await postJSON("/gdb/scheduler/run-now", {});
  await loadState();
  await loadReport(true);
};
document.getElementById("btn-invalidate").onclick = async () => {
  await postJSON("/gdb/scheduler/invalidate-cache", {});
  await loadReport(true);
};
document.getElementById("btn-state").onclick      = () => loadState();
document.getElementById("priority-filter").onchange = () =>
  loadReport().then(r => renderGapTable(r));

/* ---------- bootstrap ---------- */
(async () => {
  await loadReport();
  await loadState();
  setInterval(loadState, 8000);
})();
</script>

</body>
</html>
"""

OUT = Path(__file__).resolve().parent / "dashboard.html"
DASHBOARD_HTML = CHUNK_1 + CHUNK_2 + CHUNK_3 + CHUNK_4A + CHUNK_4B
OUT.write_text(DASHBOARD_HTML, encoding="utf-8")
print(f"wrote {OUT}  ({len(DASHBOARD_HTML)} chars)")
"""
  ul.innerHTML = items.map(rec => `
    <li class="border-l-4 pl-3 border-emerald-500">
      <div class="font-medium">${escape(rec.title || rec.theme || "")}</div>
      <div class="text-xs text-slate-500">${escape(rec.action || rec.suggested_action || "")}</div>
      <div class="text-xs text-slate-400 mt-0.5">priority: ${escape(rec.priority || "")} &middot; size: ${rec.query_count ?? "?"}</div>
    </li>`).join("");
}
"""
