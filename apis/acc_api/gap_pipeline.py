"""Standalone runner for the GDB Coverage Gap Detector.

Builds one weekly gap report and inserts it into `gap_reports_collection`.
Intended to be cron'd (e.g. weekly) against the same Mongo/embedding config
as main.py — it reuses main.py's already-configured connections rather than
opening new ones.

Usage:
    python gap_pipeline.py

ponytail: no scheduler here (no APScheduler/Celery dependency added) — wire
this into whatever cron/orchestration the ops team already uses for the
service. Building a scheduler was out of scope for a single-report pipeline.
"""

from __future__ import annotations

import logging

from gap_detector import build_gap_report
from main import gap_reports_collection, model, reviewer_collection

log = logging.getLogger("gap_pipeline")
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)-7s | %(message)s")


def _embed_texts(texts: list[str]):
    prefixed = [f"Represent this sentence for searching relevant passages: {t}" for t in texts]
    return model.encode(prefixed, normalize_embeddings=True)


def run() -> dict:
    log.info("Building GDB coverage gap report...")
    report = build_gap_report(questions_collection=reviewer_collection, embed_fn=_embed_texts)
    gap_reports_collection.insert_one(report)
    log.info(
        "Gap report stored: %d disclaimer questions, %d clusters, %d heatmap cells.",
        report["total_disclaimers"],
        report["clusters_found"],
        report["coverage_stats"]["total_combinations"],
    )
    return report


if __name__ == "__main__":
    run()
