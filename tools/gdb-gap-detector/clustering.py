"""clustering.py
===============

Groups `disclaimer_logs` candidates (already produced by
``find_gap_candidates.py``) into the ``top_gaps`` clusters that appear in
the ``gap_reports`` collection.

Pipeline position
-----------------
::

    MongoDB  -->  find_gap_candidates.py  -->  clustering.py  -->  downstream
                                                                     report
                                                                     writer

Input shape (one record per disclaimer_logs row, all PII fields already
stripped upstream)
---------------------------------------------------------------------------
    {
      "query":               str,         # raw farmer question
      "query_normalized":    str,         # pre-normalized text (must exist)
      "query_hash":          str,         # upstream dedup key
      "state":               str | None,
      "domain":              str | None,
      "timestamp":           datetime,    # tz-aware UTC expected
    }

Output shape (one record per cluster, matches `top_gaps` element schema)
------------------------------------------------------------------------
    {
      "cluster_id":         str,          # sorted significant keywords joined "|"
      "cluster_name":       str,          # top-3 significant keywords joined " / "
      "size":               int,
      "keywords":           list[str],
      "sample_queries":     list[str],    # up to 3 raw `query` values
      "domains":            list[str],
      "states":             list[str],
      "growth_rate":        float,
      "priority_score":     float,
      "first_seen":         datetime,
      "last_seen":          datetime,
      "farmer_demand":      int,          # == size per spec
      "recommended_action": str,
      "priority_level":     "HIGH" | "MEDIUM" | "LOW",
    }

Clustering approach
-------------------
Two records end up in the same cluster iff their sets of **significant
keywords** (after stop-word filtering) are identical:

    sig_kws(record) = sorted({token for token in tokens(query_normalized)
                                if token not in STOPWORDS and len(token) >= 3})

``cluster_id`` is ``"|".join(sorted(sig_kws))`` so the ID is independent
of input ordering. ``cluster_name`` is the top-3 sig-kws by within-cluster
frequency (ties broken alphabetically), joined with ``" / "`` — this is a
human-readable label, not an ID.

Priority score formula (original; documented, not reverse-engineered)
--------------------------------------------------------------------
::

    priority_score = size + (0.15 * num_distinct_states) + (0.1 * growth_rate)

The three terms encode three explainable signals:

* ``size``              — raw volume of unmet demand. Dominant term.
* ``0.15 * states``     — geographic spread. A cluster seen in 5 states is
                          more strategically important than the same volume
                          confined to one state; the coefficient is small
                          so geographic spread nudges score but does not
                          override volume.
* ``0.1 * growth_rate`` — recency trend. A cluster that doubled last week
                          should be actioned before a fading one; the
                          coefficient is smaller than ``states`` because
                          growth is noisier than geographic spread.

Thresholds for ``priority_level``:

* ``>= 8.0`` → HIGH
* ``>= 5.0`` → MEDIUM
* else      → LOW

``recommended_action`` is a single short sentence keyed off
``priority_level`` (see ``_RECOMMENDED_ACTION_BY_LEVEL``).

growth_rate semantics
---------------------
``growth_rate = (recent - prior) / prior`` where:

* ``recent`` = number of cluster members with ``timestamp`` in the last 7
  calendar days (UTC).
* ``prior``  = number of cluster members with ``timestamp`` in the 7 days
  immediately preceding the recent window.

If ``prior == 0`` the rate is reported as ``0.0`` — explicitly avoids a
``ZeroDivisionError`` and is documented behaviour. (Calling this 0.0 is
a conservative choice: it does not falsely signal "infinite growth" when
a topic only recently emerged.)

Limit
-----
The top 20 clusters by ``priority_score`` (descending) are returned.
The function is named ``compute_top_gaps`` and accepts an optional
``limit`` argument defaulting to 20.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

# ---------------------------------------------------------------------------
# Public constants (extracted from this file's docstring; kept here so
# tests and downstream callers can reference them without parsing prose).
# ---------------------------------------------------------------------------

# A small, documented, intentional list. English + a handful of
# high-frequency Hindi transliterations we see in farmer logs. Notably NOT
# "rashtra", "fasal", etc. — domain words that should survive filtering.
# See ``STOPWORD_DOC`` in the docstring above for rationale.
STOPWORDS: frozenset[str] = frozenset({
    # English
    "a", "an", "the", "and", "or", "but", "for", "to", "in", "on", "of",
    "is", "are", "was", "were", "be", "been", "being", "do", "does", "did",
    "has", "have", "had", "i", "you", "he", "she", "we", "they", "my",
    "your", "his", "her", "our", "their", "this", "that", "these", "those",
    "what", "which", "who", "whom", "how", "why", "when", "where",
    "can", "could", "should", "would", "will", "shall", "may", "might",
    "not", "no", "yes", "if", "then", "than", "as", "at", "by", "from",
    "with", "about", "into", "so", "very", "much", "any", "some", "all",
    # Hindi transliterated (high-frequency stopwords)
    "hai", "hain", "ka", "ki", "ke", "ko", "se", "me", "main", "mujhe",
    "mera", "mere", "yeh", "woh", "kya", "kab", "kaise", "kyun", "kahan",
    "aur", "ya", "bhi", "nahi", "nahin", "nahi",
})

MIN_TOKEN_LENGTH = 3

# Trailing 's' is stripped from tokens whose length is strictly greater
# than this, so length-4 words like "this", "that", "loss" pass through
# untouched. Practical effect: exact plural variants of the same word
# (e.g. "aphids"/"aphid", "borers"/"borer") collapse to one sig-kw.
# This is a low-precision heuristic — words ending in "s" that aren't
# plurals (e.g. "moss", "class") will be over-stripped. Documented as a
# known trade-off; see the README "Known limitations" section.
MIN_PLURAL_STRIP_LENGTH = 4

PRIORITY_HIGH_THRESHOLD = 8.0
PRIORITY_MEDIUM_THRESHOLD = 5.0

TOP_GAPS_LIMIT = 20

_RECOMMENDED_ACTION_BY_LEVEL: dict[str, str] = {
    "HIGH":   "Prioritize for expert Q&A drafting this sprint.",
    "MEDIUM": "Schedule expert review in the next cycle.",
    "LOW":    "Monitor; bundle with related clusters if recurring.",
}

# Tokenization pattern: split on anything that isn't a unicode letter or
# digit. Keeps Devanagari and other Indic scripts intact, drops punctuation,
# commas, dots, question marks, etc.
_TOKEN_RE = re.compile(r"[^\w]+", re.UNICODE)
_WORD_RE = re.compile(r"^[\w]+$", re.UNICODE)


# ---------------------------------------------------------------------------
# Pure helpers (exported for testability)
# ---------------------------------------------------------------------------
def _significant_keywords(text: str) -> frozenset[str]:
    """Tokenize ``text``, drop stopwords and short tokens, return a set.

    Lowercased, unicode-aware. Empty input returns an empty set, which
    becomes the special "no-significant-keywords" cluster (see
    ``_cluster_key``).
    """
    if not text:
        return frozenset()
    tokens = (t for t in _TOKEN_RE.split(text.lower()) if t)
    result: set[str] = set()
    for t in tokens:
        if len(t) < MIN_TOKEN_LENGTH or t in STOPWORDS:
            continue
        # Lightweight singular/plural fold: drop a trailing "s" on
        # tokens longer than MIN_PLURAL_STRIP_LENGTH (e.g. "aphids" →
        # "aphid"). Applied AFTER stopword filtering so e.g. "us" never
        # becomes "u". Trade-off: this is a heuristic, not a real
        # lemmatizer — see the README "Known limitations" section.
        if t.endswith("s") and len(t) > MIN_PLURAL_STRIP_LENGTH:
            t = t[:-1]
        result.add(t)
    return frozenset(result)


def _cluster_key(sig_kws: frozenset[str]) -> str:
    """Stable cluster ID from a set of significant keywords.

    Sorted joined with ``|``. An empty sig_kw set becomes the literal
    ``"<uncategorized>"`` cluster so queries with no significant keywords
    still group together (rather than each becoming its own cluster).
    """
    if not sig_kws:
        return "<uncategorized>"
    return "|".join(sorted(sig_kws))


def _cluster_name(cluster_members: list[dict[str, Any]]) -> str:
    """Human-readable name: top-3 sig-kws by frequency within the cluster,
    ties broken alphabetically, joined with ``" / "``.

    If a cluster has no significant keywords (the "uncategorized" bucket),
    the name is the literal ``"uncategorized"``.
    """
    if not cluster_members:
        return "uncategorized"
    counter: Counter[str] = Counter()
    for r in cluster_members:
        for kw in _significant_keywords(r.get("query_normalized", "")):
            counter[kw] += 1
    if not counter:
        return "uncategorized"
    # -count => descending; word ascending => alphabetical tie-break.
    top = sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))[:3]
    return " / ".join(kw for kw, _ in top)


def _growth_rate(
    members: list[dict[str, Any]],
    *,
    now: datetime | None = None,
) -> float:
    """Compute ``(recent - prior) / prior`` for 7-day windows.

    Returns ``0.0`` (not an error) when ``prior == 0``.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    recent_cutoff = now - timedelta(days=7)
    prior_cutoff = now - timedelta(days=14)

    recent = 0
    prior = 0
    for m in members:
        ts = m.get("timestamp")
        if ts is None:
            continue
        # Normalize naive timestamps to UTC so they compare cleanly
        # against tz-aware `now`. (Mongo may yield naive datetimes
        # depending on driver config.)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts >= recent_cutoff:
            recent += 1
        elif recent_cutoff > ts >= prior_cutoff:
            prior += 1

    if prior == 0:
        return 0.0
    return (recent - prior) / prior


