from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from typing import Any

import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.metrics.pairwise import cosine_similarity
from mcp.mcp_containers.reviewer_system.vector_retrieval import (
    fetch_query_embedding,
)
log = logging.getLogger("gdb_gap_detector.clustering")


# =============================================================================
# Configuration
# =============================================================================

MIN_CLUSTER_SIZE = 3

DBSCAN_EPS = 0.18

DBSCAN_MIN_SAMPLES = 3
async def assign_cluster(
    question: str,
    metadata: dict[str, Any],
    gap_result: dict[str, Any],
) -> str:
    """
    Assign an incoming disclaimer query to an
    existing semantic cluster.

    Returns

        cluster_xxxxx

    If no suitable cluster exists,
    create a new one.
    """

    cluster = await _find_existing_cluster(
        question,
        metadata,
    )

    if cluster is not None:

        await _append_to_cluster(
        cluster,
        question,
    )

    return cluster["cluster_id"]

    return await _create_cluster(
        question,
        metadata,
    )
# =============================================================================
# Cluster Repository
# =============================================================================


#
# Temporary in-memory registry.
#
# Replace with MongoDB collection:
#
# gap_clusters
#
_CLUSTER_REGISTRY: dict[str, dict[str, Any]] = {}
# =============================================================================
# Existing Cluster Assignment
# =============================================================================


async def _find_existing_cluster(
    question: str,
    metadata: dict[str, Any],
) -> dict[str, Any] | None:
    """
    Find the closest existing cluster.

    Matching uses

    - state
    - crop
    - semantic centroid

    Returns None when no cluster satisfies
    the similarity threshold.
    """

    if not _CLUSTER_REGISTRY:
        return None

    embedding = await fetch_query_embedding(question)

    best_cluster = None
    best_score = -1.0

    for cluster in _CLUSTER_REGISTRY.values():

        #
        # Geographic isolation
        #

        if (
            cluster["state"]
            and metadata.get("state")
            and cluster["state"] != metadata["state"]
        ):
            continue

        #
        # Crop isolation
        #

        if (
            cluster["crop"]
            and metadata.get("crop")
            and cluster["crop"] != metadata["crop"]
        ):
            continue

        centroid = np.asarray(
            cluster["centroid"]
        ).reshape(1, -1)

        query = np.asarray(
            embedding
        ).reshape(1, -1)

        similarity = cosine_similarity(
            query,
            centroid,
        )[0][0]

        if similarity > best_score:

            best_score = similarity

            best_cluster = cluster

    if (
        best_cluster
        and best_score >= 0.88
    ):
        return best_cluster

    return None
# =============================================================================
# Cluster Creation
# =============================================================================


async def _create_cluster(
    question: str,
    metadata: dict[str, Any],
) -> str:
    """
    Create a brand-new semantic cluster.
    """

    embedding = await fetch_query_embedding(question)

    cluster_id = (
        f"cluster_{uuid.uuid4().hex[:12]}"
    )

    _CLUSTER_REGISTRY[cluster_id] = {

        "cluster_id": cluster_id,

        "centroid": embedding,

        "questions": [question],

        "size": 1,

        "state": metadata.get("state"),

        "crop": metadata.get("crop"),

        "domain": metadata.get("domain"),

        "created_at": None,
    }

    return cluster_id
# =============================================================================
# Cluster Update
# =============================================================================


async def _append_to_cluster(
    cluster: dict[str, Any],
    question: str,
) -> None:
    """
    Add a new question to an existing cluster and
    update the centroid using a running average.
    """

    embedding = await fetch_query_embedding(
        question
    )

    old = np.asarray(
        cluster["centroid"]
    )

    new = np.asarray(
        embedding
    )

    size = cluster["size"]

    centroid = (
        old * size + new
    ) / (size + 1)

    cluster["centroid"] = centroid.tolist()

    cluster["questions"].append(
        question
    )

    cluster["size"] += 1

