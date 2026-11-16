"""The gap-detection pipeline: extract -> normalise -> cluster -> trend -> score -> report."""
from __future__ import annotations

import hashlib
import logging
import math
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from .clustering import cluster_queries, dominant, representative, top_keywords
from .config import settings
from .db import get_out_db, get_source_db
from . import sources
from .normalize import classify_intent, norm_crop, norm_domain, norm_state

log = logging.getLogger("gapdetector.pipeline")
N_WEEKS = 8


def _utc(d) -> datetime | None:
    if not isinstance(d, datetime):
        return None
    return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d.astimezone(timezone.utc)


def iso_week_id(d: datetime) -> str:
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


# --------------------------------------------------------------------------- extract
def _normalise(doc: dict) -> dict | None:
    created = _utc(doc.get("createdAt"))
    text = (doc.get("question") or doc.get("originalQuestion") or "").strip()
    if not created or not text:
        return None
    d = doc.get("details") or {}
    return {
        "id": str(doc.get("_id")),
        "text": text,
        "created": created,
        "status": doc.get("status", ""),
        "source": doc.get("source", ""),
        "crop": norm_crop(d.get("normalised_crop") or d.get("crop")),
        "state": norm_state(d.get("state")),
        "district": (d.get("district") or "").strip().title() or "Unknown",
        "domain": norm_domain(d.get("domain")),
        "intent": classify_intent(text),
    }


def extract_disclaimer_queries(db, now: datetime) -> list[dict]:
    since = now - timedelta(days=settings.lookback_days)
    cur = db[settings.questions_collection].find(
        {
            "source": {"$in": settings.disclaimer_sources},
            "createdAt": {"$gte": since},
            "isTesting": {"$ne": True},
            "isTrainingQuestion": {"$ne": True},
            "status": {"$nin": settings.ignored_statuses},
        },
        {"question": 1, "originalQuestion": 1, "details": 1, "createdAt": 1, "status": 1, "source": 1},
    )
    return [r for r in (_normalise(d) for d in cur) if r]


def extract_gdb_coverage(db) -> Counter:
    """Count GDB-answered (resolved) questions per (crop, state, domain), from every source."""
    cells: Counter = Counter()
    cur = db[settings.questions_collection].find(
        {"status": {"$in": settings.resolved_statuses}, "isTesting": {"$ne": True}},
        {"details": 1, "createdAt": 1},
    )
    for d in cur:
        det = d.get("details") or {}
        cells[(norm_crop(det.get("normalised_crop") or det.get("crop")), norm_state(det.get("state")), norm_domain(det.get("domain")))] += 1
    return cells


