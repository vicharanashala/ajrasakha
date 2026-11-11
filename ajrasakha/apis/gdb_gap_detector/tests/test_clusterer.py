import numpy as np
from gdb_gap_detector.pipeline.clusterer import (
    cluster_embeddings,
    extract_keywords,
    find_representative_query,
)


def test_extract_keywords_tfidf():
    """Test TF-IDF keyword extraction across sample query list."""
    queries = [
        "How to control aphids in mustard crop?",
        "Best pesticide spray for aphids control in mustard crop",
        "Aphids disease treatment for mustard field",
    ]
    keywords = extract_keywords(queries, top_n=3)
    assert len(keywords) > 0
    # "aphids" or "mustard" or "control" should be among top features
    lower_kw = [k.lower() for k in keywords]
    assert any("aphid" in k or "mustard" in k for k in lower_kw)


def test_find_representative_query_centroid():
    """Test centroid representative query (Medoid) selection."""
    queries = [
        "How to treat yellow rust in wheat?",
        "Yellow rust fungus treatment in wheat field",
        "Pesticide for wheat rust disease",
    ]
    # Create mock 3D embeddings where query 0 is central
    embeds = np.array([
        [1.0, 1.0, 1.0],
        [1.0, 1.1, 0.9],
        [0.9, 0.8, 1.1],
    ], dtype=np.float32)

    rep_query = find_representative_query(embeds, queries)
    assert rep_query in queries


def test_clusterer_hdbscan_outlier_safety_net():
    """Test HDBSCAN clustering and routing unclustered queries to Outlier Safety Net."""
    hashes = ["h1", "h2", "h3", "h4", "h5"]
    unique_map = {
        h: {
            "query": f"Query string {idx}",
            "count": 1,
            "domains": ["Pest Control"],
            "states": ["Punjab"],
            "languages": ["English"],
        }
        for idx, h in enumerate(hashes)
    }
    triage_map = {h: "real_gap" for h in hashes}

    # 5 random vectors that won't form a tight cluster with min_size=10
    rng = np.random.default_rng(42)
    embeddings = rng.random((5, 384)).astype(np.float32)

    clusters = cluster_embeddings(hashes, unique_map, embeddings, triage_map, min_cluster_size=10)

    # All hashes fall into fallback/misc bucket since 5 < min_cluster_size=10
    assert len(clusters) == 1
    assert clusters[0].is_miscellaneous is True
    assert clusters[0].cluster_id == "misc|outliers"


def test_clusterer_empty_input():
    """Test clusterer with zero queries."""
    clusters = cluster_embeddings([], {}, np.empty((0, 384)), {})
    assert clusters == []


def test_clusterer_single_item_cluster():
    """Test clusterer with a single query item."""
    hashes = ["h1"]
    unique_map = {
        "h1": {
            "query": "Single query item test",
            "count": 5,
            "domains": ["General"],
            "states": ["Delhi"],
            "languages": ["English"],
        }
    }
    triage_map = {"h1": "real_gap"}
    embeds = np.ones((1, 384), dtype=np.float32)

    clusters = cluster_embeddings(hashes, unique_map, embeds, triage_map, min_cluster_size=3)
    assert len(clusters) == 1
    assert clusters[0].is_miscellaneous is True
    assert clusters[0].farmer_demand == 5


def test_clusterer_tight_cluster():
    """Test clustering of 4 identical embeddings with min_size=3."""
    hashes = ["h1", "h2", "h3", "h4"]
    unique_map = {
        h: {
            "query": f"Control stem borer in paddy variation {idx}",
            "count": 2,
            "domains": ["Pest Control"],
            "states": ["Haryana"],
            "languages": ["English"],
        }
        for idx, h in enumerate(hashes)
    }
    triage_map = {h: "near_miss" for h in hashes}

    # Nearly identical vectors
    base_vec = np.ones(384, dtype=np.float32)
    embeddings = np.array([base_vec + 0.001 * i for i in range(4)], dtype=np.float32)

    clusters = cluster_embeddings(hashes, unique_map, embeddings, triage_map, min_cluster_size=3)
    assert len(clusters) >= 1
    total_demand = sum(c.farmer_demand for c in clusters)
    assert total_demand == 8