def _priority_score(size: int, num_states: int, growth_rate: float) -> float:
    """Original explainable priority formula — see module docstring."""
    return size + (0.15 * num_states) + (0.1 * growth_rate)


def _priority_level(score: float) -> str:
    if score >= PRIORITY_HIGH_THRESHOLD:
        return "HIGH"
    if score >= PRIORITY_MEDIUM_THRESHOLD:
        return "MEDIUM"
    return "LOW"


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------
def compute_top_gaps(
    candidates: Iterable[dict[str, Any]],
    *,
    limit: int = TOP_GAPS_LIMIT,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    """Cluster candidate disclaimer rows and return top ``limit`` clusters.

    Parameters
    ----------
    candidates
        Iterable of pre-loaded disclaimer_logs rows (PII already stripped
        by ``find_gap_candidates.fetch_unanswered_disclaimers`` via
        projection).
    limit
        Number of top clusters to return, sorted by ``priority_score``
        descending. Default 20 (per the gap_reports spec).
    now
        Reference time for ``growth_rate`` computation. Defaults to
        ``datetime.now(timezone.utc)``. Override for tests / reproducible
        reports.

    Returns
    -------
    list of cluster dicts in the exact ``top_gaps`` element shape. May
    be empty (or contain the single "uncategorized" bucket) depending on
    input.
    """
    now = now or datetime.now(timezone.utc)
    candidates = list(candidates)

    # Group by cluster_id (= sorted significant-keyword signature).
    clusters: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in candidates:
        sig = _significant_keywords(row.get("query_normalized", ""))
        clusters[_cluster_key(sig)].append(row)

    results: list[dict[str, Any]] = []
    for cid, members in clusters.items():
        size = len(members)

        # keywords: sorted union of all sig-kws seen in the cluster.
        keywords: set[str] = set()
        for m in members:
            keywords.update(_significant_keywords(m.get("query_normalized", "")))
        keywords_sorted = sorted(keywords)

        # sample_queries: up to 3 raw `query` values, insertion order.
        samples: list[str] = []
        seen_samples: set[str] = set()
        for m in members:
            q = m.get("query")
            if q is None or q in seen_samples:
                continue
            samples.append(q)
            seen_samples.add(q)
            if len(samples) >= 3:
                break

        domains = sorted({m["domain"] for m in members
                          if m.get("domain") is not None})
        states = sorted({m["state"] for m in members
                         if m.get("state") is not None})

        # first_seen / last_seen tolerate naive timestamps by normalizing.
        ts_pairs: list[tuple[datetime, datetime]] = []
        for m in members:
            ts = m.get("timestamp")
            if ts is None:
                continue
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            ts_pairs.append((ts, ts))
        first_seen = min(t for t, _ in ts_pairs) if ts_pairs else None
        last_seen = max(t for _, t in ts_pairs) if ts_pairs else None

        growth = _growth_rate(members, now=now)
        score = _priority_score(size, len(states), growth)
        level = _priority_level(score)

        results.append({
            "cluster_id": cid,
            "cluster_name": _cluster_name(members),
            "size": size,
            "keywords": keywords_sorted,
            "sample_queries": samples,
            "domains": domains,
            "states": states,
            "growth_rate": growth,
            "priority_score": score,
            "first_seen": first_seen,
            "last_seen": last_seen,
            "farmer_demand": size,        # == size per spec
            "recommended_action": _RECOMMENDED_ACTION_BY_LEVEL[level],
            "priority_level": level,
        })

    # Sort by priority_score descending; tie-break by size desc, then
    # cluster_id asc so the result is deterministic for tests.
    results.sort(key=lambda c: (-c["priority_score"],
                                -c["size"],
                                c["cluster_id"]))
    return results[:limit]
