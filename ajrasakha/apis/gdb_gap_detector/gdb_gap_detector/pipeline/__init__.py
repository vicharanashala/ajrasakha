"""Core business logic pipeline stages."""

from gdb_gap_detector.pipeline.extractor import extract_disclaimer_queries
from gdb_gap_detector.pipeline.embedder import get_embedder
from gdb_gap_detector.pipeline.overlap import triage_query_overlaps
from gdb_gap_detector.pipeline.clusterer import cluster_embeddings
from gdb_gap_detector.pipeline.scorer import score_clusters
from gdb_gap_detector.pipeline.coverage import calculate_coverage_heatmap
from gdb_gap_detector.pipeline.trend import calculate_trend_deltas
from gdb_gap_detector.pipeline.reporter import assemble_gap_report, generate_markdown_report

__all__ = [
    "extract_disclaimer_queries",
    "get_embedder",
    "triage_query_overlaps",
    "cluster_embeddings",
    "score_clusters",
    "calculate_coverage_heatmap",
    "calculate_trend_deltas",
    "assemble_gap_report",
    "generate_markdown_report",
]
