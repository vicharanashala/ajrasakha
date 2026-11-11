# API reference

Base URL: `http://localhost:8000` (dev). All endpoints are `GET`, read-only, JSON.
Interactive docs: `/docs` (Swagger) and `/redoc`.

| Endpoint | Purpose | Notable params |
|---|---|---|
| `/health` | liveness; `?db=true` also pings MongoDB | `db` |
| `/gaps/summary` | KPI block for the dashboard header (totals, coverage counts, top gap, critical count) | — |
| `/gaps/report/latest` | the most recent gap report document (see shape below) | — |
| `/gaps/reports` | list of past reports (id, dates, totals) | `limit` (≤ 100) |
| `/gaps/clusters` | scored clusters for a run, best first | `run_id` (default latest), `limit`, `domain`, `state`, `crop` |
| `/gaps/heatmap` | coverage cells for a run; `by_crop=true` returns the domain × state × crop view | `run_id`, `by_crop` |
| `/gaps/trends` | weekly unanswered-query counts by domain | `weeks` (≤ 52) |

`404` from `/gaps/*` means no report exists yet — run `python -m pipeline.run_gap_report`.

## Report document (`/gaps/report/latest`)

```jsonc
{
  "report_type": "weekly_gap_report",
  "run_id": "20261008T001713-0d648f",
  "period_days": 90, "start_date": "...", "end_date": "...", "generated_at": "...",
  "total_disclaimers": 310, "unique_queries": 121, "clusters_found": 37,
  "excluded_non_agricultural": 25, "excluded_test_traffic": 15,
  "top_gaps": [{
    "cluster_id": "...-c001", "cluster_name": "Mustard Aphid Attack Pest Control",
    "size": 30, "farmer_demand": 25, "growth_rate": -1.0, "priority_score": 75.0,
    "priority_level": "CRITICAL", "keywords": ["aphid", "mustard", ...],
    "sample_queries": ["..."], "domains": ["Pest Control"], "states": ["Rajasthan", ...],
    "crops": ["Mustard"], "first_seen": "...", "last_seen": "...",
    "recommended_action": "High demand - commission 6 expert-validated GDB entries on ..."
  }],
  "coverage_stats": {
    "heatmap": [{ "domain": "Crop Disease", "state": "Punjab", "crop": null,
                  "gdb_count": 1, "disclaimer_count": 22, "coverage_score": 4.3, "status": "gap" }],
    "total_combinations": 56, "covered": 24, "partial": 14, "gaps": 18
  },
  "outreach_recommendations": [{ "target_state": "Punjab", "focus_domain": "Crop Disease",
                                 "gap_questions": 22, "recommendation": "...", "priority": "CRITICAL" }],
  "domains_with_gaps": [{ "domain": "Crop Disease", "gap_count": 53 }],
  "states_with_gaps":  [{ "state": "Maharashtra", "gap_count": 70 }],
  "crops_with_gaps":   [{ "crop": "Mustard", "gap_count": 30 }],
  "crop_coverage": { "heatmap": [ /* same cell shape, with "crop" set */ ], "gaps": 51, ... }
}
```

`total_disclaimers` counts the queries actually analysed. Off-topic questions and synthetic
test traffic are excluded before analysis and reported separately in the two `excluded_*`
fields, so neither can inflate a gap.

## Cluster document (`/gaps/clusters`)

Adds to the fields above: `weekly_counts` (oldest → newest), `unique_farmers`,
`frequency_score`, `trend_score`, `farmers_score`, `geography_score`, `gap_score` (0..1),
`crop_distribution` / `state_distribution` / `domain_distribution` / `language_distribution`
(name → count), `representative_queries`.

## Pipeline CLI

```
python -m pipeline.run_gap_report [--period-days N] [--dry-run]
```
`--dry-run` computes and prints the report without writing to Mongo. Output is aggregate
only (no farmer identifiers).
