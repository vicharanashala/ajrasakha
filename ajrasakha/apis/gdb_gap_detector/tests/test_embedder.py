import numpy as np
from gdb_gap_detector.pipeline.embedder import get_embedder, get_embedder_model


def test_embedder_singleton():
    """Verify SentenceTransformer model is cached as a singleton."""
    m1 = get_embedder_model()
    m2 = get_embedder_model()
    assert m1 is m2


def test_get_embedder_batch_shape():
    """Verify get_embedder returns normalized float32 numpy array with 384 dimensions."""
    queries = [
        "How to control aphids in mustard crop?",
        "How to make vermicompost at home?",
    ]
    embeddings = get_embedder(queries)

    assert isinstance(embeddings, np.ndarray)
    assert embeddings.shape == (2, 384)
    assert embeddings.dtype == np.float32


def test_get_embedder_empty_list():
    """Verify get_embedder handles empty query list gracefully."""
    embeddings = get_embedder([])
    assert embeddings.shape == (0, 384)
