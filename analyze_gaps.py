"""
GDB Gap Analysis Pipeline
==========================
Reads disclaimer-triggered queries (in production: MongoDB `disclaimer_queries`
collection; here: disclaimer_queries.json) and produces:

  1. Structured clusters keyed by (Crop, Domain, State, Intent), refined with
     TF-IDF + KMeans text clustering so near-duplicate phrasings of the same
     underlying question collapse into one gap.
  2. Weekly volume series per cluster.
  3. Gap scoring: high-volume gaps and fast-growing gaps (WoW / trailing
     4-week trend).
  4. A Crop x Domain and State x Domain coverage heatmap matrix.
  5. A prioritized GDB Gap Report (JSON + human-readable) with outreach
     planning recommendations.

Output: analysis_output.json -- consumed by the FastAPI layer (api.py) and,
for this demo, directly embedded into the React dashboard.
"""
import json
from collections import defaultdict
from datetime import datetime
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans

with open("disclaimer_queries.json") as f:
    RECORDS = json.load(f)

WEEKS = sorted(set(r["week_start"] for r in RECORDS))
N_WEEKS = len(WEEKS)


# ---------------------------------------------------------------------------
# 1. Structured clustering by Crop x Domain x State
#    (Intent tracked as a sub-dimension within each cluster)
# ---------------------------------------------------------------------------
def structured_key(r):
    return (r["crop"], r["domain"], r["state"])

groups = defaultdict(list)
for r in RECORDS:
    groups[structured_key(r)].append(r)