# --------------------------------------------------------------------------- scoring
def trend_stats(created: list[datetime], now: datetime) -> dict:
    weekly = [0] * N_WEEKS  # index 0 = oldest ... N_WEEKS-1 = most recent 7 days
    for c in created:
        age_w = int((now - c).total_seconds() // (7 * 86400))
        if 0 <= age_w < N_WEEKS:
            weekly[N_WEEKS - 1 - age_w] += 1
    recent, prev = weekly[-1], weekly[-2]
    growth = (recent - prev) / max(prev, 2)
    if prev == 0 and recent >= 3:
        label = "New"
    elif growth >= 1 and recent >= 3:
        label = "Surging"
    elif growth >= 0.25 and recent >= 2:
        label = "Growing"
    elif growth <= -0.3:
        label = "Declining"
    else:
        label = "Stable"
    return {"weekly": weekly, "recent_7d": recent, "prev_7d": prev, "growth": round(growth, 3), "trend": label}


def weekly_history(rows: list[dict], now: datetime) -> list[dict]:
    """Unanswered / total queries per 7-day bucket (oldest first), covering the whole lookback window."""
    resolved = set(settings.resolved_statuses)
    n = max(1, min(53, math.ceil(settings.lookback_days / 7)))
    out = [{"week_start": (now - timedelta(days=7 * (n - i))).date().isoformat(), "unanswered": 0, "total": 0} for i in range(n)]
    for r in rows:
        age_w = int((now - r["created"]).total_seconds() // (7 * 86400))
        if 0 <= age_w < n:
            b = out[n - 1 - age_w]
            b["total"] += 1
            b["unanswered"] += r["status"] not in resolved
    while len(out) > 8 and out[0]["total"] == 0:  # trim empty leading weeks, keep at least 8
        out.pop(0)
    return out


def priority_score(open_n: int, max_open: int, growth: float, n_states: int) -> float:
    demand = math.log1p(open_n) / math.log1p(max(max_open, 1))
    g = max(-1.0, min(3.0, growth))
    growth_norm = (g + 1) / 4
    breadth = min(n_states / 5, 1.0)
    return round(100 * (0.55 * demand + 0.25 * growth_norm + 0.20 * breadth), 1)


def _cluster_id(crop: str, domain: str, rep_text: str) -> str:
    return hashlib.sha1(f"{crop}|{domain}|{rep_text.lower()}".encode()).hexdigest()[:10]


def build_clusters(rows: list[dict], now: datetime) -> tuple[list[dict], str]:
    groups, backend, vectors = cluster_queries(rows)
    resolved = set(settings.resolved_statuses)
    clusters = []
    for idxs in groups:
        members = [rows[i] for i in idxs]
        open_members = [m for m in members if m["status"] not in resolved]
        rep = rows[representative(idxs, vectors)]
        states = Counter(m["state"] for m in open_members or members)
        districts = Counter((m["state"], m["district"]) for m in open_members or members if m["district"] != "Unknown")
        intent, intent_share = dominant([m["intent"] for m in members])
        t = trend_stats([m["created"] for m in open_members], now)
        examples = []
        for m in sorted(members, key=lambda x: x["created"], reverse=True):
            if m["text"] not in examples:
                examples.append(m["text"])
            if len(examples) == 3:
                break
        clusters.append({
            "cluster_id": _cluster_id(rep["crop"], rep["domain"], rep["text"]),
            "crop": rep["crop"], "domain": rep["domain"], "intent": intent,
            "label": rep["text"],
            "keywords": top_keywords([m["text"] for m in members]),
            "size": len(members), "open": len(open_members), "resolved": len(members) - len(open_members),
            "states": [{"state": s, "count": n} for s, n in states.most_common()],
            "n_states": len(states),
            "top_districts": [{"state": s, "district": d, "count": n} for (s, d), n in districts.most_common(5)],
            "sources": dict(Counter(m["source"] for m in members)),
            "examples": examples,
            "first_seen": min(m["created"] for m in members),
            "last_seen": max(m["created"] for m in members),
            **t,
        })
    return clusters, backend


def build_cells(rows: list[dict], gdb: Counter) -> list[dict]:
    resolved = set(settings.resolved_statuses)
    gaps: Counter = Counter()
    for r in rows:
        if r["status"] not in resolved:
            gaps[(r["crop"], r["state"], r["domain"])] += 1
    cells = []
    for key in set(gaps) | set(gdb):
        ans, gap = gdb.get(key, 0), gaps.get(key, 0)
        total = ans + gap
        cov = ans / total if total else None
        band = None if cov is None else ("strong" if cov >= 0.7 else "partial" if cov >= 0.4 else "gap")
        cells.append({"crop": key[0], "state": key[1], "domain": key[2], "gdb_answers": ans,
                      "open_gaps": gap, "coverage": None if cov is None else round(cov, 3), "band": band})
    return sorted(cells, key=lambda c: -c["open_gaps"])


def build_outreach(clusters: list[dict], rows: list[dict]) -> list[dict]:
    """State-level planning view: where are the largest / fastest-growing gaps?"""
    resolved = set(settings.resolved_statuses)
    open_rows = [r for r in rows if r["status"] not in resolved]
    by_state: dict[str, list[dict]] = defaultdict(list)
    for r in open_rows:
        by_state[r["state"]].append(r)
    total_open = max(len(open_rows), 1)
    out = []
    for state, rs in by_state.items():
        out.append({"state": state, "open_gaps": len(rs), "share": round(len(rs) / total_open, 3),
                    "recent_7d": 0, "prev_7d": 0, "growth": 0.0, "trend": "Stable",
                    "top_crops": [{"crop": c, "count": n} for c, n in Counter(r["crop"] for r in rs).most_common(5)],
                    "top_domains": [{"domain": d, "count": n} for d, n in Counter(r["domain"] for r in rs).most_common(5)],
                    "top_districts": [{"district": d, "count": n} for d, n in Counter(r["district"] for r in rs if r["district"] != "Unknown").most_common(5)]})
    return out


def finalize_outreach(outreach: list[dict], rows: list[dict], clusters: list[dict], now: datetime) -> list[dict]:
    resolved = set(settings.resolved_statuses)
    by_state: dict[str, list[datetime]] = defaultdict(list)
    for r in rows:
        if r["status"] not in resolved:
            by_state[r["state"]].append(r["created"])
    state_clusters: dict[str, list[dict]] = defaultdict(list)
    for c in clusters:
        for s in c["states"][:3]:
            state_clusters[s["state"]].append(c)
    for o in outreach:
        o.update({k: v for k, v in trend_stats(by_state[o["state"]], now).items() if k != "weekly"})
        top = sorted(state_clusters[o["state"]], key=lambda c: -c["priority_score"])[:3]
        o["focus_clusters"] = [{"cluster_id": c["cluster_id"], "label": c["label"], "crop": c["crop"], "domain": c["domain"]} for c in top]
        o["recommendation"] = _recommend(o)
    return sorted(outreach, key=lambda o: (o["state"] == "Unknown", -(o["open_gaps"] * (1 + max(o["growth"], 0) * 0.5))))


def _recommend(o: dict) -> str:
    crops = [c["crop"] for c in o["top_crops"] if c["crop"] != "Unknown"]
    topic = f"{crops[0]} / {o['top_domains'][0]['domain']}" if crops and o["top_domains"] else (
        f"{o['top_domains'][0]['domain']} (crop not stated in queries)" if o["top_domains"] else "priority topics")
    if o["state"] == "Unknown":
        return f"Capture location: {o['open_gaps']} unanswered queries have no state recorded; fix state capture in the chatbot, then target {topic}."
    where = f" (start with {o['top_districts'][0]['district']})" if o["top_districts"] else ""
    urgency = "Urgent: " if o["trend"] in ("Surging", "New") else ""
    return f"{urgency}Engage field experts on {topic} in {o['state']}{where}; {o['open_gaps']} unanswered farmer queries."


# --------------------------------------------------------------------------- run
def run_pipeline(now: datetime | None = None, db=None, persist: bool = True, out_db=None) -> dict:
    src = db if db is not None else get_source_db()
    out = out_db if out_db is not None else (db if db is not None else get_out_db())
    if now is None:
        now = (sources.latest_timestamp(src) if settings.as_of == "latest" else None) or datetime.now(timezone.utc)
    if settings.source_mode == "disclaimer_logs":
        rows = sources.extract_disclaimer_logs(src, now)
        gdb = sources.extract_gdb_cells_from_entries(src)
    else:
        rows = extract_disclaimer_queries(src, now)
        gdb = extract_gdb_coverage(src)
    db = out
    clusters, backend = build_clusters(rows, now)

    rankable = [c for c in clusters if c["open"] >= settings.min_cluster_size]
    max_open = max((c["open"] for c in rankable), default=1)
    for c in clusters:
        c["priority_score"] = priority_score(c["open"], max_open, c["growth"], c["n_states"])
    ranked = sorted(rankable, key=lambda c: (-c["priority_score"], -c["open"]))
    for i, c in enumerate(ranked, 1):
        c["rank"] = i

    cells = build_cells(rows, gdb)
    outreach = finalize_outreach(build_outreach(ranked, rows), rows, ranked, now)
    resolved = set(settings.resolved_statuses)
    open_total = sum(1 for r in rows if r["status"] not in resolved)
    report_id = iso_week_id(now)
    report = {
        "_id": report_id,
        "generated_at": now,  # data "as of" time (== wall clock unless AS_OF=latest)
        "run_at": datetime.now(timezone.utc),  # when the pipeline actually ran
        "params": {"lookback_days": settings.lookback_days, "min_cluster_size": settings.min_cluster_size,
                   "top_n": settings.top_n, "embedding_backend": backend,
                   "sources": settings.disclaimer_sources},
        "summary": {
            "disclaimer_queries": len(rows), "open_gaps": open_total, "resolved_since": len(rows) - open_total,
            "clusters_total": len(clusters), "clusters_ranked": len(ranked),
            "long_tail_queries": sum(c["open"] for c in clusters if c["open"] < settings.min_cluster_size),
            "states_affected": len({r["state"] for r in rows if r["status"] not in resolved}),
            "growing_clusters": sum(1 for c in ranked if c["trend"] in ("Growing", "Surging", "New")),
            "weekly_history": weekly_history(rows, now),
            "weekly_totals": trend_stats([r["created"] for r in rows if r["status"] not in resolved], now)["weekly"],
        },
        "top_clusters": ranked[: settings.top_n],
        "emerging_clusters": sorted([c for c in ranked if c["trend"] in ("Surging", "New", "Growing")], key=lambda c: -c["growth"])[:10],
        "outreach": outreach,
    }
    if persist:
        db[settings.out_reports].replace_one({"_id": report_id}, report, upsert=True)
        db[settings.out_clusters].delete_many({"report_id": report_id})
        if ranked or clusters:
            db[settings.out_clusters].insert_many([{**c, "report_id": report_id} for c in clusters])
        db[settings.out_cells].delete_many({"report_id": report_id})
        if cells:
            db[settings.out_cells].insert_many([{**c, "report_id": report_id} for c in cells])
    log.info("pipeline: %d queries -> %d clusters (%d ranked) using %s", len(rows), len(clusters), len(ranked), backend)
    return report
