#!/usr/bin/env python3
"""aggregate_results.py - Per-scenario SLA aggregator (Project 7)."""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

try:
    import yaml
    _HAS_YAML = True
except ImportError:
    _HAS_YAML = False


SLA_P95_ALLOCATE_MS = 800.0
SLA_HTTP_5XX_RATIO  = 0.001
SLA_QUEUE_WAIT_S    = 60.0
SLA_COSINE_P95_MS   = 1500.0
SLA_REP_DRIFT_MAX   = 0
_S4_DEFAULT_BUDGETS_MS = {
    "POST /api/auth/login": 400.0,
    "GET /api/questions/queue-details": 500.0,
    "POST /api/questions/allocated": 600.0,
    "POST /:qid/feedback-reviewer": 800.0,
    "POST /api/answers/moderator/approve": 1200.0,
}


def _repo_root():
    return Path(__file__).resolve().parents[2]


def _load_budgets():
    yaml_path = _repo_root() / "testing" / "config" / "sla.yaml"
    if yaml_path.exists() and _HAS_YAML:
        with open(yaml_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {
        "scenarios": {
            "1x_locust":  {"s5_http_5xx_ratio_max": SLA_HTTP_5XX_RATIO,
                           "s3_end_queue_length_max": 100},
            "5x_locust":  {"s5_http_5xx_ratio_max": SLA_HTTP_5XX_RATIO,
                           "s3_end_queue_length_max": 500},
            "10x_locust": {"s5_http_5xx_ratio_max": SLA_HTTP_5XX_RATIO,
                           "s3_end_queue_length_max": 1000},
        },
        "sla_gates": {
            "S1": {"budget_ms": SLA_QUEUE_WAIT_S * 1000.0},
            "S2": {"budget_ms": SLA_P95_ALLOCATE_MS},
            "S3": {},
            "S4": {"endpoint_budgets_ms": dict(_S4_DEFAULT_BUDGETS_MS)},
            "S5": {},
            "S6": {"budget_drift": SLA_REP_DRIFT_MAX},
            "S7": {"budget_ms": SLA_COSINE_P95_MS},
        },
    }


def _read_csv(path):
    if not path.exists():
        return []
    with open(path, "r", newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _percentile(values, p):
    if not values:
        return 0.0
    s = sorted(values)
    k = (len(s) - 1) * p
    f, c = int(k), min(int(k) + 1, len(s) - 1)
    if f == c:
        return s[int(k)]
    return s[f] + (s[c] - s[f]) * (k - f)


def _per_endpoint(rows):
    by_name = {}
    err_by_name = {}
    tot_by_name = {}
    for r in rows:
        name = r.get("name") or ""
        if not name:
            continue
        try:
            rt = float(r.get("response_time_ms") or 0)
        except ValueError:
            rt = 0.0
        by_name.setdefault(name, []).append(rt)
        tot_by_name[name] = tot_by_name.get(name, 0) + 1
        try:
            code = int(r.get("status_code") or 0)
        except ValueError:
            code = 0
        if 500 <= code <= 599:
            err_by_name[name] = err_by_name.get(name, 0) + 1

    out = {}
    for name, lst in by_name.items():
        out[name] = {
            "count":     len(lst),
            "p50_ms":    _percentile(lst, 0.50),
            "p95_ms":    _percentile(lst, 0.95),
            "p99_ms":    _percentile(lst, 0.99),
            "max_ms":    max(lst),
            "err_count": err_by_name.get(name, 0),
            "err_ratio": (err_by_name.get(name, 0) / max(1, tot_by_name[name])),
        }
    return out


def _cosine_p95(rows):
    rt = []
    for r in rows:
        if "check-duplicate" in (r.get("endpoint") or ""):
            try:
                rt.append(float(r["response_time_ms"]))
            except (KeyError, ValueError):
                pass
    return _percentile(rt, 0.95) if rt else 0.0


def _end_queue_lengths(rows):
    if not rows:
        return {}
    by_ep = {}
    for r in rows:
        ep = r.get("endpoint") or ""
        try:
            ts = float(r.get("timestamp") or 0)
            ql = int(r.get("queue_length") or 0)
        except ValueError:
            continue
        by_ep.setdefault(ep, []).append((ts, ql))
    out = {}
    for ep, samples in by_ep.items():
        samples.sort(key=lambda x: x[0])
        n = max(1, len(samples) // 20)
        tail = [q for _, q in samples[-n:]]
        out[ep] = int(round(sum(tail) / len(tail))) if tail else 0
    return out


def _s4_breaches(agg, budgets):
    breaches = []
    for name, v in agg.items():
        for key, budget in budgets.items():
            if key in name:
                if v["p95_ms"] > budget:
                    breaches.append((name, v["p95_ms"], budget))
                break
    return breaches


def _sla_summary(scenario, agg, rep_drift_count, cosine_p95_ms, end_queue_lengths, budgets):
    out = []
    scen_cfg = (budgets.get("scenarios") or {}).get(scenario) or {}
    gates    = budgets.get("sla_gates") or {}

    max_latency_ms = max((v["max_ms"] for v in agg.values()), default=0.0)
    s1_budget_ms = float((gates.get("S1") or {}).get("budget_ms")
                         or (SLA_QUEUE_WAIT_S * 1000))
    out.append(("S1", "queue_wait_proxy", max_latency_ms <= s1_budget_ms,
                f"max_latency={max_latency_ms:.0f}ms budget={s1_budget_ms:.0f}ms"))

    s2_budget_ms = float((gates.get("S2") or {}).get("budget_ms")
                         or SLA_P95_ALLOCATE_MS)
    alloc = [v["p95_ms"] for k, v in agg.items() if "allocat" in k]
    worst = max(alloc) if alloc else 0.0
    out.append(("S2", "allocator_p95", worst <= s2_budget_ms,
                f"worst_allocate_p95={worst:.1f}ms budget={s2_budget_ms:.1f}ms"))

    s3_threshold = int(scen_cfg.get("s3_end_queue_length_max") or 0)
    if end_queue_lengths:
        worst_end = max(end_queue_lengths.values())
        worst_ep  = max(end_queue_lengths, key=lambda k: end_queue_lengths[k])
        out.append(("S3", "queue_drained", worst_end <= s3_threshold,
                    f"worst_end={worst_end} ({worst_ep}) budget={s3_threshold} per-scenario"))
    else:
        out.append(("S3", "queue_drained", True,
                    f"no queue_lengths.csv - skipped (budget={s3_threshold})"))

    s4_budgets = dict((gates.get("S4") or {}).get("endpoint_budgets_ms")
                      or _S4_DEFAULT_BUDGETS_MS)
    breaches = _s4_breaches(agg, s4_budgets)
    if not agg:
        s4_pass = True
        s4_detail = "no requests observed"
    else:
        s4_pass = (len(breaches) == 0)
        if breaches:
            rows = ", ".join(f"{n}={obs:.0f}ms>bdg={bdg:.0f}ms" for n, obs, bdg in breaches[:3])
            s4_detail = (f"{len(breaches)} breach(es); first: {rows} "
                         f"(of {len(s4_budgets)} budgeted endpoints)")
        else:
            n_with_budget = sum(1 for name in agg if any(k in name for k in s4_budgets))
            s4_detail = f"all {n_with_budget} budgeted endpoints within budget"
    out.append(("S4", "per_endpoint_p95", s4_pass, s4_detail))

    s5_budget = float(scen_cfg.get("s5_http_5xx_ratio_max") or SLA_HTTP_5XX_RATIO)
    worst5 = max((v["err_ratio"] for v in agg.values()), default=0.0)
    worst5_name = (max(agg, key=lambda k: agg[k]["err_ratio"]) if agg else "")
    out.append(("S5", "http_5xx", worst5 <= s5_budget,
                f"worst_5xx_ratio={worst5:.4%} ({worst5_name}) budget={s5_budget:.4%} per-scenario"))

    s6_budget = int((gates.get("S6") or {}).get("budget_drift") or SLA_REP_DRIFT_MAX)
    out.append(("S6", "reputation_mismatches", rep_drift_count <= s6_budget,
                f"drift_count={rep_drift_count} budget={s6_budget}"))

    s7_budget_ms = float((gates.get("S7") or {}).get("budget_ms") or SLA_COSINE_P95_MS)
    out.append(("S7", "cosine_p95", cosine_p95_ms <= s7_budget_ms,
                f"p95={cosine_p95_ms:.1f}ms budget={s7_budget_ms:.1f}ms"))

    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenario", required=True)
    args = ap.parse_args()

    repo = _repo_root()
    budgets = _load_budgets()

    scen_dir = repo / "results" / args.scenario
    scen_dir.mkdir(parents=True, exist_ok=True)

    req_rows = _read_csv(scen_dir / "requests.csv")
    ass_rows = _read_csv(scen_dir / "assertions.csv")
    ql_rows  = _read_csv(scen_dir / "queue_lengths.csv")

    agg = _per_endpoint(req_rows)
    cosine_p95_ms = _cosine_p95(req_rows)
    end_ql = _end_queue_lengths(ql_rows)

    out_csv = scen_dir / "aggregated.csv"
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["scenario", "name", "count", "p50_ms", "p95_ms",
                    "p99_ms", "max_ms", "err_count", "err_ratio"])
        for name, v in sorted(agg.items()):
            w.writerow([
                args.scenario, name,
                int(v["count"]),
                f"{v['p50_ms']:.1f}", f"{v['p95_ms']:.1f}",
                f"{v['p99_ms']:.1f}", f"{v['max_ms']:.1f}",
                int(v["err_count"]), f"{v['err_ratio']:.4%}",
            ])

    rep_drift = int(sum(int(r["count"]) for r in ass_rows if r.get("assertion_key") == "REP_DRIFT"))
    summary = _sla_summary(
        scenario=args.scenario,
        agg=agg,
        rep_drift_count=rep_drift,
        cosine_p95_ms=cosine_p95_ms,
        end_queue_lengths=end_ql,
        budgets=budgets,
    )
    sla_csv = scen_dir / "sla_summary.csv"
    with open(sla_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["scenario", "sla_id", "name", "passed", "detail"])
        for sla_id, name, passed, detail in summary:
            w.writerow([args.scenario, sla_id, name, int(bool(passed)), detail])

    runs_csv = repo / "results" / "aggregated" / "_runs.csv"
    runs_csv.parent.mkdir(parents=True, exist_ok=True)
    new_file = not runs_csv.exists()
    with open(runs_csv, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if new_file:
            w.writerow(["scenario", "sla_pass", "sla_gate_count", "p95_max_ms", "err_ratio_max"])
        sla_pass = bool(all(p for _, _, p, _ in summary))
        w.writerow([
            args.scenario,
            int(sla_pass),
            len(summary),
            f"{max((v['p95_ms'] for v in agg.values()), default=0):.1f}",
            f"{max((v['err_ratio'] for v in agg.values()), default=0):.4%}",
        ])

    overall = "PASS" if all(p for _, _, p, _ in summary) else "FAIL"
    n_pass = sum(1 for _, _, p, _ in summary if p)
    print(f"[aggregate] {args.scenario}: {overall} ({n_pass}/{len(summary)} gates) -> {out_csv.name} {sla_csv.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
