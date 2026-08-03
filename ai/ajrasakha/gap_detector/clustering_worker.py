"""Weekly CLI / Cloud Run worker for semantic gap clustering, score-based diagnosis, and Coverage Debt ranking."""

import os
import re
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Any, Optional

try:
    from pymongo import MongoClient, ASCENDING
except ImportError:
    MongoClient = None
    ASCENDING = 1

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger("gdb_gap_worker")

MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI") or "mongodb://localhost:27017"
DB_NAME = os.getenv("DB_NAME") or os.getenv("MONGODB_DB_NAME") or "ajrasakha"

# ─── CROP DICTIONARY ─────────────────────────────────────────────────────────
CROP_DICTIONARY: Dict[str, List[str]] = {
    "cotton":       ["cotton", "kapas", "patti", "kabaas"],
    "paddy":        ["paddy", "rice", "dhaan", "chawal", "vari", "nel"],
    "wheat":        ["wheat", "gehun", "gehu", "gahu", "godhumai"],
    "sugarcane":    ["sugarcane", "ganna", "us", "kabbu"],
    "maize":        ["maize", "corn", "bhutta", "makka", "makkai"],
    "potato":       ["potato", "aloo", "alu", "batata"],
    "onion":        ["onion", "pyaz", "pyaaz", "kanda", "vengayam"],
    "tomato":       ["tomato", "tamatar", "thakkali"],
    "chilli":       ["chilli", "chili", "mirch", "mirchi", "milagai"],
    "turmeric":     ["turmeric", "haldi", "manjal"],
    "soybean":      ["soybean", "soyabean", "soya"],
    "groundnut":    ["groundnut", "peanut", "moongphali", "shenga", "verukadalai"],
    "mustard":      ["mustard", "sarson", "rai"],
    "gram":         ["gram", "chana", "chole", "kadalai"],
    "mango":        ["mango", "aam", "manga"],
    "banana":       ["banana", "kela", "vazhai"],
    "apple":        ["apple", "seb"],
    "pomegranate":  ["pomegranate", "anar", "dalimb"],
    "jowar":        ["jowar", "sorghum", "cholam"],
    "bajra":        ["bajra", "pearl millet", "kambu"],
}

# Pre-compile all crop synonym patterns once at import time
_CROP_PATTERNS: List[tuple] = [
    (canonical, re.compile(
        r'\b(?:' + '|'.join(re.escape(s) for s in synonyms) + r')\b',
        re.IGNORECASE
    ))
    for canonical, synonyms in CROP_DICTIONARY.items()
]

DIAGNOSIS_TYPES = {
    "missing_knowledge": {
        "label": "Missing Knowledge",
        "action": "Research and create a verified GDB Q&A entry with Agri domain experts.",
    },
    "retrieval_failure": {
        "label": "Retrieval Failure",
        "action": "Repair vector embeddings, metadata tags, and retrieval similarity thresholds.",
    },
    "language_alias_gap": {
        "label": "Language / Alias Gap",
        "action": "Add regional crop and pest synonyms, local dialect terms, and Sarvam AI translations.",
    },
    "missing_context": {
        "label": "Missing Context",
        "action": "Inject targeted follow-up prompt to clarify crop stage, symptom, or district.",
    },
    "safety_escalation": {
        "label": "Safety Escalation",
        "action": "High-risk topic (chemical / pesticide dosage). Retain human expert validation.",
    },
}

# Score thresholds for diagnosis classification
_SCORE_MISSING_KNOWLEDGE_MAX = 0.35
_SCORE_LANGUAGE_ALIAS_MAX = 0.55


def _anonymize_user_id(user_id: str) -> str:
    """SHA-256 hash of internal user ID or phone number. No raw PII stored."""
    if not user_id:
        return "anon_unknown"
    return "farmer_" + hashlib.sha256(str(user_id).encode("utf-8")).hexdigest()[:12]


