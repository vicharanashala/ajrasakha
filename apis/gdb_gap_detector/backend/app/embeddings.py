"""Text -> vector. sentence-transformers when available, TF-IDF (scikit-learn) otherwise."""
from __future__ import annotations

import logging

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

from .config import settings

log = logging.getLogger("gapdetector.embeddings")

_sbert = None


def _load_sbert():
    global _sbert
    if _sbert is None:
        from sentence_transformers import SentenceTransformer

        _sbert = SentenceTransformer(settings.sbert_model)
    return _sbert


def resolve_backend() -> str:
    want = settings.embedding_backend
    if want in ("sbert", "tfidf"):
        return want
    try:
        import sentence_transformers  # noqa: F401

        return "sbert"
    except Exception:
        return "tfidf"


def embed(texts: list[str]) -> tuple[np.ndarray, str, float]:
    """Return (L2-normalised dense matrix, backend name, cosine distance threshold)."""
    backend = resolve_backend()
    if backend == "sbert":
        try:
            vecs = _load_sbert().encode(texts, normalize_embeddings=True, show_progress_bar=False)
            return np.asarray(vecs, dtype=np.float32), "sbert", settings.distance_threshold_sbert
        except Exception as exc:  # model download blocked, etc.
            log.warning("sentence-transformers failed (%s); falling back to TF-IDF", exc)
    vec = TfidfVectorizer(
        lowercase=True, ngram_range=(1, 2), sublinear_tf=True, min_df=1,
        max_features=8000, stop_words="english",
    )
    mat = vec.fit_transform(texts)
    dense = normalize(mat.toarray().astype(np.float32))
    return dense, "tfidf", settings.distance_threshold_tfidf
