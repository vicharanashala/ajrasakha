import logging
import numpy as np
from gdb_gap_detector.core import settings

logger = logging.getLogger("gdb_gap_detector.embedder")

_GLOBAL_MODEL = None


def get_embedder_model(model_name: str | None = None):
    """Retrieve or initialize the cached SentenceTransformer model instance."""
    global _GLOBAL_MODEL
    from sentence_transformers import SentenceTransformer  # lazy import

    name = model_name or settings.embedding_model_name
    if _GLOBAL_MODEL is None:
        logger.info(f"Loading SentenceTransformer model '{name}' into memory...")
        _GLOBAL_MODEL = SentenceTransformer(name)
    return _GLOBAL_MODEL


def get_embedder(
    queries: list[str], model_name: str | None = None
) -> np.ndarray:
    """Stage 2: Batch encode unique queries into normalized dense embeddings."""
    if not queries:
        return np.empty((0, 384), dtype=np.float32)

    model = get_embedder_model(model_name)
    logger.info(f"Encoding batch of {len(queries)} query strings...")
    embeddings = model.encode(
        queries,
        batch_size=32,
        show_progress_bar=False,
        normalize_embeddings=True,
    )
    return np.asarray(embeddings, dtype=np.float32)