def extract_crop_from_text(query_text: str) -> str:
    """NER fallback: match crop names / regional synonyms using pre-compiled patterns."""
    if not query_text:
        return "General"
    for canonical, pattern in _CROP_PATTERNS:
        if pattern.search(query_text):
            return canonical.title()
    return "General"


def _resolve_gdb_top_score(gap_signal: Dict[str, Any], query_text: str, db: Any) -> float:
    """
    Resolve the best available GDB cosine score for a cluster's representative query.

    Priority:
      1. Recorded gdbTopScore in gapSignal (set at disclaimer time in plan_executor.py)
      2. MongoDB text-score approximation against golden_dataset collection
      3. Heuristic based on query token count (conservative lower bound)

    Returns a float in [0.0, 1.0].
    """
    # 1. Recorded score from gapSignal (most accurate)
    recorded = gap_signal.get("gdbTopScore")
    if isinstance(recorded, (int, float)) and 0.0 < recorded <= 1.0:
        return float(recorded)

    # 2. Text-score proxy from golden_dataset
    try:
        col = db["golden_dataset"]
        result = col.find_one(
            {"$text": {"$search": query_text}},
            {"score": {"$meta": "textScore"}},
        )
        if result and "score" in result:
            # Normalise: text scores are unbounded; cap at 10 → 1.0
            return min(float(result["score"]) / 10.0, 0.95)
    except Exception:
        pass

    # 3. Conservative heuristic: longer queries are more specific → lower gap score
    token_count = len(query_text.split())
    if token_count > 6:
        return 0.28   # Specific query → likely missing knowledge
    elif token_count > 3:
        return 0.48   # Moderate query → potential language/alias gap
    return 0.20       # Very short → vague, missing context


def diagnose_gap(query_text: str, crop: str, top_cosine_score: float) -> tuple[str, str, str]:
    """
    Classify root cause using score thresholds and query characteristics.

    Rule order matters — safety check runs first regardless of score.
    """
    lower_q = query_text.lower()

    # Safety escalation: chemical / dosage queries always require human review
    safety_keywords = [
        "dosage", "ml per litre", "poison", "toxic",
        "chemical mix", "overdose", "spray quantity",
    ]
    if any(kw in lower_q for kw in safety_keywords):
        d = "safety_escalation"
        return d, DIAGNOSIS_TYPES[d]["label"], DIAGNOSIS_TYPES[d]["action"]

    # Missing context: too vague AND no crop identified
    if len(lower_q.split()) < 3 and crop.lower() in ("general", "unknown"):
        d = "missing_context"
        return d, DIAGNOSIS_TYPES[d]["label"], DIAGNOSIS_TYPES[d]["action"]

    # Score-based classification
    if top_cosine_score >= _SCORE_LANGUAGE_ALIAS_MAX:
        d = "retrieval_failure"
    elif top_cosine_score >= _SCORE_MISSING_KNOWLEDGE_MAX:
        d = "language_alias_gap"
    else:
        d = "missing_knowledge"

    return d, DIAGNOSIS_TYPES[d]["label"], DIAGNOSIS_TYPES[d]["action"]


def compute_coverage_debt_score(
    unique_farmers: int,
    week_growth_pct: float,
    is_missing_knowledge: bool,
) -> float:
    """Weighted Coverage Debt score in range [0, 100]."""
    farmer_score    = min(unique_farmers * 2.5, 40.0)
    growth_score    = min(max(week_growth_pct, 0.0) * 0.5, 25.0)
    urgency_score   = 15.0
    geo_score       = 10.0
    knowledge_score = 10.0 if is_missing_knowledge else 5.0
    return round(farmer_score + growth_score + urgency_score + geo_score + knowledge_score, 1)


