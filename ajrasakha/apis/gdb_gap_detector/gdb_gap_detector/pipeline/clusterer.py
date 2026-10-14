from collections import Counter
from datetime import datetime, timezone
import hashlib
import logging
from typing import Any

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

from gdb_gap_detector.core import settings
from gdb_gap_detector.models import GapCluster

logger = logging.getLogger("gdb_gap_detector.clusterer")


def extract_keywords(queries: list[str], top_n: int = 5) -> list[str]:
    """Extract top N descriptive key phrases across cluster queries using TF-IDF N-grams."""
    if not queries:
        return []

    try:
        vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            stop_words="english",
            max_features=top_n * 2,
            sublinear_tf=True,
        )
        tfidf_matrix = vectorizer.fit_transform(queries)
        scores = np.asarray(tfidf_matrix.sum(axis=0)).flatten()
        feature_names = vectorizer.get_feature_names_out()

        top_indices = scores.argsort()[::-1][:top_n]
        keywords = [feature_names[i] for i in top_indices if scores[i] > 0]
        if keywords:
            return keywords
    except Exception as err:
        logger.debug(f"TF-IDF vectorizer fallback triggered: {err}")

    # Robust fallback for minimal tokens
    tokens: list[str] = []
    for q in queries:
        tokens.extend([w.strip().lower() for w in q.split() if len(w) >= 3])
    counts = Counter(tokens)
    return [word for word, _ in counts.most_common(top_n)]


def find_representative_query(
    cluster_embeddings: np.ndarray, cluster_queries: list[str]
) -> str:
    """Select the query closest to the cluster embedding centroid (Medoid)."""
    if len(cluster_queries) == 1:
        return cluster_queries[0]

    centroid = cluster_embeddings.mean(axis=0, keepdims=True)
    # Cosine similarity to centroid
    norm_embeddings = cluster_embeddings / (
        np.linalg.norm(cluster_embeddings, axis=1, keepdims=True) + 1e-9
    )
    norm_centroid = centroid / (np.linalg.norm(centroid) + 1e-9)
    similarities = np.dot(norm_embeddings, norm_centroid.T).flatten()

    best_idx = int(np.argmax(similarities))
    return cluster_queries[best_idx]


def cluster_embeddings(
    unique_hashes: list[str],
    unique_map: dict[str, dict[str, Any]],
    embeddings: np.ndarray,
    triage_map: dict[str, str],
    min_cluster_size: int | None = None,
) -> list[GapCluster]:
    """Stage 4: HDBSCAN Semantic Clustering + Outlier Safety Net (Miscellaneous Bucket).

    Returns list of un-scored GapCluster models.
    """
    if len(unique_hashes) == 0:
        return []

    min_size = min_cluster_size or settings.min_cluster_size

    # Fallback to single miscellaneous cluster if data size < min_cluster_size
    if len(unique_hashes) < min_size:
        labels = np.full(len(unique_hashes), -1, dtype=int)
    else:
        import hdbscan  # lazy import

        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=min_size,
            min_samples=1,
            metric="euclidean",
            cluster_selection_method="leaf",
        )
        labels = clusterer.fit_predict(embeddings)

    # Group hashes and embedding indices by cluster label
    clusters_by_label: dict[int, list[int]] = {}
    for idx, label in enumerate(labels):
        clusters_by_label.setdefault(int(label), []).append(idx)

    gap_clusters: list[GapCluster] = []

    for label, idx_list in clusters_by_label.items():
        is_misc = label == -1
        hash_list = [unique_hashes[i] for i in idx_list]
        cluster_embeds = embeddings[idx_list]

        # Aggregate cluster metrics
        queries: list[str] = []
        sample_queries: list[str] = []
        domains: set[str] = set()
        states: set[str] = set()
        languages: set[str] = set()
        total_demand = 0
        first_seen = datetime.max.replace(tzinfo=timezone.utc)
        last_seen = datetime.min.replace(tzinfo=timezone.utc)

        near_miss_count = 0
        real_gap_count = 0
        almost_covered_count = 0

        # Sort queries by count descending to select initial samples
        hash_list_sorted = sorted(
            hash_list,
            key=lambda h: unique_map[h].get("count", 1),
            reverse=True,
        )

        for q_hash in hash_list_sorted:
            data = unique_map[q_hash]
            q_text = data["query"]
            q_count = data["count"]

            queries.append(q_text)
            if len(sample_queries) < 3:
                sample_queries.append(q_text)

            total_demand += q_count
            domains.update(data.get("domains", []))
            states.update(data.get("states", []))
            languages.update(data.get("languages", []))

            fs = data.get("first_seen")
            ls = data.get("last_seen")
            if fs:
                if fs.tzinfo is None:
                    fs = fs.replace(tzinfo=timezone.utc)
                first_seen = min(first_seen, fs)
            if ls:
                if ls.tzinfo is None:
                    ls = ls.replace(tzinfo=timezone.utc)
                last_seen = max(last_seen, ls)

            status = triage_map.get(q_hash, "real_gap")
            if status == "near_miss":
                near_miss_count += q_count
            elif status == "almost_covered":
                almost_covered_count += q_count
            else:
                real_gap_count += q_count

        if first_seen == datetime.max.replace(tzinfo=timezone.utc):
            first_seen = datetime.now(timezone.utc)
        if last_seen == datetime.min.replace(tzinfo=timezone.utc):
            last_seen = datetime.now(timezone.utc)

        keywords = extract_keywords(queries)

        if is_misc:
            cluster_id = "misc|outliers"
            cluster_name = "Miscellaneous / Unclustered Queries"
        else:
            rep_query = find_representative_query(cluster_embeds, queries)
            cluster_name = rep_query
            cluster_id = hashlib.md5(rep_query.encode("utf-8")).hexdigest()[:12]

        gap_cluster = GapCluster(
            cluster_id=cluster_id,
            cluster_name=cluster_name,
            size=total_demand,
            keywords=keywords,
            sample_queries=sample_queries,
            domains=sorted(list(domains)),
            states=sorted(list(states)),
            languages=sorted(list(languages)),
            first_seen=first_seen,
            last_seen=last_seen,
            farmer_demand=total_demand,
            is_miscellaneous=is_misc,
            near_miss_count=near_miss_count,
            real_gap_count=real_gap_count,
            almost_covered_count=almost_covered_count,
        )
        gap_clusters.append(gap_cluster)

    logger.info(
        f"HDBSCAN created {len(gap_clusters)} clusters (including Outlier Safety Net)."
    )
    return gap_clusters
