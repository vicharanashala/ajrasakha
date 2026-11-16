"""Semantic clustering of disclaimer-triggered queries.

Strategy: hard-partition by (crop, primary domain) so clusters never mix crops or
agronomic domains, then run average-linkage agglomerative clustering on cosine
distance inside each partition. State and intent are measured *on* each cluster
(distribution) and drive the heatmap / outreach views.
"""
from __future__ import annotations

from collections import Counter, defaultdict

import numpy as np
from sklearn.cluster import AgglomerativeClustering
from sklearn.feature_extraction.text import TfidfVectorizer

from .config import settings
from .embeddings import embed


def cluster_queries(rows: list[dict]) -> tuple[list[list[int]], str]:
    """rows: normalised query dicts with crop/domain/text. Returns (groups of row indices, backend)."""
    if not rows:
        return [], "none", np.zeros((0, 0), dtype=np.float32)
    vectors, backend, threshold = embed([r["text"] for r in rows])

    partitions: dict[tuple[str, str], list[int]] = defaultdict(list)
    for i, r in enumerate(rows):
        partitions[(r["crop"], r["domain"])].append(i)

    groups: list[list[int]] = []
    for idxs in partitions.values():
        if len(idxs) == 1:
            groups.append(idxs)
            continue
        model = AgglomerativeClustering(
            n_clusters=None, metric="cosine", linkage="average", distance_threshold=threshold,
        )
        labels = model.fit_predict(vectors[idxs])
        by_label: dict[int, list[int]] = defaultdict(list)
        for pos, lab in zip(idxs, labels):
            by_label[int(lab)].append(pos)
        groups.extend(by_label.values())
    return groups, backend, vectors


def representative(idxs: list[int], vectors: np.ndarray) -> int:
    """Index of the member closest to the cluster centroid."""
    sub = vectors[idxs]
    centroid = sub.mean(axis=0)
    norm = np.linalg.norm(centroid) or 1.0
    sims = sub @ (centroid / norm)
    return idxs[int(np.argmax(sims))]


def top_keywords(texts: list[str], k: int = 5) -> list[str]:
    try:
        vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), max_features=500)
        mat = vec.fit_transform(texts)
    except ValueError:
        return []
    scores = np.asarray(mat.sum(axis=0)).ravel()
    terms = np.array(vec.get_feature_names_out())
    return [str(t) for t in terms[np.argsort(-scores)[:k]]]


def dominant(values: list[str]) -> tuple[str, float]:
    c = Counter(values)
    val, n = c.most_common(1)[0]
    return val, n / len(values)