def _build_four_week_trend(
    cluster_id: str,
    current_count: int,
    prev_clusters_map: Dict[str, int],
    archive_col: Any,
) -> List[int]:
    """
    Build a 4-week trend list from actual weekly snapshots.
    Falls back to [current] * 4 if history is not available (first run).
    """
    try:
        history_docs = list(
            archive_col.find(
                {"clusters.clusterId": cluster_id},
                {"week": 1, "clusters.$": 1},
            )
            .sort("week", ASCENDING)
            .limit(3)
        )
        trend = []
        for doc in history_docs:
            clusters = doc.get("clusters", [])
            if clusters:
                trend.append(clusters[0].get("affectedFarmersCount", current_count))
        trend.append(current_count)
        # Pad to 4 entries using oldest known value
        while len(trend) < 4:
            trend.insert(0, trend[0])
        return trend[-4:]
    except Exception:
        return [current_count] * 4


def run_weekly_gap_clustering(dry_run: bool = False) -> None:
    """
    Main entry point for the weekly CLI / Cloud Run job.

    Args:
        dry_run: If True, compute clusters and log results without writing to MongoDB.
    """
    logger.info("Connecting to MongoDB at %s (DB: %s)...", MONGO_URI, DB_NAME)
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    questions_col    = db["questions"]
    gdb_clusters_col = db["gdb_gap_clusters"]
    locks_col        = db["gdb_gap_worker_locks"]

    now = datetime.now(timezone.utc)
    current_week_str = now.strftime("%Y-%W")

    # ── Idempotency lock: prevent double-run within the same week ─────────────
    if not dry_run:
        lock_result = locks_col.find_one_and_update(
            {"week": current_week_str, "status": "pending"},
            {"$set": {"status": "running", "startedAt": now}},
            upsert=False,
        )
        if lock_result is None:
            existing_lock = locks_col.find_one({"week": current_week_str})
            if existing_lock and existing_lock.get("status") in ("running", "done"):
                logger.warning(
                    "Week %s already processed (status: %s). Skipping.",
                    current_week_str,
                    existing_lock.get("status"),
                )
                return
            # First run this week — insert lock
            locks_col.insert_one({"week": current_week_str, "status": "running", "startedAt": now})

    # ── Load previous week snapshot for WoW velocity ──────────────────────────
    prev_week_str = (now - timedelta(days=7)).strftime("%Y-%W")
    prev_week_doc = gdb_clusters_col.find_one({"week": prev_week_str})
    prev_clusters_map: Dict[str, int] = {}
    if prev_week_doc:
        for c in prev_week_doc.get("clusters", []):
            prev_clusters_map[c.get("clusterId", "")] = c.get("affectedFarmersCount", 1)

    # ── Fetch disclaimer-triggered questions ──────────────────────────────────
    disclaimer_query = {
        "$or": [
            {"gapSignal.disclaimerIssued": True},
            {"details.gapSignal.disclaimerIssued": True},
        ]
    }
    docs = list(questions_col.find(disclaimer_query).limit(2000))
    logger.info("Found %d disclaimer-triggered questions.", len(docs))

    # ── Group by Crop × State × Domain ───────────────────────────────────────
    grouped: Dict[tuple, List[Dict[str, Any]]] = {}
    for doc in docs:
        details  = doc.get("details") or {}
        raw_crop = str(details.get("crop") or doc.get("crop") or "").strip().title()
        user_q   = str(doc.get("question") or doc.get("text") or "")

        crop   = extract_crop_from_text(user_q) if not raw_crop or raw_crop.lower() in ("general", "unknown", "none") else raw_crop
        state  = str(details.get("state") or doc.get("state_name") or "Unknown").strip().title()
        domain_raw = details.get("domain") or ["Pest Management"]
        domain = domain_raw[0] if isinstance(domain_raw, list) and domain_raw else str(domain_raw)

        grouped.setdefault((crop, state, domain), []).append(doc)

    # ── Build clusters ────────────────────────────────────────────────────────
    clusters_output: List[Dict[str, Any]] = []
    total_disclaimers = len(docs)

    for (crop, state, domain), items in grouped.items():
        q_texts = [i.get("question") or i.get("text") or "" for i in items if i.get("question") or i.get("text")]
        if not q_texts:
            continue

        raw_user_ids       = [str(i.get("userId") or i.get("phone") or "unknown") for i in items]
        anonymized_hashes  = list({_anonymize_user_id(uid) for uid in raw_user_ids})
        unique_farmers_count = len(anonymized_hashes)

        cluster_id = f"{crop.lower()}_{state.lower()}_{domain.lower()}".replace(" ", "_")

        # True WoW velocity
        if cluster_id in prev_clusters_map and prev_clusters_map[cluster_id] > 0:
            prev_cnt        = prev_clusters_map[cluster_id]
            week_growth_pct = round(((unique_farmers_count - prev_cnt) / prev_cnt) * 100.0, 1)
        else:
            week_growth_pct = None  # New cluster — no historical baseline

        rep_query  = q_texts[0]
        gap_signal = items[0].get("gapSignal") or (items[0].get("details") or {}).get("gapSignal") or {}
        top_score  = _resolve_gdb_top_score(gap_signal, rep_query, db)

        diagnosis, diag_label, rec_action = diagnose_gap(rep_query, crop, top_score)
        debt_score = compute_coverage_debt_score(
            unique_farmers=unique_farmers_count,
            week_growth_pct=week_growth_pct if week_growth_pct is not None else 0.0,
            is_missing_knowledge=(diagnosis == "missing_knowledge"),
        )

        four_week_trend = _build_four_week_trend(cluster_id, unique_farmers_count, prev_clusters_map, gdb_clusters_col)

        clusters_output.append({
            "clusterId":               cluster_id,
            "crop":                    crop,
            "state":                   state,
            "domain":                  domain,
            "affectedFarmersCount":    unique_farmers_count,
            "rawQuestionsCount":       len(items),
            "weekGrowthPercent":       week_growth_pct,     # None = first week
            "coverageDebtScore":       debt_score,
            "diagnosis":               diagnosis,
            "diagnosisLabel":          diag_label,
            "recommendedAction":       rec_action,
            "fourWeekTrend":           four_week_trend,
            "representativeQuestions": q_texts[:3],
            "anonymizedFarmerHashes":  anonymized_hashes[:10],
            "updatedAt":               now,
        })

    clusters_output.sort(key=lambda x: x["coverageDebtScore"], reverse=True)

    # Compute aggregate WoW growth across all clusters
    prev_total = sum(prev_clusters_map.values()) or 1
    agg_wow_growth = round(((total_disclaimers - prev_total) / prev_total) * 100.0, 1) if prev_clusters_map else None

    summary_doc = {
        "week":                   current_week_str,
        "totalDisclaimers":       total_disclaimers,
        "activeClustersCount":    len(clusters_output),
        "weekOverWeekGrowth":     agg_wow_growth,
        "coverageDebtScore":      clusters_output[0]["coverageDebtScore"] if clusters_output else 0.0,
        "disclaimerDeflectionImpact": None,   # Computed externally from answered vs. disclaimer ratio
        "topGapCluster":          clusters_output[0] if clusters_output else None,
        "clusters":               clusters_output,
        "updatedAt":              now,
    }

    if dry_run:
        logger.info("[DRY RUN] Would write %d clusters for week %s.", len(clusters_output), current_week_str)
        return

    gdb_clusters_col.replace_one({"week": current_week_str}, summary_doc, upsert=True)
    locks_col.update_one({"week": current_week_str}, {"$set": {"status": "done", "finishedAt": now}})
    logger.info("Done. Wrote %d clusters for week %s.", len(clusters_output), current_week_str)


if __name__ == "__main__":
    import sys
    _dry = "--dry-run" in sys.argv
    run_weekly_gap_clustering(dry_run=_dry)
