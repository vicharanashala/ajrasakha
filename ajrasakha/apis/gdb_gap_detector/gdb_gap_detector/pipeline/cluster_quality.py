# adding cluster labels to the overall clusters
import numpy as np
from sklearn.metrics import silhouette_samples


def evaluate_cluster_quality(
    embeddings: np.ndarray,
    labels: np.ndarray,
) -> dict:
    """Evaluate semantic clustering quality for each cluster."""

    # Ignore HDBSCAN noise/outliers labeled as -1
    valid_mask = labels != -1
    valid_embeddings = embeddings[valid_mask]
    valid_labels = labels[valid_mask]

    unique_labels = set(valid_labels)

    # Silhouette requires at least 2 clusters
    if len(unique_labels) < 2:
        return {
            "overall_score": 0.0,
            "clusters": {},
        }

    # Calculate silhouette value for every individual query
    sample_scores = silhouette_samples(
        valid_embeddings,
        valid_labels,
    )

    cluster_quality = {}

    for cluster_id in sorted(unique_labels):
        cluster_mask = valid_labels == cluster_id
        cluster_scores = sample_scores[cluster_mask]

        average_score = float(np.mean(cluster_scores))

        if average_score >= 0.5:
            quality = "GOOD"
        elif average_score >= 0.25:
            quality = "FAIR"
        else:
            quality = "WEAK"

        cluster_quality[int(cluster_id)] = {
            "silhouette_score": round(average_score, 4),
            "quality": quality,
            "size": int(np.sum(cluster_mask)),
        }

    return {
        "overall_score": round(float(np.mean(sample_scores)), 4),
        "clusters": cluster_quality,
    }