# ---------------------------------------------------------------------------
# 2. Text-level sub-clustering with TF-IDF + KMeans
#    Within each structured group, collapse near-duplicate phrasings.
#    This mirrors what a sentence-transformers embedding + clustering step
#    would do, using a lighter-weight offline-friendly TF-IDF approach.
# ---------------------------------------------------------------------------
def subcluster_questions(questions, max_k=3):
    if len(questions) < 6:
        return {"n_subclusters": 1, "representative": questions[0]}
    vec = TfidfVectorizer(max_features=200, stop_words="english")
    X = vec.fit_transform(questions)
    k = min(max_k, max(1, len(questions) // 8))
    if k <= 1:
        return {"n_subclusters": 1, "representative": questions[0]}
    km = KMeans(n_clusters=k, n_init=4, random_state=42).fit(X)
    # representative = question closest to the largest cluster's centroid
    sizes = np.bincount(km.labels_)
    biggest = sizes.argmax()
    idxs = [i for i, l in enumerate(km.labels_) if l == biggest]
    center = km.cluster_centers_[biggest]
    dists = [np.linalg.norm(X[i].toarray()[0] - center) for i in idxs]
    rep = questions[idxs[int(np.argmin(dists))]]
    return {"n_subclusters": int(k), "representative": rep}


# ---------------------------------------------------------------------------
# 3. Weekly series + growth scoring per cluster
# ---------------------------------------------------------------------------
def weekly_series(records):
    counts = {w: 0 for w in WEEKS}
    for r in records:
        counts[r["week_start"]] += 1
    return [counts[w] for w in WEEKS]

def growth_rate(series):
    """Compare trailing 2 weeks vs the prior 2 weeks (WoW momentum)."""
    if len(series) < 4:
        return 0.0
    recent = sum(series[-2:])
    prior = sum(series[-4:-2])
    if prior == 0:
        return 100.0 if recent > 0 else 0.0
    return round(((recent - prior) / prior) * 100, 1)

def total_volume(series):
    return sum(series)


clusters = []
for (crop, domain, state), recs in groups.items():
    series = weekly_series(recs)
    vol = total_volume(series)
    if vol < 4:
        continue  # too sparse to be an actionable gap
    growth = growth_rate(series)
    questions = [r["question_text"] for r in recs]
    sub = subcluster_questions(questions)
    intent_counts = defaultdict(int)
    for r in recs:
        intent_counts[r["intent"]] += 1
    top_intent = max(intent_counts, key=intent_counts.get)

    # Priority score: blends absolute volume with momentum, so both chronic
    # high-traffic gaps and newly-emerging spikes surface near the top.
    priority_score = round(vol * 0.6 + max(growth, 0) * 0.4, 1)

    clusters.append({
        "crop": crop,
        "domain": domain,
        "state": state,
        "top_intent": top_intent,
        "intent_breakdown": dict(intent_counts),
        "total_volume": vol,
        "weekly_series": series,
        "growth_pct": growth,
        "priority_score": priority_score,
        "representative_question": sub["representative"],
        "n_question_variants": sub["n_subclusters"],
        "sample_questions": list({q for q in questions})[:5],
    })

clusters.sort(key=lambda c: c["priority_score"], reverse=True)


# ---------------------------------------------------------------------------
# 4. Gap classification
# ---------------------------------------------------------------------------
HIGH_VOLUME_THRESHOLD = np.percentile([c["total_volume"] for c in clusters], 75)
FAST_GROWTH_THRESHOLD = 40.0  # % growth, trailing 2wk vs prior 2wk

high_volume_gaps = sorted(
    [c for c in clusters if c["total_volume"] >= HIGH_VOLUME_THRESHOLD],
    key=lambda c: c["total_volume"], reverse=True
)[:10]

fast_growing_gaps = sorted(
    [c for c in clusters if c["growth_pct"] >= FAST_GROWTH_THRESHOLD and c["total_volume"] >= 10],
    key=lambda c: c["growth_pct"], reverse=True
)[:10]


# ---------------------------------------------------------------------------
# 5. Coverage heatmaps
# ---------------------------------------------------------------------------
def build_heatmap(dim_a_key, dim_b_key, records):
    dim_a_vals = sorted(set(r[dim_a_key] for r in records))
    dim_b_vals = sorted(set(r[dim_b_key] for r in records))
    matrix = {a: {b: 0 for b in dim_b_vals} for a in dim_a_vals}
    for r in records:
        matrix[r[dim_a_key]][r[dim_b_key]] += 1
    return {"rows": dim_a_vals, "cols": dim_b_vals, "matrix": matrix}

crop_domain_heatmap = build_heatmap("crop", "domain", RECORDS)
state_domain_heatmap = build_heatmap("state", "domain", RECORDS)


# ---------------------------------------------------------------------------
# 6. Outreach planning recommendations
#    Simple rule-based planner: turns top gaps into concrete field-team /
#    content-team actions. In production this could route to a task queue.
# ---------------------------------------------------------------------------
def recommend_action(cluster):
    if cluster["growth_pct"] >= 60:
        urgency = "Immediate"
        action = (f"Deploy an SOP/advisory note on {cluster['domain'].lower()} for "
                   f"{cluster['crop']} in {cluster['state']} within 1 week; this pattern "
                   f"is escalating fast and looks like an emerging seasonal event.")
    elif cluster["total_volume"] >= HIGH_VOLUME_THRESHOLD:
        urgency = "This sprint"
        action = (f"Commission a dedicated GDB knowledge article + verified expert answer "
                   f"for {cluster['crop']} {cluster['domain'].lower()} queries in "
                   f"{cluster['state']}; chronic high-volume gap.")
    else:
        urgency = "Backlog"
        action = (f"Add to content backlog: {cluster['crop']} {cluster['domain'].lower()} "
                   f"coverage for {cluster['state']}.")
    return {"urgency": urgency, "recommended_action": action}

outreach_plan = []
seen = set()
for c in (fast_growing_gaps + high_volume_gaps):
    key = (c["crop"], c["domain"], c["state"])
    if key in seen:
        continue
    seen.add(key)
    rec = recommend_action(c)
    outreach_plan.append({
        "crop": c["crop"], "domain": c["domain"], "state": c["state"],
        "total_volume": c["total_volume"], "growth_pct": c["growth_pct"],
        "priority_score": c["priority_score"],
        **rec,
    })
outreach_plan.sort(key=lambda x: {"Immediate": 0, "This sprint": 1, "Backlog": 2}[x["urgency"]])


# ---------------------------------------------------------------------------
# 7. Weekly GDB Gap Report summary
# ---------------------------------------------------------------------------
report = {
    "report_week": WEEKS[-1],
    "period_covered": f"{WEEKS[0]} to {WEEKS[-1]}",
    "total_disclaimer_queries": len(RECORDS),
    "total_gap_clusters": len(clusters),
    "high_volume_threshold": round(HIGH_VOLUME_THRESHOLD, 1),
    "fast_growth_threshold_pct": FAST_GROWTH_THRESHOLD,
    "headline_stats": {
        "top_gap_by_volume": {
            "crop": high_volume_gaps[0]["crop"], "domain": high_volume_gaps[0]["domain"],
            "state": high_volume_gaps[0]["state"], "volume": high_volume_gaps[0]["total_volume"],
        } if high_volume_gaps else None,
        "top_gap_by_growth": {
            "crop": fast_growing_gaps[0]["crop"], "domain": fast_growing_gaps[0]["domain"],
            "state": fast_growing_gaps[0]["state"], "growth_pct": fast_growing_gaps[0]["growth_pct"],
        } if fast_growing_gaps else None,
        "immediate_actions_count": len([o for o in outreach_plan if o["urgency"] == "Immediate"]),
    },
}

output = {
    "generated_at": datetime.utcnow().isoformat() + "Z",
    "weeks": WEEKS,
    "report": report,
    "clusters": clusters,
    "high_volume_gaps": high_volume_gaps,
    "fast_growing_gaps": fast_growing_gaps,
    "crop_domain_heatmap": crop_domain_heatmap,
    "state_domain_heatmap": state_domain_heatmap,
    "outreach_plan": outreach_plan,
}

with open("analysis_output.json", "w") as f:
    json.dump(output, f, indent=2)

print(f"Clusters found: {len(clusters)}")
print(f"High-volume gaps: {len(high_volume_gaps)} | Fast-growing gaps: {len(fast_growing_gaps)}")
print(f"Outreach actions generated: {len(outreach_plan)}")
print("Top 5 by priority score:")
for c in clusters[:5]:
    print(f"  {c['crop']:12s} | {c['domain']:20s} | {c['state']:15s} | vol={c['total_volume']:3d} | growth={c['growth_pct']:6.1f}% | score={c['priority_score']}")
