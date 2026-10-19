import numpy as np

from gdb_gap_detector.pipeline.cluster_quality import evaluate_cluster_quality


def test_cluster_quality():
    embeddings = np.array([
        [1.0, 0.0],
        [0.9, 0.1],
        [0.8, 0.2],
        [0.0, 1.0],
        [0.1, 0.9],
        [0.2, 0.8],
    ])

    labels = np.array([
        0, 0, 0,
        1, 1, 1,
    ])

    result = evaluate_cluster_quality(embeddings, labels)

    assert "overall_score" in result
    assert "clusters" in result

    assert result["overall_score"] > 0

    assert 0 in result["clusters"]
    assert 1 in result["clusters"]

    assert result["clusters"][0]["quality"] == "GOOD"
    assert result["clusters"][1]["quality"] == "GOOD"

    assert result["clusters"][0]["size"] == 3
    assert result["clusters"][1]["size"] == 3