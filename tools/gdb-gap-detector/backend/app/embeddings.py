"""
Computes question embeddings locally using sentence-transformers, since
the real raw_queries collection doesn't have a stored embedding field.
No API key needed, runs on-device.

Model is loaded lazily so importing this module doesn't trigger a
download - tests mock get_model() instead of loading the real thing.
"""

from __future__ import annotations
from functools import lru_cache

_MODEL_NAME = "all-MiniLM-L6-v2"  # small, fast, decent general quality


@lru_cache(maxsize=1)
def get_model():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(_MODEL_NAME)


def compute_embeddings(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    model = get_model()
    vectors = model.encode(texts, show_progress_bar=False)
    return [v.tolist() for v in vectors]
