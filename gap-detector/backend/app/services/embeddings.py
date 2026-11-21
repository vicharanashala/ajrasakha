"""Sentence embeddings for semantic clustering of disclaimer queries.

Backends (``settings.embedding_backend``):

* ``sentence-transformers`` - the multilingual MiniLM model (Hindi, Tamil, Kannada ...
  alongside English). Downloaded once on first use (~470 MB), runs on CPU.
* ``hash`` - a deterministic, dependency-free bag-of-words hashing embedder used by the
  test-suite and CI. Similar texts still land close together, so the clustering logic
  can be exercised without the model.

Embeddings are cached in ``ace_insights.embedding_cache`` keyed by ``(text_hash, model)``
so weekly runs only embed queries they have not seen before.
"""

from __future__ import annotations

import hashlib
import logging
import re
from typing import Protocol

import torch
from pymongo.database import Database

from backend.app.config import get_settings
from backend.app.db import COL_EMBEDDINGS

log = logging.getLogger(__name__)

HASH_DIM = 256


class Embedder(Protocol):
    name: str

    def embed(self, texts: list[str]) -> torch.Tensor:
        """Return an (n, dim) float32 tensor of L2-normalised vectors."""
        ...


class HashEmbedder:
    """Deterministic word + word-bigram feature hashing (test / CI backend)."""

    name = "hash-v1"

    def embed(self, texts: list[str]) -> torch.Tensor:
        out = torch.zeros((len(texts), HASH_DIM), dtype=torch.float32)
        for i, text in enumerate(texts):
            tokens = re.findall(r"\w+", (text or "").lower())
            feats = list(tokens) + [a + "_" + b for a, b in zip(tokens, tokens[1:], strict=False)]
            for tok in feats:
                h = int(hashlib.md5(tok.encode("utf-8")).hexdigest(), 16)  # noqa: S324
                out[i, h % HASH_DIM] += 1.0
        return torch.nn.functional.normalize(out, dim=1)


class SentenceTransformerEmbedder:
    def __init__(self, model_name: str) -> None:
        from sentence_transformers import SentenceTransformer  # heavy import, keep lazy

        log.info("loading embedding model %s", model_name)
        self.name = model_name
        self._model = SentenceTransformer(model_name, device="cpu")

    def embed(self, texts: list[str]) -> torch.Tensor:
        return self._model.encode(
            texts,
            batch_size=64,
            show_progress_bar=False,
            convert_to_tensor=True,
            normalize_embeddings=True,
        ).to(torch.float32)


_embedder_singleton: Embedder | None = None


def get_embedder() -> Embedder:
    global _embedder_singleton
    if _embedder_singleton is None:
        s = get_settings()
        if s.embedding_backend == "hash":
            _embedder_singleton = HashEmbedder()
        else:
            _embedder_singleton = SentenceTransformerEmbedder(s.embedding_model)
    return _embedder_singleton


def text_hash(text: str) -> str:
    return hashlib.sha256((text or "").strip().lower().encode("utf-8")).hexdigest()[:32]


def embed_texts(
    texts: list[str], embedder: Embedder | None = None, cache_db: Database | None = None
) -> torch.Tensor:
    """Embed ``texts`` (order preserved), reading and filling the Mongo cache if given."""
    embedder = embedder or get_embedder()
    if not texts:
        return torch.zeros((0, 1), dtype=torch.float32)

    hashes = [text_hash(t) for t in texts]
    cached: dict[str, list[float]] = {}
    if cache_db is not None:
        cursor = cache_db[COL_EMBEDDINGS].find(
            {"model": embedder.name, "text_hash": {"$in": list(set(hashes))}},
            {"text_hash": 1, "vector": 1},
        )
        cached = {d["text_hash"]: d["vector"] for d in cursor}

    # embed each distinct missing text once
    missing = list(dict.fromkeys(h for h in hashes if h not in cached))
    if missing:
        first_idx = {h: hashes.index(h) for h in missing}
        fresh = embedder.embed([texts[first_idx[h]] for h in missing])
        for row, h in enumerate(missing):
            cached[h] = fresh[row].tolist()
        if cache_db is not None:
            for h in missing:
                cache_db[COL_EMBEDDINGS].update_one(
                    {"text_hash": h, "model": embedder.name},
                    {"$set": {"text_hash": h, "model": embedder.name, "vector": cached[h]}},
                    upsert=True,
                )
        log.info(
            "embedded %d new texts (%d served from cache)", len(missing), len(texts) - len(missing)
        )

    return torch.tensor([cached[h] for h in hashes], dtype=torch.float32)
