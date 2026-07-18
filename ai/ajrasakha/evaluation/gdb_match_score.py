"""
gdb_match_score — simple text-similarity metric for GDB ground-truth cases.

================================================================================
WHAT THIS IS
================================================================================
A bespoke (non-DeepEval) similarity score intended for the PS3 goal of
"comparing the agent's answer against the GDB canonical answer." It answers:

    "How much do these two strings overlap as text?"

...which is a *different* question from what DeepEval's library metrics
answer:

    AnswerRelevancyMetric      — does the answer address the question?
                                  (judge-based, quality judgment)
    FaithfulnessMetric         — are the claims in the answer supported by
                                  the retrieval context? (judge-based)
    ContextualRelevancyMetric  — is the retrieved context relevant to the
                                  query? (judge-based)

gdb_match_score is a DETERMINISTIC, NUMERIC, NON-JUDGE similarity. Useful
when:
  - The judge is unavailable / too slow / too expensive (mock mode, CI)
  - You want a cheap pre-filter before paying for an LLM judge
  - You want a reproducible "did the agent rephrase the canonical answer"
    signal that doesn't depend on which LLM is behind the judge
  - You want an exact-string sanity check (difflib.SequenceMatcher on
    identical strings returns 1.0)

================================================================================
WHAT IT IS NOT
================================================================================
Not a substitute for AnswerRelevancy / Faithfulness / ContextualRelevancy.
Those are quality judgments; this is text overlap. A rephrased-but-correct
answer can score LOW on gdb_match_score and HIGH on AnswerRelevancy;
that's expected and complementary, not contradictory.

================================================================================
METHODS
================================================================================
Two interchangeable methods, both stdlib (no new dependencies):

  seqmatch  — difflib.SequenceMatcher.ratio()
              Character-level longest-common-subsequence ratio.
              Fast, deterministic, sensitive to word reordering.

  jaccard   — token-level Jaccard similarity on lowercase word tokens.
              Insensitive to word order; gives 0.0 if no token overlap.
              Use when you care about vocabulary overlap, not phrasing.

Default: seqmatch. Pass method="jaccard" to use the other.

================================================================================
DESIGN NOTE — why not sentence-transformers cosine?
================================================================================
sentence-transformers is a declared dependency in ai/pyproject.toml but it
pulls in torch (~1.5 GB) and a model download on first use. We do NOT add
it as a hard dependency for this metric. gdb_match_score works in <10 ms
per call with stdlib only. If a future caller wants embedding cosine and
has torch + a model pre-loaded, add a third method="embedding" branch
that lazily imports sentence_transformers; do not make it the default.

================================================================================
API
================================================================================
    gdb_match_score(actual_output: str, expected_output: str,
                    method: str = "seqmatch") -> dict

    Returns: {"score": float in [0.0, 1.0], "method": str}
"""

from __future__ import annotations

import difflib
import re
from typing import Literal

Method = Literal["seqmatch", "jaccard"]

_VALID_METHODS: tuple[str, ...] = ("seqmatch", "jaccard")


def gdb_match_score(
    actual_output: str,
    expected_output: str,
    method: str = "seqmatch",
) -> dict:
    """
    Compute a text-similarity score between two strings.

    Parameters
    ----------
    actual_output : str
        The agent's response text. May be empty (returns 0.0).
    expected_output : str
        The canonical / ground-truth text. May be empty (returns 0.0 if
        actual_output is also empty, else ratio of actual to "").
    method : {"seqmatch", "jaccard"}, default "seqmatch"
        Which similarity algorithm to use. See module docstring.

    Returns
    -------
    dict
        {"score": float, "method": str}
          score is in [0.0, 1.0]. 0.0 = no overlap, 1.0 = identical.
          method echoes the requested method (for caller logging).

    Raises
    ------
    ValueError
        If method is not one of the supported names.
    """
    if method not in _VALID_METHODS:
        raise ValueError(
            f"method must be one of {_VALID_METHODS}, got {method!r}"
        )

    if method == "seqmatch":
        score = _seqmatch_ratio(actual_output, expected_output)
    else:  # "jaccard"
        score = _jaccard_ratio(actual_output, expected_output)

    return {"score": round(float(score), 4), "method": method}


# ---------------------------------------------------------------------------
# Methods
# ---------------------------------------------------------------------------

def _seqmatch_ratio(a: str, b: str) -> float:
    """
    difflib.SequenceMatcher character-level ratio.

    Edge cases:
      - both empty  -> 1.0 (vacuously identical; nothing to differ on)
      - one empty   -> 0.0 (no LCS possible across an empty string)
    """
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def _jaccard_ratio(a: str, b: str) -> float:
    """
    Token-level Jaccard similarity on lowercase word tokens.

        |A ∩ B| / |A ∪ B|

    Tokenisation: lowercase + split on non-alphanumeric runs. Punctuation,
    whitespace, and case differences are all neutralised. Useful when the
    agent rephrases with the same vocabulary but in a different order.

    Edge cases:
      - both empty          -> 1.0
      - one empty, one not  -> 0.0
      - no shared tokens    -> 0.0
    """
    tokens_a = set(_tokenize(a))
    tokens_b = set(_tokenize(b))

    if not tokens_a and not tokens_b:
        return 1.0
    if not tokens_a or not tokens_b:
        return 0.0

    intersection = tokens_a & tokens_b
    union = tokens_a | tokens_b
    return len(intersection) / len(union)


_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _tokenize(s: str) -> list[str]:
    """Lowercase + split on non-alphanumeric runs. Unicode word chars via \\w."""
    if not s:
        return []
    # \w in Python re already handles Unicode letters/digits; lowercase first
    # so the regex pattern stays ASCII and simple.
    return re.findall(r"[a-z0-9]+", s.lower())
