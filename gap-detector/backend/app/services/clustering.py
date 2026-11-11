"""Semantic clustering of disclaimer queries.

Pipeline: sentence-transformers embeddings -> cosine similarity (``util.cos_sim``,
torch) -> average-linkage agglomerative clustering on cosine distance -> cluster
labels from TF-IDF-style keyword scoring + dominant crop / domain.

Everything numeric runs on torch tensors; no scikit-learn.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass, field

import torch
from sentence_transformers import util as st_util

from backend.app.models import DisclaimerQuery

# --------------------------------------------------------------------------- #
# Agglomerative clustering (average linkage, cosine distance) on torch
# --------------------------------------------------------------------------- #


def cosine_distance_matrix(embeddings: torch.Tensor) -> torch.Tensor:
    """(n, n) cosine distances in [0, 2]; embeddings are expected L2-normalised."""
    sim = st_util.cos_sim(embeddings, embeddings)
    return (1.0 - sim).clamp_(min=0.0)


def agglomerative_labels(embeddings: torch.Tensor, distance_threshold: float) -> list[int]:
    """Average-linkage agglomerative clustering.

    Repeatedly merges the two clusters whose *average* pairwise cosine distance is the
    smallest (Lance-Williams UPGMA update), until no pair is closer than
    ``distance_threshold``. Returns a cluster label per row (0..k-1, in order of first
    appearance).

    Cost: an n x n distance matrix plus O(n) merges over it, so ~O(n^3) time and
    O(n^2) memory. Comfortable into the low thousands of queries per run (a few
    thousand is well under a second and a few hundred MB); beyond that, bucket by
    domain or state and cluster each bucket -- see docs/DESIGN.md.
    """
    n = embeddings.shape[0]
    if n == 0:
        return []
    if n == 1:
        return [0]

    # cd holds cluster-to-cluster mean distances. Merged-away rows/columns are set to
    # +inf, so argmin over cd alone never selects an inactive cluster -- no masking pass.
    cd = cosine_distance_matrix(embeddings)
    cd.fill_diagonal_(float("inf"))
    members: list[list[int]] = [[i] for i in range(n)]
    active = torch.ones(n, dtype=torch.bool)
    inf = torch.tensor(float("inf"))

    while True:
        flat = int(torch.argmin(cd))
        i, j = flat // n, flat % n
        best = float(cd[i, j])
        if not math.isfinite(best) or best > distance_threshold:
            break
        if i > j:
            i, j = j, i
        # merge j into i: average linkage -> weighted mean of member-level distances
        ni, nj = len(members[i]), len(members[j])
        new_row = (cd[i] * ni + cd[j] * nj) / (ni + nj)
        cd[i] = new_row
        cd[:, i] = new_row
        cd[i, i] = float("inf")
        members[i].extend(members[j])
        members[j] = []
        active[j] = False
        cd[j, :] = inf
        cd[:, j] = inf

    labels = [-1] * n
    next_label = 0
    for idx in range(n):
        if active[idx] and members[idx]:
            for m in members[idx]:
                labels[m] = next_label
            next_label += 1
    return labels


# --------------------------------------------------------------------------- #
# Cluster description: keywords, title, representatives
# --------------------------------------------------------------------------- #

_STOP = set(
    """a an the and or of in on at to for from with by is are was were be been being am
    i me my we our you your he she it its they them their this that these those there here
    what which who whom whose when where why how do does did doing done can could should
    would will shall may might must have has had having not no nor so if then than too very
    just also any some all each every both few more most other such only own same as about
    into over under again further once up down out off please tell give want need know help
    kya hai ka ki ke ko me mein se par kaise kab kyu kyon aur ya h hain karna kare karen
    crop plant plants farmer farming field often good bad amount start use using fight
    steps best way ways much many get make per like new old time affected problem""".split()
)


def _tokens(text: str) -> list[str]:
    return [t for t in re.findall(r"[^\W\d_]{3,}", text.lower()) if t not in _STOP]


def cluster_keywords(texts: list[str], all_texts: list[str], top_k: int = 6) -> list[str]:
    """TF-IDF-style keyword scoring: term frequency inside the cluster weighted by
    inverse document frequency across all queries. Pure Python; deterministic."""
    if not texts:
        return []
    n_docs = max(len(all_texts), 1)
    df: Counter[str] = Counter()
    for t in all_texts:
        df.update(set(_tokens(t)))
    tf: Counter[str] = Counter()
    for t in texts:
        tf.update(_tokens(t))
    scored = {
        term: count * math.log((1 + n_docs) / (1 + df[term])) + 1e-9 * count
        for term, count in tf.items()
    }
    return [t for t, _ in sorted(scored.items(), key=lambda kv: (-kv[1], kv[0]))[:top_k]]


def representative_indices(
    embeddings: torch.Tensor, member_idx: list[int], k: int = 3
) -> list[int]:
    """Members closest to the cluster centroid (most 'typical' queries)."""
    if not member_idx:
        return []
    sub = embeddings[member_idx]
    centroid = torch.nn.functional.normalize(sub.mean(dim=0, keepdim=True), dim=1)
    sims = st_util.cos_sim(centroid, sub)[0]
    order = torch.argsort(sims, descending=True)[:k].tolist()
    return [member_idx[o] for o in order]


def _stem(word: str) -> str:
    """Tiny plural/verb-ending stripper so 'aphid'/'aphids', 'spray'/'spraying' collapse."""
    w = word.lower()
    for suffix in ("ing", "ies", "es", "s"):
        if len(w) > len(suffix) + 2 and w.endswith(suffix):
            return w[: -len(suffix)] if suffix != "ies" else w[:-3] + "y"
    return w


def make_title(keywords: list[str], crop: str | None, domain: str | None) -> str:
    """'<Crop> <kw1> <kw2> <Domain>' with no repeated words (by stem)."""
    seen: set[str] = set()
    parts: list[str] = []
    if crop:
        parts.append(crop)
        seen.update(_stem(w) for w in crop.split())
    domain_words = {_stem(w) for w in (domain or "").split()}
    for k in keywords:
        st = _stem(k)
        if st in seen or st in domain_words:
            continue
        seen.add(st)
        parts.append(k.title())
        if len(parts) >= (3 if crop else 2):
            break
    if domain and domain not in ("General", "General Agriculture"):
        parts.append(domain)
    return " ".join(parts) or "Uncategorised"


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #


@dataclass
class RawCluster:
    label: int
    member_idx: list[int]
    keywords: list[str] = field(default_factory=list)
    representative_idx: list[int] = field(default_factory=list)
    title: str = ""


def cluster_queries(
    queries: list[DisclaimerQuery],
    embeddings: torch.Tensor,
    distance_threshold: float,
    min_cluster_size: int,
) -> list[RawCluster]:
    """Cluster queries and describe each cluster. Singletons below ``min_cluster_size``
    are dropped (they are noise for a *demand* report, but still counted in totals)."""
    if not queries:
        return []
    labels = agglomerative_labels(embeddings, distance_threshold)
    groups: dict[int, list[int]] = {}
    for idx, lab in enumerate(labels):
        groups.setdefault(lab, []).append(idx)

    all_texts = [q.query for q in queries]
    out: list[RawCluster] = []
    for lab, idxs in groups.items():
        if len(idxs) < min_cluster_size:
            continue
        texts = [queries[i].query for i in idxs]
        kws = cluster_keywords(texts, all_texts)
        crop = Counter(q.crop for q in (queries[i] for i in idxs) if q.crop).most_common(1)
        dom = Counter(q.domain for q in (queries[i] for i in idxs) if q.domain).most_common(1)
        out.append(
            RawCluster(
                label=lab,
                member_idx=idxs,
                keywords=kws,
                representative_idx=representative_indices(embeddings, idxs),
                title=make_title(kws, crop[0][0] if crop else None, dom[0][0] if dom else None),
            )
        )
    out.sort(key=lambda c: -len(c.member_idx))
    return out
