from __future__ import annotations

import logging
import os
from typing import Any

import asyncio
from pymongo import MongoClient
from mcp.mcp_containers.reviewer_system.vector_retrieval import (
    fetch_query_embedding,
    raw_vector_search,
)

log = logging.getLogger("gdb_gap_detector.coverage")

# =============================================================================
# Coverage Configuration
# =============================================================================

SEMANTIC_WEIGHT = float(os.getenv("SEMANTIC_WEIGHT", "0.60"))
CROP_WEIGHT = float(os.getenv("CROP_WEIGHT", "0.20"))
STATE_WEIGHT = float(os.getenv("STATE_WEIGHT", "0.10"))
DOMAIN_WEIGHT = float(os.getenv("DOMAIN_WEIGHT", "0.05"))
SEASON_WEIGHT = float(os.getenv("SEASON_WEIGHT", "0.05"))

TOP_K_MATCHES = int(os.getenv("TOP_K_MATCHES", "10"))

MIN_COVERAGE_SCORE = float(
    os.getenv("MIN_COVERAGE_SCORE", "0.80")
)

MIN_SEMANTIC_SCORE = float(
    os.getenv("MIN_SEMANTIC_SCORE", "0.65")
)

# =============================================================================
# MongoDB Configuration
# =============================================================================

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")

DATABASE_NAME = os.getenv(
    "GDB_DATABASE_NAME",
    "ajrasakha",
)

QUESTIONS_COLLECTION = os.getenv(
    "GDB_COLLECTION_NAME",
    "agriai_questions",
)

VECTOR_INDEX_NAME = os.getenv(
    "GDB_VECTOR_INDEX",
    "question_embedding_index",
)

EMBEDDING_FIELD = os.getenv(
    "GDB_EMBEDDING_FIELD",
    "embedding",
)
_client = MongoClient(MONGO_URI)

_questions = _client[
    DATABASE_NAME
][QUESTIONS_COLLECTION]


# =============================================================================
# Public API
# =============================================================================


async def compute_gap_analysis(
    question: str,
    metadata: dict[str, Any],
) -> dict[str, Any]:
    """
    Compute metadata-aware GDB coverage.

    Pipeline

    Farmer Question
            │
            ▼
    Embedding Generation
            │
            ▼
    Vector Search
            │
            ▼
    Top-K Similar Questions
            │
            ▼
    Metadata Compatibility
            │
            ▼
    Coverage Score
            │
            ▼
    Gap Classification
    """

    log.info("Running GDB coverage analysis.")

    embedding = await _generate_embedding(
        question,
    )

    candidates = await _retrieve_candidates(
        embedding,
        top_k=TOP_K_MATCHES,
    )
    summary = _summarize_candidates(metadata,candidates,)

    if not candidates:

        log.info("No semantic neighbours found.")

        return {
            "covered": False,
            "coverage_score": 0.0,
            "gap_type": "NO_MATCH",
            "matched_question": None,
            "similar_questions": [],
        }

    scored_candidates = []

    for raw_candidate in candidates:

        candidate = _normalize_candidate(raw_candidate)

        scored = _score_candidate(
            metadata,
            candidate,
        )

        scored_candidates.append(scored)

    best_match = max(
        scored_candidates,
        key=lambda x: x["coverage_score"],
    )
    confidence = _calculate_confidence(
    scored_candidates,
)
    dominant_gap = _determine_dominant_gap(
    summary,
    len(candidates),
    best_match["gap_type"],
)
    explanation = _build_explanation(
    best_match,
    dominant_gap,
    confidence,
)

    covered = (
        best_match["coverage_score"]
        >= MIN_COVERAGE_SCORE
        and best_match["semantic_score"]
        >= MIN_SEMANTIC_SCORE
    )

    return {
        "covered": covered,
        "coverage_score": round(
            best_match["coverage_score"],
            3,
        ),
        "confidence": confidence,
        "gap_type": dominant_gap,
        "explanation": explanation,
        "matched_question": best_match["candidate"],
        "similar_questions":
    _format_similar_questions(
        scored_candidates,
    ),
    }