# =============================================================================
# Weekly Cluster Rebuild
# =============================================================================


async def rebuild_clusters(
    unanswered_queries: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Weekly batch clustering job.

    Steps

    1. Group by state + crop
    2. Run DBSCAN inside each group
    3. Build cluster registry
    4. Compute centroids
    5. Return summary

    Live Registry
            │
            ▼
Build New Registry (temporary)
            │
            ▼
Finished?
            │
           Yes
            │
            ▼
replace_cluster_registry()
Add this to ensure that the cluster registry is updated atomically. The new registry is built in memory and only replaces the old one once it's fully constructed. This prevents any inconsistencies or partial updates from being visible to other parts of the application that rely on the cluster registry.
    """

    grouped = _group_queries(
        unanswered_queries,
    )

    total_clusters = 0

    total_queries = 0

    rebuilt_clusters = []

    for (_, _), queries in grouped.items():

        clusters = await _cluster_group(
            queries,
        )
        clusters = _merge_similar_clusters(
            clusters,
        )

        for cluster in clusters:

            rebuilt_clusters.append(cluster)

            total_clusters += 1

            total_queries += cluster["size"]

    replace_cluster_registry(
        rebuilt_clusters,
    )
    
    return {
        "clusters": total_clusters,
        "queries": total_queries,
    }
# =============================================================================
# Metadata Grouping
# =============================================================================


def _group_queries(
    queries: list[dict[str, Any]],
) -> dict[tuple, list[dict[str, Any]]]:
    """
    Separate queries before semantic clustering.

    We NEVER cluster

        Rice Maharashtra

    together with

        Rice Punjab

    because agricultural advice is
    geographically dependent.
    """

    grouped = defaultdict(list)

    for query in queries:

        state = (
            query.get("state")
            or "unknown"
        )

        crop = (
            query.get("crop")
            or "unknown"
        )

        grouped[
            (
                state.lower(),
                crop.lower(),
            )
        ].append(query)

    return grouped
# =============================================================================
# DBSCAN Clustering
# =============================================================================


async def _cluster_group(
    queries: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Perform semantic clustering for one
    (state, crop) group.

    Each query must already contain an embedding.
    """

    if not queries:
        return []

    #
    # Ensure embeddings exist
    #

    for query in queries:

        if not query.get("embedding"):

            query["embedding"] = await fetch_query_embedding(
                query["question"]
            )

    #
    # Build embedding matrix
    #

    vectors = np.asarray(
        [
            q["embedding"]
            for q in queries
        ]
    )

    #
    # Cluster
    #

    clustering = DBSCAN(
        eps=DBSCAN_EPS,
        min_samples=DBSCAN_MIN_SAMPLES,
        metric="cosine",
    )

    labels = clustering.fit_predict(
        vectors
    )

    grouped: dict[int, list[dict]] = defaultdict(list)

    for label, query in zip(
        labels,
        queries,
    ):

        #
        # Ignore DBSCAN noise.
        # Every noise point becomes its own
        # singleton cluster later.
        #

        grouped[label].append(query)

    clusters = []

    for label, members in grouped.items():

        #
        # DBSCAN labels noise as -1
        #

        if label == -1:

            for query in members:

                clusters.append(
                    await _singleton_cluster(
                        query
                    )
                )

            continue

        clusters.append(
            _build_cluster(
                members
            )
        )

    return clusters
# =============================================================================
# Cluster Builder
# =============================================================================


def _build_cluster(
    members: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Construct one semantic cluster from
    DBSCAN members.
    """

    vectors = np.asarray(
        [
            q["embedding"]
            for q in members
        ]
    )

    centroid = vectors.mean(
        axis=0
    )

    representative = max(
        members,
        key=lambda x: len(
            x["question"]
        ),
    )

    return {

        "cluster_id":
            f"cluster_{uuid.uuid4().hex[:12]}",

        "centroid":
            centroid.tolist(),

        "size":
            len(members),

        "questions":
            [
                q["question"]
                for q in members
            ],

        "state":
            representative.get("state"),

        "crop":
            representative.get("crop"),

        "season":
            representative.get("season"),

        "domain":
            representative.get("domain"),

        "created_at":
            None,
    }
# =============================================================================
# Singleton Cluster
# =============================================================================


async def _singleton_cluster(
    query: dict[str, Any],
) -> dict[str, Any]:
    """
    Convert one DBSCAN noise point into
    its own cluster.

    This ensures every disclaimer query
    belongs to exactly one cluster.
    """

    return {

        "cluster_id":
            f"cluster_{uuid.uuid4().hex[:12]}",

        "centroid":
            query["embedding"],

        "size":
            1,

        "questions":
            [
                query["question"]
            ],

        "state":
            query.get("state"),

        "crop":
            query.get("crop"),

        "season":
            query.get("season"),

        "domain":
            query.get("domain"),

        "created_at":
            None,
    }
# =============================================================================
# Cluster Merge
# =============================================================================


def _merge_similar_clusters(
    clusters: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Merge clusters whose centroids are nearly identical.

    Prevents duplicate clusters describing the
    same knowledge gap.
    """

    if len(clusters) <= 1:
        return clusters

    merged = []
    visited = set()

    for i, cluster in enumerate(clusters):

        if i in visited:
            continue

        current = cluster

        centroid_a = np.asarray(
            current["centroid"]
        ).reshape(1, -1)

        for j in range(i + 1, len(clusters)):

            if j in visited:
                continue

            other = clusters[j]

            #
            # Never merge different geography
            #

            if current["state"] != other["state"]:
                continue

            if current["crop"] != other["crop"]:
                continue

            centroid_b = np.asarray(
                other["centroid"]
            ).reshape(1, -1)

            similarity = cosine_similarity(
                centroid_a,
                centroid_b,
            )[0][0]

            if similarity >= 0.95:

                current["questions"].extend(
                    other["questions"]
                )

                current["size"] += other["size"]

                current["centroid"] = (
                    (
                        np.asarray(current["centroid"])
                        + np.asarray(other["centroid"])
                    )
                    / 2
                ).tolist()

                visited.add(j)

        merged.append(current)

    return merged
# =============================================================================
# Growth Detection
# =============================================================================


def detect_cluster_growth(
    previous_clusters: dict[str, dict[str, Any]],
    current_clusters: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Compare two cluster snapshots and compute
    weekly growth.
    """

    growth = []

    for cluster in current_clusters.values():

        previous_size = 0

        for old in previous_clusters.values():

            if (
                old["state"] == cluster["state"]
                and old["crop"] == cluster["crop"]
            ):

                similarity = cosine_similarity(
                    np.asarray(old["centroid"]).reshape(1, -1),
                    np.asarray(cluster["centroid"]).reshape(1, -1),
                )[0][0]

                if similarity >= 0.90:

                    previous_size = old["size"]

                    break

        current_size = cluster["size"]

        delta = current_size - previous_size

        rate = (
            current_size
            if previous_size == 0
            else delta / previous_size
        )

        growth.append(
            {
                "cluster_id": cluster["cluster_id"],
                "previous_size": previous_size,
                "current_size": current_size,
                "growth": delta,
                "growth_rate": round(rate, 2),
            }
        )

    growth.sort(
        key=lambda x: x["growth_rate"],
        reverse=True,
    )

    return growth
# =============================================================================
# Registry Management
# =============================================================================


def replace_cluster_registry(
    clusters: list[dict[str, Any]],
) -> None:
    """
    Atomically replace the live cluster registry.
    """

    global _CLUSTER_REGISTRY

    new_registry = {}

    for cluster in clusters:

        new_registry[
            cluster["cluster_id"]
        ] = cluster

    _CLUSTER_REGISTRY = new_registry

    log.info(
        "Cluster registry updated (%d clusters)",
        len(new_registry),
    )