# =============================================================================
# Dominant Gap Decision
# =============================================================================


def _determine_dominant_gap(
    summary: dict[str, Any],
    total: int,
    fallback_gap: str,
) -> str:
    """
    Decide the dominant coverage gap based on the
    overall neighbourhood instead of one document.
    """

    if total == 0:
        return "NO_MATCH"

    if (
        summary["crop_matches"] >= total * 0.7
        and summary["location_matches"] < total * 0.3
    ):
        return "LOCATION_GAP"

    if (
        summary["location_matches"] >= total * 0.7
        and summary["crop_matches"] < total * 0.3
    ):
        return "CROP_GAP"

    if (
        summary["domain_matches"] < total * 0.2
    ):
        return "DOMAIN_GAP"

    if (
        summary["season_matches"] < total * 0.2
    ):
        return "SEASON_GAP"

    return fallback_gap


# =============================================================================
# Candidate Scoring
# =============================================================================


def _score_candidate(
    metadata: dict[str, Any],
    candidate: dict[str, Any],
) -> dict[str, Any]:
    """
    Compute metadata-aware coverage score
    for one retrieved neighbour.
    """

    semantic_score = candidate.get(
        "similarity",
        0.0,
    )

    metadata_score = _metadata_score(
        metadata,
        candidate,
    )

    coverage_score = (
        semantic_score * SEMANTIC_WEIGHT
        + metadata_score
    )

    gap_type = _classify_gap(
        metadata,
        candidate,
        semantic_score,
    )

    return {
        "candidate": candidate,
        "semantic_score": semantic_score,
        "metadata_score": metadata_score,
        "coverage_score": coverage_score,
        "gap_type": gap_type,
    }


# =============================================================================
# Metadata Compatibility
# =============================================================================


def _metadata_score(
    incoming: dict[str, Any],
    candidate: dict[str, Any],
) -> float:
    """
    Compute metadata compatibility score.

    Maximum score =

    Crop     0.20
    State    0.10
    Domain   0.05
    Season   0.05

    Total = 0.40
    """

    score = 0.0

    #
    # Crop
    #

    incoming_crop = (
        incoming.get("crop") or ""
    ).strip().lower()

    candidate_crop = (
        candidate.get("crop")
        or candidate.get("normalised_crop")
        or ""
    ).strip().lower()

    if (
        incoming_crop
        and candidate_crop
        and incoming_crop == candidate_crop
    ):
        score += CROP_WEIGHT

    #
    # State
    #

    incoming_state = (
        incoming.get("state") or ""
    ).strip().lower()

    candidate_state = (
        candidate.get("state") or ""
    ).strip().lower()

    if (
        incoming_state
        and candidate_state
        and incoming_state == candidate_state
    ):
        score += STATE_WEIGHT

    #
    # Season
    #

    incoming_season = (
        incoming.get("season") or ""
    ).strip().lower()

    candidate_season = (
        candidate.get("season") or ""
    ).strip().lower()

    if (
        incoming_season
        and candidate_season
        and incoming_season == candidate_season
    ):
        score += SEASON_WEIGHT

    #
    # Domain
    #

    incoming_domains = {
        d.lower()
        for d in incoming.get("domain", [])
    }

    candidate_domains = {
        d.lower()
        for d in candidate.get("domain", [])
    }

    if incoming_domains.intersection(
        candidate_domains
    ):
        score += DOMAIN_WEIGHT

    return score
# =============================================================================
# Candidate Normalization
# =============================================================================


def _normalize_candidate(
    candidate: dict[str, Any],
) -> dict[str, Any]:
    """
    Normalize candidate documents originating from either the
    prototype GDB collection or the production agriai_questions
    collection.

    Prototype schema

        {
            question,
            answer,
            state,
            domain,
            keywords
        }

    Production schema

        {
            question,
            details:{
                crop,
                normalised_crop,
                state,
                district,
                season,
                domain
            },
            embedding
        }

    This function converts both into one common structure so the
    coverage algorithm never needs to know where the document
    originated.
    """

    details = candidate.get("details", {})

    domain = details.get(
        "domain",
        candidate.get("domain", []),
    )

    if isinstance(domain, str):
        domain = [domain]

    crop = (
        details.get("normalised_crop")
        or details.get("crop")
        or candidate.get("crop")
    )

    return {
        "question": candidate.get(
            "question",
            "",
        ),
        "answer": candidate.get(
            "answer",
            "",
        ),
        "crop": crop,
        "state": details.get(
            "state",
            candidate.get("state"),
        ),
        "district": details.get(
            "district",
        ),
        "season": details.get(
            "season",
        ),
        "domain": domain,
        "keywords": candidate.get(
            "keywords",
            [],
        ),
        "embedding": candidate.get(
            "embedding",
            [],
        ),
        "similarity": float(candidate.get("score",candidate.get("similarity", 0.0))),
        "raw": candidate,
    }


# =============================================================================
# Gap Classification
# =============================================================================


def _classify_gap(
    incoming: dict[str, Any],
    candidate: dict[str, Any],
    semantic_score: float,
) -> str:
    """
    Determine why coverage failed.

    Priority

    1. No semantic match
    2. Crop mismatch
    3. Location mismatch
    4. Season mismatch
    5. Domain mismatch
    6. Full coverage
    """

    if semantic_score < MIN_SEMANTIC_SCORE:
        return "NO_MATCH"

    incoming_crop = (
        incoming.get("crop") or ""
    ).strip().lower()

    candidate_crop = (
        candidate.get("crop") or ""
    ).strip().lower()

    if (
        incoming_crop
        and candidate_crop
        and incoming_crop != candidate_crop
    ):
        return "CROP_GAP"

    incoming_state = (
        incoming.get("state") or ""
    ).strip().lower()

    candidate_state = (
        candidate.get("state") or ""
    ).strip().lower()

    if (
        incoming_state
        and candidate_state
        and incoming_state != candidate_state
    ):
        return "LOCATION_GAP"

    incoming_season = (
        incoming.get("season") or ""
    ).strip().lower()

    candidate_season = (
        candidate.get("season") or ""
    ).strip().lower()

    if (
        incoming_season
        and candidate_season
        and incoming_season != candidate_season
    ):
        return "SEASON_GAP"

    incoming_domains = {
        d.lower()
        for d in incoming.get("domain", [])
    }

    candidate_domains = {
        d.lower()
        for d in candidate.get("domain", [])
    }

    if (
        incoming_domains
        and candidate_domains
        and incoming_domains.isdisjoint(
            candidate_domains
        )
    ):
        return "DOMAIN_GAP"

    return "FULL_MATCH"


# =============================================================================
# Retrieval Hooks
# =============================================================================


async def _generate_embedding(
    question: str,
) -> list[float]:
    """
    Generate embedding using Ajrasakha's shared
    embedding service.
    """

    return await fetch_query_embedding(
        question,
    )


async def _retrieve_candidates(
    embedding: list[float],
    top_k: int,
) -> list[dict[str, Any]]:
    """
    Retrieve Top-K nearest neighbours from
    MongoDB Atlas Vector Search.
    """

    def run():

        return raw_vector_search(
            collection=_questions,
            index_name=VECTOR_INDEX_NAME,
            embedding_path=EMBEDDING_FIELD,
            embedding=embedding,
            pre_filter={},
            limit=top_k,
        )

    rows = await asyncio.to_thread(run)

    return rows

    # =============================================================================
# Coverage Statistics
# =============================================================================


def _summarize_candidates(
    metadata: dict[str, Any],
    candidates: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Analyse the retrieved neighbours collectively.

    Instead of relying on a single nearest neighbour,
    use the entire Top-K neighbourhood to determine
    the dominant knowledge gap.
    """

    total = len(candidates)

    if total == 0:
        return {
            "location_matches": 0,
            "crop_matches": 0,
            "domain_matches": 0,
            "season_matches": 0,
        }

    state = (metadata.get("state") or "").lower()
    crop = (metadata.get("crop") or "").lower()
    season = (metadata.get("season") or "").lower()

    location_matches = 0
    crop_matches = 0
    season_matches = 0
    domain_matches = 0

    incoming_domains = {
        d.lower()
        for d in metadata.get("domain", [])
    }

    for candidate in candidates:

        candidate = _normalize_candidate(candidate)

        if (
            candidate.get("state", "").lower()
            == state
        ):
            location_matches += 1

        if (
            candidate.get("crop", "").lower()
            == crop
        ):
            crop_matches += 1

        if (
            candidate.get("season", "").lower()
            == season
        ):
            season_matches += 1

        candidate_domains = {
            d.lower()
            for d in candidate.get("domain", [])
        }

        if incoming_domains.intersection(
            candidate_domains
        ):
            domain_matches += 1

    return {
        "location_matches": location_matches,
        "crop_matches": crop_matches,
        "season_matches": season_matches,
        "domain_matches": domain_matches,
    }
    # =============================================================================
# Coverage Confidence
# =============================================================================


def _calculate_confidence(
    scored_candidates: list[dict[str, Any]],
) -> float:
    """
    Estimate confidence of the coverage decision.

    Confidence depends on:

    - best semantic match
    - average semantic agreement
    - consistency across neighbours

    Returns a value between 0.0 and 1.0.
    """

    if not scored_candidates:
        return 0.0

    semantic_scores = [
        c["semantic_score"]
        for c in scored_candidates
    ]

    best = max(semantic_scores)

    average = (
        sum(semantic_scores)
        / len(semantic_scores)
    )

    spread = max(semantic_scores) - min(semantic_scores)

    consistency = 1.0 - spread

    confidence = (
        (0.50 * best)
        + (0.30 * average)
        + (0.20 * consistency)
    )

    return round(
        max(0.0, min(confidence, 1.0)),
        3,
    )
# =============================================================================
# Explainability
# =============================================================================


def _build_explanation(
    best_match: dict[str, Any],
    dominant_gap: str,
    confidence: float,
) -> list[str]:
    """
    Produce human-readable reasoning for the
    detected coverage gap.
    """

    explanation = []

    explanation.append(
        f"Semantic similarity: "
        f"{best_match['semantic_score']:.3f}"
    )

    explanation.append(
        f"Coverage score: "
        f"{best_match['coverage_score']:.3f}"
    )

    explanation.append(
        f"Confidence: "
        f"{confidence:.3f}"
    )

    if dominant_gap == "LOCATION_GAP":

        explanation.append(
            "Relevant agricultural knowledge exists "
            "but not for the requested state."
        )

    elif dominant_gap == "CROP_GAP":

        explanation.append(
            "Similar questions exist for other crops."
        )

    elif dominant_gap == "DOMAIN_GAP":

        explanation.append(
            "Requested agricultural domain is "
            "poorly represented in the GDB."
        )

    elif dominant_gap == "SEASON_GAP":

        explanation.append(
            "Knowledge exists but for different seasons."
        )

    elif dominant_gap == "NO_MATCH":

        explanation.append(
            "No semantically similar questions found."
        )

    else:

        explanation.append(
            "Coverage considered sufficient."
        )

    return explanation
# =============================================================================
# Similar Question Formatter
# =============================================================================


def _format_similar_questions(
    scored_candidates: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Convert scored neighbours into dashboard-
    friendly output.
    """

    formatted = []

    for item in scored_candidates:

        candidate = item["candidate"]

        formatted.append(
            {
                "question":
                    candidate.get(
                        "question",
                        "",
                    ),

                "state":
                    candidate.get(
                        "state",
                    ),

                "crop":
                    candidate.get(
                        "crop",
                    ),

                "domain":
                    candidate.get(
                        "domain",
                    ),

                "similarity":
                    round(
                        item["semantic_score"],
                        3,
                    ),

                "coverage":
                    round(
                        item["coverage_score"],
                        3,
                    ),

                "gap":
                    item["gap_type"],
            }
        )

    formatted.sort(
        key=lambda x: x["coverage"],
        reverse=True,
    )

    return formatted